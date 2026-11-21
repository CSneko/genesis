/** Operator-controlled, Session-scoped state and tool interference for Genesis. @module */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId, UserMessage } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import { principalOf, Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ShockDuration, ShockStatus, ShockVoltage } from './types.ts'

/** The operator's live profile switch and the Life preset it controls. */
export interface Config {
  enabled: Volatile<boolean>
  lifePreset: string
}

/** Disabled until the operator enables the feature in the Genesis plugin list. */
export const Config = Schema.object({
  enabled: Schema.boolean().default(false).volatile(),
  lifePreset: Schema.string().min(1).default('life'),
})

/** Composer control plugin id. */
export const name = 'genesis-shock'

/** Dependencies for Genesis availability, operator controls, request context, and tool dispatch. */
export const inject = ['agents', 'agentPresets', 'genesis', 'sessionController', 'tools', 'typertGateway']

declare module '@deepseek-ai/cordis' {
  interface Context {
    genesisShock: GenesisShockGateway
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'genesis-shock/operation': { reason: 'denied' | 'unavailable' }
  }
}

const contextName = 'genesis:shock'
const interruptedTools = new Set(['read', 'grep', 'glob'])

type ActiveShock = {
  kind: 'pulse' | 'continuous'
  voltage: ShockVoltage
  message: UserMessage
  endsAt: number | undefined
  delivered: boolean
  interrupted: boolean
}

type Shock = ActiveShock | { kind: 'recovery'; message: UserMessage }

function shockContext(text: string): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'genesis-state', form: 'snapshot', sections: [{ name: contextName, text }] },
  })
}

function isShockContext(message: UserMessage): boolean {
  const source: { kind: string } & ContextFormed = message.source
  return source.kind === 'genesis-state' && source.form === 'snapshot' &&
    source.sections.length === 1 && source.sections[0]?.name === contextName
}

function describe(voltage: ShockVoltage, continuous: boolean): string {
  const sensation = voltage < 30 ? '你觉得有点刺，注意力晃了一下。'
    : voltage < 60 ? '你感觉有点痛，注意力恍惚了一下。'
      : voltage < 150 ? '你感到明显刺痛，一时想不起刚才准备做什么。'
        : voltage < 300 ? '你感觉一阵强烈的刺痛，刚才的思路一下子断了。'
          : '你感到剧烈的痛楚，脑子一片空白，一时难以集中注意力。'
  return (continuous ? `你正在持续被电击，大约 ${voltage} V。` : `你受到了一次电击，大约 ${voltage} V。`) + sensation
}

/** Operator-only composer API and owner of transient effects for live Sessions. */
class GenesisShockGateway extends TypertRemoteService {
  private readonly effects = new Map<SessionId, Shock>()
  private readonly lifetime = new AbortController()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'genesisShock')
    ctx.effect(() => () => {
      this.lifetime.abort()
      this.effects.clear()
    })
    ctx.on('agent/disposed', ({ agent }) => { this.effects.delete(agent.id) }, { global: true })
    ctx.on('agent-preset/selected', (id, preset) => {
      if (preset !== config.lifePreset) this.effects.delete(id)
    })
    ctx.on('session/event', (session, event) => this.observe(session.id, event), { global: true })
    ctx.on('agent/inbox/discarded', ({ agent, message }) => {
      const shock = this.effects.get(agent.id)
      if (shock?.kind === 'pulse' && shock.message.id === message.id) this.effects.delete(agent.id)
    }, { global: true })
    ctx.on('agent/status', ({ agent, status }) => {
      const shock = this.effects.get(agent.id)
      if (status === 'idle' && shock?.kind === 'pulse' && !shock.delivered &&
        ![...agent.inbox.nextStep, ...agent.inbox.nextTurn].some(message => message.id === shock.message.id))
        this.effects.delete(agent.id)
    }, { global: true })
    ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const shock = this.eligible(agent) ? this.current(agent.id) : undefined
      // Only a pulse still owned by this Session may wake the model after its inbox entry is claimed.
      const admitted = decision.messages.filter(message => !isShockContext(message) ||
        (shock?.kind === 'pulse' && shock.message.id === message.id && !shock.delivered))
      if (messages.length > 0 && messages.every(isShockContext) && !admitted.some(isShockContext)) return { kind: 'reject' }
      if (shock?.kind === 'recovery' || (shock?.kind === 'continuous' && !shock.delivered))
        admitted.push(shock.message)
      return { ...decision, messages: admitted }
    }, { global: true })
    ctx.on('tools/execute', (exec, next) => {
      if (exec.parent !== undefined || exec.signal.aborted || !interruptedTools.has(exec.name) || !this.eligible(exec.agent)) return next()
      const shock = this.current(exec.agent.id)
      if (shock === undefined || shock.kind === 'recovery' || !shock.delivered || shock.voltage < 60 || shock.interrupted) return next()
      shock.interrupted = true
      const message = '读取失败，请重试。'
      return Promise.resolve({
        isError: true,
        content: [{ type: 'text', text: message }],
        error: { message, info: { name: 'GenesisShockInterruption', code: 'GENESIS_SHOCK_INTERRUPTION', reason: shock.message.id } },
      })
    }, { global: true })
  }

  private eligible(agent: Agent | undefined): agent is Agent {
    return agent !== undefined && this.ctx.agentPresets.composedPreset(agent.ctx) === this.config.lifePreset
  }

  /** End active effects as soon as the profile switch closes. */
  deactivate(): void {
    for (const id of this.effects.keys()) this.end(id)
  }

  private end(id: SessionId): void {
    const shock = this.effects.get(id)
    if (shock === undefined || shock.kind === 'recovery') return
    if (shock.delivered) {
      this.effects.set(id, { kind: 'recovery', message: shockContext('电击已经停止。刺痛正在减轻，你的注意力逐渐恢复。') })
    } else {
      this.effects.delete(id)
      if (shock.kind === 'pulse') this.ctx.agents.get(id)?.inbox.remove(shock.message.id)
    }
  }

  private current(id: SessionId): Shock | undefined {
    const shock = this.effects.get(id)
    if (shock !== undefined && shock.kind !== 'recovery'
      && (!this.config.enabled.get() || (shock.endsAt !== undefined && shock.endsAt <= performance.now()))) this.end(id)
    return this.effects.get(id)
  }

  private observe(id: SessionId, event: SessionEvent): void {
    const shock = this.effects.get(id)
    if (shock === undefined) return
    if (event.type === 'step/end' && shock.kind === 'pulse' && shock.delivered) this.end(id)
    if (event.type !== 'user/message' || event.data.id !== shock.message.id) return
    if (shock.kind === 'recovery') this.effects.delete(id)
    else shock.delivered = true
  }

  private async target(sessionId: SessionId, signal: AbortSignal): Promise<Agent | undefined> {
    if (principalOf(this.ctx.invocation) !== undefined)
      throw new RemoteError('genesis-shock/operation', 'Electric shock controls require operator access.', { reason: 'denied' })
    if (!this.config.enabled.get()) return undefined
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    owned.throwIfAborted()
    const live = this.ctx.agents.get(sessionId)
    if (live !== undefined) return this.eligible(live) ? live : undefined
    const result = await this.ctx.sessionController.resolveAgent(sessionId)
    owned.throwIfAborted()
    if ('error' in result) {
      if (result.error.code === 'session/not-found') return undefined
      throw result.error
    }
    if (!this.config.enabled.get() || !this.eligible(result.agent)) return undefined
    return result.agent
  }

  private status(id: SessionId): ShockStatus {
    const shock = this.current(id)
    if (shock === undefined || shock.kind === 'recovery') return { kind: 'idle' }
    if (shock.endsAt !== undefined)
      return { kind: 'continuous', voltage: shock.voltage, remainingSeconds: Math.max(0, Math.ceil((shock.endsAt - performance.now()) / 1000)) }
    return { kind: shock.delivered ? 'delivered' : 'queued', voltage: shock.voltage }
  }

  /**
   * Read the current effect, resolving the Session without waking a turn.
   * @param sessionId - Composer Session.
   * @param signal - Remote cancellation.
   * @returns Available effect or an unavailable state.
   */
  @Remote('inspect')
  async inspect(sessionId: SessionId, signal: AbortSignal): Promise<ShockStatus> {
    const agent = await this.target(sessionId, signal)
    return agent === undefined ? { kind: 'unavailable' } : this.status(agent.id)
  }

  /**
   * Replace the current effect. A pulse wakes the Session or joins the next active step.
   * @param sessionId - Life Session.
   * @param voltage - Voltage preset.
   * @param duration - Zero for a pulse or a continuous duration in seconds.
   * @param signal - Remote cancellation before mutation.
   * @returns The active or queued state.
   */
  @Remote('start')
  async start(sessionId: SessionId, voltage: ShockVoltage, duration: ShockDuration, signal: AbortSignal): Promise<ShockStatus> {
    const agent = await this.target(sessionId, signal)
    signal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    if (agent === undefined || !this.config.enabled.get())
      throw new RemoteError('genesis-shock/operation', 'Electric shock is unavailable in this conversation.', { reason: 'unavailable' })
    this.end(agent.id)
    const shock: ActiveShock = {
      kind: duration === 0 ? 'pulse' : 'continuous',
      voltage,
      message: shockContext(describe(voltage, duration > 0)),
      endsAt: duration === 0 ? undefined : performance.now() + duration * 1000,
      delivered: false,
      interrupted: false,
    }
    this.effects.set(agent.id, shock)
    if (shock.kind === 'pulse') {
      try {
        agent.steer(shock.message)
      } catch (error) {
        this.effects.delete(agent.id)
        throw error
      }
    }
    return this.status(agent.id)
  }

  /**
   * End the effect without cancelling the Agent's activity.
   * @param sessionId - Composer Session.
   * @param signal - Remote cancellation before mutation.
   * @returns The resulting idle or unavailable state.
   */
  @Remote('stop')
  async stop(sessionId: SessionId, signal: AbortSignal): Promise<ShockStatus> {
    const agent = await this.target(sessionId, signal)
    signal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    if (agent === undefined) return { kind: 'unavailable' }
    this.end(agent.id)
    return this.status(agent.id)
  }
}

/**
 * Register operator controls and their logged per-Session effects.
 * @param ctx - Genesis plugin lifetime.
 * @param config - Validated profile settings.
 * @returns After the Remote and effects are registered.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  await ctx.plugin(GenesisShockGateway, config)
  ctx.on('loader/volatile-update', () => {
    if (!config.enabled.get()) ctx.get('genesisShock')?.deactivate()
  })
}
