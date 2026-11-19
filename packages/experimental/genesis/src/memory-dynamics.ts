/** Optional accessibility decay and source-backed recall reinforcement, independent of truth confidence. @module */
import { isNonDeclarative } from './personality.ts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { LifeEvent, LifeMemory, LifeState, MemoryId } from './model.ts'
import type { Config } from './config.ts'

/** Versioned payload inside the existing extensible life-event envelope. */
export const memoryRecallSchema = z.strictObject({
  version: z.literal(1),
  memoryId: z.uuid(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  userEventId: z.uuid(),
  resultEventId: z.uuid(),
})

/** Stable marker for the retention start of records already in storage. */
export const memoryRetentionStart = 'memory:familiarity:v1'

/**
 * Identify remembered content independently of rendered relative dates or cached embeddings.
 * @param memory - Current sourced interpretation.
 * @returns Stable content key; corrected content starts its own reinforcement history.
 */
export function memoryContentKey(memory: LifeMemory): string {
  const revision = memory.contentChangedAt === undefined ? [] : [memory.contentChangedAt]
  return createHash('sha256').update(JSON.stringify([memory.content, memory.attribution, memory.confidence, ...revision])).digest('hex')
}

/**
 * Replay familiarity for each current declarative interpretation.
 * @param memories - Eligible current records.
 * @param events - Append-only life evidence, including versioned recall events.
 * @param policy - Validated retention policy.
 * @param now - One retrieval timestamp; backward clock movement never increases elapsed age.
 * @returns Internal familiarity in [0, 1] for declarative records only.
 */
export function memoryFamiliarity(
  memories: readonly LifeMemory[], events: readonly LifeEvent[], policy: NonNullable<Config['memoryDynamics']>, now: Date,
): Map<MemoryId, number> {
  const recalled = new Map<string, number[]>()
  const migration = events.find(event => event.dedupKey === memoryRetentionStart)
  const migrationAt = migration === undefined ? -Infinity : Date.parse(migration.timestamp)
  for (const event of events) {
    if (event.type !== 'memory.recalled') continue
    const evidence = memoryRecallSchema.parse(event.payload)
    const key = `${evidence.memoryId}:${evidence.contentHash}`
    const times = recalled.get(key) ?? []
    times.push(Date.parse(event.timestamp))
    recalled.set(key, times)
  }
  const day = 86_400_000
  return new Map(memories.filter(memory => !isNonDeclarative(memory)).map((memory) => {
    const started = Date.parse(memory.contentChangedAt ?? memory.createdAt)
    const baseHalfLife = policy.halfLifeDays[memory.category] * (1 + memory.importance)
    let anchor = started
    let lastSpaced = started
    let repetitions = 0
    let familiarity = policy.initialFamiliarity
    const decay = (at: number) => {
      const halfLifeMs = day * baseHalfLife * (1 + repetitions * policy.reinforcement)
      return familiarity * 2 ** (-Math.max(0, at - anchor) / halfLifeMs)
    }
    const times = recalled.get(`${memory.id}:${memoryContentKey(memory)}`) ?? []
    let anchoredMigration = started >= migrationAt
    const migrate = () => {
      familiarity = Math.max(policy.initialFamiliarity, decay(migrationAt))
      anchor = migrationAt
      anchoredMigration = true
    }
    for (const at of times.sort((a, b) => a - b)) {
      if (at < started || at > now.getTime()) continue
      if (!anchoredMigration && at >= migrationAt) migrate()
      familiarity = Math.min(1, decay(at) + policy.recallGain)
      anchor = at
      if (at - lastSpaced >= policy.spacingDays * day) {
        repetitions = Math.min(policy.maxReinforcements, repetitions + 1)
        lastSpaced = at
      }
    }
    if (!anchoredMigration && now.getTime() >= migrationAt) migrate()
    return [memory.id, decay(now.getTime())]
  }))
}

/** @param memories - Eligible matches. @param events - Committed evidence. @param policy - Deployment policy.
 * @param now - Evaluation time. @returns A bounded multiplier among text or semantic matches. */
export function memoryAccessibility(
  memories: readonly LifeMemory[], events: readonly LifeEvent[], policy: Config['memoryDynamics'], now: Date,
): Map<MemoryId, number> {
  if (policy === undefined) return new Map()
  const familiarity = memoryFamiliarity(memories, events, policy, now)
  return new Map(memories.map(memory => [memory.id, memory.importance >= policy.protectedImportance ? 1
    : policy.floor + (1 - policy.floor) * Math.min(1, (familiarity.get(memory.id) ?? 1) / policy.initialFamiliarity)]))
}

/** @param state - Current committed life. @param policy - Validated retention policy. @param now - Evaluation time.
 * @returns Expired ordinary declarative records; protected memories remain in the inventory. */
export function expiredMemories(state: LifeState, policy: NonNullable<Config['memoryDynamics']>, now: Date): MemoryId[] {
  const protectedIds = new Set([
    ...(state.agency?.goals.filter(goal => goal.status === 'active' || goal.status === 'paused').flatMap(goal => goal.memoryIds) ?? []),
    ...state.events.flatMap(event => event.type === 'memory.created' && event.source === 'user' ? [event.payload['memoryId']] : []),
  ])
  const candidates = state.memories.filter(memory => !isNonDeclarative(memory) && memory.category !== 'self'
    && memory.importance < policy.protectedImportance && !protectedIds.has(memory.id) && !memory.content.includes('{{date:'))
  return [...memoryFamiliarity(candidates, state.events, policy, now)]
    .filter(([, score]) => score < policy.forgetBelow).map(([id]) => id)
}

/**
 * Adjust relevance only among existing matches; exact IDs always remain first.
 * @param matches - Matches with comparable relevance scores.
 * @param weights - Derived accessibility multipliers.
 * @param query - Original query, used for exact-ID precedence.
 * @returns Ranked records without mutating either the input or stored memory.
 */
export function accessibleMemories(
  matches: readonly { value: LifeMemory; score: number }[], weights: ReadonlyMap<MemoryId, number>, query: string,
): LifeMemory[] {
  return [...matches].sort((a, b) => Number(b.value.id === query.trim()) - Number(a.value.id === query.trim())
    || b.score * (weights.get(b.value.id) ?? 1) - a.score * (weights.get(a.value.id) ?? 1)
    || b.value.importance - a.value.importance || a.value.id.localeCompare(b.value.id)).map(match => match.value)
}
