/** Independent QQ reply routes and bounded probability receipts; credentials never enter this domain. @module */
import { z } from 'zod'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import type { QqDecisionSettings, QqDecisionReceipt } from './types.ts'

/** Validated explicit inheritance, registered provider or binary endpoint. */
export const decisionSettingsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('inherit') }),
  z.strictObject({ kind: z.literal('provider'), provider: z.string().trim().min(1).max(512), model: z.string().trim().min(1).max(512) }),
  z.strictObject({ kind: z.literal('jev'), url: z.url().refine((value) => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  }), model: z.string().trim().min(1).max(512), threshold: z.number().min(0).max(1), useKey: z.boolean() }),
])
const probability = z.strictObject({ probability: z.number().min(0).max(1), threshold: z.number().min(0).max(1) })
/** Receipt fields contain message references and actual model probability, never message bodies. */
export const decisionReceiptSchema = z.strictObject({ sessionId: z.string().transform(SessionId), messageId: z.string().min(1).max(200),
  target: z.string().regex(/^[1-9][0-9]*$/), timestamp: z.iso.datetime(), outcome: z.enum(['reply', 'skip', 'failed']),
  decision: probability.nullable() })
const settingsRow = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().positive(), settings: decisionSettingsSchema })
/** Independent version keeps QQ and memory model configuration separate. */
export const qqDecisionDomain = defineDomain({ name: 'genesis_qq_decision', version: 1, tables: {
  settings: domainTable<'current', z.infer<typeof settingsRow>>(settingsRow),
  recent: domainTable<'current', { schemaVersion: 1; entries: QqDecisionReceipt[] }>(z.strictObject({
    schemaVersion: z.literal(1), entries: z.array(decisionReceiptSchema),
  })),
} })
/** One serialized writer; unknown writes stop dependent reads until verified reload. */
export class QqDecisionPreferences {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing = false
  /**
   * @param domain - Exclusive settings/receipt storage.
   * @param limit - Maximum retained probability rows.
   */
  constructor(private readonly domain: Domain<typeof qqDecisionDomain>, private readonly limit: number) { this.read() }
  /** Read detached current settings and recent outcomes. @returns No secrets or group text. */
  read(): { revision: number; settings: QqDecisionSettings; recent: QqDecisionReceipt[] } {
    if (this.failure) throw this.failure
    if (this.closing) throw new GenesisError('closed', 'QQ decision settings are closing.')
    const row = this.domain.table('settings').get('current')
    return { revision: row?.revision ?? 0, settings: row?.settings ?? { kind: 'inherit' },
      recent: this.domain.table('recent').get('current')?.entries.slice(-this.limit) ?? [] }
  }
  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    this.read()
    const task = this.tail.then(async () => {
      if (this.failure) throw this.failure
      try { return await run() } catch (error) {
        if (error instanceof GenesisError && error.code === 'configuration-conflict') throw error
        this.failure = new GenesisError('storage', 'QQ decision write has an uncertain outcome. Reload verified storage before continuing.', { cause: error })
        throw this.failure
      }
    })
    this.tail = task.then(() => {}, (_error: unknown) => { /* Caller owns reporting; disposal drains writes. */ })
    return task
  }
  /**
   * Save only this channel's route.
   * @param settings - Operator draft.
   * @param revision - Revision fence.
   * @returns New revision.
   */
  save(settings: QqDecisionSettings, revision: number): Promise<number> {
    const value = decisionSettingsSchema.parse(settings)
    return this.enqueue(async () => {
      if ((this.domain.table('settings').get('current')?.revision ?? 0) !== revision) throw new GenesisError('configuration-conflict', 'QQ decision settings changed. Refresh before saving.')
      await this.domain.table('settings').put('current', { schemaVersion: 1, revision: revision + 1, settings: value })
      return revision + 1
    })
  }
  /**
   * Publish a bounded receipt after its Session audit.
   * @param receipt - Actual result.
   * @returns After durable publication.
   */
  record(receipt: QqDecisionReceipt): Promise<void> {
    const value = decisionReceiptSchema.parse(receipt)
    return this.enqueue(async () => {
      const previous = this.domain.table('recent').get('current')?.entries ?? []
      await this.domain.table('recent').put('current', { schemaVersion: 1,
        entries: [...previous.filter(row => row.sessionId !== value.sessionId || row.messageId !== value.messageId), value].slice(-this.limit) })
    })
  }
  /** Drain writes and close storage. @returns After the owner is quiescent. */
  async close(): Promise<void> { this.closing = true; await this.tail; await this.domain.close() }
}
