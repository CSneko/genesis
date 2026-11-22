/** Operator-owned settings shared by the optional Telegram and Matrix adapters. @module */
import Schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { matrixOrigin } from './im-adapters.ts'
import type { ImChannel, ImConnection } from './types.ts'

/** Both the conversation and sender must match an allowlist before text enters a Session. */
interface ImAccess {
  /** Start polling this channel when the plugin loads. */
  enabled: boolean
  /** Exact platform chat or room IDs. */
  allowChats: string[]
  /** Exact platform sender IDs. */
  allowUsers: string[]
}

/** Deployment settings for Telegram and Matrix text conversations. */
export interface ImConfig {
  /** Telegram Bot API access policy. */
  telegram?: ImAccess
  /** Matrix Client-Server API access policy and homeserver. */
  matrix?: ImAccess & {
    /** HTTPS origin or loopback HTTP origin that receives the Matrix access token. */
    homeserver: string
  }
  /** Server-side long-poll duration in seconds. */
  pollSeconds: number
  /** Delay between polling retries or wake-state checks. */
  retryMs: number
  /** Time budget for one conversation turn and reply. */
  turnTimeoutMs: number
  /** Maximum serialized history and new message characters per turn. */
  maxContextChars: number
}

const telegramChat = /^-?[1-9][0-9]{0,15}$/u
const telegramUser = /^[1-9][0-9]{0,15}$/u
const matrixRoom = /^!\S{1,254}$/u
const matrixUser = /^@[^:\s]+:\S+$/u

/** Nonsecret fields shared by UI requests and persisted rows. */
export const imConnectionSchema = z.strictObject({
  enabled: z.boolean(),
  allowChats: z.array(z.string().max(255)),
  allowUsers: z.array(z.string().max(255)),
  homeserver: z.string().max(2048),
})

/**
 * Validate an operator draft before replacing a connection or saving it.
 * @param channel - Platform that owns the draft.
 * @param input - Complete connection settings.
 * @param maxTargets - Combined allowlist limit.
 * @returns Validated settings with a canonical Matrix origin.
 */
export function validateImConnection(channel: ImChannel, input: ImConnection, maxTargets: number): ImConnection {
  const connection = imConnectionSchema.parse(input)
  if (connection.allowChats.length + connection.allowUsers.length > maxTargets) {
    throw new GenesisError('capacity', 'IM allowlists exceed maxAllowedTargets.')
  }
  const chat = channel === 'telegram' ? telegramChat : matrixRoom
  const user = channel === 'telegram' ? telegramUser : matrixUser
  if (!connection.allowChats.every(id => chat.test(id)) || !connection.allowUsers.every(id => user.test(id))) {
    throw new GenesisError('invalid-source', 'The allowlists contain invalid platform IDs.')
  }
  if (channel === 'telegram' && connection.homeserver !== '') throw new GenesisError('invalid-state', 'Telegram uses the official Bot API.')
  if (channel === 'matrix' && (connection.enabled || connection.homeserver !== '')) {
    connection.homeserver = matrixOrigin(connection.homeserver)
  }
  return connection
}

/** Each channel starts disabled. Empty allowlists admit no messages. */
export const imConfig = Schema.object({
  telegram: Schema.object({
    enabled: Schema.boolean().default(false),
    allowChats: Schema.array(Schema.string().pattern(telegramChat)).default([]),
    allowUsers: Schema.array(Schema.string().pattern(telegramUser)).default([]),
  }),
  matrix: Schema.object({
    enabled: Schema.boolean().default(false),
    homeserver: Schema.string().default(''),
    allowChats: Schema.array(Schema.string().pattern(matrixRoom)).default([]),
    allowUsers: Schema.array(Schema.string().pattern(matrixUser)).default([]),
  }),
  pollSeconds: Schema.natural().min(1).max(50).default(25),
  retryMs: Schema.natural().min(100).max(60000).default(3000),
  turnTimeoutMs: Schema.natural().min(1000).max(3600000).default(120000),
  maxContextChars: Schema.natural().min(4096).default(128000),
})
