/** Minimal polling clients for Telegram Bot API and Matrix Client-Server API. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import type { ImChannel } from './types.ts'

/** Transport event identity scoped by channel, account and conversation. */
export type ImEventId = Branded<'GenesisImEventId'>
/** Conversation identity within one channel account. */
export type ImChatId = Branded<'GenesisImChatId'>
/** Authenticated account identity within one channel. */
export type ImAccountId = Branded<'GenesisImAccountId'>
/** Platform account and service that own one polling checkpoint. */
type ImCheckpointAccount = Branded<'GenesisImCheckpointAccount'>

/** A validated and allowlisted incoming text message. */
export interface ImInput {
  event: ImEventId
  chat: ImChatId
  sender: ImAccountId
  text: string
  thread?: number
}

/** The polling cursor advances only after the runtime settles the complete batch. */
export interface ImBatch {
  cursor: string | null
  inputs: ImInput[]
  gap: boolean
}

/** An authenticated adapter instance for a single deployment account. */
export interface ImAdapter {
  channel: ImChannel
  account: ImCheckpointAccount
  /** Read one batch of validated text without committing its checkpoint.
   * @param cursor - Last durably settled checkpoint.
   * @param signal - Worker cancellation.
   * @returns Accepted inputs and the next checkpoint.
   */
  poll(cursor: string | null, signal: AbortSignal): Promise<ImBatch>
  /** Send to the authenticated input's original chat and wait for a platform acknowledgement.
   * @param input - Validated input that binds the destination.
   * @param text - Bounded plain-text reply.
   * @param signal - Turn cancellation.
   * @returns After an acknowledgement. A failure can leave delivery uncertain.
   */
  send(input: ImInput, text: string, signal: AbortSignal): Promise<void>
}

type Access = { allowChats: readonly string[]; allowUsers: readonly string[] }
type Request = (url: string | URL, options: RequestInit) => Promise<unknown>
type Connect = (token: string, request: Request, signal: AbortSignal) => Promise<ImAdapter>

const telegramId = z.number().int().positive()
const telegramMessage = z.object({
  message_id: telegramId,
  message_thread_id: telegramId.optional(),
  is_topic_message: z.boolean().optional(),
  chat: z.object({ id: z.number().int(), type: z.enum(['private', 'group', 'supergroup']) }),
  from: z.object({ id: telegramId, is_bot: z.literal(false) }),
  sender_chat: z.never().optional(),
  text: z.string().min(1),
}).refine(message => !message.is_topic_message || message.message_thread_id !== undefined)
const telegramUpdate = z.object({
  update_id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  message: z.unknown().optional(),
})
const matrixIdentifier = z.string().min(2).max(255)
const matrixMessage = z.object({
  event_id: matrixIdentifier,
  sender: matrixIdentifier,
  type: z.literal('m.room.message'),
  content: z.object({ msgtype: z.literal('m.text'), body: z.string().min(1), 'm.relates_to': z.never().optional() }),
})
const matrixSync = z.object({
  next_batch: z.string().min(1).max(4096),
  rooms: z.object({
    join: z.record(z.string(), z.object({
      timeline: z.object({ events: z.array(z.unknown()), limited: z.boolean().optional() }).optional(),
    })).optional(),
  }).optional(),
})

/**
 * Validate the credentials' explicit homeserver before making any request.
 * @param value - Homeserver base origin.
 * @returns A canonical HTTPS origin or a loopback HTTP origin for local deployments.
 */
export function matrixOrigin(value: string): string {
  const url = URL.parse(value)
  if (url === null || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))) {
    throw new GenesisError('invalid-state', 'Matrix homeserver must be an HTTPS origin or a loopback HTTP origin.')
  }
  return url.origin
}

/**
 * Authenticate a Telegram bot before admitting private, group or topic text.
 * @param access - Explicit chat and sender allowlists.
 * @param pollSeconds - Server-side long-poll duration.
 * @returns A connector that never derives its API origin from an incoming message.
 */
export function telegramConnector(access: Access, pollSeconds: number): Connect {
  return async (token, request, signal) => {
    if (!/^\d+:[A-Za-z0-9_-]+$/u.test(token)) throw new GenesisError('invalid-state', 'Telegram bot token has an invalid format.')
    const call = async <T>(method: string, body: object, result: z.ZodType<T>, signal: AbortSignal) =>
      z.object({ ok: z.literal(true), result }).parse(await request(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, signal,
      })).result
    const { id } = await call('getMe', {}, z.object({ id: telegramId, is_bot: z.literal(true) }), signal)
    return {
      channel: 'telegram', account: brandString<ImCheckpointAccount>(String(id)),
      async poll(cursor, signal) {
        const updates = await call('getUpdates', {
          timeout: pollSeconds, limit: 1, allowed_updates: ['message'],
          ...(cursor === null ? {} : { offset: z.coerce.number().int().nonnegative().parse(cursor) }),
        }, z.array(telegramUpdate).max(1), signal)
        const update = updates[0]
        if (update === undefined) return { cursor, inputs: [], gap: false }
        const next = String(update.update_id + 1)
        const message = telegramMessage.safeParse(update.message)
        if (!message.success) return { cursor: next, inputs: [], gap: false }
        const chat = String(message.data.chat.id)
        const sender = String(message.data.from.id)
        if (sender === String(id) || !access.allowChats.includes(chat) || !access.allowUsers.includes(sender)) {
          return { cursor: next, inputs: [], gap: false }
        }
        return { cursor: next, gap: false, inputs: [{
          event: brandString<ImEventId>(String(message.data.message_id)),
          chat: brandString<ImChatId>(chat), sender: brandString<ImAccountId>(sender), text: message.data.text,
          ...(message.data.message_thread_id === undefined ? {} : { thread: message.data.message_thread_id }),
        }] }
      },
      async send(input, text, signal) {
        await call('sendMessage', {
          chat_id: Number(input.chat), text,
          ...(input.thread === undefined ? {} : { message_thread_id: input.thread }),
        }, z.object({ message_id: telegramId }), signal)
      },
    }
  }
}

/**
 * Authenticate a Matrix account and poll only explicitly permitted rooms and senders.
 * @param access - Explicit room and sender allowlists.
 * @param origin - Validated homeserver origin.
 * @param pollSeconds - Server-side long-poll duration.
 * @returns A connector for unencrypted, non-threaded room messages.
 */
export function matrixConnector(access: Access, origin: string, pollSeconds: number): Connect {
  return async (token, request, signal) => {
    const call: Request = (path, init) => request(new URL(path, origin), {
      ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    })
    const { user_id: user } = z.object({ user_id: matrixIdentifier }).parse(await call('/_matrix/client/v3/account/whoami', { signal }))
    const filter = JSON.stringify({
      presence: { types: [] }, account_data: { types: [] },
      room: {
        rooms: access.allowChats, account_data: { types: [] }, ephemeral: { types: [] }, state: { types: [] },
        timeline: { limit: 25, types: ['m.room.message'], senders: access.allowUsers, not_senders: [user] },
      },
    })
    return {
      channel: 'matrix', account: brandString<ImCheckpointAccount>(`${origin}|${user}`),
      async poll(cursor, signal) {
        const query = new URLSearchParams({ filter, timeout: cursor === null ? '0' : String(pollSeconds * 1000) })
        if (cursor !== null) query.set('since', cursor)
        const batch = matrixSync.parse(await call(`/_matrix/client/v3/sync?${query}`, { signal }))
        const inputs: ImInput[] = []
        let gap = false
        if (cursor !== null) for (const [room, data] of Object.entries(batch.rooms?.join ?? {})) {
          if (!access.allowChats.includes(room) || data.timeline === undefined) continue
          gap ||= data.timeline.limited === true
          for (const event of data.timeline.events) {
            const message = matrixMessage.safeParse(event)
            if (!message.success || message.data.sender === user || !access.allowUsers.includes(message.data.sender)) continue
            inputs.push({ event: brandString<ImEventId>(message.data.event_id), chat: brandString<ImChatId>(room),
              sender: brandString<ImAccountId>(message.data.sender), text: message.data.content.body })
          }
        }
        return { cursor: batch.next_batch, inputs, gap }
      },
      async send(input, text, signal) {
        const path = `/_matrix/client/v3/rooms/${encodeURIComponent(input.chat)}/send/m.room.message/${encodeURIComponent(input.event)}`
        z.object({ event_id: matrixIdentifier }).parse(await call(path, { method: 'PUT', body: JSON.stringify({ msgtype: 'm.text', body: text }), signal }))
      },
    }
  }
}
