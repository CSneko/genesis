/** Browser-safe mailbox samples; credential values never cross Remote. @module */
import type { MailSettings, MailMessage } from './model.ts'
export type { MailSettings, MailMessage, MailId } from './model.ts'
/** Bounded metadata; opening a message as the operator does not mark it read by Genesis. */
export type MailSummary = Omit<MailMessage, 'text'>
/** One filtered mailbox page and live connection diagnostics. */
export interface MailStatus {
  settings: MailSettings
  pollMs: number
  revision: number
  credentialPresent: boolean
  awake: boolean
  active: boolean
  failure: 'sync' | 'processing' | 'send' | 'credential' | null
  lastSyncAt: number | null
  pending: number
  uncertain: number
  messages: MailSummary[]
  total: number
  nextOffset: number | null
}
