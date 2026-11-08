/** Durable idle-work cursor and atomic, version-fenced memory consolidation. @module */
import { randomUUID } from 'node:crypto'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import { GenesisError } from './error.ts'
import { retainMemoryHistory } from './memory-history.ts'
import type { LifeState, MemoryId, LifeEventId, LifeMemory, MemoryHabit, MemoryInput, MemoryEmbedding } from './model.ts'

/** Actual user evidence grouped by completed Session turn, independent of manual saves. */
export interface ReviewEvidence { sessionId: SessionId; turn: number; userEventIds: LifeEventId[] }
/** Non-destructive consolidation replacement; source experiences are retained. */
export interface ConsolidationChange {
  id?: MemoryId
  input: MemoryInput
  embedding?: MemoryEmbedding | undefined
  habit?: MemoryHabit
  experienceIds: MemoryId[]
}
/** Selected versions and pending-work revision fence the entire commit. */
export interface ConsolidationCommit {
  revision: number
  versions: Array<{ id: MemoryId; updatedAt: string }>
  changes: ConsolidationChange[]
}

/**
 * Queue new evidence or initialize preferences, retaining a real Session for logged auxiliary calls.
 * @param state - Unpublished transaction snapshot.
 * @param sessionId - Actual source Session, if known.
 * @param advance - Whether new work needs a fresh revision and retry budget.
 */
export function queueConsolidation(state: LifeState, sessionId?: SessionId, advance = true): void {
  const now = new Date().toISOString()
  const work = state.consolidation ??= { revision: 0, completed: 0, requestedAt: now, failures: 0 }
  const source = sessionId ?? work.sessionId ?? state.events.findLast(event => event.relatedSessionId !== undefined)?.relatedSessionId
  if (source !== undefined) work.sessionId = brandString<SessionId>(source)
  if (!advance) return
  work.revision++
  work.requestedAt = now
  work.failures = 0
  delete work.failure
}

/**
 * Apply a bounded plan only while every selected version and work revision still matches.
 * @param state - Unpublished transaction snapshot.
 * @param plan - Fully validated sourced replacements.
 * @returns Whether the transaction consumed the pending revision; stale plans have no effects.
 */
export function applyConsolidation(state: LifeState, plan: ConsolidationCommit): boolean {
  const work = state.consolidation
  if (work === undefined || work.revision !== plan.revision || work.completed >= plan.revision
    || plan.versions.some(version => !state.memories.some(memory => memory.id === version.id
      && memory.updatedAt === version.updatedAt))) return false
  for (const change of plan.changes) {
    const old = change.id === undefined ? undefined : state.memories.find(memory => memory.id === change.id)
    if (change.id !== undefined && old === undefined) throw new GenesisError('invalid-source', 'Consolidation referenced a removed memory.')
    const now = new Date(Math.max(Date.now(), old === undefined ? 0 : Date.parse(old.updatedAt) + 1)).toISOString()
    const memory: LifeMemory = retainMemoryHistory(old, { ...change.input,
      id: old?.id ?? brandString<MemoryId>(randomUUID()), lifeId: state.identity.id,
      createdAt: old?.createdAt ?? now, updatedAt: now, embedding: change.embedding,
      ...(change.habit === undefined ? {} : { habit: change.habit }), experienceIds: change.experienceIds })
    if (old === undefined) state.memories.push(memory)
    else state.memories[state.memories.indexOf(old)] = memory
  }
  work.completed = plan.revision
  work.lastRunAt = new Date().toISOString()
  work.lastAttemptAt = work.lastRunAt
  work.changes = plan.changes.length
  work.failures = 0
  delete work.failure
  return true
}
