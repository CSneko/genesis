/** Bounded, operator-only views of retained people and relationship evidence. @module */
import type { LifePerson, PersonId } from './people-model.ts'
import type { LifeEventId } from './model.ts'
import type { SessionId } from '@deepseek-ai/dsh-session'

export type { PersonId, LifePerson } from './people-model.ts'
/** Current estimates remain inferences; operator identity is an independent deployment binding. */
export interface PersonSummary {
  id: PersonId
  name: string
  accountId: string
  updatedAt: string
  operator: boolean
  relationship: LifePerson['relationship']
  evidenceCount: number
}
/** Page over retained profiles; strangers without meaningful relationship evidence are absent. */
export interface PeopleCatalog {
  items: PersonSummary[]
  total: number
  nextOffset: number | null
}
/** One immutable appraisal or explicit migration, linked to its original Session evidence. */
export interface PersonEvidence {
  id: LifeEventId
  timestamp: string
  kind: 'appraisal' | 'migration'
  reason: string
  summary: string
  sources: Array<{ id: LifeEventId; sessionId: SessionId | null; eventId: string | null }>
}
/** Detail pages retain the current profile while paging its immutable evidence separately. */
export interface PersonDetail {
  person: PersonSummary
  events: PersonEvidence[]
  total: number
  nextOffset: number | null
}
