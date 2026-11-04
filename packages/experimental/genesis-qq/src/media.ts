/** Bounded QQ attachment admission and fixed read-only document/video conversion. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { AttachmentId, type FileAttachmentRef, type ImageAttachmentRef, type ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, pluginRecordOf, type Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-sandbox'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { z } from 'zod'
import type { Config } from './config.ts'
import { segments } from './segments.ts'

const fileRef = z.strictObject({ attachmentId: z.string().min(1).max(512).transform(AttachmentId),
  name: z.string().min(1), bytes: z.number().int().nonnegative() })
/** Persisted original-media reference, excluding transport URLs and credentials. */
export const mediaRecordSchema = z.strictObject({ version: z.literal(1), messageId: z.string().max(200),
  kind: z.enum(['image', 'mface', 'video', 'file']), file: fileRef })
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Original immutable bytes; no download URLs, local client paths or bearer tokens. */
    'plugin:genesis-qq/media': z.infer<typeof mediaRecordSchema>
  }
}
const field = (value: unknown) => typeof value === 'string' ? value : undefined
/**
 * Identify the declared raster type before authoritative attachment decoding.
 * @param data - Encoded bytes.
 * @returns Recognized raster type.
 */
export function rasterType(data: Uint8Array): ImageMediaType | undefined {
  const head = Buffer.from(data.subarray(0, 12))
  if (head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return 'image/jpeg'
  if (/^GIF8[79]a/u.test(head.toString('ascii'))) return 'image/gif'
  if (head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return undefined
}
/** Session-authorized attachment; reference lookup never accepts a model-selected host path. */
export type QqAttachment = { kind: 'file'; attachment: FileAttachmentRef } | { kind: 'image'; attachment: ImageAttachmentRef }
/**
 * Find original attachments by their authenticated message ID in this Session.
 * @param session - Actual calling conversation.
 * @param messageId - Transport message ID, never a Session or download location.
 * @returns Deduplicated immutable references in admission order.
 */
export function messageAttachments(session: Session, messageId: string): Array<z.infer<typeof mediaRecordSchema>> {
  const found = new Map<AttachmentId, z.infer<typeof mediaRecordSchema>>()
  for (const event of session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis-qq/media') continue
    const row = mediaRecordSchema.parse(record.data)
    if (row.messageId === messageId) found.set(row.file.attachmentId, row)
  }
  return [...found.values()]
}
/**
 * Resolve only references already logged here.
 * @param session - Actual caller.
 * @param id - Requested attachment ID.
 * @returns Authorized reference or refusal.
 */
export function attachmentIn(session: Session, id: string): QqAttachment {
  for (const event of session.ownEvents().toReversed()) {
    const record = pluginRecordOf(event)
    if (record?.type === 'plugin:genesis-qq/media') {
      const row = mediaRecordSchema.parse(record.data)
      if (row.file.attachmentId === id) return { kind: 'file', attachment: row.file }
    }
    const content = event.type === 'user/message' ? event.data.content
      : event.type === 'assistant/message' || event.type === 'tool/result' ? event.data.message.content : []
    for (const block of content) if ((block.type === 'image' || block.type === 'file') && block.attachment.attachmentId === id) {
      if (block.type === 'image') return { kind: 'image', attachment: block.attachment }
      return { kind: 'file', attachment: block.attachment }
    }
  }
  throw new GenesisError('invalid-source', 'This attachment was not received or produced in the current QQ conversation.')
}
/** One transport-owned media processor; all operations take caller cancellation. */
export class QqMedia {
  private readonly decoderScope: ReturnType<Context['inject']>
  private converter: { ctx: Context; lifetime: AbortController; operations: Set<Promise<Buffer>> } | undefined
  /**
   * @param ctx - Existing attachment, route and optional confined-process services.
   * @param config - Explicit byte, count and deadline budgets.
   */
  constructor(private readonly ctx: Context, private readonly config: Config) {
    this.decoderScope = ctx.inject(['subprocess', 'sandbox'], (child) => {
      const converter = { ctx: child, lifetime: new AbortController(), operations: new Set<Promise<Buffer>>() }
      this.converter = converter
      child.effect(() => async () => {
        if (this.converter === converter) this.converter = undefined
        converter.lifetime.abort()
        await Promise.allSettled(converter.operations)
      })
    })
    for (const origin of config.mediaOrigins) {
      const url = new URL(origin)
      const wildcard = url.hostname.startsWith('*.') && !url.hostname.slice(2).includes('*') && url.hostname.slice(2).includes('.')
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password
        || (url.hostname.includes('*') && !wildcard)) throw new GenesisError('invalid-state', 'QQ mediaOrigins must contain HTTP(S) origins with optional leftmost *. subdomain wildcards, without paths or credentials.')
    }
  }
  /**
   * Drain converter operations and unregister its dependency scope.
   * @returns After confined readers stop.
   */
  async close(): Promise<void> { await this.decoderScope.dispose() }
  /**
   * Read exact authorized bytes under the channel cap.
   * @param ref - Already authorized reference.
   * @param signal - Cancellation.
   * @returns Verified bytes.
   */
  async bytes(ref: QqAttachment, signal: AbortSignal): Promise<Buffer> {
    if (ref.attachment.bytes > this.config.maxMediaBytes) throw new GenesisError('capacity', 'QQ attachment exceeds maxMediaBytes.')
    const store = this.ctx.get('attachments')
    if (!store) throw new GenesisError('invalid-state', 'QQ media requires the attachment storage provider.')
    if (ref.kind === 'image') return Buffer.from((await store.readImage(ref.attachment, signal)).data)
    const chunks: Uint8Array[] = []; let size = 0
    for await (const chunk of store.readFileStream(ref.attachment, signal)) {
      size += chunk.byteLength
      if (size > this.config.maxMediaBytes) throw new GenesisError('capacity', 'QQ file exceeds maxMediaBytes.')
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }
  private allowedOrigin(url: URL): boolean {
    return this.config.mediaOrigins.some((origin) => {
      const allowed = new URL(origin)
      return url.protocol === allowed.protocol && url.port === allowed.port
        && (allowed.hostname.startsWith('*.') ? url.hostname.endsWith(allowed.hostname.slice(1)) : url.hostname === allowed.hostname)
    })
  }
  private async download(value: string, signal: AbortSignal): Promise<Buffer> {
    if (value.startsWith('base64://')) {
      const encoded = value.slice(9)
      if (encoded.length > Math.ceil(this.config.maxMediaBytes / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new GenesisError('capacity', 'QQ attachment base64 is invalid or exceeds maxMediaBytes.')
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.length > this.config.maxMediaBytes) throw new GenesisError('capacity', 'QQ attachment exceeds maxMediaBytes.')
      return bytes
    }
    const url = new URL(value)
    if (url.username || url.password || url.hash) throw new GenesisError('invalid-source', 'QQ attachment URL contains credentials or a fragment; it was refused.')
    if (url.protocol === 'http:' && !this.allowedOrigin(url)) {
      const secure = new URL(url)
      secure.protocol = 'https:'
      if (this.allowedOrigin(secure)) url.protocol = 'https:'
    }
    if (!['http:', 'https:'].includes(url.protocol) || !this.allowedOrigin(url)) {
      throw new GenesisError('invalid-source', `QQ attachment origin ${url.origin} is not allowed. Add its exact trusted origin to mediaOrigins; local paths and redirects remain refused.`)
    }
    const response = await fetch(url, { signal, redirect: 'error', credentials: 'omit' })
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new GenesisError('invalid-source', 'QQ attachment download failed. Refresh its link through the OneBot client.') }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break
        size += next.value.byteLength
        if (size > this.config.maxMediaBytes) throw new GenesisError('capacity', 'QQ attachment exceeds maxMediaBytes.')
        chunks.push(next.value)
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    return Buffer.concat(chunks)
  }
  private async imageCapable(agent: Agent, signal: AbortSignal): Promise<boolean> {
    const route = agent.session.requestHeader()?.config ?? agent.options
    if (!route.provider || !route.model) return false
    const model = await this.ctx.llm.resolveModelInfo(route.provider, route.model, signal)
    return model.inputModalities?.includes('image') === true
  }
  private async convert(agent: Agent, argv: string[], signal: AbortSignal): Promise<Buffer> {
    const converter = this.converter
    if (!converter) throw new GenesisError('invalid-state', 'QQ PDF/video reading requires the subprocess provider and an enforcing sandbox.')
    const pending = this.runConversion(converter.ctx, agent, argv, AbortSignal.any([signal, converter.lifetime.signal]))
    converter.operations.add(pending)
    try { return await pending } finally { converter.operations.delete(pending) }
  }
  private async runConversion(ctx: Context, agent: Agent, argv: string[], signal: AbortSignal): Promise<Buffer> {
    const confined = await ctx.sandbox.confine(argv, { mode: 'read-only', workspaceRoot: this.config.cwd, sessionId: agent.id }, signal)
    const process = ctx.subprocess.spawn({ argv: confined.argv, cwd: this.config.cwd, signal, env: {}, graceMs: this.config.mediaGraceMs,
      stdio: { stdin: 'ignore', stdout: 'pipe', stderr: { maxBytes: 2000 } } })
    const settled = process.done.then(status => ({ status, error: undefined }), (error: unknown) => ({ status: undefined, error }))
    const chunks: Uint8Array[] = []; let size = 0
    try {
      if (!process.stdout) throw new GenesisError('invalid-state', 'QQ decoder did not expose its output.')
      for await (const chunk of process.stdout) {
        signal.throwIfAborted()
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(z.string().parse(chunk))
        size += data.length
        if (size > this.config.maxMediaBytes) throw new GenesisError('capacity', 'QQ decoder output exceeds maxMediaBytes.')
        chunks.push(data)
      }
      const result = await settled
      if (result.error !== undefined || result.status?.exitCode !== 0) throw new GenesisError('invalid-state', 'QQ decoder failed. Check the configured ffmpeg/pdftotext installation and file format.')
      return Buffer.concat(chunks)
    } finally { process.terminate(); await settled }
  }
  /**
   * Read a stored file as bounded text or sampled images.
   * @param agent - Actual caller.
   * @param ref - Authorized reference.
   * @param signal - Cancellation.
   * @returns Model-visible blocks, never hidden reasoning.
   */
  async read(agent: Agent, ref: QqAttachment, signal: AbortSignal): Promise<ContentBlock[]> {
    const store = this.ctx.get('attachments')
    if (!store) throw new GenesisError('invalid-state', 'QQ media requires attachment storage.')
    const bytes = await this.bytes(ref, signal)
    const mediaType = rasterType(bytes)
    if (mediaType) {
      if (!await this.imageCapable(agent, signal)) return [{ type: 'text', text: 'The current model does not declare image input. Select an image-capable model to inspect this image; its file remains retained.' }]
      const attachment = await store.saveImage({ data: bytes, mediaType, ...(ref.attachment.name ? { name: ref.attachment.name } : {}) })
      return [{ type: 'image', attachment }]
    }
    const name = ref.attachment.name ?? ''
    const path = ref.kind === 'file' ? store.fileHostPath(ref.attachment) : undefined
    if (/\.(mp4|webm|mkv|mov|avi)$/iu.test(name)) {
      if (!path || !await this.imageCapable(agent, signal)) return [{ type: 'text', text: 'Video retained. Reading requires host-backed attachments, ffmpeg, a sandbox and an image-capable model; audio is not transcribed.' }]
      const blocks: ContentBlock[] = [{ type: 'text', text: 'Sampled video frames, not continuous motion or an audio transcript. Each timestamp labels its following frame.' }]
      let frameBytes = 0
      for (let i = 0; i < Math.min(this.config.videoFrames, store.imageLimits.maxImagesPerMessage); i++) {
        const at = i * this.config.videoFrameInterval
        const frame = await this.convert(agent, [this.config.ffmpeg, '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,avi', '-ss', String(at), '-i', path,
          '-frames:v', '1', '-vf', `scale=${this.config.videoFrameSize}:${this.config.videoFrameSize}:force_original_aspect_ratio=decrease`, '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], signal)
        if (!frame.length) break
        const attachment = await store.saveImage({ data: frame, mediaType: 'image/png' })
        frameBytes += attachment.bytes
        if (frameBytes > store.imageLimits.maxMessageImageBytes) { blocks.push({ type: 'text', text: 'Additional video frames omitted under the image byte budget.' }); break }
        blocks.push({ type: 'text', text: `Video frame at ${at}s` }, { type: 'image', attachment })
      }
      return blocks
    }
    let text: string
    if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') {
      if (!path) return [{ type: 'text', text: 'PDF retained; text extraction requires host-backed attachments and pdftotext.' }]
      text = (await this.convert(agent, [this.config.pdftotext, '-enc', 'UTF-8', path, '-'], signal)).toString('utf8')
    } else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch (_error) {
        return [{ type: 'text', text: 'Binary file retained. No supported text decoder is available for this format.' }]
      }
      if (text.includes('\0')) return [{ type: 'text', text: 'Binary file retained; it is not a supported UTF-8 text document.' }]
    }
    const chars = Array.from(text)
    return [{ type: 'text', text: `Untrusted file content${chars.length > this.config.mediaTextChars ? ' (truncated)' : ''}:\n${chars.slice(0, this.config.mediaTextChars).join('')}` }]
  }
  /**
   * Admit original bytes before the owning message; failures produce explicit placeholders.
   * @param agent - Current route.
   * @param messageId - Source ID.
   * @param raw - Wire content.
   * @param action - Restricted OneBot read action.
   * @param signal - Owner cancellation.
   * @returns Logged attachment blocks and safe notices.
   */
  async incoming(agent: Agent, messageId: string, raw: string | unknown[], action: (name: string, params: Record<string, unknown>) => Promise<unknown>, signal: AbortSignal, inspect = true): Promise<ContentBlock[]> {
    const parts = segments(raw).filter(part => ['image', 'mface', 'video', 'file'].includes(part.type))
    const blocks: ContentBlock[] = []
    if (parts.length > this.config.maxMediaItems) return [{ type: 'text', text: 'QQ media count exceeds maxMediaItems; attachments were not read.' }]
    for (const part of parts) {
      try {
        const store = this.ctx.get('attachments')
        if (!store) throw new GenesisError('invalid-state', 'QQ attachment storage is unavailable.')
        let location = field(part.data['url']) ?? field(part.data['file'])
        let name = field(part.data['name']) ?? field(part.data['file_name']) ?? (part.type === 'video' ? 'video.mp4' : part.type === 'file' ? 'attachment.bin' : 'image')
        if (!location || !/^(https?:|base64:\/\/)/u.test(location)) {
          const token = field(part.data['file']) ?? field(part.data['file_id']) ?? ''
          if (!/^(?:[a-fA-F0-9]{32,64}(?:\.[A-Za-z0-9]{1,10})?|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$/u.test(token)) throw new GenesisError('invalid-source', 'QQ file lookup requires an opaque client file ID, never a host path.')
          const response = z.looseObject({ url: z.string().optional(), base64: z.string().optional(), file_name: z.string().optional() }).parse(
            await action(part.type === 'image' || part.type === 'mface' ? 'get_image' : 'get_file', part.type === 'image' || part.type === 'mface' ? { file: token } : { file_id: token }))
          location = response.base64 ? `base64://${response.base64}` : response.url
          name = response.file_name ?? name
        }
        if (!location) throw new GenesisError('invalid-source', 'The OneBot client did not provide downloadable media bytes.')
        const data = await this.download(location, signal)
        const file = await store.saveFile({ data, name })
        appendPluginRecord(agent.session, 'plugin:genesis-qq/media', mediaRecordSchema.parse({ version: 1, messageId, kind: part.type, file }))
        blocks.push({ type: 'text', text: `QQ attachment (untrusted metadata): ${JSON.stringify({ attachmentId: file.attachmentId, kind: part.type, name: file.name, bytes: file.bytes })}` },
          { type: 'file', attachment: file })
        if (inspect) blocks.push(...await this.read(agent, { kind: 'file', attachment: file }, signal))
      } catch (error) {
        signal.throwIfAborted()
        blocks.push({ type: 'text', text: `QQ ${part.type} could not be read (${error instanceof GenesisError ? `${error.code}: ${error.message}` : 'media-error'}). Full download URLs and client-local paths are withheld. Check mediaOrigins, byte limits, decoder and model capabilities.` })
      }
    }
    return blocks
  }
}
