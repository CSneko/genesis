/** Built-in optional internal OneBot companion, enabled only through operator settings. @module */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { isAbsolute } from 'node:path'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CompanionStore, companionDomain } from './state.ts'
import { CompanionController } from './controller.ts'
import { CompanionGateway } from './gateway.ts'
export { CompanionGateway } from './gateway.ts'

/** Deployment limits; editable connection and sleep policy belong to the settings owner. */
export interface Config {
  /** Genesis preset whose operator Web conversations may recall the private partner interpretation. */
  lifePreset: string
  /** Dedicated directory used to attach the persistent internal conversation to the Web workspace. */
  cwd: string
  /** Maximum serialized model conversation characters before a new internal request is refused. */
  contextChars: number
  /** Maximum text characters in a single internal message. */
  maxTextChars: number
  /** Maximum characters in the current attributed relationship interpretation. */
  maxUnderstandingChars: number
  /** Maximum journal messages; capacity refusal retains existing evidence. */
  maxRecords: number
  /** Maximum complete serialized partner projection. */
  maxStateChars: number
  /** Maximum messages retrieved for prompts and settings. */
  historyLimit: number
  /** Maximum output tokens for each main-model internal request. */
  maxTokens: number
  /** Maximum time for one complete internal conversation. */
  exchangeMs: number
  /** Schedule and cancellation sampling interval during active exchanges. */
  pollMs: number
  /** Explicit partner wake override duration. */
  wakeMs: number
  /** Socket handshake deadline. */
  connectTimeoutMs: number
  /** OneBot heartbeat interval; sends no model-triggering message. */
  heartbeatMs: number
  /** Maximum incoming and outgoing UTF-8 JSON frame bytes. */
  maxFrameBytes: number
  /** Maximum accepted queued OneBot actions. */
  maxPending: number
}
/** Validate resource limits before loading storage or network work. */
export const Config: Schema<Config> = Schema.object({
  lifePreset: Schema.string().default('life'),
  cwd: Schema.string().default(process.cwd()), contextChars: Schema.natural().min(4096).default(128000),
  maxTextChars: Schema.natural().min(1).max(16000).default(2000),
  maxUnderstandingChars: Schema.natural().min(1).max(8000).default(2000),
  maxRecords: Schema.natural().min(1).default(10000), maxStateChars: Schema.natural().min(4096).default(20000000),
  historyLimit: Schema.natural().min(1).max(50).default(10), maxTokens: Schema.natural().min(128).max(16384).default(2048),
  exchangeMs: Schema.natural().min(1000).max(3600000).default(300000), pollMs: Schema.natural().min(100).max(60000).default(1000),
  wakeMs: Schema.natural().min(1000).max(86400000).default(1800000),
  connectTimeoutMs: Schema.natural().min(100).max(60000).default(10000), heartbeatMs: Schema.natural().min(1000).max(60000).default(15000),
  maxFrameBytes: Schema.natural().min(1024).max(1048576).default(65536), maxPending: Schema.natural().min(1).max(64).default(8),
})
/** Loader plugin identity. */
export const name = 'experimental-genesis-companion'
/** Required owners survive socket, inference and storage teardown. */
export const inject = ['genesis', 'genesisMessaging', 'agents', 'agentPresets', 'agentDefaultModel', 'sessions', 'sessionPersistence', 'systemPrompt', 'tools', 'storageDomain', 'credentials']
/** Register controls and restore settings; enabling a socket never starts a conversation.
 * @param ctx - Cordis effect owner.
 * @param config - Validated deployment bounds.
 * @returns After storage and optional socket restore; connection errors remain visible in settings.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (!isAbsolute(config.cwd)) throw new GenesisError('invalid-state', 'Companion cwd must be an absolute dedicated workspace directory.')
  const store = new CompanionStore(await ctx.storageDomain.open(companionDomain), config.maxRecords, config.maxStateChars)
  const controller = new CompanionController(ctx, store, config)
  ctx.effect(() => () => controller.close())
  await store.start((await ctx.genesis.snapshot()).identity.id)
  ctx.tools.register(defineTool({
    name: 'genesis_companion_pause',
    description: 'Pause the current private conversation with the AI partner and send nothing further this round. This tool is only valid inside a partner conversation; call it when you want to stop for now instead of apologizing or explaining.',
    parameters: {},
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (_args, exec) => {
      exec.signal.throwIfAborted()
      if (exec.agent === undefined || !controller.pauseExchange(exec.agent.session.id)) {
        throw new GenesisError('invalid-source', 'There is no active partner conversation to pause.')
      }
      return { paused: true }
    },
  }))
  ctx.genesisMessaging.register(controller.messageProvider())
  await ctx.plugin(CompanionGateway, controller)
  await controller.start()
}
