/** Durable cross-conversation reservations; incomplete sends are never retried automatically. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError, conversationIdSchema, type LifeId } from '@deepseek-ai/dsh-experimental-genesis'

/** Stable idempotency identity derived from the initiating QQ message and exact delivery request. */
export type QqMessageId = Branded<'GenesisQqMessageId'>
/** Model and storage parser for a delivery identity. */
export const qqMessageIdSchema = z.string().regex(/^[a-f0-9]{64}$/u).transform(brandString<QqMessageId>)
/** Complete persisted receipt; text stays in its source and target Session logs. */
export const qqMessageReceiptSchema = z.strictObject({
  id: qqMessageIdSchema, lifeId: z.uuid().transform(brandString<LifeId>), sourceSessionId: z.string().min(1).transform(SessionId),
  sourceSeq: z.number().int().nonnegative().transform(SessionSeq), targetId: conversationIdSchema,
  targetSessionId: z.string().min(1).transform(SessionId), digest: z.string().regex(/^[a-f0-9]{64}$/u),
  timestamp: z.iso.datetime(), status: z.enum(['reserved', 'confirmed', 'uncertain']), parts: z.number().int().positive(),
  messageIds: z.array(z.string().min(1).max(200)),
}).superRefine((receipt, ctx) => {
  if (receipt.messageIds.length > receipt.parts || receipt.status === 'confirmed' && receipt.messageIds.length !== receipt.parts) {
    ctx.addIssue({ code: 'custom', message: 'QQ delivery acknowledgements do not match the planned parts.' })
  }
})
/** Validated delivery metadata without message text or credentials. */
export type QqMessageReceipt = z.infer<typeof qqMessageReceiptSchema>
/** Independent version-one journal under the Genesis writer lease. */
export const qqMessagesDomain = defineDomain({ name: 'genesis_qq_messages', version: 1,
  tables: { receipts: domainTable<QqMessageId, QqMessageReceipt>(qqMessageReceiptSchema) } })

/** One owner serializes durable reservations and stops after uncertain storage writes. */
export class QqMessageStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  /** @param domain - Exclusive domain handle. @param limit - Maximum retained receipts; capacity never evicts idempotency evidence. */
  constructor(private readonly domain: Domain<typeof qqMessagesDomain>, private readonly limit: number) {}
  /** @param id - Stable original delivery identity. @returns Immutable durable receipt, or undefined before reservation. */
  get(id: QqMessageId): QqMessageReceipt | undefined {
    if (this.failure !== undefined) throw this.failure
    const receipt = this.domain.table('receipts').get(id)
    if (receipt !== undefined && receipt.id !== id) throw new GenesisError('invalid-state', 'Stored QQ receipt key differs from its identity.')
    return receipt
  }
  private change<T>(run: () => Promise<T>): Promise<T> {
    const pending = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      return run()
    })
    this.tail = pending.then(() => {}, (_error: unknown) => {
      // The awaiting executor reports failure; disposal drains accepted writes.
    })
    return pending
  }
  private async put(receipt: QqMessageReceipt): Promise<void> {
    try { await this.domain.table('receipts').put(receipt.id, qqMessageReceiptSchema.parse(receipt)) }
    catch (error) {
      this.failure = new GenesisError('storage', 'QQ message reservation or receipt write is uncertain. Stop sending and reload verified storage.', { cause: error })
      throw this.failure
    }
  }
  /** @param receipt - Complete reserved plan metadata. @returns True only for the caller owning a new durable reservation. */
  reserve(receipt: QqMessageReceipt): Promise<boolean> {
    return this.change(async () => {
      const previous = this.get(receipt.id)
      if (previous !== undefined) {
        if (previous.digest !== receipt.digest || previous.lifeId !== receipt.lifeId) {
          throw new GenesisError('invalid-source', 'The original QQ delivery identity was reused with different content or life data.')
        }
        return false
      }
      if (this.domain.table('receipts').size >= this.limit) {
        throw new GenesisError('capacity', 'QQ message receipt capacity is exhausted. Increase maxMessageReceipts; existing reservations cannot be discarded safely.')
      }
      await this.put(receipt)
      return true
    })
  }
  /**
   * @param id - Existing reservation.
   * @param status - Platform acknowledgement outcome.
   * @param messageIds - Actual acknowledged parts.
   * @returns After durable settlement.
   */
  settle(id: QqMessageId, status: 'confirmed' | 'uncertain', messageIds: string[]): Promise<void> {
    return this.change(async () => {
      const receipt = this.get(id)
      if (receipt === undefined) throw new GenesisError('invalid-state', 'QQ delivery has no durable reservation.')
      if (receipt.status !== 'reserved') throw new GenesisError('invalid-state', 'QQ delivery has already settled; inspect its receipt.')
      await this.put({ ...receipt, status, messageIds })
    })
  }
  /** @returns After accepted writes and the domain close settle. */
  async close(): Promise<void> { await this.tail; await this.domain.close() }
}
