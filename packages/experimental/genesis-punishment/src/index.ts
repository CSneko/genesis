/** Optional Genesis punishment delivery; only explicit, authorized tool calls send requests. @module */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolkitId } from '@deepseek-ai/dsh-experimental-genesis/types'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-experimental-genesis'

/** Operator-owned destination, model instructions and request deadline. */
export interface Config {
  /** Live operator switch; disabled rejects calls and cancels active requests. */
  enabled: Volatile<boolean>
  /** Permit transport-bound QQ group Life conversations, subject to existing QQ tool permissions. */
  allowGroupChats: Volatile<boolean>
  /** Only this composed Life preset may invoke the tool. */
  lifePreset: string
  /** Complete model-visible tool description; never put credentials here. */
  description: Volatile<string>
  /** Model-visible level semantics; this text imposes no numeric validation bounds. */
  levelDescription: Volatile<string>
  /** Fixed HTTP(S) destination; not exposed in the tool schema or result. */
  webhookUrl: Volatile<string>
  /** Private request headers, for example Authorization. */
  webhookHeaders: Record<string, string>
  /** Deadline for one attempt; delivery is never retried automatically. */
  timeoutMs: number
}
/** Validate deployment fields before registering the tool. */
export const Config = Schema.object({
  enabled: Schema.boolean().default(false).volatile(),
  allowGroupChats: Schema.boolean().default(false).volatile(),
  lifePreset: Schema.string().min(1).default('life'),
  description: Schema.string().min(1).default('Punish the owner by sending a punishment level to the configured webhook. Use only within the owner\'s agreed rules. The usual scale is 0.0 to 1.0; follow the operator\'s level description. Acceptance confirms delivery, not the downstream action.').volatile(),
  levelDescription: Schema.string().min(1).default('Punishment level, conventionally 0.0 to 1.0. Other finite numbers are allowed when the operator defines another scale.').volatile(),
  webhookUrl: Schema.string().pattern(/^(?:https?:\/\/[^/?#@\s]+(?:[/?][^#\s]*)?)?$/u).default('').volatile(),
  webhookHeaders: Schema.dict(Schema.string()).default({}),
  timeoutMs: Schema.natural().min(1).max(2147483647).default(10000),
})
/** Cordis plugin identifier. */
export const name = 'genesis-punishment'
/** Life ownership, learnable toolkits and logged tool execution. */
export const inject = ['tools', 'genesis', 'genesisToolkits', 'agentPresets']

/** Safe failure report; remote effects may already have occurred after dispatch. */
export class PunishmentError extends Error {
  /** @param code - Stable failure category. @param message - Credential-free diagnosis and recovery action. */
  constructor(readonly code: 'configuration' | 'permission' | 'delivery', message: string) {
    super(message)
    this.name = 'PunishmentError'
  }
}

function destinationUrl(value: string): URL {
  let destination: URL
  try { destination = new URL(value) } catch (_error) {
    throw new PunishmentError('configuration', 'Set webhookUrl to an absolute HTTP(S) URL.')
  }
  if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password || destination.hash)
    throw new PunishmentError('configuration', 'webhookUrl requires HTTP(S), no fragment, and no embedded credentials. Use webhookHeaders for authentication.')
  return destination
}

/**
 * Register a learnable tool for operator conversations and explicitly permitted groups with no startup or replay delivery.
 * @param ctx - Effect owner; disposal aborts and joins all in-flight requests.
 * @param config - Validated destination and model-facing descriptions.
 * @returns After registration and the durable integration observation; no webhook is contacted at load.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (config.webhookUrl.get() !== '') destinationUrl(config.webhookUrl.get())
  let headers: Headers
  try {
    headers = new Headers(config.webhookHeaders)
    headers.set('Content-Type', 'application/json')
  } catch (_error) {
    throw new PunishmentError('configuration', 'Correct webhookHeaders to contain valid HTTP header names and values.')
  }
  const lifetime = new AbortController()
  const active = new Map<Promise<unknown>, AbortController>()
  ctx.effect(() => async () => {
    lifetime.abort()
    await Promise.allSettled([...active.keys()])
  })
  ctx.genesisToolkits.registerManaged(name, () => [{
    id: brandString<ToolkitId>('punishment'), name: '惩罚主人',
    description: '按主人配置的规则向指定 webhook 发送惩罚等级', tools: ['genesis_punish'], qqAccess: config.allowGroupChats.get() ? 'anyone' : 'disabled',
  }])
  await ctx.genesis.recordIntegrationState(name, 'initialized',
    'Punishment webhook tool registered; configuration, permission, learning and successful delivery are separate facts.')
  const register = () => ctx.tools.register(defineTool({
    name: 'genesis_punish',
    description: config.description.get(),
    parameters: { level: { type: 'number', required: true, description: config.levelDescription.get() } },
    timeoutMs: config.timeoutMs,
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true },
          level: { type: 'number', required: true },
          status: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    // Generic Web cards display the logged level and result without exposing the destination.
    presentCall: args => ({ card: 'generic', title: 'genesis_punish', rawInput: JSON.stringify(args) }),
    async execute(args, exec) {
      if (!config.enabled.get()) throw new PunishmentError('permission', 'Punishment is disabled. Enable it in Plugins → Punishment before calling.')
      const url = config.webhookUrl.get()
      if (url === '') throw new PunishmentError('configuration', 'Set the webhook URL in Plugins → Punishment before calling.')
      const preset = await ctx.agentPresets.resolve(config.lifePreset)
      if (preset.broken !== undefined)
        throw new PunishmentError('configuration', 'The punishment Life preset is unavailable. Correct lifePreset before calling.')
      const destination = destinationUrl(url)
      const agent = exec.agent
      const groupAllowed = agent !== undefined && config.allowGroupChats.get()
        && ctx.genesis.qqConversationOf(agent.id)?.kind === 'group'
      const operatorAllowed = agent !== undefined && ctx.genesis.isOperatorSession(agent.id) && !ctx.genesis.isQqSession(agent.id)
      if (agent === undefined || ctx.agentPresets.composedPreset(agent.ctx) !== config.lifePreset || (!operatorAllowed && !groupAllowed))
        throw new PunishmentError('permission', 'Punishment requires a private operator Life conversation or a QQ group with group chat access enabled in Punishment settings.')
      const stop = new AbortController()
      const signal = AbortSignal.any([exec.signal, lifetime.signal, stop.signal, AbortSignal.timeout(config.timeoutMs)])
      signal.throwIfAborted()
      const pending = (async () => {
        let response: Response
        try {
          response = await fetch(destination, {
            method: 'POST', headers, body: JSON.stringify({ level: args.level }), redirect: 'manual', signal,
          })
          await response.body?.cancel()
        } catch (_error) {
          // Network errors may contain the secret URL; do not retain them as a public cause.
          throw new PunishmentError('delivery', 'Webhook delivery was interrupted. The remote outcome is unknown. Check the receiver before sending again; no automatic retry occurred.')
        }
        if (!response.ok)
          throw new PunishmentError('delivery', `Webhook returned HTTP ${response.status}. The downstream outcome is unverified. Check the receiver before sending again; no redirect or automatic retry occurred.`)
        return { accepted: true, level: args.level, status: response.status }
      })()
      active.set(pending, stop)
      try { return await pending } finally { active.delete(pending) }
    },
  }), { when: () => config.enabled.get() && config.webhookUrl.get() !== '' })
  let unregister = register()
  ctx.on('loader/volatile-update', (paths) => {
    if (!config.enabled.get()) for (const stop of active.values()) stop.abort()
    if (paths.some(path => path[0] === 'description' || path[0] === 'levelDescription')) {
      unregister()
      unregister = register()
    }
  })
}
