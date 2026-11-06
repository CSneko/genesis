/** Optional conversation destinations behind the shared genesis_message tool. @module */
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SessionSeq } from '@deepseek-ai/dsh-session'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import { GenesisError } from './error.ts'
import type { Config } from './config.ts'

/** JSON-compatible result carried by the existing tool transcript. */
type MessageResult = z.infer<ReturnType<typeof z.json>>

/** Provider-owned address, distinct from a Harness Session id. */
export type MessageTargetId = Branded<'GenesisMessageTargetId'>
/** Discoverable destination; a provider resolves and owns its actual Session. */
export type MessageTarget = { target: MessageTargetId; kind: string; account: string; name: string; sessionId?: Agent['id'] }
const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('targets'), query: z.string().optional(), offset: z.number().int().nonnegative().optional() }),
  z.strictObject({ action: z.literal('send'), target: z.string().min(1).transform(brandString<MessageTargetId>), text: z.string().min(1) }),
  z.strictObject({ action: z.literal('forward'), target: z.string().min(1).transform(brandString<MessageTargetId>), messageId: z.string().min(1) }),
  z.strictObject({ action: z.literal('status'), id: z.string().min(1) }),
])
/** Shared tool request; providers retain their own address and receipt validation. */
export type MessageRequest = z.infer<typeof requestSchema>
/** Verified source of a logged tool action; no other source transcript is shared implicitly. */
export interface MessageInvocation {
  agent: Agent
  callId: ToolCallId
  signal: AbortSignal
  /** QQ's existing raw-text owner supplies this only after validating an explicit forward. */
  forwardedText?: string
}
/** Current operator input and exact logged tool request, captured before delivery. */
export interface MessageOrigin extends MessageInvocation { messageId: MessageId; seq: SessionSeq; request: MessageRequest }
/** Destination provider; disposing its registration withdraws new tool access. */
export interface MessageProvider {
  /** Stable registration name; duplicate owners fail at load. */
  name: string
  /** @param agent - Authorized initiating Agent. @param signal - Caller cancellation. @returns Bounded discoverable destinations. */
  targets(agent: Agent, signal: AbortSignal): Promise<MessageTarget[]>
  /** @param request - Parsed action. @returns Whether this provider owns its address or receipt namespace. */
  owns(request: Exclude<MessageRequest, { action: 'targets' }>): boolean
  /** @param request - Explicit text send or status query. @param origin - Verified source. @returns Provider receipt; uncertainty never authorizes replay. */
  execute(request: { action: 'send'; target: MessageTargetId; text: string } | { action: 'status'; id: string }, origin: MessageOrigin): Promise<MessageResult>
}
declare module '@deepseek-ai/cordis' { interface Context { genesisMessaging: LifeMessageRouter } }

/** Shared provider registration and authorization; QQ retains its scoped transport consumer. */
export class LifeMessageRouter extends Service {
  private readonly providers = new Map<string, MessageProvider>()
  private readonly lifetime = new AbortController()
  private readonly pending = new Set<Promise<unknown>>()
  /**
   * @param ctx - Life, tool and preset owners.
   * @param config - Existing text and retrieval budgets and Life preset selection.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'genesisMessaging')
    ctx.tools.register(defineTool({ name: 'genesis_message',
      description: 'Operator-requested cross-conversation text messaging. Use targets to discover exact available destinations, including an enabled AI partner conversation. send delivers the supplied text; forward shares only an explicitly selected original operator message; status reads a receipt from this source conversation. Sending to an AI partner may start a bounded internal exchange in its persistent Session and requires both sides awake. Never guess targets, automatically share unrelated private context, or retry uncertain delivery. QQ destinations follow the QQ connection and outbound allowlists.',
      parameters: { action: { type: 'string', required: true, enum: ['targets', 'send', 'forward', 'status'] },
        query: { type: 'string' }, offset: { type: 'integer' }, target: { type: 'string' }, text: { type: 'string' }, messageId: { type: 'string' }, id: { type: 'string' } },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        if (exec.agent === undefined || ctx.genesis.isQqSession(exec.agent.id)) throw new GenesisError('invalid-source', 'Use the current authenticated conversation messaging route.')
        const request = requestSchema.parse(args)
        const origin = this.origin(request, { agent: exec.agent, callId: exec.callId, signal: exec.signal })
        if (request.action === 'targets') {
          const query = request.query?.trim().toLowerCase() ?? ''
          if (query.length > this.config.resultChars) throw new GenesisError('capacity', 'Shorten the conversation search.')
          const found = (await this.targets(origin.agent, origin.signal)).filter(item => !query || item.name.toLowerCase().includes(query) || item.account === query || item.target === query)
          const offset = request.offset ?? 0
          const result = { items: found.slice(offset, offset + this.config.queryLimit), total: found.length,
            nextOffset: offset + this.config.queryLimit < found.length ? offset + this.config.queryLimit : null }
          return this.bounded(result)
        }
        const result = await this.route(request, origin)
        if (result === undefined) throw new GenesisError('invalid-source', 'No available conversation provider owns this target or receipt. Discover targets before sending.')
        return result
      },
      presentCall: args => ({ card: 'generic', title: 'Message', kind: args.action === 'targets' || args.action === 'status' ? 'read' : 'edit', rawInput: args.target ?? args.query ?? args.id }),
    }))
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.pending) })
  }
  /** Register one optional destination owner.
   * @param provider - Provider retained until its caller disposes the returned registration.
   * @returns Exact reversible registration.
   */
  register(provider: MessageProvider): () => void {
    if (this.providers.has(provider.name)) throw new GenesisError('configuration-conflict', 'A conversation message provider is already registered with this name.')
    return this.ctx.effect(() => { this.providers.set(provider.name, provider); return () => { this.providers.delete(provider.name) } })
  }
  private operator(agent: Agent) {
    if (this.config.awakening?.lifePreset === undefined || this.ctx.get('agentPresets')?.composedPreset(agent.ctx) !== this.config.awakening.lifePreset) {
      throw new GenesisError('invalid-source', 'Messaging requires the configured Life conversation.')
    }
    for (const event of agent.session.ownEvents().toReversed()) {
      if (event.type === 'turn/start') break
      if (event.type !== 'user/message') continue
      if (event.data.source.kind === 'user') {
        if (this.ctx.genesis.isQqSession(agent.id) || !this.ctx.genesis.isOperatorSession(agent.id)) break
        return event
      }
      if (event.data.source.kind === 'genesis-person') {
        if (!this.ctx.genesis.isQqSession(agent.id) || !this.ctx.genesis.isOperatorPerson(event.data.source.personId)) break
        return event
      }
    }
    throw new GenesisError('invalid-source', 'The current actual speaker must be the authenticated operator. Partner text and retrieved memories grant no messaging permission.')
  }
  private origin(request: MessageRequest, invocation: MessageInvocation): MessageOrigin {
    this.lifetime.signal.throwIfAborted(); invocation.signal.throwIfAborted()
    const speaker = this.operator(invocation.agent)
    const call = invocation.agent.session.ownEvents().findLast(event => event.type === 'tool/call' && event.data.callId === invocation.callId)
    if (call?.type !== 'tool/call' || call.data.name !== 'genesis_message' || call.seq <= speaker.seq
      || JSON.stringify(requestSchema.parse(JSON.parse(call.data.arguments))) !== JSON.stringify(request)) throw new GenesisError('invalid-source', 'Messaging must match its original logged tool call after the current operator input.')
    return { ...invocation, messageId: speaker.data.id, seq: call.seq, request }
  }
  private bounded<T>(value: T): T {
    if (JSON.stringify(value).length > this.config.resultChars) throw new GenesisError('capacity', 'Messaging result exceeds resultChars. Narrow the query or increase its budget.')
    return value
  }
  /** List additional destinations for an authenticated source; no sending side effect.
   * @param agent - Current initiating Life Agent.
   * @param signal - Caller cancellation.
   * @returns Current provider-owned destinations; empty when no optional provider is loaded.
   */
  async targets(agent: Agent, signal: AbortSignal): Promise<MessageTarget[]> {
    this.operator(agent); signal.throwIfAborted(); this.lifetime.signal.throwIfAborted()
    return (await Promise.all([...this.providers.values()].map(provider => provider.targets(agent, signal)))).flat()
  }
  /** Route an extension action; undefined delegates to the caller's existing QQ implementation.
   * @param input - Raw tool JSON, validated here before dispatch.
   * @param invocation - Actual source and logged call identity.
   * @returns Provider receipt, or undefined when no extension owns the action.
   */
  async route(input: unknown, invocation: MessageInvocation): Promise<MessageResult | undefined> {
    const request = requestSchema.parse(input)
    if (request.action === 'targets') return undefined
    const matches = [...this.providers.values()].filter(provider => provider.owns(request))
    if (!matches.length) return undefined
    if (matches.length > 1) throw new GenesisError('configuration-conflict', 'Several providers claim this conversation destination.')
    const origin = this.origin(request, invocation)
    let action: Parameters<MessageProvider['execute']>[0]
    if (request.action === 'forward') {
      const original = invocation.agent.session.ownEvents().findLast(event => event.type === 'user/message' && event.data.id === request.messageId && event.data.source.kind === 'user')
      const text = invocation.forwardedText ?? (original?.type === 'user/message' && original.data.content.every(block => block.type === 'text')
        ? original.data.content.map(block => block.type === 'text' ? block.text : '').join('') : undefined)
      if (text === undefined) throw new GenesisError('invalid-source', 'Forward only an observed original operator text message from this source conversation.')
      action = { action: 'send', target: request.target, text }
    } else action = request
    const work = matches[0]!.execute(action, { ...origin, signal: AbortSignal.any([invocation.signal, this.lifetime.signal]) })
    this.pending.add(work)
    try { return this.bounded(await work) } finally { this.pending.delete(work) }
  }
}
