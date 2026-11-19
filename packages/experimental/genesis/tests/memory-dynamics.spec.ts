/** Recall reinforcement follows committed human exchanges and survives restart without changing truth confidence. */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { SessionId } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import { openCore } from './harness.ts'
import { accessibleMemories, memoryAccessibility, memoryFamiliarity, memoryRetentionStart } from '../src/memory-dynamics.ts'
import { memoryReading, recallResultReadings } from '../src/memory-delivery.ts'
import { memoryBrowserPage } from '../src/memory-browser.ts'
import type { LifeMemory, MemoryId } from '../src/model.ts'

const cleanups: Array<() => Promise<unknown>> = []
const memoryDynamics = {
  initialFamiliarity: 0.25, recallGain: 0.25, spacingDays: 1, forgetting: false, forgetBelow: 0.03,
  halfLifeDays: { episodic: 30, semantic: 90, self: 180, procedural: 120 },
  floor: 0.5, reinforcement: 0.15, maxReinforcements: 20, protectedImportance: 0.9,
}
afterEach(async () => {
  const errors: unknown[] = []
  for (const close of cleanups.splice(0).reverse()) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Memory dynamics fixture teardown')
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-recall-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const app = await openCore(root, 'json', { memorySharing: 'life', memoryDynamics })
  cleanups.push(() => app.close())
  return { ...app, root }
}

it('fades ordinary old matches while preserving important memories, habits and exact-ID access', async () => {
  const { core, config } = await fixture()
  const sample = (await core.snapshot()).memories[0]!
  const old: LifeMemory = { ...sample, importance: 0.3, kind: 'declarative', category: 'episodic', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }
  const recent: LifeMemory = { ...old, id: brandString<MemoryId>(randomUUID()), createdAt: '2026-11-15T00:00:00.000Z', updatedAt: '2026-11-15T00:00:00.000Z' }
  const important: LifeMemory = { ...old, id: brandString<MemoryId>(randomUUID()), importance: 0.95 }
  const habit: LifeMemory = { ...old, id: brandString<MemoryId>(randomUUID()), category: 'procedural', kind: undefined }
  const entries = [old, recent, important, habit]
  const weights = memoryAccessibility(entries, [], config.memoryDynamics, new Date('2026-11-15T00:00:00.000Z'))
  expect(weights.get(old.id)).toBeCloseTo(config.memoryDynamics!.floor)
  expect(weights.get(recent.id)).toBe(1)
  expect(weights.get(important.id)).toBe(1)
  expect(weights.get(habit.id)).toBe(1)
  expect(accessibleMemories([{ value: old, score: 1 }, { value: recent, score: 1 }], weights, '共同经历')[0]?.id).toBe(recent.id)
  expect(accessibleMemories([{ value: old, score: 1 }, { value: recent, score: 1 }], weights, old.id)[0]?.id).toBe(old.id)
  expect(old.confidence).toBe(sample.confidence)
})

it('reinforces only delivered current readings once per human exchange, preserves replay and rejects damaged evidence', async () => {
  const app = await fixture()
  const { core, config } = app
  const source = (await core.snapshot()).events[0]!
  const memory = await core.remember({ content: '一起在海边散步。', category: 'episodic', kind: 'declarative',
    importance: 0.3, confidence: 0.4, sourceEventIds: [source.id], attribution: 'model-inference' })
  const start = Date.parse(memory.updatedAt)
  const at = (day: number) => new Date(start + day * 86_400_000).toISOString()
  const sessionId = SessionId('recall-human-session')
  await core.observe({ sessionId, eventId: '1', timestamp: at(90), kind: 'user-message' })
  const readings = recallResultReadings(JSON.stringify({ format: 'genesis-recall-v1',
    entries: [memoryReading(memory, 'full', new Date(at(90)), config.timeZone)] }))
  const result = { sessionId, eventId: '2', timestamp: at(90), kind: 'tool-result' as const, tool: 'genesis_recall', success: true, readings }
  await core.observe(result)
  await core.observe(result)
  await core.observe({ ...result, eventId: '3' })
  await core.observe({ ...result, eventId: '4', success: false })
  await core.observe({ ...result, eventId: '5', readings: [] })
  await core.observe({ sessionId, eventId: '6', timestamp: at(91), kind: 'user-message' })
  await core.observe({ ...result, eventId: '7', timestamp: at(91) })
  const state = await core.snapshot()
  expect(state.events.filter(event => event.type === 'memory.recalled')).toHaveLength(2)
  const current = state.memories.find(item => item.id === memory.id)!
  expect(current).toEqual(memory)
  const before = memoryAccessibility([memory], [], config.memoryDynamics, new Date(at(100))).get(memory.id)!
  const after = memoryAccessibility([memory], state.events, config.memoryDynamics, new Date(at(100))).get(memory.id)!
  expect(after).toBeGreaterThan(before)
  await app.close()
  const restarted = await openCore(app.root, 'json', { memorySharing: 'life', memoryDynamics })
  cleanups.push(() => restarted.close())
  const restored = await restarted.core.snapshot()
  expect(restored.identity.id).toBe(state.identity.id)
  expect(memoryAccessibility([memory], restored.events, config.memoryDynamics, new Date(at(100))).get(memory.id)).toBe(after)
  await restarted.core.observe(result)
  expect((await restarted.core.snapshot()).events.filter(event => event.type === 'memory.recalled')).toHaveLength(2)
  const corruptRoot = await mkdtemp(join(tmpdir(), 'genesis-damaged-recall-'))
  cleanups.push(() => rm(corruptRoot, { recursive: true, force: true }))
  const damaged = structuredClone(restored)
  damaged.events.find(event => event.type === 'memory.recalled')!.payload['contentHash'] = 'broken'
  await expect(openCore(corruptRoot, 'json', {}, damaged)).rejects.toThrow()
})

it('finds category and explicit source relationships across the full store before paging', async () => {
  const { core, config } = await fixture()
  const source = (await core.snapshot()).events[0]!
  const first = await core.remember({ content: '海边散步', category: 'episodic', importance: 0.4, confidence: 0.4, sourceEventIds: [source.id] })
  const related = await core.remember({ content: '海边拾贝', category: 'semantic', importance: 0.4, confidence: 0.4, sourceEventIds: [source.id] })
  const state = await core.snapshot()
  const limit = { ...config, queryLimit: 1 }
  const page = memoryBrowserPage(state, '海边', 'all', 0, { relatedTo: first.id, category: 'semantic', navigationOffset: 0 }, limit)
  expect(page.total).toBe(1)
  expect(page.items[0]?.id).toBe(related.id)
  expect(() => memoryBrowserPage(state, '', 'all', 0, { relatedTo: brandString<MemoryId>(randomUUID()), navigationOffset: 0 }, limit)).toThrow('removed')
})

it('expires ordinary records after the migration grace period and keeps that deletion across restart', async () => {
  const original = await fixture()
  const source = (await original.core.snapshot()).events[0]!
  const ordinary = await original.core.remember({ content: '旧的海边经历', category: 'episodic', importance: 0.2,
    confidence: 0.5, sourceEventIds: [source.id] })
  const pinned = await original.core.editMemory(brandString<MemoryId>(randomUUID()),
    { content: '手动保留的海边经历', category: 'episodic', kind: 'declarative', importance: 0.2, confidence: 0.5 }, null)
  const seed = await original.core.snapshot()
  const policy = { memoryDynamics: { ...memoryDynamics, forgetting: true } }
  const root = await mkdtemp(join(tmpdir(), 'genesis-forgetting-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  for (const memory of seed.memories) {
    if (memory.id === ordinary.id || memory.id === pinned.id) {
      memory.createdAt = '2000-01-01T00:00:00.000Z'
      memory.updatedAt = memory.createdAt
    }
  }
  const fresh = await openCore(root, 'json', policy, seed)
  cleanups.push(() => fresh.close())
  const grace = await fresh.core.snapshot()
  expect(grace.memories.find(memory => memory.id === ordinary.id)).toBeDefined()
  const marker = grace.events.find(event => event.dedupKey === memoryRetentionStart)!
  const graceFamiliarity = memoryFamiliarity(grace.memories, grace.events, fresh.config.memoryDynamics!, new Date(marker.timestamp))
  expect(graceFamiliarity.get(ordinary.id)).toBe(0.25)
  await fresh.close()

  const elapsedRoot = await mkdtemp(join(tmpdir(), 'genesis-expired-'))
  cleanups.push(() => rm(elapsedRoot, { recursive: true, force: true }))
  marker.timestamp = '2000-01-01T00:00:00.000Z'
  const expired = await openCore(elapsedRoot, 'json', policy, grace)
  cleanups.push(() => expired.close())
  expect(await expired.core.getMemory(ordinary.id)).toBeUndefined()
  expect(await expired.core.getMemory(pinned.id)).toBeDefined()
  await expired.close()
  const restarted = await openCore(elapsedRoot, 'json', policy)
  cleanups.push(() => restarted.close())
  expect(await restarted.core.getMemory(ordinary.id)).toBeUndefined()
  expect((await restarted.core.snapshot()).events.filter(event => event.type === 'memory.forgotten').map(event => event.payload['memoryId']))
    .toEqual([ordinary.id])
})

it('queues saturated familiarity for consolidation without turning an episode into a habit', async () => {
  const { core, config } = await fixture()
  const source = (await core.snapshot()).events[0]!
  const memory = await core.remember({ content: '一起看了一次落日', category: 'episodic', kind: 'declarative',
    importance: 0.2, confidence: 0.5, sourceEventIds: [source.id] })
  const sessionId = SessionId('saturated-recall')
  const timestamp = memory.createdAt
  const readings = [memoryReading(memory, 'full', new Date(timestamp), config.timeZone)]
  for (let index = 0; index < 5; index++) {
    await core.observe({ sessionId, eventId: String(index * 2), timestamp, kind: 'user-message' })
    await core.observe({ sessionId, eventId: String(index * 2 + 1), timestamp, kind: 'tool-result', tool: 'genesis_recall', success: true, readings })
  }
  const state = await core.snapshot()
  expect(memoryFamiliarity([memory], state.events, config.memoryDynamics!, new Date(timestamp)).get(memory.id)).toBe(1)
  expect(state.events.filter(event => event.type === 'memory.matured')).toHaveLength(1)
  expect(state.consolidation).toMatchObject({ sessionId, revision: 1, completed: 0 })
  expect(await core.getMemory(memory.id)).toMatchObject({ kind: 'declarative', confidence: 0.5 })
  expect(state.memories.some(item => item.habit !== undefined)).toBe(false)
})
