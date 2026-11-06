/** Life-bound partner identity, attributed understanding and internal delivery journal. @module */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { brandString, brandNumber } from '@deepseek-ai/dsh-brand'
import type { Branded, BrandedNumber } from '@deepseek-ai/dsh-brand'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { LifeId } from '@deepseek-ai/dsh-experimental-genesis'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'

/** Stable partner identifier; OneBot account numbers are only local transport addresses. */
export type CompanionId = Branded<'GenesisCompanionId'>
/** Internal OneBot message number, unrelated to a QQ message or Session sequence. */
export type CompanionMessageId = BrandedNumber<'GenesisCompanionMessageId'>
/** Source-scoped receipt for one explicitly requested internal text delivery. */
export type CompanionDeliveryId = Branded<'GenesisCompanionDeliveryId'>
const deliveryId = z.string().regex(/^companion:[a-f0-9]{64}$/u).transform(brandString<CompanionDeliveryId>)
const deliverySchema = z.strictObject({ id: deliveryId, sourceSessionId: z.string().transform(SessionId),
  sourceSeq: z.number().int().nonnegative().transform(SessionSeq), targetSessionId: z.string().transform(SessionId),
  digest: z.string().regex(/^[a-f0-9]{64}$/u), status: z.enum(['reserved', 'emitted', 'uncertain']),
  messageId: z.number().int().positive().transform(brandNumber<CompanionMessageId>).nullable() })
/** Durable source ownership and actual local socket outcome. */
export type CompanionDelivery = z.infer<typeof deliverySchema>
/** Only authenticated loopback endpoints may receive internal conversation text. */
export const settingsSchema = z.strictObject({
  enabled: z.boolean(), interactionEnabled: z.boolean(),
  endpoint: z.url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash
  }),
  name: z.string().trim().min(1).max(80),
  timeZone: z.string().min(1).max(80).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true }
    catch (_error) { return false /* The operator must supply an installed IANA time zone. */ }
  }),
  sleepEnabled: z.boolean(), sleepStart: z.number().int().min(0).max(1439), sleepEnd: z.number().int().min(0).max(1439),
  maxRounds: z.number().int().min(1).max(8),
}).refine(value => !value.sleepEnabled || value.sleepStart !== value.sleepEnd, 'Choose different sleep and wake times.')
/** Complete editable nonsecret settings. */
export type CompanionSettings = z.infer<typeof settingsSchema>
const messageSchema = z.strictObject({ id: z.number().int().positive().transform(brandNumber<CompanionMessageId>), speaker: z.enum(['genesis', 'partner']),
  text: z.string(), at: z.number().int(), sessionId: z.string().transform(SessionId),
  outcome: z.enum(['recorded', 'reserved', 'emitted', 'uncertain']), key: z.string().nullable() })
/** Internal receipt; emitted means a WebSocket write completed, never a QQ delivery. */
export type CompanionMessage = z.infer<typeof messageSchema>
const stateSchema = z.strictObject({ schemaVersion: z.literal(1), lifeId: z.string().transform(brandString<LifeId>),
  partnerId: z.uuid().transform(brandString<CompanionId>), revision: z.number().int().nonnegative(), settings: settingsSchema,
  wakeUntil: z.number().int().nonnegative(), nextMessageId: z.number().int().positive(),
  messages: z.array(messageSchema),
  understanding: z.strictObject({ text: z.string(), attribution: z.literal('model-inference'),
    sourceMessageIds: z.array(z.number().int().positive().transform(brandNumber<CompanionMessageId>)), sessionId: z.string().transform(SessionId) }).nullable(),
})
/** One independent versioned storage domain; historical text also remains in its source Sessions. */
export const companionDomain = defineDomain({ name: 'genesis_companion', version: 1,
  tables: { state: domainTable<'current', z.infer<typeof stateSchema>>(stateSchema),
    conversation: domainTable<'partner', { sessionId: SessionId; published: boolean }>(z.strictObject({ sessionId: z.string().transform(SessionId), published: z.boolean() })),
    deliveries: domainTable<CompanionDeliveryId, CompanionDelivery>(deliverySchema),
    identity: domainTable<'partner', { lifeId: LifeId; partnerId: CompanionId }>(z.strictObject({
      lifeId: z.string().transform(brandString<LifeId>), partnerId: z.uuid().transform(brandString<CompanionId>),
    })) } })

/** Compute a partner schedule at an actual instant, including overnight intervals.
 * @param settings - Validated operator schedule.
 * @param wakeUntil - Explicit wake override deadline.
 * @param now - Actual UTC milliseconds.
 * @returns Whether the gateway must suppress partner model triggers.
 */
export function partnerAsleep(settings: CompanionSettings, wakeUntil: number, now: number): boolean {
  if (!settings.sleepEnabled || now < wakeUntil) return false
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: settings.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const minute = Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value)
  return settings.sleepStart < settings.sleepEnd ? minute >= settings.sleepStart && minute < settings.sleepEnd
    : minute >= settings.sleepStart || minute < settings.sleepEnd
}

/** Serial writes fence the integration after an uncertain storage outcome. */
export class CompanionStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  /**
   * @param domain - Exclusive domain held through controller teardown.
   * @param maxRecords - Journal capacity; full storage rejects new deliveries.
   * @param maxStateChars - Complete serialized state limit.
   */
  constructor(private readonly domain: Domain<typeof companionDomain>, private readonly maxRecords: number, private readonly maxStateChars: number) {}
  /** Restore the same partner and mark interrupted event writes uncertain; never retransmit.
   * @param lifeId - Actual existing Genesis identity.
   * @returns After first initialization or conservative recovery commits.
   */
  async start(lifeId: LifeId): Promise<void> {
    const saved = this.domain.table('state').get('current')
    const identity = this.domain.table('identity').get('partner')
    if (saved === undefined) {
      if (identity !== undefined) throw new GenesisError('invalid-state', 'Companion state is missing. Restore it with its recorded partner identity.')
      await this.put({ schemaVersion: 1, lifeId, partnerId: brandString<CompanionId>(randomUUID()), revision: 0,
        settings: { enabled: false, interactionEnabled: false, endpoint: 'ws://127.0.0.1:6199/ws', name: 'AstrBot',
          timeZone: 'Asia/Shanghai', sleepEnabled: false, sleepStart: 1380, sleepEnd: 480, maxRounds: 3 },
        wakeUntil: 0, nextMessageId: 1, messages: [], understanding: null })
    } else {
      if (stateSchema.parse(saved).lifeId !== lifeId) throw new GenesisError('invalid-state', 'Companion data belongs to another life. Restore matching storage.')
      if (identity !== undefined && (identity.lifeId !== lifeId || identity.partnerId !== saved.partnerId)) throw new GenesisError('invalid-state', 'Companion identity and relationship data disagree. Restore matching storage.')
      await this.change(state => { for (const message of state.messages) if (message.outcome === 'reserved') message.outcome = 'uncertain' })
    }
    if (identity === undefined) {
      const state = this.read()
      try { await this.domain.table('identity').put('partner', { lifeId, partnerId: state.partnerId }) }
      catch (error) { this.failure = new GenesisError('storage', 'Partner identity write outcome is uncertain. Restore verified storage before connecting.', { cause: error }); throw this.failure }
    }
    const conversation = this.domain.table('conversation').get('partner')
    if (conversation === undefined) {
      const state = this.read(), previous = state.messages.at(-1)?.sessionId
      await this.write(() => this.domain.table('conversation').put('partner', {
        sessionId: previous ?? SessionId(`genesis-companion-${state.partnerId}`), published: previous !== undefined,
      }))
    }
    for (const [, receipt] of this.domain.table('deliveries').entries()) if (receipt.status === 'reserved') {
      await this.write(() => this.domain.table('deliveries').put(receipt.id, { ...receipt, status: 'uncertain' }))
    }
  }
  /** Read a detached validated projection; storage uncertainty prevents dependent effects. @returns Confirmed partner state. */
  read(): z.infer<typeof stateSchema> {
    if (this.failure !== undefined) throw this.failure
    const saved = this.domain.table('state').get('current')
    if (saved === undefined) throw new GenesisError('invalid-state', 'Companion state is missing. Restore its storage before reconnecting.')
    return structuredClone(stateSchema.parse(saved))
  }
  private async put(state: z.infer<typeof stateSchema>): Promise<void> {
    const value = stateSchema.parse(state)
    if (value.messages.length > this.maxRecords || JSON.stringify(value).length > this.maxStateChars) throw new GenesisError('capacity', 'Companion storage is full. Export and delete its data or increase retention limits.')
    try { await this.domain.table('state').put('current', value) }
    catch (error) { this.failure = new GenesisError('storage', 'Companion write outcome is uncertain. Stop interaction and reload verified storage.', { cause: error }); throw this.failure }
  }
  private async write(run: () => Promise<void>): Promise<void> {
    this.read()
    try { await run() }
    catch (error) { this.failure = new GenesisError('storage', 'Companion conversation or receipt write is uncertain. Reload verified storage before continuing.', { cause: error }); throw this.failure }
  }
  /** Read the single durable internal conversation binding. @returns Reserved or published Session identity. */
  conversation(): { sessionId: SessionId; published: boolean } {
    this.read()
    const row = this.domain.table('conversation').get('partner')
    if (row === undefined) throw new GenesisError('invalid-state', 'The companion conversation binding is missing. Restore its storage.')
    return row
  }
  /** Bind one internal conversation Session as the current one.
   * @param sessionId - Session the next exchange creates or resumes.
   * @returns After the binding commits.
   */
  async bindConversation(sessionId: SessionId): Promise<void> {
    await this.write(() => this.domain.table('conversation').put('partner', { sessionId, published: false }))
  }
  /** Mark the reserved Session published after its actual creation or recovery.
   * @returns After durable publication confirmation.
   */
  async publishConversation(): Promise<void> {
    const row = this.conversation()
    if (!row.published) await this.write(() => this.domain.table('conversation').put('partner', { ...row, published: true }))
  }
  /** Read an earlier source-scoped delivery receipt.
   * @param id - Provider receipt returned by this tool.
   * @returns Stored outcome, or undefined before reservation.
   */
  delivery(id: string): CompanionDelivery | undefined {
    this.read()
    const key = deliveryId.parse(id), receipt = this.domain.table('deliveries').get(key)
    if (receipt !== undefined && (receipt.id !== key || receipt.targetSessionId !== this.conversation().sessionId)) throw new GenesisError('invalid-state', 'Internal receipt identity differs from its recorded conversation.')
    return receipt
  }
  /** Commit a receipt before network delivery, or settle its socket outcome.
   * @param receipt - Complete source and target ownership.
   * @returns After durable confirmation; uncertainty fences dependent effects.
   */
  async saveDelivery(receipt: CompanionDelivery): Promise<void> {
    this.read()
    if (this.domain.table('deliveries').size >= this.maxRecords && this.delivery(receipt.id) === undefined) throw new GenesisError('capacity', 'Companion delivery receipts are full. Retain deduplication evidence and increase maxRecords.')
    await this.write(() => this.domain.table('deliveries').put(receipt.id, receipt))
  }
  /** Mutate the committed projection in order; validation failures leave it unchanged.
   * @param edit - Synchronous edit of a detached state.
   * @returns The edit result after durable confirmation.
   */
  change<T>(edit: (state: z.infer<typeof stateSchema>) => T): Promise<T> {
    const work = this.tail.then(async () => { const state = this.read(); const result = edit(state); await this.put(state); return result })
    this.tail = work.then(() => {}, (_error: unknown) => { /* The operation caller reports failure; shutdown drains admitted writes. */ })
    return work
  }
  /** Drain writes before releasing the domain. @returns After storage closes. */
  async close(): Promise<void> { await this.tail; await this.domain.close() }
}
