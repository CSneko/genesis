/** Current memory versions and their source-bearing superseded interpretations. @module */
import type { LifeMemory } from './model.ts'

/**
 * Retain the previous interpretation when editable content changes; vector rebuilds do not create versions.
 * @param previous - Last committed interpretation, if any.
 * @param next - Replacement with a strictly later update time.
 * @returns Replacement carrying its previous versions without duplicating vector caches.
 */
export function retainMemoryHistory(previous: LifeMemory | undefined, next: LifeMemory): LifeMemory {
  if (previous === undefined) return next
  const fields = (memory: LifeMemory) => ({
    content: memory.content,
    category: memory.category,
    ...(memory.summary === undefined ? {} : { summary: memory.summary }),
    ...(memory.organization === undefined ? {} : { organization: memory.organization }),
    ...(memory.habit === undefined ? {} : { habit: memory.habit }),
    importance: memory.importance,
    confidence: memory.confidence,
    ...(memory.kind === undefined ? {} : { kind: memory.kind }),
    ...(memory.attribution === undefined ? {} : { attribution: memory.attribution }),
  })
  if (JSON.stringify(fields(previous)) === JSON.stringify(fields(next))) {
    return { ...next, ...(previous.history === undefined ? {} : { history: previous.history }) }
  }
  return {
    ...next,
    history: [
      ...(previous.history ?? []),
      { ...fields(previous), sourceEventIds: previous.sourceEventIds, recordedAt: previous.updatedAt, supersededAt: next.updatedAt },
    ],
  }
}
