/** Bilibili reading with one Genesis writing path. @module */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as schema } from 'zod'
import { isAbsolute } from 'node:path'
import { apply as mountUpstream } from 'dsh-bili-humanism'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { WritingTypeId } from '@deepseek-ai/dsh-experimental-genesis'
import { readingGuide } from './guide.ts'
import * as LocalAsr from './local-asr.ts'
import type { LocalAsrConfig } from './local-asr.ts'

/** Validated trusted deployment configuration; account writes and upstream personality learning are unavailable. */
export interface Config {
  /** Enable the learnable local transcription tool; omission registers no ASR tool. */
  localAsr?: LocalAsrConfig | undefined
  /** Absolute private upstream ledger and inbox directory for this life. */
  dataDir: string
  /** Optional absolute read-credential file; empty uses public requests without account credentials. */
  credentialPath: string
  /** Trusted absolute Python executable; empty delegates to the upstream local environment. */
  pythonPath: string
  /** Trusted absolute ASR model directory; empty delegates to the upstream local environment. */
  asrModelPath: string
  /** Upstream estimated source-text tokens per reading, independent of model billing. */
  maxReadTokens: number
  /** Optional source-duration limit; omission retains upstream byte, request and wall-time budgets. */
  maxMediaSeconds?: number
  /** Only Agents composed with this preset may execute the integration tools. */
  lifePreset: string
  /** Stable category id; operator renames and disabling remain authoritative. */
  recordTypeId: string
  /** Initial display name for a newly created viewing-note category. */
  recordTypeName: string
  /** Maximum complete tool JSON characters admitted for decoding and evidence reconstruction. */
  sourceChars: number
}
/** Trusted paths and budgets; no model input can change these values. */
export const Config: z<Config> = z.object({
  localAsr: z.union([z.const(undefined), z.object({
    timeoutMs: z.natural().min(1000).max(3600000).default(180000),
    graceMs: z.natural().min(1).max(60000).default(1000),
    maxOutputBytes: z.natural().min(1024).max(16000000).default(1000000),
  })]),
  dataDir: z.string().required(),
  credentialPath: z.string().default(''),
  pythonPath: z.string().default(''),
  asrModelPath: z.string().default(''),
  maxReadTokens: z.natural().min(1).default(60000),
  maxMediaSeconds: z.natural().min(1).required(false),
  lifePreset: z.string().default('life'),
  recordTypeId: z.string().pattern(/^[a-z][a-z0-9-]{0,63}$/).default('viewing-notes'),
  recordTypeName: z.string().default('观影札记'),
  sourceChars: z.natural().min(1).max(1000000).default(100000),
})
/** Loader plugin name. */
export const name = 'experimental-genesis-bili-humanism'
/** Existing life, tools and replay owners are prerequisites. */
export const inject = ['genesis', 'genesisRecords', 'tools', 'agents', 'agentPresets']

/**
 * Mount the pinned reader and its derived Genesis guidance.
 * @param ctx - Cordis owner; accepted tool bodies settle before upstream storage closes.
 * @param config - Trusted private paths, Life preset and explicit retrieval limits.
 * @returns After tools and the shared writing category are ready; loading never fetches videos or imports memories.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Bilibili integration requires Node.js 24 or newer.')
  for (const [field, path] of Object.entries({ dataDir: config.dataDir, credentialPath: config.credentialPath,
    pythonPath: config.pythonPath, asrModelPath: config.asrModelPath })) {
    if ((field === 'dataDir' || path !== '') && !isAbsolute(path)) throw new Error(`${field} must be an absolute private path.`)
  }
  const recordType = brandString<WritingTypeId>(config.recordTypeId)
  await ctx.genesisRecords.ensureType(recordType, config.recordTypeName, new AbortController().signal)
  const preset = await ctx.agentPresets.resolve(config.lifePreset)
  if (preset.broken !== undefined) throw new Error('The configured Life preset is unavailable. Inspect its configuration before loading Bilibili tools.')
  const participates = (agent: Agent | undefined) => agent !== undefined && ctx.agentPresets.composedPreset(agent.ctx) === config.lifePreset
  const upstream = (tool: string) => tool.startsWith('bili_humanism_')
  mountUpstream(ctx, { dataDir: config.dataDir, credentialPath: config.credentialPath,
    pythonPath: config.pythonPath, asrModelPath: config.asrModelPath, maxReadTokens: config.maxReadTokens,
    ...(config.maxMediaSeconds === undefined ? {} : { maxMediaSeconds: config.maxMediaSeconds }),
    enablePersonalityLearning: false, enablePostViewingQuestions: false,
    enablePersonalityShadow: false, enableDailyFetching: false, enableHistoryWrites: false,
    enableFavoriteWrites: false, enableLikeWrites: false, enableCoinWrites: false })
  if (config.localAsr !== undefined) await ctx.plugin(LocalAsr, {
    dataDir: config.dataDir, credentialPath: config.credentialPath, pythonPath: config.pythonPath,
    asrModelPath: config.asrModelPath, maxReadTokens: config.maxReadTokens,
    ...(config.maxMediaSeconds === undefined ? {} : { maxMediaSeconds: config.maxMediaSeconds }),
    ...config.localAsr,
  })
  ctx.tools.guard((exec) => {
    if (exec.name === 'bili_humanism_memory') return 'Personal memories are managed by Genesis.'
    if (exec.name === 'bili_humanism_journal') return 'Write viewing notes with genesis_record.'
    if (upstream(exec.name) && !participates(exec.agent)) {
      return 'Bilibili life experiences are available only in the configured Life preset.'
    }
    if (upstream(exec.name) && JSON.stringify(exec.arguments).length > config.sourceChars) {
      return 'Bilibili arguments exceed sourceChars. Shorten the input or increase the trusted budget before retrying.'
    }
    return undefined
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (!upstream(exec.name) || result.isError) return next()
    if (exec.name === 'bili_humanism_guide') {
      const guide = JSON.stringify(readingGuide(config.recordTypeId))
      if (guide.length > config.sourceChars) return { kind: 'block', feedback: [{ type: 'text', text: 'The reading guide exceeds sourceChars. Increase the trusted budget before reading it.' }] }
      return { kind: 'accept', value: guide }
    }
    let value: unknown = result.value
    if (typeof value === 'string' && value.length <= config.sourceChars) {
      try { value = JSON.parse(value) } catch (_error) { value = undefined /* Invalid upstream JSON is not usable reading evidence. */ }
    }
    if (value !== undefined && JSON.stringify(value).length > config.sourceChars) value = undefined
    if (value === undefined) return { kind: 'block', feedback: [{ type: 'text',
      text: 'Bilibili output is invalid JSON or exceeds sourceChars. Inspect the local source and configured budget before retrying.' }] }
    const failure = schema.object({ error: schema.string(), message: schema.string() }).safeParse(value)
    if (failure.success) return { kind: 'block', feedback: [{ type: 'text', text: JSON.stringify(failure.data) }] }
    if (exec.name === 'bili_humanism_read' && schema.object({ result: schema.object({
      coverage: schema.object({ state: schema.literal('read_failed') }),
    }) }).safeParse(value).success) {
      const visual = schema.object({ visual: schema.object({ status: schema.literal('frames_ready') }) }).safeParse(value)
      if (visual.success) return next()
      const source = schema.object({ result: schema.json(), visual: schema.json().optional() }).parse(value)
      return { kind: 'block', feedback: [{ type: 'text', text: JSON.stringify({
        error: 'READING_UNCONFIRMED', message: 'Bilibili text reading is unconfirmed. Use the saved reading ID for explicit frame extraction or local ASR.',
        ...source,
      }) }] }
    }
    return next()
  }, { global: true })

  const restrictions = new Map<Agent, () => void>()
  const restrict = (agent: Agent) => {
    restrictions.get(agent)?.()
    const deny = participates(agent) ? ['bili_humanism_memory', 'bili_humanism_journal']
      : [...ctx.tools.schemas().map(tool => tool.name).filter(upstream)]
    restrictions.set(agent, agent.ctx.tools.restrict({ deny }))
  }
  ctx.on('agent/created', ({ agent }) => { restrict(agent) }, { global: true })
  ctx.on('agent-preset/selected', (id) => {
    const agent = ctx.agents.get(id)
    if (agent !== undefined) restrict(agent)
  }, { global: true })
  ctx.on('agent/disposed', ({ agent }) => { restrictions.get(agent)?.(); restrictions.delete(agent) }, { global: true })
  ctx.effect(() => () => { for (const dispose of restrictions.values()) dispose(); restrictions.clear() })
  for (const agent of ctx.agents.list()) restrict(agent)
  const lifetime = new AbortController()
  const executions = new Set<Promise<unknown>>()
  ctx.on('tools/execute', async (exec, next) => {
    if (!upstream(exec.name)) return next()
    const original = exec.signal
    exec.signal = AbortSignal.any([original, lifetime.signal])
    const operation = next()
    executions.add(operation)
    try { return await operation } finally { executions.delete(operation); exec.signal = original }
  }, { global: true })
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled(executions)
  })
}
