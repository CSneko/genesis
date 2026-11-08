/** TLS-only IMAP and SMTP adapters; message content cannot configure connections or credentials. @module */
import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'
import { simpleParser } from 'mailparser'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import type { MailSettings, MailMessage } from './model.ts'

/** One bounded incoming source, authenticated only by the configured receiving service. */
export interface IncomingMail {
  uid: number; validity: string; from: string; to: string; subject: string; text: string; messageId: string
  inReplyTo: string | null; threadKey: string; operator: boolean; authservId: string | null; at: number
}
/** Complete transport limits, including the bounded first import. */
export interface TransportLimits { timeoutMs: number; maxSourceBytes: number; maxTextChars: number; batchSize: number }
/** Pluggable protocol adapter; tests replace external mail servers, never mailbox policy or persistence. */
export interface MailTransport {
  /**
   * @param settings - Captured route.
   * @param password - Resolved secret.
   * @param cursor - Last retained UID.
   * @param validity - Previous UID generation.
   * @param limits - Complete request bounds.
   * @param signal - Lifetime.
   * @param receive - Durable admission before cursor advancement.
   * @returns After one bounded sync. */
  sync(settings: MailSettings, password: string, cursor: number, validity: string | null, limits: TransportLimits, signal: AbortSignal, receive: (mail: IncomingMail) => Promise<void>): Promise<void>
  /**
   * @param settings - Captured route.
   * @param password - Resolved secret.
   * @param mail - Reserved outgoing message.
   * @param timeoutMs - Network deadlines.
   * @param signal - Lifetime.
   * @returns Whether the SMTP server accepted the one recipient; not a delivery confirmation. */
  send(settings: MailSettings, password: string, mail: MailMessage, timeoutMs: number, signal: AbortSignal): Promise<boolean>
}
/** Verify sender-domain authentication from the first Authentication-Results field added by a trusted receiving service.
 * @param address - Unique parsed sender address.
 * @param header - First authentication results field, without its field name.
 * @param settings - Trusted receiving service identifier; the contact role is checked separately.
 * @returns Whether the receiving service reports aligned DMARC success; the service must prepend results on every delivery and remove forged results using its identifier.
 */
export function authenticatedSender(address: string, header: string | undefined, settings: Pick<MailSettings, 'trustedAuthservId'>): boolean {
  if (!settings.trustedAuthservId || header === undefined) return false
  const normalized = header.replace(/\r?\n[\t ]+/gu, ' ')
  if (normalized.split(';')[0]?.trim().toLowerCase() !== settings.trustedAuthservId.toLowerCase()) return false
  const domain = address.split('@')[1]?.toLowerCase()
  return normalized.split(';').slice(1).some((result) => {
    const verdict = /^\s*dmarc\s*=\s*pass\b/iu.test(result)
    const from = /\bheader\.from\s*=\s*"?([a-z0-9.-]+)"?(?=\s|$)/iu.exec(result)?.[1]?.toLowerCase()
    return verdict && from === domain
  })
}
/** Maintained protocol clients; IMAP retrieval never marks mail read on the server. */
export class StandardMailTransport implements MailTransport {
  /** @inheritdoc */
  async sync(settings: MailSettings, password: string, cursor: number, validity: string | null, limits: TransportLimits, signal: AbortSignal, receive: (mail: IncomingMail) => Promise<void>): Promise<void> {
    const client = new ImapFlow({ host: settings.imapHost, port: settings.imapPort, secure: true,
      auth: { user: settings.user, pass: password }, logger: false, connectionTimeout: limits.timeoutMs,
      greetingTimeout: limits.timeoutMs, socketTimeout: limits.timeoutMs, disableAutoIdle: true })
    const abort = () => { client.close() }
    client.on('error', (_error: Error) => { /* Awaited protocol calls own reporting; no credentials or raw server replies are logged. */ })
    signal.throwIfAborted(); signal.addEventListener('abort', abort, { once: true })
    try {
      await client.connect(); signal.throwIfAborted()
      const lock = await client.getMailboxLock('INBOX', { readOnly: true })
      try {
        const box = client.mailbox
        if (!box) throw new GenesisError('invalid-state', 'IMAP inbox is unavailable.')
        const generation = String(box.uidValidity), start = generation === validity ? cursor + 1 : 1
        if (start >= box.uidNext) return
        // Range ends at a captured UIDNEXT: a UID range ending in * can replay the last old message.
        const ids = await client.search({ uid: `${start}:${box.uidNext - 1}` }, { uid: true })
        if (ids === false || ids === undefined) throw new GenesisError('invalid-state', 'IMAP search did not complete.')
        for (const uid of ids.slice(0, limits.batchSize)) {
          signal.throwIfAborted()
          const item = await client.fetchOne(uid, { source: { start: 0, maxLength: limits.maxSourceBytes + 1 }, size: true }, { uid: true })
          if (!item || item.source === undefined) throw new GenesisError('invalid-source', 'An incoming mail disappeared before durable admission. Retry sync.')
          if (item.size === undefined || item.size > limits.maxSourceBytes || item.source.length > limits.maxSourceBytes) throw new GenesisError('capacity', 'An incoming email exceeds maxSourceBytes. Increase the limit or move that message out of INBOX; later mail remains pending.')
          const parsed = await simpleParser(item.source, { skipHtmlToText: false, skipTextToHtml: true, maxHtmlLengthToParse: limits.maxSourceBytes })
          const from = parsed.from?.value.length === 1 ? parsed.from.value[0]?.address ?? '' : ''
          const auth = parsed.headerLines.find(line => line.key.toLowerCase() === 'authentication-results')?.line.replace(/^authentication-results:\s*/iu, '')
          const messageId = parsed.messageId ?? `imap:${generation}:${uid}`
          const references = typeof parsed.references === 'string' ? [parsed.references] : parsed.references
          const text = parsed.text ?? ''
          if (text.length > limits.maxTextChars) throw new GenesisError('capacity', 'Incoming mail text exceeds maxTextChars. Increase the limit or move that message out of INBOX.')
          if (JSON.stringify({ from, to: parsed.to, subject: parsed.subject, messageId, references }).length > limits.maxTextChars) throw new GenesisError('capacity', 'Incoming mail headers exceed maxTextChars. Increase the configured limit or move that message out of INBOX.')
          await receive({ uid, validity: generation, from, to: parsed.to === undefined ? settings.address : (Array.isArray(parsed.to) ? parsed.to.map(value => value.text).join(', ') : parsed.to.text),
            subject: parsed.subject ?? '', text, messageId, inReplyTo: parsed.inReplyTo ?? null,
            threadKey: references?.[0] ?? parsed.inReplyTo ?? messageId, operator: authenticatedSender(from, auth, settings), authservId: auth?.split(';')[0]?.trim() ?? null, at: parsed.date?.getTime() ?? Date.now() })
        }
      } finally { lock.release() }
    } finally { signal.removeEventListener('abort', abort); client.close() }
  }
  /** @inheritdoc */
  async send(settings: MailSettings, password: string, mail: MailMessage, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
    const transport = nodemailer.createTransport({ host: settings.smtpHost, port: settings.smtpPort, secure: settings.smtpSecure,
      requireTLS: !settings.smtpSecure, auth: { user: settings.user, pass: password },
      connectionTimeout: timeoutMs, greetingTimeout: timeoutMs, socketTimeout: timeoutMs, logger: false, debug: false,
      disableFileAccess: true, disableUrlAccess: true })
    const abort = () => { transport.close() }
    signal.throwIfAborted(); signal.addEventListener('abort', abort, { once: true })
    try {
      const result = await transport.sendMail({ from: settings.address, to: mail.to, subject: mail.subject, text: mail.text,
        messageId: mail.messageId, ...(mail.inReplyTo === null ? {} : { inReplyTo: mail.inReplyTo, references: [mail.inReplyTo] }) })
      return result.accepted.length === 1 && result.rejected.length === 0
    } finally { signal.removeEventListener('abort', abort); transport.close() }
  }
}
