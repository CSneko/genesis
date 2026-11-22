/** Secret-free QQ settings and sampled delivery diagnostics for the authenticated operator UI. @module */
import type { SessionId } from '@deepseek-ai/dsh-session'

/** Text channel displayed alongside the QQ connection. */
export type ImChannel = 'telegram' | 'matrix'

/** Sampled delivery worker state. */
export type ImChannelState = 'disabled' | 'unconfigured' | 'connecting' | 'connected' | 'paused' | 'retrying' | 'failed'

/** Operator settings for one text channel. The homeserver is used only by Matrix. */
export interface ImConnection {
  enabled: boolean
  allowChats: string[]
  allowUsers: string[]
  homeserver: string
}

/** Confirmed settings and credential presence, sampled without returning the secret. */
export interface ImConnectionStatus {
  connection: ImConnection
  revision: number
  tokenConfigured: boolean
  writable: boolean
}

/** Nonsecret operator connection choices; the token remains in credential storage. */
export interface QqConnection {
  enabled: boolean
  wsUrl: string
  port: number
  botQq: string
  operatorQq: string
}
/** Operator-owned conversation policy; relation estimates cannot change these fields. */
export interface QqSettings {
  enabled: boolean
  allowGroups: string[]
  allowUsers: string[]
  acceptPrivateFromAnyone: boolean
  groupAutoReply: boolean
  replyOnlyWhenMentioned: boolean
  extraPrompt: string
  privateContextTokens: number
  groupContextTokens: number
  operatorContextTokens: number
}
/** Durable send reservations preserve unknown outcomes; inspection never retries a send. */
export interface QqDelivery {
  sessionId: SessionId
  timestamp: string
  seq: number
  status: 'confirmed' | 'uncertain'
  parts: number
  acknowledged: number
}
/** One bounded current sample; connection details and token presence never disclose the token itself. */
export interface QqStatus {
  imChannels?: Record<ImChannel, ImChannelState>
  imConnections?: Record<ImChannel, ImConnectionStatus>
  revision: number
  connectionRevision: number
  connection: QqConnection
  settings: QqSettings
  botQq: string
  operatorQq: string
  endpoint: string
  tokenConfigured: boolean
  mode: 'unconfigured' | 'connected' | 'listening' | 'disconnected' | 'paused' | 'failed'
  failure: 'transport' | 'operation' | 'settings' | 'archived' | 'decision' | null
  pending: number
  liveSessions: number
  decision?: { revision: number; settings: QqDecisionSettings; keyConfigured: boolean; recent: QqDecisionReceipt[] }
  deliveries: QqDelivery[]
  omitted: number
}

/** QQ-only reply decision configuration; inheritance never writes memory settings. */
export type QqDecisionSettings = { kind: 'inherit' } | { kind: 'provider'; provider: string; model: string }
  | { kind: 'jev'; url: string; model: string; threshold: number; useKey: boolean }
/** Actual probability receipt; boolean-only models retain null rather than an invented percentage. */
export interface QqDecisionReceipt {
  sessionId: SessionId
  messageId: string
  target: string
  timestamp: string
  outcome: 'reply' | 'skip' | 'failed'
  decision: { probability: number; threshold: number } | null
}
