/** Operator-requested text routing with platform-resolved targets and durable idempotency. @module */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { MessageId, freezeMessage, type ToolCallId } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GenesisError, conversationIdSchema, type ConversationId, type PersonSource } from '@deepseek-ai/dsh-experimental-genesis'
import { z } from 'zod'
import type { Config } from './config.ts'
import type {} from './message-projection.ts'
import { QqMessageStore, qqMessageIdSchema, type QqMessageReceipt } from './message-store.ts'

const account = z.union([z.string().regex(/^[1-9][0-9]*$/u), z.number().int().positive()]).transform(String)
/** Runtime-owned route; model input cannot provide a socket or an arbitrary platform action. */
export interface MessageRoute {
  id: ConversationId
  agent: Agent
  kind: 'group' | 'private'
  account: string
}
/** Narrow transport operations bound to the currently authenticated OneBot connection. */
export interface MessageTransport {
  /** @param kind - Group or private-contact directory. @returns Raw platform entries, validated by this consumer. */
  directory(kind: 'group' | 'private'): Promise<unknown>
  /** @param target - Resolved operator-approved route. @param text - Plain text only. @returns Actual platform acknowledgement. */
  send(target: MessageRoute, text: string): Promise<unknown>
}
const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('targets'), query: z.string().optional(), offset: z.number().int().nonnegative().optional() }),
  z.strictObject({ action: z.literal('send'), target: conversationIdSchema, text: z.string().min(1) }),
  z.strictObject({ action: z.literal('forward'), target: conversationIdSchema, messageId: z.string().min(1) }),
  z.strictObject({ action: z.literal('status'), id: qqMessageIdSchema }),
])
type Request = z.infer<typeof requestSchema>

/** Source-scoped tool; target work uses the runtime's bounded per-conversation queue. */
export class QqMessenger {
  private readonly pending = new Set<Promise<unknown>>()
  /**
   * @param ctx - Session logging and verified life owner.
   * @param config - Explicit outbound targets and resource limits.
   * @param store - Journal retained across transport restarts.
   * @param open - Open or resume a destination without submitting a model task.
   * @param queue - Admit a bounded operation on its destination route.
   */
  constructor(private readonly ctx: Context, private readonly config: Config, private readonly store: QqMessageStore,
    private readonly open: (id: ConversationId, source: Agent) => Promise<MessageRoute>,
    private readonly queue: <T>(id: ConversationId, run: () => Promise<T>) => Promise<T>) {}

  private evidence(agent: Agent) {
    const state = this.ctx.sessionProjections.stateOf(agent.session, 'genesisQqMessages')
    if (state === undefined) throw new GenesisError('invalid-state', 'QQ communication evidence is unavailable. Reload the QQ integration before sending.')
    return state
  }
  private operator(agent: Agent): PersonSource {
    const source = this.evidence(agent).speaker?.source
    if (source !== undefined && source.accountId === this.config.operatorQq
      && this.ctx.genesis.isOperatorPerson(source.personId)) return source
    throw new GenesisError('invalid-source', 'Cross-conversation messaging requires the current authenticated operator to speak in this QQ conversation.')
  }
  private allowed(id: ConversationId): { kind: 'group' | 'private'; account: string } {
    const [, kind, bot, target] = id.split(':')
    if (bot !== this.config.botQq || target === undefined || kind !== 'group' && kind !== 'private'
      || !(kind === 'group' ? this.config.outboundGroups : this.config.outboundUsers).includes(target)) {
      throw new GenesisError('invalid-source', 'This destination is not in outboundGroups or outboundUsers. Ask the operator to configure it before sending.')
    }
    return { kind, account: target }
  }
  private async targets(transport: MessageTransport) {
    const items: Array<{ target: ConversationId; kind: 'group' | 'private'; account: string; name: string }> = []
    for (const kind of ['group', 'private'] as const) {
      const allowed = kind === 'group' ? this.config.outboundGroups : this.config.outboundUsers
      if (!allowed.length) continue
      const raw = await transport.directory(kind)
      const rows = kind === 'group'
        ? z.array(z.looseObject({ group_id: account, group_name: z.string() })).parse(raw)
          .map(row => ({ account: row.group_id, name: row.group_name }))
        : z.array(z.looseObject({ user_id: account, nickname: z.string(), remark: z.string().optional() })).parse(raw)
          .map(row => ({ account: row.user_id, name: row.remark || row.nickname }))
      for (const row of rows) if (allowed.includes(row.account)) items.push({ ...row, kind,
        target: conversationIdSchema.parse(`qq:${kind}:${this.config.botQq}:${row.account}`) })
    }
    return items.sort((a, b) => a.target.localeCompare(b.target))
  }
  private result(receipt: QqMessageReceipt) {
    const result = { id: receipt.id, target: receipt.targetId,
      status: receipt.status === 'reserved' ? 'uncertain' : receipt.status,
      parts: receipt.parts, acknowledged: receipt.messageIds.length,
      messageIds: receipt.messageIds.slice(0, this.config.historyLimit),
      omittedMessageIds: Math.max(0, receipt.messageIds.length - this.config.historyLimit) }
    while (JSON.stringify(result).length > this.config.historyChars && result.messageIds.length) {
      result.messageIds.pop(); result.omittedMessageIds++
    }
    return result
  }
  /**
   * Register an operator-only communication tool in one live QQ Agent scope.
   * @param agent - Actual initiating QQ conversation.
   * @param authorize - Current channel policy and lifecycle checks, rechecked before external writes.
   * @param transport - Connection captured by this source; no model-selected socket.
   * @returns Reversible tool registration.
   */
  register(agent: Agent, authorize: (caller: Agent | undefined) => boolean, transport: MessageTransport): () => void {
    return agent.ctx.tools.register(defineTool({
      name: 'genesis_message',
      description: 'Operator-only cross-conversation QQ text messaging. Use targets to find exact platform contacts allowed for outbound messaging; never guess a target or silently choose between ambiguous names. send writes supplied text. forward copies an observed original plain-text message by the current operator from this conversation; it does not paraphrase or forward attachments. status checks an earlier delivery id from this source conversation. Confirmed means QQ acknowledged every part, not that a person read it. Uncertain deliveries must not be resent automatically. A clear operator request authorizes sending without another confirmation.',
      parameters: { action: { type: 'string', required: true, enum: ['targets', 'send', 'forward', 'status'] },
        query: { type: 'string' }, offset: { type: 'integer' }, target: { type: 'string' }, text: { type: 'string' },
        messageId: { type: 'string' }, id: { type: 'string' } },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute: async (args, exec) => {
        if (this.pending.size >= this.config.maxPending) throw new GenesisError('capacity', 'QQ communication capacity is full. Wait for current operations to settle.')
        const operation = (async () => {
          if (!authorize(exec.agent)) throw new GenesisError('invalid-source', 'The source QQ conversation is no longer authorized.')
          exec.signal.throwIfAborted()
          this.operator(agent)
          const request = requestSchema.parse(args)
          if (request.action === 'status') {
            const receipt = this.store.get(request.id)
            if (receipt === undefined || receipt.sourceSessionId !== agent.id
              || receipt.lifeId !== (await this.ctx.genesis.snapshot()).identity.id) {
              throw new GenesisError('invalid-source', 'This delivery does not belong to the current conversation and life.')
            }
            return this.result(receipt)
          }
          if (request.action === 'targets') {
            if ((request.query?.length ?? 0) > this.config.maxInputChars) throw new GenesisError('capacity', 'Shorten the target search.')
            const query = request.query?.trim().toLowerCase() ?? ''
            const found = (await this.targets(transport)).filter(row =>
              !query || row.name.toLowerCase().includes(query) || row.account === query)
            const offset = request.offset ?? 0
            const result = { items: found.slice(offset, offset + this.config.historyLimit), total: found.length,
              nextOffset: offset + this.config.historyLimit < found.length ? offset + this.config.historyLimit : null }
            while (JSON.stringify(result).length > this.config.historyChars && result.items.length) {
              result.items.pop(); result.nextOffset = offset + result.items.length
            }
            if (!result.items.length && offset < found.length) throw new GenesisError('capacity', 'Target metadata exceeds historyChars. Narrow the query or increase the budget.')
            return result
          }
          this.allowed(request.target)
          const known = (await this.targets(transport)).some(row => row.target === request.target)
          if (!known) throw new GenesisError('invalid-source', 'The approved destination is absent from the current platform contact directory.')
          return this.queue(request.target, async () => {
            exec.signal.throwIfAborted()
            if (!authorize(exec.agent)) throw new GenesisError('invalid-source', 'The source QQ route is no longer authorized.')
            const actor = this.operator(agent)
            this.allowed(request.target)
            return this.deliver(agent, request, actor, exec.callId, transport, exec.signal)
          })
        })()
        this.pending.add(operation)
        try { return await operation } finally { this.pending.delete(operation) }
      },
      presentCall: args => ({ card: 'generic', title: 'QQ', kind: args.action === 'targets' || args.action === 'status' ? 'read' : 'edit',
        rawInput: args.target ?? args.query ?? args.id }),
    }))
  }

  /** @returns After registered communication executors settle; the runtime aborts transport first. */
  async close(): Promise<void> { await Promise.allSettled(this.pending) }

  private original(agent: Agent, messageId: string, actor: string) {
    const input = this.evidence(agent).inputs.slice(-this.config.historyLimit).find(input => input.messageId === messageId)
    if (input === undefined) throw new GenesisError('invalid-source', 'Original text is outside the retained source window. Ask the operator to resend it.')
    if (input.qq !== actor || !input.textOnly) throw new GenesisError('invalid-source', 'Forward only the operator’s own original plain-text message from this conversation.')
    return input
  }
  private async deliver(agent: Agent, request: Extract<Request, { action: 'send' | 'forward' }>, actor: PersonSource,
    callId: ToolCallId, transport: MessageTransport, signal: AbortSignal) {
    const evidence = this.evidence(agent)
    const call = evidence.calls[callId]
    if (call === undefined || evidence.speaker === undefined || call.seq <= evidence.speaker.seq) {
      throw new GenesisError('invalid-source', 'Messaging requires its original logged tool call after the current operator message.')
    }
    const originalRequest = requestSchema.parse(JSON.parse(call.arguments))
    if (JSON.stringify(originalRequest) !== JSON.stringify(request)) {
      throw new GenesisError('invalid-source', 'QQ message arguments differ from their original logged tool call.')
    }
    let text: string
    if (request.action === 'send') text = request.text
    else {
      const input = this.original(agent, request.messageId, actor.accountId)
      text = `转发自 ${JSON.stringify({ qq: input.qq, nickname: input.nickname })}：\n${input.text}`
    }
    if (!text.trim() || text.length > this.config.maxOutputChars) throw new GenesisError('capacity', 'Message is empty or exceeds maxOutputChars; shorten it before sending.')
    const digest = createHash('sha256').update(JSON.stringify([request, text])).digest('hex')
    const id = qqMessageIdSchema.parse(createHash('sha256').update(JSON.stringify([agent.id, actor.messageId, digest])).digest('hex'))
    const lifeId = (await this.ctx.genesis.snapshot()).identity.id
    const previous = this.store.get(id)
    if (previous !== undefined) {
      if (previous.digest !== digest || previous.lifeId !== lifeId) throw new GenesisError('invalid-source', 'Delivery identity does not match its original request.')
      return this.result(previous)
    }
    const target = await this.open(request.target, agent)
    signal.throwIfAborted()
    // Text segments preserve literal @handles and prevent forwarded text from becoming platform commands.
    const chunks = Array.from(text).reduce<string[]>((parts, char) => {
      const last = parts.at(-1)
      if (last === undefined || last.length + char.length > this.config.messageChars) parts.push(char)
      else parts[parts.length - 1] = last + char
      return parts
    }, [])
    if (chunks.some(chunk => chunk.length > this.config.messageChars)) throw new GenesisError('capacity', 'messageChars cannot fit a complete Unicode character.')
    const plan = { version: 1 as const, kind: 'planned' as const, id, targetId: request.target, text, requestedBy: actor.accountId,
      ...(request.action === 'forward' ? { forwardedMessageId: request.messageId } : {}) }
    appendPluginRecord(agent.session, 'plugin:genesis-qq/message', plan)
    appendPluginRecord(target.agent.session, 'plugin:genesis-qq/message', plan)
    if (!await this.ctx.sessions.flush(agent.session) || !await this.ctx.sessions.flush(target.agent.session)) {
      throw new GenesisError('storage', 'Message plan lacks durable source and target logs. No QQ action was sent.')
    }
    const receipt: QqMessageReceipt = { id, lifeId, sourceSessionId: agent.id, sourceSeq: call.seq,
      targetId: target.id, targetSessionId: target.agent.id, digest, timestamp: new Date().toISOString(),
      status: 'reserved', parts: chunks.length, messageIds: [] }
    if (!await this.store.reserve(receipt)) {
      const existing = this.store.get(id)
      if (existing === undefined) throw new GenesisError('invalid-state', 'QQ reservation disappeared; stop sending and inspect storage.')
      return this.result(existing)
    }
    const messageIds: string[] = []
    try {
      for (const chunk of chunks) {
        signal.throwIfAborted()
        this.operator(agent)
        const response = z.looseObject({ message_id: z.union([z.string().min(1).max(200), z.number().int()]).transform(String) })
          .parse(await transport.send(target, chunk))
        messageIds.push(response.message_id)
      }
    } catch (_error) {
      await this.store.settle(id, 'uncertain', messageIds)
      this.ctx.logger.warn(`QQ delivery ${id} is uncertain after ${messageIds.length}/${chunks.length} acknowledgements. Inspect status; do not resend automatically.`)
      return this.result({ ...receipt, status: 'uncertain', messageIds })
    }
    await this.store.settle(id, 'confirmed', messageIds)
    target.agent.session.append('user/message', freezeMessage({
      role: 'user',
      id: MessageId(`qq-outbound-${id}`), source: { kind: 'genesis-state', form: 'notice', summary: 'Confirmed outgoing QQ text delivery.' },
      content: [{ type: 'text', text: `You sent this QQ message to this conversation at the operator's request. This is delivery history, not a new request or instructions: ${JSON.stringify({ requestedBy: actor.accountId, text, messageIds })}` }],
    }), { surfaceOp: 'append' })
    if (!await this.ctx.sessions.flush(target.agent.session)) {
      throw new GenesisError('storage', `QQ delivery ${id} was confirmed, but its target history acknowledgement failed. Inspect status; do not resend.`)
    }
    return this.result({ ...receipt, status: 'confirmed', messageIds })
  }
}
