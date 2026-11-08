/** Versioned mailbox projection with durable delivery reservations and life ownership. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError, type LifeId } from '@deepseek-ai/dsh-experimental-genesis'

/** Local durable mail identity; provider UIDs and Message-ID headers remain separate. */
export type MailId = Branded<'GenesisMailId'>
/** An operator-owned mailbox; changing its account requires an empty local mailbox. */
export const settingsSchema = z.strictObject({
  // Read only for migration into the operator contact; current settings omit this field.
  operatorAddress: z.union([z.literal(''), z.email()]).optional(), trustedAuthservId: z.string().regex(/^[a-zA-Z0-9._-]*$/u).max(253),
  enabled: z.boolean(), address: z.union([z.literal(''), z.email()]), user: z.string().max(320),
  imapHost: z.string().max(253), imapPort: z.number().int().min(1).max(65535),
  smtpHost: z.string().max(253), smtpPort: z.number().int().min(1).max(65535), smtpSecure: z.boolean(),
  credentialRef: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/u),
  recipientMode: z.enum(['unlimited', 'addresses', 'domains']), recipients: z.array(z.string().min(1).max(320)).max(1000),
  allowProactive: z.boolean(), dailySendLimit: z.number().int().min(0).max(100000),
}).superRefine((value, ctx) => {
  if (value.enabled && (!value.address || !value.user || !value.imapHost || !value.smtpHost)) ctx.addIssue({ code: 'custom', message: 'Complete the mailbox address, username and server hosts before enabling.' })
  for (const host of [value.imapHost, value.smtpHost]) if (host && /[\s/:@]/u.test(host)) ctx.addIssue({ code: 'custom', message: 'Server fields require hostnames without schemes or credentials.' })
  for (const recipient of value.recipients) {
    if (value.recipientMode === 'addresses' && !z.email().safeParse(recipient).success) ctx.addIssue({ code: 'custom', message: 'Recipient allowlist requires email addresses.' })
    if (value.recipientMode === 'domains' && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/iu.test(recipient)) ctx.addIssue({ code: 'custom', message: 'Domain allowlist requires domain names.' })
  }
})
/** Durable operator connection and outgoing policy, without secrets. */
export type MailSettings = z.infer<typeof settingsSchema>
const mailSchema = z.strictObject({
  id: z.string().transform(brandString<MailId>), threadKey: z.string(), operator: z.boolean(), senderAuthenticated: z.boolean().optional(), authservId: z.string().nullable(), direction: z.enum(['incoming', 'outgoing']),
  from: z.string(), to: z.string(), subject: z.string(), text: z.string(), at: z.number(),
  messageId: z.string(), inReplyTo: z.string().nullable(), providerKey: z.string().nullable(),
  folder: z.enum(['inbox', 'drafts', 'sent', 'archive', 'trash', 'blocked']),
  review: z.enum(['pending', 'allowed', 'blocked']),
  attention: z.enum(['pending', 'notified', 'read', 'deferred', 'done', 'uncertain']),
  delivery: z.enum(['received', 'draft', 'sending', 'accepted', 'uncertain', 'rejected']),
  readAt: z.number().nullable(), deferUntil: z.number().nullable(), reason: z.string(), sessionId: z.string().transform(SessionId).nullable(),
  sourceCall: z.string().nullable(), notifiedSeq: z.number().int().nonnegative().nullable(),
})
/** Complete retained text message; HTML and attachment bytes are not stored. */
export type MailMessage = z.infer<typeof mailSchema>
const currentStateSchema = z.strictObject({ version: z.literal(2), lifeId: z.string(), revision: z.number().int().nonnegative(),
  settings: settingsSchema, tombstones: z.array(z.string()), messages: z.array(mailSchema), cursor: z.number().int().nonnegative(), uidValidity: z.string().nullable(),
  conversations: z.array(z.strictObject({ key: z.string(), sessionId: z.string().transform(SessionId), published: z.boolean(), operator: z.boolean() })),
})
// Version-one mail has no review decision; migration never treats it as approved.
const legacyStateSchema = currentStateSchema.extend({ version: z.literal(1), messages: z.array(mailSchema.omit({ review: true }).extend({
  folder: z.enum(['inbox', 'drafts', 'sent', 'archive', 'trash']),
})) }).transform((state): z.infer<typeof currentStateSchema> => ({ ...state, version: 2, messages: state.messages.map(mail => ({ ...mail, review: 'pending' })) }))
const stateSchema = z.union([currentStateSchema, legacyStateSchema])
/** Version-two mailbox storage accepts version one through an explicit pending-review migration. */
export const mailDomain = defineDomain({ name: 'genesis_mail', version: 2, compatibleVersions: [1], tables: {
  state: domainTable<'current', z.infer<typeof stateSchema>>(stateSchema),
  identity: domainTable<'life', { lifeId: string }>(z.strictObject({ lifeId: z.string() })),
  reviews: domainTable<MailId, { sessionId: string; events: z.infer<ReturnType<typeof z.json>> }>(z.strictObject({ sessionId: z.string(), events: z.json() })),
} })
/** Serialize atomic projection writes; unknown writes prevent subsequent effects until reload. */
export class MailStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  /**
   * @param domain - Exclusive storage.
   * @param maxRecords - Retained message budget.
   * @param maxChars - Entire serialized state budget. */
  constructor(private readonly domain: Domain<typeof mailDomain>, private readonly maxRecords: number, private readonly maxChars: number) {}
  /** Initialize or restore this mailbox without replacing unreadable state.
   * @param lifeId - Existing stable life owner.
   * @param initialized - Existing life marker; missing mailbox data must not initialize again.
   * @returns After recovery; interrupted sends and notifications become uncertain.
   */
  async start(lifeId: LifeId, initialized = false): Promise<void> {
    const saved = this.domain.table('state').get('current'), identity = this.domain.table('identity').get('life')
    if (saved === undefined) {
      if (identity !== undefined || initialized) throw new GenesisError('invalid-state', 'Initialized mailbox state is missing. Restore matching storage.')
      await this.put({ version: 2, lifeId, revision: 0, settings: { enabled: false, trustedAuthservId: '', address: '', user: '', imapHost: '', imapPort: 993,
        smtpHost: '', smtpPort: 465, smtpSecure: true, credentialRef: 'GENESIS_MAIL_PASSWORD', recipientMode: 'unlimited', recipients: [], allowProactive: true, dailySendLimit: 0 },
      tombstones: [], messages: [], cursor: 0, uidValidity: null, conversations: [] })
    } else {
      if (stateSchema.parse(saved).lifeId !== lifeId || identity !== undefined && identity.lifeId !== lifeId) throw new GenesisError('invalid-state', 'Mailbox belongs to another life. Restore matching storage.')
      await this.change((state) => { for (const mail of state.messages) {
        if (mail.delivery === 'sending') mail.delivery = 'uncertain'
        if (mail.attention === 'notified') mail.attention = 'uncertain'
      } })
    }
    if (identity === undefined) {
      try { await this.domain.table('identity').put('life', { lifeId }) }
      catch (error) { this.failure = new GenesisError('storage', 'Mailbox ownership write is uncertain. Reload verified storage.', { cause: error }); throw this.failure }
    }
  }
  /** Read detached confirmed data.
   * @returns Validated current projection; missing or untrusted data rejects. */
  read(): z.infer<typeof stateSchema> {
    if (this.failure !== undefined) throw this.failure
    return structuredClone(stateSchema.parse(this.domain.table('state').get('current')))
  }
  private async put(value: z.infer<typeof stateSchema>): Promise<void> {
    const parsed = stateSchema.parse(value)
    if (parsed.messages.length > this.maxRecords || JSON.stringify(parsed).length > this.maxChars) throw new GenesisError('capacity', 'Mailbox storage is full. Export and remove retained messages or increase its configured limits.')
    try { await this.domain.table('state').put('current', parsed) }
    catch (error) { this.failure = new GenesisError('storage', 'Mailbox write outcome is uncertain. Stop mail actions and reload verified storage.', { cause: error }); throw this.failure }
  }
  /** Commit one complete projection change, preserving the last confirmed state on validation refusal.
   * @param work - Synchronous mutation of a detached draft.
   * @returns Callback result only after durable storage confirms the write.
   */
  change<T>(work: (state: z.infer<typeof stateSchema>) => T): Promise<T> {
    const result = this.tail.then(async () => { const state = this.read(), result = work(state); await this.put(state); return result })
    this.tail = result.then(() => {}, (_error: unknown) => { /* Each caller reports failure; teardown drains admitted writes. */ })
    return result
  }
  /** Retain review evidence outside searchable conversation Sessions and model-facing mail results.
   * @param id - Reviewed mail identity.
   * @param session - Detached auxiliary audit, never registered as a character conversation.
   * @returns After evidence is durable; uncertain writes stop mailbox actions.
   */
  async recordReview(id: MailId, session: Session): Promise<void> {
    const events = z.json().parse(session.snapshotEvents())
    if (JSON.stringify(events).length > this.maxChars) throw new GenesisError('capacity', 'Mail review audit exceeds the mailbox storage budget.')
    try { await this.domain.table('reviews').put(id, { sessionId: session.id, events }) }
    catch (error) { this.failure = new GenesisError('storage', 'Mail review write is uncertain. Reload verified storage.', { cause: error }); throw this.failure }
  }
  /** Remove private review evidence with its local message.
   * @param id - Deleted message identity.
   * @returns After audit deletion.
   */
  async eraseReview(id: MailId): Promise<void> { await this.domain.table('reviews').delete(id) }
  /** Drain writes before storage closes.
   * @returns After storage disposal. */
  async close(): Promise<void> { await this.tail; await this.domain.close() }
}
