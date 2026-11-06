/** Browser-safe partner status; credentials are never returned. @module */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CompanionId, CompanionMessageId, CompanionSettings, CompanionMessage } from './state.ts'
export type { CompanionSettings, CompanionId, CompanionMessageId, CompanionMessage }
/** One bounded operator sample. */
export interface CompanionStatus {
  sessionId: SessionId
  partnerId: CompanionId
  settings: CompanionSettings
  revision: number
  connected: boolean
  tokenPresent: boolean
  partnerAsleep: boolean
  genesisAwake: boolean
  blocked: 'disabled' | 'interaction-disabled' | 'disconnected' | 'genesis-asleep' | 'partner-asleep' | 'archived' | null
  active: { sessionId: SessionId; remaining: number; waiting: boolean } | null
  /** Every partner conversation this life has used, most recent binding included. */
  sessions: SessionId[]
  messages: CompanionMessage[]
  messagesOmitted: number
  failure: string | null
}
