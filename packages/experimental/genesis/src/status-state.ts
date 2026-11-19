/** Detached selections for the life overview, excluding unrelated history and vectors. @module */
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { LifeEvent, LifeEventId, LifeState } from './model.ts'

/** Overview data with full counts and bounded historical samples in newest-first order. */
export type StatusState = Pick<LifeState, 'identity' | 'operator' | 'emotion' | 'interests' | 'consolidation' | 'memories' | 'growth' | 'sessions'> & {
  counts: { events: number; memories: number; growth: number }
  interestHistory: { total: number; entries: StatusHistoryEntry[] }
  emotionHistory: { total: number; entries: StatusHistoryEntry[] }
}

/** One selected historical event and its existing sources in life-event order. */
interface StatusHistoryEntry {
  event: LifeEvent
  sourceEventIds: LifeEventId[]
}

/**
 * Select overview inputs before detaching; the caller retains ownership of committed state.
 * @param state - Validated committed life; never modified or retained.
 * @param sessionIds - Live sessions whose capability inventories are displayed.
 * @param limit - Maximum entries per preview, from the resolved query limit.
 * @returns Detached overview data preserving counts, stable ranking and source ordering.
 */
export function selectStatusState(state: LifeState, sessionIds: readonly SessionId[], limit: number): StatusState {
  const interestHistory: StatusState['interestHistory'] = { total: 0, entries: [] }
  const emotionHistory: StatusState['emotionHistory'] = { total: 0, entries: [] }
  const add = (history: StatusState['interestHistory'], event: LifeEvent) => {
    history.total++
    if (history.entries.length < limit) history.entries.push({ event, sourceEventIds: [] })
  }
  for (const event of state.events.toReversed()) {
    if (event.type === 'interest.changed') add(interestHistory, event)
    if (event.type === 'emotion.initialized' || event.type === 'emotion.configured' ||
      event.type === 'emotion.adjusted' || event.type === 'emotion.upgraded' ||
      event.type === 'relationship.adjusted' || (event.type === 'emotion.reviewed' && event.payload['changed'] === true)) {
      add(emotionHistory, event)
    }
  }
  const cited = new Map<string, StatusHistoryEntry[]>()
  for (const entry of [...interestHistory.entries, ...emotionHistory.entries]) {
    const ids = entry.event.payload['sourceEventIds']
    if (!Array.isArray(ids)) continue
    for (const id of new Set(ids)) {
      if (typeof id !== 'string') continue
      const entries = cited.get(id) ?? []
      entries.push(entry)
      cited.set(id, entries)
    }
  }
  if (cited.size > 0) {
    for (const event of state.events) {
      for (const entry of cited.get(event.id) ?? []) entry.sourceEventIds.push(event.id)
    }
  }
  const sessions: LifeState['sessions'] = {}
  for (const id of sessionIds) {
    if (!Object.hasOwn(state.sessions, id)) continue
    Object.defineProperty(sessions, id, { value: state.sessions[id], enumerable: true, writable: true, configurable: true })
  }
  return structuredClone({
    identity: state.identity,
    ...(state.operator === undefined ? {} : { operator: state.operator }),
    ...(state.emotion === undefined ? {} : { emotion: state.emotion }),
    ...(state.interests === undefined ? {} : { interests: state.interests }),
    ...(state.consolidation === undefined ? {} : { consolidation: state.consolidation }),
    memories: state.memories.slice().sort((a, b) => b.importance - a.importance).slice(0, limit)
      .map(({ embedding: _embedding, ...memory }) => memory),
    growth: state.growth.slice(-limit).reverse(),
    sessions,
    counts: { events: state.events.length, memories: state.memories.length, growth: state.growth.length },
    interestHistory,
    emotionHistory,
  })
}
