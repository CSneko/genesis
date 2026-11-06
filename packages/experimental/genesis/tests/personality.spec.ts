/** Existing life storage owns personality settings, edits, deletion and restart continuity. @module */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Config, type MemoryConfig } from '../src/config.ts'
import { behaviorMemories, behaviorReading, isNonDeclarative } from '../src/personality.ts'
import { consolidationChanges } from '../src/consolidation-plan.ts'
import { openCore } from './harness.ts'

const disposers: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-personality-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  return root
}

it('initializes sourced personality once and preserves edits and deletion across changed configuration and restarts', async () => {
  const root = await directory()
  const personality = Config({ leasePath: join(root, 'life.lock'), personality: {
    tendencies: 'Usually caring and curious, with independent preferences.', speakingStyle: 'Warm and direct in serious discussions.',
  } }).personality!
  const first = await openCore(root, 'json', { personality })
  disposers.push(first.close)
  const initial = await first.core.snapshot()
  const source = initial.events.find(event => event.type === 'personality.initialized')!
  expect(source.source).toBe('system')
  const seeds = initial.memories.filter(isNonDeclarative)
  expect(seeds).toHaveLength(2)
  expect(seeds.every(memory => memory.sourceEventIds.includes(source.id) && memory.attribution === undefined)).toBe(true)
  const style = seeds.find(memory => memory.category === 'procedural')!
  expect(behaviorReading(style, initial, new Date(), first.config.timeZone).attribution).toBe('configured-initial-tendency')
  const settings: MemoryConfig = {
    decisionUrl: '', decisionKeyEnv: '', decisionThreshold: 0.5,
    decisionProvider: 'fixture', decisionModel: 'fixture', writerProvider: 'fixture', writerModel: 'fixture',
    embeddingUrl: '', embeddingModel: '', embeddingKeyEnv: '', embeddingDimensions: 0,
    windowTurns: 1, timeoutMs: 30000, maxRetries: 0, retryDelayMs: 0, inputChars: 24000, outputChars: 24000, maxTokens: 4096, reasoningEffort: 'auto',
    organizationLimit: 20, identityRewriteLimit: 100, maxChanges: 8, overview: { maxCalls: 64, timeoutMs: 5000, maxReferences: 10000, maxChanges: 64, outputChars: 128000, maxTokens: 16384 }, maxImplicitMemories: 12,
    associationLimit: 3, associationChars: 2000, associationInputChars: 1000, associationTimeoutMs: 1200, experienceWindowMs: 1800000,
    consolidation: { enabled: true, idleMs: 60000, cooldownMs: 300000, retryMs: 60000, maxFailures: 3,
      batchLimit: 20, minHabitSupport: 3 }, minSimilarity: 0.35,
  }
  await expect(consolidationChanges({ changes: [{ id: style.id, evidenceIds: [style.id],
    memory: { category: 'procedural', kind: 'declarative', content: 'Replace the initial style.', importance: 0.5, confidence: 0.5 } }] },
  initial, seeds, settings, async () => { throw new Error('No embedding should run') })).rejects.toThrow('initial settings')
  const self = seeds.find(memory => memory.category === 'self')!
  await first.core.editMemory(self.id, { category: 'self', kind: 'non-declarative', content: 'I prefer careful exploration.',
    importance: 0.8, confidence: 0.8 }, self.updatedAt, 12)
  await first.core.deleteMemory(style.id)
  const before = await first.core.snapshot()
  await first.close()
  const second = await openCore(root, 'json', { personality: { ...personality, speakingStyle: 'Do not reset to this style.' } })
  disposers.push(second.close)
  const restored = await second.core.snapshot()
  expect(restored.identity).toEqual(initial.identity)
  expect(restored.memories).toEqual(before.memories)
  expect(restored.events.filter(event => event.type === 'personality.initialized')).toHaveLength(1)
})

it('keeps existing taught tendencies and admits only complete active readings within the shared memory budget', async () => {
  const root = await directory()
  const first = await openCore(root)
  disposers.push(first.close)
  const state = await first.core.snapshot()
  const taught = await first.core.remember({ category: 'self', kind: 'non-declarative', attribution: 'user-stated',
    content: 'Taught reserved personality.', importance: 0.9, confidence: 0.9, sourceEventIds: [state.events[0]!.id] })
  await first.close()
  const personality = Config({ leasePath: '/unused.lock', personality: {} }).personality!
  const second = await openCore(root, 'json', { personality })
  disposers.push(second.close)
  const restored = await second.core.snapshot()
  expect(restored.memories.filter(memory => memory.category === 'self' && isNonDeclarative(memory))).toEqual([taught])
  const style = restored.memories.find(memory => memory.category === 'procedural')!
  style.habit = { cue: 'Old context', response: 'Retired expression', active: false, supportEventIds: style.sourceEventIds }
  const config = { ...second.config, memoryChars: 256 }
  const now = new Date()
  const selected = behaviorMemories(restored, config, now)
  expect(selected.map(memory => memory.id)).toEqual([taught.id])
  expect(isNonDeclarative(style)).toBe(true)
  expect(JSON.stringify({ entries: selected.map(memory => behaviorReading(memory, restored, now, config.timeZone)), omitted: 0 }).length)
    .toBeLessThanOrEqual(config.memoryChars)
})

it('refuses an over-budget initialization visibly and can retry without creating another life', async () => {
  const root = await directory()
  const personality = Config({ leasePath: '/unused.lock', personality: {} }).personality!
  await expect(openCore(root, 'json', { personality, memoryChars: 256 })).rejects.toMatchObject({ code: 'capacity' })
  const next = await openCore(root, 'json', { personality })
  disposers.push(next.close)
  const state = await next.core.snapshot()
  expect(state.events.filter(event => event.type === 'life.created')).toHaveLength(1)
  expect(state.events.filter(event => event.type === 'personality.initialized')).toHaveLength(1)
})
