/** Optional Genesis video toolkit; all model-visible instructions and results use logged tool calls. @module */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolkitId } from '@deepseek-ai/dsh-experimental-genesis/types'
import { isAbsolute, parse } from 'node:path'
import { access } from 'node:fs/promises'
import { z } from 'zod'
import { VideoController, VideoError } from './controller.ts'
import { videoGuide } from './guide.ts'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import type {} from '@deepseek-ai/dsh-jobs'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    /** Managed Remotion rendering with separately durable project/job artifacts. */
    video: 'video'
  }
}

/** Trusted local deployment paths and finite editing/rendering budgets. */
export interface Config {
  /** Absolute private project directory; this exact directory is granted to operator Life Sessions in workspace-write mode. */
  dataDir: string
  /** Only this composed preset can execute video operations. */
  lifePreset: string
  /** Already installed Chromium executable; empty disables rendering while retaining editing and inspection. */
  browserExecutable: string
  /** Operator-selected ffprobe executable; used only for imported-media metadata. */
  ffprobeExecutable: string
  /** Maximum complete serialized model operation input, in characters. */
  inputChars: number
  /** Maximum complete serialized tool response, in characters, including metadata. */
  resultChars: number
  /** Maximum characters of source JSON returned by each read. */
  pageChars: number
  /** Maximum list entries per response. */
  pageSize: number
  /** Maximum live projects in dataDir. */
  maxProjects: number
  /** Maximum immutable revisions per project. */
  maxRevisions: number
  /** Maximum imported assets per project. */
  maxAssets: number
  /** Maximum retained render admissions per project. */
  maxJobs: number
  /** Wall-clock deadline for media metadata extraction. */
  probeTimeoutMs: number
  /** Maximum bytes of one imported media file; buffered by the local file provider. */
  maxAssetBytes: number
  /** Maximum bytes admitted for completed output delivery. */
  maxOutputBytes: number
  /** Maximum self-contained Player HTML and its embedded asset bytes before compilation. */
  maxPreviewBytes: number
  /** Maximum composition duration in seconds. */
  maxDurationSeconds: number
  /** Maximum simultaneous local render jobs. */
  maxConcurrentRenders: number
  /** Number of Chromium render workers per job. */
  renderConcurrency: number
  /** Wall-clock deadline for a render job, including bundling. */
  renderTimeoutMs: number
  /** Termination grace period for each managed process range. */
  graceMs: number
  /** Per-stream bounded diagnostic collection for child processes. */
  processOutputBytes: number
  /** Maximum recent progress characters in status results. */
  progressChars: number
  /** Interval between progress samples; does not decide completion. */
  progressIntervalMs: number
  /** Resolution multiplier for low-resolution preview exports. */
  previewScale: number
}
/** Validate paths and budgets before tools become available. */
export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().required(), lifePreset: Schema.string().default('life'),
  browserExecutable: Schema.string().default(''), ffprobeExecutable: Schema.string().default('ffprobe'),
  inputChars: Schema.natural().min(1024).max(1000000).default(100000),
  resultChars: Schema.natural().min(12000).max(1000000).default(24000),
  pageChars: Schema.natural().min(1).max(100000).default(3000), pageSize: Schema.natural().min(1).max(100).default(20),
  maxProjects: Schema.natural().min(1).default(100), maxRevisions: Schema.natural().min(1).default(200),
  maxAssets: Schema.natural().min(1).default(100), maxJobs: Schema.natural().min(1).default(100),
  probeTimeoutMs: Schema.natural().min(1000).max(300000).default(30000), maxAssetBytes: Schema.natural().min(1024).default(67108864),
  maxOutputBytes: Schema.natural().min(1024).default(134217728),
  maxPreviewBytes: Schema.natural().min(1024).max(268435456).default(25165824),
  maxDurationSeconds: Schema.number().min(1).max(3600).default(300),
  maxConcurrentRenders: Schema.natural().min(1).max(8).default(1), renderConcurrency: Schema.natural().min(1).max(16).default(2),
  renderTimeoutMs: Schema.natural().min(1000).max(3600000).default(600000), graceMs: Schema.natural().min(1).max(60000).default(1000),
  processOutputBytes: Schema.natural().min(1024).default(262144), progressChars: Schema.natural().min(1).max(10000).default(2000),
  progressIntervalMs: Schema.natural().min(100).max(10000).default(1000), previewScale: Schema.number().min(0.1).max(1).default(0.5),
})
/** Loader plugin identifier. */
export const name = 'experimental-genesis-video'
/** Reuse the actual Life, logged tools, local files, policy, confinement, processes and delivery owners. */
export const inject = ['agents', 'genesis', 'genesisToolkits', 'agentPresets', 'tools', 'fs', 'sandboxPolicy', 'sandbox', 'subprocess', 'attachments', 'jobs']

function renderResult(value: unknown): ContentBlock[] {
  const result = z.object({
    attachment: z.object({ attachmentId: z.string().transform(AttachmentId), name: z.string(), bytes: z.number() }).optional(),
    image: z.object({ attachmentId: z.string().transform(AttachmentId), mediaType: z.literal('image/png'), bytes: z.number(),
      width: z.number(), height: z.number(), name: z.string() }).optional(),
  }).parse(value)
  return [{ type: 'text', text: JSON.stringify(value) },
    ...(result.attachment === undefined ? [] : [{ type: 'file' as const, attachment: result.attachment }]),
    ...(result.image === undefined ? [] : [{ type: 'image' as const, attachment: result.image }])]
}

/**
 * Register one learnable operator-only video tool and its private artifact grant.
 * @param ctx - Cordis effect owner; unloading aborts and joins accepted work.
 * @param config - Validated deployment paths and resource budgets.
 * @returns After the optional toolkit is installed; no video, model call or browser download starts at load.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!isAbsolute(config.dataDir) || parse(config.dataDir).root === config.dataDir) throw new VideoError('configuration', 'Video dataDir must be an absolute private directory, not a filesystem root.')
  if (config.browserExecutable !== '' && !isAbsolute(config.browserExecutable)) throw new VideoError('configuration', 'Video browserExecutable must be an absolute installed Chromium path, or empty to disable rendering.')
  if (config.pageChars * 6 + config.progressChars > config.resultChars) throw new VideoError('configuration', 'Video resultChars must accommodate JSON-escaped pageChars plus progressChars. Reduce pageChars or increase resultChars.')
  const preset = await ctx.agentPresets.resolve(config.lifePreset)
  if (preset.broken !== undefined) throw new VideoError('configuration', 'The configured video Life preset is unavailable. Correct it before loading the plugin.')
  const controller = new VideoController(ctx, config)
  const directory = await controller.prepare()
  const alive = new AbortController()
  ctx.effect(() => () => { alive.abort() })
  ctx.effect(() => ctx.sandboxPolicy.registerWritableDirectory(directory, session => session !== undefined
    && controller.participates(ctx.agents.get(session.id)) && ctx.genesis.learningStatus().tools.includes('genesis_video')))
  ctx.effect(() => ctx.jobs.attachController('genesis-video'))
  // Rendering drains before its file grant and controller are released.
  ctx.effect(() => () => controller.close())
  const marker = await ctx.fs.resolve(directory + '/toolkit-installed.json')
  if (await ctx.fs.stat(marker) === undefined) {
    const catalogue = await ctx.genesisToolkits.inspect(alive.signal)
    if (!catalogue.entries.some(entry => entry.id === 'video')) {
      await ctx.genesisToolkits.save([...catalogue.entries, { id: brandString<ToolkitId>('video'), name: '视频制作',
        description: '使用 Remotion 保存剪辑工程、制作预览并导出视频', tools: ['genesis_video'] }], catalogue.revision, alive.signal)
    }
    await ctx.fs.writeText(marker, '{"version":1}', { kind: 'createIfAbsent' }, alive.signal,
      { mode: 'danger-full-access', workspaceRoot: directory })
  } else {
    const receipt = new TextDecoder().decode(await ctx.fs.readBytes(marker, alive.signal, 1024))
    z.strictObject({ version: z.literal(1) }).parse(JSON.parse(receipt))
  }
  ctx.tools.guard(exec => exec.name === 'genesis_video' && !controller.participates(exec.agent)
    ? 'Video tools require the configured operator Life conversation.' : undefined)
  ctx.on('agent/turn-stopping', ({ agent, signal }) => { if (signal.aborted) return controller.stop(agent) }, { global: true })
  ctx.on('agent/disposed', ({ agent }) => {
    void controller.stop(agent).catch((error: unknown) => {
      ctx.logger.error('Video cancellation failed during conversation disposal: %s', error instanceof Error ? error.message : String(error))
    })
  }, { global: true })
  ctx.tools.register(defineTool({
    name: 'genesis_video',
    description: 'Create persistent Remotion video projects, import local media, edit timelines or custom React scenes, build interactive Remotion Player previews without rendering MP4, render MP4, inspect/cancel jobs, and deliver completed output. Call action=guide first for exact operation inputs. Installed rendering dependencies do not imply visual understanding, speech transcription or publishing. Requires an operator Life conversation and the current Session file policy. No automatic dependency or browser installation; restart never replays rendering.',
    parameters: { action: { type: 'string', enum: ['guide', 'save', 'read', 'list', 'import', 'probe', 'preview', 'render', 'status', 'cancel', 'delete'], required: true },
      input: { type: 'json', description: 'Operation object documented by action=guide; omit for guide and an empty list request.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => renderResult(value) },
    async execute(args, exec) {
      if (!controller.participates(exec.agent)) throw new VideoError('operator-required', 'Video tools require a logged call in the configured operator Life conversation.')
      if (JSON.stringify(args).length > config.inputChars) throw new VideoError('input-limit', 'Video input exceeds inputChars. Shorten the source or split the project before retrying.')
      let value: unknown
      if (args.action === 'guide') {
        let browserReady = false
        if (config.browserExecutable) {
          browserReady = await access(config.browserExecutable).then(() => true, () => false)
        }
        value = { ...videoGuide, environment: { remotionVersion: '4.0.540', browserConfigured: config.browserExecutable !== '', browserPathExists: browserReady,
          maxDurationSeconds: config.maxDurationSeconds, maxAssetBytes: config.maxAssetBytes, maxOutputBytes: config.maxOutputBytes,
          maxConcurrentRenders: config.maxConcurrentRenders, dataDir: directory,
          tested: 'Only a completed job receipt establishes a successful render; browser presence does not.' } }
      } else value = await controller.execute(args.action, args.input ?? {}, exec.agent, exec.callId, exec.rootCallId, exec.signal)
      const response = z.json().parse(value)
      if (JSON.stringify(renderResult(response)).length > config.resultChars) throw new VideoError('result-limit', 'Video response exceeds resultChars. Request a smaller page; completed writes remain committed and must not be assumed rolled back.')
      return response
    },
    presentCall: args => ({ card: 'generic', title: 'Remotion', kind: ['guide', 'read', 'list', 'status', 'probe'].includes(args.action) ? 'read' : args.action === 'delete' ? 'delete' : 'execute', rawInput: args.action }),
  }))
}
