/** Current-conversation QQ evidence; stored input is data, never instruction authority. @module */
import { z } from 'zod'
import { pluginRecordOf, type Session } from '@deepseek-ai/dsh-session'
import { mediaRecordSchema } from './media.ts'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'

/** Durable observation and decision audit; interrupted observations are never automatically replayed. */
export const groupRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    version: z.literal(1),
    kind: z.literal('message'),
    messageId: z.string().min(1).max(200),
    qq: z.string().regex(/^[1-9][0-9]*$/),
    nickname: z.string().max(200),
    text: z.string(),
    atMe: z.boolean(),
    mediaDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
  }),
  z.strictObject({
    version: z.union([z.literal(1), z.literal(2)]),
    kind: z.literal('decision'),
    messageId: z.string().min(1).max(200),
    outcome: z.enum(['reply', 'skip', 'failed']),
    decision: z.strictObject({ probability: z.number().min(0).max(1), threshold: z.number().min(0).max(1) }).optional(),
  }),
])
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Versioned current-group observations and binary reply outcomes; excluded from ordinary model history. */
    'plugin:genesis-qq/group': z.infer<typeof groupRecordSchema>
  }
}
/** One user-visible message with current-conversation pagination; no internal person identifiers. */
export interface QqHistoryMessage {
  messageId?: string
  seq: number
  time: number
  role: 'user' | 'assistant'
  qq: string
  nickname: string
  text: string
  attachments?: Array<{
    attachmentId: z.infer<typeof mediaRecordSchema>['file']['attachmentId']
    kind: z.infer<typeof mediaRecordSchema>['kind']
    name: string
    bytes: number
  }>
}

/**
 * Validate and collect this plugin's durable group audit, including ignored messages.
 * @param session - Actual calling conversation, never a model-selected Session.
 * @returns Validated observations and outcomes; unknown versions or corruption refuse use.
 */
export function groupRecords(session: Session): Array<z.infer<typeof groupRecordSchema>> {
  return session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:genesis-qq/group' ? [groupRecordSchema.parse(record.data)] : []
  })
}

/**
 * Read visible QQ messages in chronological order, with no tools, hidden reasoning or other Sessions.
 * @param session - Actual calling conversation.
 * @param botQq - Authenticated bot account for assistant labels.
 * @returns Observed group input and ordinary QQ dialogue, deduplicated by authenticated message ID.
 */
export function historyMessages(session: Session, botQq: string): QqHistoryMessage[] {
  const result: QqHistoryMessage[] = []
  const seen = new Set<string>()
  const media = session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:genesis-qq/media' ? [mediaRecordSchema.parse(record.data)] : []
  })
  for (const event of session.ownEvents()) {
    const record = pluginRecordOf(event)
    if (record?.type === 'plugin:genesis-qq/group') {
      const row = groupRecordSchema.parse(record.data)
      if (row.kind !== 'message' || seen.has(row.messageId)) continue
      seen.add(row.messageId)
      result.push({
        seq: event.seq,
        time: event.time,
        role: 'user',
        messageId: row.messageId,
        qq: row.qq,
        nickname: row.nickname,
        text: row.text,
      })
    } else if (event.type === 'user/message' && event.data.source.kind === 'genesis-person') {
      const source = event.data.source
      if (seen.has(source.messageId)) continue
      seen.add(source.messageId)
      const text = event.data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      result.push({
        seq: event.seq,
        time: event.time,
        role: 'user',
        messageId: source.messageId,
        qq: source.accountId,
        nickname: source.name,
        text: text.startsWith('发言者 ') ? text.slice(text.indexOf('\n') + 1) : text,
      })
    } else if (event.type === 'assistant/message' && !event.data.interrupted) {
      const text = event.data.message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      if (text) result.push({ seq: event.seq, time: event.time, role: 'assistant', qq: botQq, nickname: '机器人', text })
    }
  }
  return result.map((row) => {
    const attachments = media
      .filter(item => item.messageId === row.messageId)
      .map(item => ({
        attachmentId: item.file.attachmentId,
        kind: item.kind,
        name: item.file.name,
        bytes: item.file.bytes,
      }))
    return attachments.length ? { ...row, attachments } : row
  })
}

/**
 * Fit a complete history result to its serialized character budget without hiding omitted text.
 * @param rows - Already authorized chronological messages.
 * @param limit - Maximum newest messages.
 * @param chars - Complete JSON character limit, including metadata.
 * @param beforeSeq - Optional exclusive pagination cursor.
 * @returns Chronological page; truncated messages remain pageable by their original sequence.
 */
export function historyPage(
  rows: QqHistoryMessage[],
  limit: number,
  chars: number,
  beforeSeq?: number,
): {
  messages: Array<QqHistoryMessage & { truncated: boolean }>
  nextBeforeSeq: number | null
  omitted: number
} {
  const eligible = rows.filter(row => beforeSeq === undefined || row.seq < beforeSeq)
  const selected = eligible.slice(-limit)
  const result = {
    messages: selected.map(row => ({ ...row, truncated: false })),
    nextBeforeSeq: selected[0]?.seq ?? null,
    omitted: eligible.length - selected.length,
  }
  // Keep all selected labels when possible and share the text budget across the page.
  while (JSON.stringify(result).length > chars) {
    const longest = result.messages.toSorted((a, b) => b.text.length - a.text.length)[0]
    if (longest === undefined || longest.text.length === 0) {
      if (result.messages.length <= 1) throw new GenesisError('capacity', 'QQ history metadata exceeds historyChars.')
      result.messages.shift()
      result.omitted++
      const first = result.messages[0]
      if (first === undefined) throw new GenesisError('invalid-state', 'QQ history page lost its next cursor.')
      result.nextBeforeSeq = first.seq
      continue
    }
    const excess = JSON.stringify(result).length - chars
    longest.text = Array.from(longest.text)
      .slice(0, Math.max(0, Array.from(longest.text).length - Math.max(1, excess)))
      .join('')
    longest.truncated = true
  }
  return result
}

/**
 * Prepare automatic dialogue context without audit identifiers or pagination cursors.
 * @param rows - Authorized messages in this conversation.
 * @param limit - Maximum recent message count.
 * @param chars - Complete serialized character budget.
 * @returns Bounded readable messages with observed reply IDs; attachment handles remain available for media tools.
 */
export function recentHistory(rows: QqHistoryMessage[], limit: number, chars: number) {
  const page = historyPage(rows, limit, chars)
  return {
    messages: page.messages.map(row => ({
      time: row.time,
      role: row.role,
      qq: row.qq,
      nickname: row.nickname,
      text: row.text,
      truncated: row.truncated,
      ...(row.messageId === undefined ? {} : { messageId: row.messageId }),
      ...(row.attachments === undefined ? {} : { attachments: row.attachments }),
    })),
    omitted: page.omitted,
  }
}

/**
 * Supply only unanswered group observations absent from retained automatic context.
 * Reply-triggering inputs enter through the inbox and must never be previewed here.
 * @param session - Actual group conversation with its retained model history.
 * @param botQq - Authenticated bot account.
 * @param limit - Maximum recent messages considered before deduplication.
 * @param chars - Complete serialized history budget.
 * @returns New bounded observations, or nothing when all eligible context was delivered.
 */
export function unseenGroupHistory(session: Session, botQq: string, limit: number, chars: number) {
  const seen = new Set<string>()
  for (const message of session.deriveMessages()) {
    if (message.role !== 'user' || message.source.kind !== 'genesis-state' || message.source.form !== 'snapshot') continue
    for (const section of message.source.sections) {
      if (
        section.name !== 'genesis:qq-recent' ||
        !section.text ||
        !message.content.some(block => block.type === 'text' && block.text.includes(section.text))
      )
        continue
      // Legacy deliveries append a tool reminder after the single-line JSON page.
      const json = section.text.slice(section.text.indexOf('{')).split('\n')[0] ?? ''
      const page = z.object({ messages: z.array(z.object({ messageId: z.string().optional() })) }).parse(JSON.parse(json))
      for (const row of page.messages) if (row.messageId !== undefined) seen.add(row.messageId)
    }
  }
  const skipped = new Set(
    groupRecords(session).flatMap(row => (row.kind === 'decision' && row.outcome === 'skip' ? [row.messageId] : [])),
  )
  const rows = historyMessages(session, botQq)
    .slice(-limit)
    .filter(row => row.messageId !== undefined && skipped.has(row.messageId) && !seen.has(row.messageId))
  if (rows.length === 0) return
  return recentHistory(rows, limit, chars)
}
