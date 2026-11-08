/** OpenAI-compatible embedding transport and semantic scoring. @module */
import { attributionHeaders, assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { MemoryConfig } from './config.ts'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { EmbeddingSettings } from './status-types.ts'
import { GenesisError } from './error.ts'
import type { MemoryEmbedding } from './model.ts'

/**
 * Resolve legacy deployment values before any GUI preferences have been saved.
 * @param memory - Legacy deployment configuration; absent means setup is pending.
 * @returns Public endpoint fields, including an optional credential reference.
 */
export function embeddingSettings(memory: MemoryConfig | undefined): EmbeddingSettings {
  return { url: memory?.embeddingUrl ?? '', model: memory?.embeddingModel ?? '',
    dimensions: memory?.embeddingDimensions ?? 0,
    ...(memory?.embeddingKeyEnv === undefined ? {} : { keyRef: memory.embeddingKeyEnv }) }
}

/**
 * Capture one embedding deployment for an operation, retaining its credential store.
 * @param ctx - Optional existing credentials provider.
 * @param memory - Auxiliary routes and limits.
 * @param settings - Fixed preferences captured for this operation.
 * @returns A fixed embedding space; incomplete setup is rejected before network access.
 */
export function configuredEmbeddings(ctx: Context, memory: MemoryConfig, settings: EmbeddingSettings): MemoryEmbeddings {
  const { embeddingKeyEnv: _legacyKey, ...limits } = memory
  return new MemoryEmbeddings({ ...limits, embeddingUrl: settings.url, embeddingModel: settings.model,
    embeddingDimensions: settings.dimensions, ...(settings.keyRef === undefined ? {} : { embeddingKeyEnv: settings.keyRef }) }, ctx.get('credentials'))
}

/**
 * Resolve optional semantic retrieval without hiding incomplete endpoint configuration.
 * @param ctx - Current credential provider.
 * @param memory - Inference limits.
 * @param settings - Current embedding preferences; disabled or wholly empty selects text mode.
 * @returns Captured embedding transport, or undefined for Markdown/text retrieval.
 */
export function optionalEmbeddings(ctx: Context, memory: MemoryConfig, settings: EmbeddingSettings): MemoryEmbeddings | undefined {
  if (settings.enabled === false || (!settings.url && !settings.model && settings.dimensions === 0)) return undefined
  return configuredEmbeddings(ctx, memory, settings)
}

/** A deployment-bound embedding space; endpoint/model/dimensions cannot share stale vectors. */
export class MemoryEmbeddings {
  /** Digest of the configured endpoint, model and dimensions. */
  readonly space: string
  private readonly headers: Record<string, string>
  /**
   * Validate the embedding space. Credentials are resolved per request so first-run configuration can finish before use.
   * @param config - Resolved embedding deployment and response limits.
   * @param credentials - Existing store resolved on every embedding request; absent uses the environment.
   */
  constructor(private readonly config: MemoryConfig, private readonly credentials?: Pick<CredentialProvider, 'resolve'>) {
    if (!config.embeddingUrl || !config.embeddingModel.trim() || config.embeddingDimensions < 1) {
      throw new GenesisError('memory-provider', 'Complete embedding settings in Knowledge Base before initialization or memory use.')
    }
    const url = new URL(config.embeddingUrl)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new GenesisError('memory-provider', 'Configure an HTTP(S) embeddingUrl without embedded credentials.')
    }
    this.headers = { ...attributionHeaders(), 'content-type': 'application/json' }
    this.space = createHash('sha256').update(JSON.stringify([url.href, config.embeddingModel, config.embeddingDimensions])).digest('hex')
  }

  /**
   * Resolve the current credential without exposing it in settings or logs.
   * @returns A validated key, or undefined for a keyless endpoint.
   */
  async credential(): Promise<string | undefined> {
    const ref = this.config.embeddingKeyEnv
    if (ref === undefined) return undefined
    const stored = await this.credentials?.resolve(credentialRef(ref))
    return assertUsableApiKey(stored?.value ?? process.env[ref] ?? '', 'Genesis embeddings', ref)
  }

  /**
   * Embed one bounded input, validating the response before indexing it.
   * @param text - Query or memory text.
   * @param signal - Operation deadline and caller cancellation.
   * A single-item response may omit index; an explicit index must be numeric zero.
   * @returns A nonzero finite vector in this deployment's space.
   */
  async embed(text: string, signal: AbortSignal): Promise<MemoryEmbedding> {
    signal.throwIfAborted()
    if (!text.trim() || text.length > this.config.inputChars) {
      throw new GenesisError('capacity', 'Embedding input is empty or exceeds memory.inputChars. Narrow the query.')
    }
    const key = await this.credential()
    signal.throwIfAborted()
    const response = await fetch(this.config.embeddingUrl, {
      method: 'POST', headers: { ...this.headers, ...(key === undefined ? {} : { authorization: `Bearer ${key}` }) },
      signal, redirect: 'error',
      body: JSON.stringify({ model: this.config.embeddingModel, input: text, dimensions: this.config.embeddingDimensions }),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new GenesisError('memory-provider', `Genesis embedding request failed (HTTP ${response.status}). Check the configured endpoint, model and credential.`)
    }
    // Bound the complete wire response before JSON decoding; vectors can otherwise exhaust memory.
    const limit = this.config.embeddingDimensions * 40 + this.config.outputChars
    if (response.body === null) throw new GenesisError('memory-provider', 'Embedding response has no body. Check the embedding service.')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let json = ''
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > limit) throw new GenesisError('capacity', 'Embedding response exceeds the configured dimension budget.')
        json += decoder.decode(chunk.value, { stream: true })
      }
      json += decoder.decode()
    } finally { await reader.cancel() }
    const parsed = z.object({ data: z.tuple([z.object({
      index: z.unknown().optional(), embedding: z.array(z.number()).length(this.config.embeddingDimensions),
    })]) }).parse(JSON.parse(json))
    const item = parsed.data[0]
    if (item.index !== undefined && item.index !== 0) {
      const received = typeof item.index === 'number' && Number.isFinite(item.index) ? String(item.index)
        : item.index === null ? 'null' : typeof item.index
      throw new GenesisError('memory-provider',
        `Embedding response data[0].index must be numeric 0 or omitted; received ${received}. Check the endpoint response format.`)
    }
    const vector = item.embedding
    const norm = Math.hypot(...vector)
    if (!Number.isFinite(norm) || norm === 0) throw new GenesisError('memory-provider', 'Embedding response has an invalid vector. Check the embedding model.')
    return { space: this.space, vector: vector.map(value => value / norm) }
  }
}

/**
 * Compare equal-space vectors; incompatible durable vectors are never searched silently.
 * @param left - Query embedding.
 * @param right - Indexed embedding.
 * @returns Cosine similarity, or a typed refusal for incompatible dimensions/spaces.
 */
export function cosine(left: MemoryEmbedding, right: MemoryEmbedding): number {
  if (left.space !== right.space || left.vector.length !== right.vector.length) {
    throw new GenesisError('memory-provider', 'Memory vectors belong to different embedding spaces. Reindex before searching.')
  }
  const denominator = Math.hypot(...left.vector) * Math.hypot(...right.vector)
  if (!Number.isFinite(denominator) || denominator === 0) throw new GenesisError('memory-provider', 'Stored memory has an invalid embedding. Reindex before searching.')
  // Equal dimensions above guarantee the corresponding component exists.
  // oxlint-disable-next-line typescript/no-non-null-assertion
  return left.vector.reduce((sum, value, index) => sum + value * right.vector[index]!, 0) / denominator
}
