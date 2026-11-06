/** Durable private-message backlog; dispatch uncertainty never causes automatic replay. @module */
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError, type LifeId } from '@deepseek-ai/dsh-experimental-genesis'

const entrySchema = z.strictObject({ id: z.string(), lifeId: z.string(), bot: z.string(), conversation: z.string(),
  target: z.string(), receivedAt: z.number(), text: z.string().nullable(), raw: z.json().nullable(), atMe: z.boolean(),
  fingerprint: z.string(), state: z.enum(['queued', 'dispatching', 'done']) })
/** Detached queued frame; raw data is revalidated by the QQ admission parser. */
export type SleepingQqMessage = z.infer<typeof entrySchema>
/** Independent QQ journal; message payloads are removed after durable inbox admission. */
export const qqSleepDomain = defineDomain({ name: 'genesis_qq_sleep_inbox', version: 1,
  tables: { entries: domainTable<string, SleepingQqMessage>(entrySchema),
    identity: domainTable<'life', { lifeId: string }>(z.strictObject({ lifeId: z.string() })) } })
/** Single writer retains text-free replay receipts and fences unknown writes. */
export class QqSleepInbox {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  /** @param domain - Exclusive domain. @param lifeId - Existing life. @param limit - Receipt capacity. @param chars - Complete retained JSON budget. */
  constructor(private readonly domain: Domain<typeof qqSleepDomain>, private readonly lifeId: LifeId,
    private readonly limit: number, private readonly chars: number) {}
  /** Restore ownership without replacing an initialized missing queue.
   * @param marked - Life history initialization marker.
   * @returns After ownership metadata commits.
   */
  async start(marked: boolean): Promise<void> {
    const owner = this.domain.table('identity').get('life')
    if (owner === undefined && (marked || this.domain.table('entries').size)) throw new GenesisError('invalid-state', 'QQ sleep inbox ownership is missing. Restore matching storage.')
    if (owner !== undefined && owner.lifeId !== this.lifeId) throw new GenesisError('configuration-conflict', 'QQ sleep inbox belongs to another life.')
    if (owner === undefined) await this.domain.table('identity').put('life', { lifeId: this.lifeId })
  }
  /** Read confirmed pending rows in received order.
   * @param bot - Configured verified bot account.
   * @returns Current rows; dispatching rows remain uncertain and are excluded from automatic replay.
   */
  pending(bot: string): SleepingQqMessage[] {
    if (this.failure !== undefined) throw this.failure
    return [...this.domain.table('entries').entries()].map(([, row]) => row).filter(row => row.bot === bot && row.state === 'queued').sort((a, b) => a.receivedAt - b.receivedAt)
  }
  /** Count retained pending and uncertain admissions.
   * @returns Payload-free queue counts.
   */
  inspect(): { pending: number; uncertain: number } {
    if (this.failure !== undefined) throw this.failure
    const rows = [...this.domain.table('entries').entries()].map(([, row]) => row)
    return { pending: rows.filter(row => row.state === 'queued').length, uncertain: rows.filter(row => row.state === 'dispatching').length }
  }
  private change<T>(work: () => Promise<T>): Promise<T> {
    const operation = this.tail.then(async () => { if (this.failure !== undefined) throw this.failure; return work() })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* Caller reports failure; close drains admitted writes. */ })
    return operation
  }
  private async put(row: SleepingQqMessage): Promise<void> {
    try { await this.domain.table('entries').put(row.id, entrySchema.parse(row)) }
    catch (error) { this.failure = new GenesisError('storage', 'QQ sleep-inbox write outcome is uncertain. Inspect the queue and Session before reloading.', { cause: error }); throw this.failure }
  }
  /** Retain a verified private message before returning from transport admission.
   * @param input - Validated message metadata and lossless raw JSON, without socket or credentials.
   * @param messageId - Actual platform message identity.
   * @returns After durable reservation; exact replay has no effect.
   */
  save(input: Omit<SleepingQqMessage, 'id' | 'lifeId' | 'state' | 'fingerprint'>, messageId: string): Promise<void> {
    return this.change(async () => {
      const id = createHash('sha256').update(JSON.stringify([this.lifeId, input.bot, input.conversation, messageId])).digest('hex')
      const fingerprint = createHash('sha256').update(JSON.stringify([input.text, input.raw, input.atMe])).digest('hex')
      const table = this.domain.table('entries'), old = table.get(id)
      if (old !== undefined) {
        if (old.fingerprint !== fingerprint) throw new GenesisError('invalid-source', 'A sleeping QQ message identity has different content.')
        return
      }
      const row = { ...input, id, lifeId: this.lifeId, state: 'queued' as const, fingerprint }
      if (table.size >= this.limit || JSON.stringify([...[...table.entries()].map(([, entry]) => entry), row]).length > this.chars) throw new GenesisError('capacity', 'QQ sleep inbox is full. Increase its configured retention; no old message was discarded.')
      await this.put(row)
    })
  }
  /** Reserve dispatch or confirm durable inbox admission; completed rows retain no message body.
   * @param id - Stable queue identity.
   * @param state - Dispatching or done.
   * @returns After the journal commits.
   */
  mark(id: string, state: 'dispatching' | 'done'): Promise<void> {
    return this.change(async () => {
      const row = this.domain.table('entries').get(id)
      if (row === undefined) throw new GenesisError('invalid-source', 'QQ sleep receipt is missing.')
      await this.put({ ...row, state, ...(state === 'done' ? { text: null, raw: null } : {}) })
    })
  }
  /** Drain reservations before closing storage. @returns After domain disposal. */
  async close(): Promise<void> { await this.tail; await this.domain.close() }
}
