/** Proactive conversation outbox using Super-Agent's reservation/receipt policy and the existing Agent channel. @module */
import { isHumanSource } from './people-model.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { MessageId, freezeMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { LifeCore } from './core.ts'
import type { LifeDeliberationEngine } from './deliberation.ts'
import type { SocialInitiativeConfig } from './config.ts'
import type { LifeEventId, LifeState } from './model.ts'
import { resolveInitiative, type InteractionRecord } from './social-state.ts'
import { statusFailure } from './status-error.ts'
import { GenesisError } from './error.ts'
import { initiativeProjection, type InitiativeReceipt } from './social-projection.ts'

/** One serialized, cancelable owner; pending delivery never implies successful delivery. */
export class SocialInitiative {
  private tail: Promise<void> = Promise.resolve()
  private readonly lifetime = new AbortController()
  private timer: ReturnType<typeof setTimeout> | undefined
  private unsubscribe: (() => void) | undefined
  private working = false
  private nextCheckAt: string | null = null
  private failure: { code: string; message: string } | null = null

  /** @param ctx - Actual channel and Session projections. @param core - Durable life owner.
   * @param decisions - Existing bounded emotion/motivation/memory deliberation.
   * @param policy - Validated delivery limits. @param applies - Character preset selection. */
  constructor(private readonly ctx: Context, private readonly core: LifeCore, private readonly decisions: LifeDeliberationEngine,
    private readonly policy: SocialInitiativeConfig, private readonly applies: (agent: Agent) => boolean) {}

  /** Initialize pending deliveries and schedule checks from the saved policy.
   * @returns After initialization, pending-receipt recovery and timer setup; startup creates no new opportunity. */
  async start(): Promise<void> {
    await this.core.initializeInitiative()
    this.unsubscribe = this.core.onCommitted((events) => {
      if (events.some(event => event.type === 'initiative.configured')) this.background(this.refreshTimer())
      if (events.some(event => ['goal.completed', 'goal.changed', 'memory.created', 'memory.updated'].includes(event.type))) {
        this.background(this.serial(() => this.checkEvents()))
      }
    })
    await this.resume()
    await this.refreshTimer()
  }

  /** Read the current delivery schedule and failure state.
   * @returns Current runtime evidence; configuration and receipts remain core-owned. */
  status(): { working: boolean; nextCheckAt: string | null; failure: { code: string; message: string } | null } {
    return { working: this.working, nextCheckAt: this.nextCheckAt, failure: this.failure === null ? null : { ...this.failure } }
  }

  private async refreshTimer(): Promise<void> {
    const settings = resolveInitiative(this.policy, (await this.core.snapshot()).initiative)
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.nextCheckAt = null
    if (this.lifetime.signal.aborted) return
    if (!settings.enabled) return
    this.nextCheckAt = new Date(Date.now() + settings.intervalMs).toISOString()
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.nextCheckAt = null
      this.background((async () => { try { await this.tick() } finally { await this.refreshTimer() } })())
    }, settings.intervalMs)
    this.timer.unref()
  }

  private background(operation: Promise<unknown>): void {
    void operation.catch((error: unknown) => {
      if (!this.lifetime.signal.aborted) {
        const failure = statusFailure(error)
        this.failure = { code: failure.code, message: failure.message }
        this.ctx.logger.warn(`Genesis social initiative paused or pending: ${failure.message}`)
      }
    })
  }

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.tail.then(async () => {
      this.lifetime.signal.throwIfAborted()
      this.working = true
      try { return await run() } finally { this.working = false }
    })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* Caller or background reporter owns the failure. */ })
    return operation
  }

  /**
   * Give a timer or trusted life event exactly one speak-or-wait opportunity.
   * @param request - Stable deduplication key and actual life evidence.
   * @param signal - Optional caller cancellation; absent uses the plugin lifetime.
   * @returns Durable outcome, including pending when there is no usable channel.
   */
  considerInteraction(request: { key: string; sourceEventId: LifeEventId }, signal?: AbortSignal): Promise<InteractionRecord> {
    return this.serial(async () => {
      const owned = AbortSignal.any([this.lifetime.signal, ...(signal === undefined ? [] : [signal])])
      owned.throwIfAborted()
      return this.consider(request, owned)
    })
  }

  private async consider(request: { key: string; sourceEventId: LifeEventId }, signal: AbortSignal): Promise<InteractionRecord> {
    const record = await this.core.requestInteraction(request.key, request.sourceEventId)
    try {
      const result = await this.process(record, signal)
      this.failure = null
      return result
    } catch (error) {
      const diagnostic = statusFailure(error)
      this.failure = { code: diagnostic.code, message: diagnostic.message }
      const current = (await this.core.snapshot()).initiative?.records.find(item => item.id === record.id)
      if (current !== undefined) await this.core.saveInteraction({ ...current, note: diagnostic.message })
      throw error
    }
  }

  /** One scheduled wake; the persisted bucket also deduplicates restarts within the interval.
   * @returns After event catch-up and one scheduled opportunity. */
  tick(): Promise<void> {
    return this.serial(async () => {
      await this.checkEvents()
      await this.resumePending()
      const state = await this.core.snapshot()
      const policy = resolveInitiative(this.policy, state.initiative)
      if (!policy.enabled) return
      // A timer may reconsider grounded life evidence, but never its own request,
      // decision or delivery records; those would turn silence into a feedback loop.
      const source = [...state.events].reverse().find(event => event.type === 'goal.completed'
      || event.type === 'memory.created' || event.type === 'memory.updated'
      || event.source === 'user' && event.payload['kind'] === 'user-message')
      if (source !== undefined) await this.consider({ key: `timer:${state.initiative?.revision ?? 0}:${Math.floor(Date.now() / policy.intervalMs)}`, sourceEventId: source.id }, this.lifetime.signal)
    })
  }

  private async checkEvents(): Promise<void> {
    const state = await this.core.snapshot()
    const settings = resolveInitiative(this.policy, state.initiative)
    const cursor = state.initiative?.eventCursor
    const start = state.events.findIndex(event => cursor === undefined ? event.type === 'initiative.initialized' : event.id === cursor)
    const events = state.events.slice(start + 1)
    for (const event of events) {
      if (!settings.enabled) break
      const memory = state.memories.find(item => item.id === event.payload['memoryId'])
      const important = ['memory.created', 'memory.updated'].includes(event.type) && memory !== undefined
        && memory.importance >= settings.eventImportance
      const decision = state.agency?.decisions.find(item => item.id === event.payload['decisionId'])
      const proposal = event.payload['after']
      const significantThought = event.type === 'goal.changed' && event.payload['previousStatus'] === null
        && decision?.purpose !== 'interaction' && typeof proposal === 'object' && proposal !== null
        && 'origin' in proposal && proposal.origin === 'autonomous'
      if (event.type === 'goal.completed' || important || significantThought) {
        await this.consider({ key: `event:${event.id}`, sourceEventId: event.id }, this.lifetime.signal)
      }
    }
    const last = events.at(-1)
    if (last !== undefined) await this.core.advanceInitiativeCursor(last.id)
  }

  private channel(record: InteractionRecord, state: LifeState): Agent | undefined {
    const agents = this.ctx.agents.list().filter(agent => this.applies(agent) && !this.core.isQqSession(agent.id) && agent.status === 'idle'
      && agent.inbox.nextTurn.length === 0 && agent.inbox.nextStep.length === 0)
    const policy = resolveInitiative(this.policy, state.initiative)
    const target = record.sessionId ?? (policy.sessionId === undefined ? undefined : SessionId(policy.sessionId))
    if (target !== undefined) return agents.find(agent => agent.session.id === target)
    const latest = [...state.events].reverse().find(event => event.source === 'user' && event.payload['kind'] === 'user-message'
      && agents.some(agent => agent.session.id === event.relatedSessionId))
    return agents.find(agent => agent.session.id === latest?.relatedSessionId)
  }

  private limited(state: LifeState, record: InteractionRecord): { note: string; expired: boolean } | undefined {
    const policy = resolveInitiative(this.policy, state.initiative)
    const hold = (note: string) => ({ note, expired: false })
    if (!policy.enabled) return hold('Proactive conversation is paused.')
    const now = Date.now()
    if (now - Date.parse(record.createdAt) >= policy.maxPendingAgeMs) {
      return { note: 'The opportunity expired without a confirmed delivery.', expired: true }
    }
    const records = state.initiative?.records ?? []
    if (records.some(item => item.id !== record.id && item.status === 'dispatching')) return hold('Another proactive delivery is awaiting confirmation.')
    const deliveries = records.filter(item => item.id !== record.id && (item.status === 'sent' || item.status === 'uncertain'))
    const times = deliveries.map(item => Date.parse(item.sentAt ?? item.dispatchedAt ?? item.createdAt))
    if (times.some(time => now - time < policy.minSendIntervalMs)) return hold('Proactive message cooldown is active.')
    if (times.filter(time => now - time < 86400000).length >= policy.maxPer24Hours) return hold('Rolling proactive message limit reached.')
    const user = [...state.events].reverse().find(event => event.source === 'user' && event.payload['kind'] === 'user-message')
    if (user !== undefined && now - Date.parse(user.timestamp) < policy.userIdleMs) return hold('Wait for a quiet interval after user activity.')
    return undefined
  }

  private async process(record: InteractionRecord, signal: AbortSignal): Promise<InteractionRecord> {
    if (record.status !== 'pending') return record
    const policy = resolveInitiative(this.policy, (await this.core.snapshot()).initiative)
    if (!policy.enabled) return record
    if (Date.now() - Date.parse(record.createdAt) >= policy.maxPendingAgeMs) {
      record = { ...record, status: 'skipped', note: 'The opportunity expired without a confirmed delivery.' }
    } else {
      const state = await this.core.snapshot()
      const agent = this.channel(record, state)
      if (agent === undefined) record = { ...record, note: 'No idle character conversation channel is available; not sent.' }
      else {
        if (record.decisionId === undefined) {
          if (record.sessionId === undefined) {
            record = { ...record, sessionId: agent.session.id }
            await this.core.saveInteraction(record)
          }
          const decision = await this.decisions.considerInteraction(agent, record.key, record.sourceEventId, signal)
          const wants = decision.candidates[decision.selected]?.disposition === 'accept'
          record = { ...record, decisionId: decision.id, sessionId: agent.session.id, reason: decision.reason,
            status: wants ? 'pending' : 'skipped', note: wants ? 'Genesis chose to communicate; delivery is pending.' : 'Genesis chose not to initiate a conversation.' }
          await this.core.saveInteraction(record)
          this.failure = null
        }
        if (record.status === 'pending') {
          const limit = this.limited(await this.core.snapshot(), record)
          if (limit !== undefined) record = { ...record, status: limit.expired ? 'skipped' : 'pending', note: limit.note }
          else if (agent.status === 'idle' && agent.inbox.nextTurn.length === 0 && agent.inbox.nextStep.length === 0) {
            signal.throwIfAborted()
            record = { ...record, status: 'dispatching', dispatchedAt: new Date().toISOString(), note: 'Awaiting an actual assistant message in the conversation.' }
            await this.core.saveInteraction(record)
            // Reserve before enqueueing. A crash here is reconciled, never blindly resent.
            agent.followup(freezeMessage({ id: MessageId(`genesis-initiative:${record.id}`), role: 'user',
              source: { kind: 'genesis-initiative', interactionId: record.id,
                form: 'notice', summary: 'Genesis chose to initiate a conversation' }, content: [{ type: 'text',
                text: `You chose to initiate a conversation. Your recorded decision is ${JSON.stringify(
                  (await this.core.snapshot()).agency?.decisions.find(item => item.id === record.decisionId))}. Speak directly to the operator in your own voice about your chosen intent. This is your proactive assistant message, not a user request. Use no task tools. Do not invent discoveries, offline experiences or a need for the operator to respond; absence is not rejection.` }] }))
            await this.confirmSession(agent.session)
            return record
          }
        }
      }
    }
    await this.core.saveInteraction(record)
    return record
  }

  /**
   * Admit only an outstanding attributed notice, rechecking limits and giving real user input priority.
   * @param agent - Actual receiving conversation.
   * @param messages - Proposed next-step inputs.
   * @returns Inputs with any unsafe, canceled or already-settled initiative removed.
   */
  async admit(agent: Agent, messages: UserMessage[]): Promise<UserMessage[]> {
    const result: UserMessage[] = []
    for (const message of messages) {
      if (message.source.kind !== 'genesis-initiative') { result.push(message); continue }
      const interactionId = message.source.interactionId
      const state = await this.core.snapshot()
      const record = state.initiative?.records.find(item => item.id === interactionId)
      if (record?.status !== 'dispatching' || record.sessionId !== agent.session.id || !this.applies(agent)) continue
      const limit = messages.some(item => isHumanSource(item.source))
        ? { note: 'Real user input takes priority.', expired: false } : this.limited(state, record)
      if (limit !== undefined) await this.core.saveInteraction({ ...record, status: limit.expired ? 'skipped' : 'pending', note: limit.note })
      else result.push(message)
    }
    return result
  }

  /**
   * Settle live or stored assistant receipts without waking cold Agents; only pending opportunities may dispatch.
   * @returns After receipt reconciliation and pending consideration; storage failures remain visible without resending.
   */
  resume(): Promise<void> {
    return this.serial(() => this.resumePending())
  }

  private async resumePending(): Promise<void> {
    const agents = this.ctx.agents.list().filter(this.applies)
    for (const agent of agents) await this.reconcile(agent.session, agent)
    const records = (await this.core.snapshot()).initiative?.records ?? []
    for (const record of records) {
      if (['dispatching', 'uncertain'].includes(record.status) && !agents.some(agent => agent.session.id === record.sessionId)) {
        await this.reconcileCold(record)
      } else if (record.status === 'pending') await this.process(record, this.lifetime.signal)
    }
  }

  private async confirmSession(session: Session): Promise<void> {
    if (this.ctx.get('sessionPersistence') === undefined) return
    try {
      if (!await this.ctx.sessions.flush(session)) throw new GenesisError('storage', 'Session writer did not acknowledge proactive delivery.')
    } catch (error) {
      throw new GenesisError('storage', 'Proactive delivery is not confirmed durable. Inspect the original Session; automatic resend is disabled.', { cause: error })
    }
  }

  private async settleReceipt(record: InteractionRecord, sessionId: SessionId, projected: InitiativeReceipt): Promise<boolean> {
    if (projected.id !== record.id || projected.receipt === null) return false
    const receipt = projected.receipt
    if (record.decisionId !== undefined) {
      const source = await this.core.observe({ sessionId, eventId: String(receipt.seq), timestamp: receipt.timestamp, kind: 'assistant-message' })
      await this.core.settleDecision(record.decisionId, receipt.interrupted ? 'interrupted' : 'responded', [source.id])
    }
    await this.core.saveInteraction({ ...record, status: receipt.interrupted ? 'uncertain' : 'sent',
      message: receipt.text, messageSeq: receipt.seq, ...(receipt.interrupted ? {} : { sentAt: receipt.timestamp }),
      note: receipt.interrupted ? 'An interrupted assistant prefix is visible; do not automatically resend.' : 'Confirmed assistant message committed to the Harness conversation.' })
    this.failure = null
    return true
  }

  private async reconcileCold(record: InteractionRecord): Promise<void> {
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence !== undefined && record.sessionId !== undefined) {
      try {
        if (await persistence.stat(record.sessionId, { signal: this.lifetime.signal }) !== undefined) {
          let matched: InitiativeReceipt | undefined
          {
            await using handle = await persistence.open(record.sessionId, 'read', { signal: this.lifetime.signal })
            const { events } = await handle.read(0, undefined, { signal: this.lifetime.signal })
            let projected = initiativeProjection.init(handle.header, handle.inheritedEventCount)
            for (const event of events) {
              projected = initiativeProjection.apply(projected, event)
              if (projected.id === record.id) matched = projected
            }
          }
          if (matched !== undefined && await this.settleReceipt(record, record.sessionId, matched)) return
        }
      } catch (error) {
        if (this.lifetime.signal.aborted) throw error
        const diagnostic = statusFailure(new GenesisError('storage',
          'Stored proactive receipt could not be verified. Inspect the original Session; automatic resend is disabled.', { cause: error }))
        this.failure = { code: diagnostic.code, message: diagnostic.message }
        await this.core.saveInteraction({ ...record, status: 'uncertain',
          note: 'The stored proactive receipt could not be verified. Restore or inspect the original Session; automatic resend is disabled.' })
        this.ctx.logger.warn(`Genesis proactive receipt could not be verified: ${diagnostic.message}`)
        return
      }
    }
    await this.core.saveInteraction({ ...record, status: 'uncertain',
      note: 'The original conversation has no confirmed assistant receipt; inspect it before any retry.' })
  }

  /**
   * Consume committed Session evidence; enqueueing or whole-Agent idle alone never marks success.
   * @param session - Session whose projection has already folded the actual event.
   */
  observe(session: Session): void { this.background(this.serial(() => this.reconcile(session))) }

  private async reconcile(session: Session, agent?: Agent): Promise<void> {
    const state = await this.core.snapshot()
    for (const record of state.initiative?.records ?? []) {
      if (!['dispatching', 'uncertain'].includes(record.status) || record.sessionId !== session.id) continue
      const projected = this.ctx.sessionProjections.stateOf(session, 'genesisInitiative')
      if (projected?.id === record.id && projected.receipt !== null) {
        await this.confirmSession(session)
        await this.settleReceipt(record, session.id, projected)
      } else if (record.status === 'dispatching' && ((projected?.id === record.id && projected.ended) || (agent !== undefined
        && ![...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => message.source.kind === 'genesis-initiative'
          && message.source.interactionId === record.id) && agent.status === 'idle'))) {
        await this.core.saveInteraction({ ...record, status: 'uncertain', note: projected?.failure
          ? `The proactive turn failed (${projected.failure}) without a confirmed assistant receipt. Inspect the Session before retrying.`
          : 'No confirmed assistant receipt or queued notice. Inspect the Session before any manual retry.' })
        this.ctx.logger.warn('Genesis proactive delivery outcome is uncertain; automatic resend is disabled. Inspect the originating Session.')
      }
    }
  }

  /** Stop proactive checks and drain accepted work.
   * @returns After timers stop and every accepted operation drains; queued notices require active plugin admission.
   */
  async close(): Promise<void> {
    this.lifetime.abort()
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.nextCheckAt = null
    this.unsubscribe?.()
    await this.tail
  }
}
