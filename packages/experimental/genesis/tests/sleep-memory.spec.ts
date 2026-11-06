import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
/** Sleep batch merge/split results, atomic rejection and durable maintenance recovery. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { LifeEventId, LifeMemory } from '../src/model.ts'
import { sleepMemoryPlan } from '../src/sleep-memory.ts'
import { sleepDomain } from '../src/sleep-model.ts'
import { SleepStore } from '../src/sleep-store.ts'
import { LifeSleep } from '../src/sleep.ts'
import { openCore } from './harness.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  try { for (const close of cleanup.splice(0).reverse()) await close() } finally { vi.useRealTimers() }
})
const raw = { memories: [
  { evidenceIds: ['m1', 'm2'], category: 'semantic', content: '用户喜欢乌龙茶，通常在午后饮用。', importance: 0.5, confidence: 0.5 },
  { evidenceIds: ['m3'], category: 'semantic', content: '用户自述养了一只猫。', importance: 0.5, confidence: 0.5 },
  { evidenceIds: ['m3'], category: 'semantic', content: '用户自述在学习钢琴。', importance: 0.5, confidence: 0.5 },
] }
it('merges A/B, splits C, refuses incomplete batches and preserves results through failure, retry and restart', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T10:00:00+08:00'))
  const root = await mkdtemp(join(tmpdir(), 'genesis-sleep-memory-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const life = await openCore(root, 'json', { sleep: {} })
  cleanup.push(() => life.close())
  const id = SessionId('sleep-memory-source')
  const records: LifeMemory[] = []
  for (const [index, content] of ['用户说喜欢乌龙茶。', '用户说午后会喝乌龙茶。', '用户说养了一只猫，也在学习钢琴。'].entries()) {
    const event = await life.core.observe({ sessionId: id, eventId: String(index), timestamp: new Date().toISOString(), kind: 'user-message' })
    records.push(await life.core.remember({ category: 'semantic', content, sourceEventIds: [event.id],
      kind: 'declarative', attribution: 'user-stated', importance: 0.5, confidence: 0.5 }))
  }
  const plan = sleepMemoryPlan(raw, records, 4, 1000, 'Asia/Shanghai')
  expect(plan).toHaveLength(3)
  expect(plan[0]?.sourceEventIds).toEqual([...records[0]!.sourceEventIds, ...records[1]!.sourceEventIds])
  expect(plan[1]?.sourceEventIds).toEqual(records[2]!.sourceEventIds)
  expect(plan[2]?.sourceEventIds).toEqual(records[2]!.sourceEventIds)
  expect(plan.every(memory => memory.attribution === 'model-inference')).toBe(true)
  expect(sleepMemoryPlan({ memories: raw.memories.slice(1).map(memory => ({ ...memory, evidenceIds: ['m1'] })) }, [records[2]!], 4, 1000, 'Asia/Shanghai')).toHaveLength(2)
  expect(() => sleepMemoryPlan({ memories: [raw.memories[0]] }, records, 4, 1000, 'Asia/Shanghai')).toThrow('omitted')
  expect(() => sleepMemoryPlan({ memories: [{ ...raw.memories[0], evidenceIds: ['m4'] }] }, records, 4, 1000, 'Asia/Shanghai')).toThrow('outside')
  expect(() => sleepMemoryPlan({ memories: raw.memories.map(memory => ({ ...memory, confidence: 0.9 })) }, records, 4, 1000, 'Asia/Shanghai')).toThrow('confidence')
  expect(() => sleepMemoryPlan(raw, records, 4, 1, 'Asia/Shanghai')).toThrow('summaryChars')
  const before = await life.core.snapshot()
  await expect(life.core.rememberBatch([plan[0]!, { ...plan[1]!, sourceEventIds: [brandString<LifeEventId>('00000000-0000-4000-8000-000000000000')] }])).rejects.toThrow()
  expect(await life.core.snapshot()).toEqual(before)
  await life.ctx.plugin(SessionProjectionRegistry)
  await life.ctx.plugin(AgentRegistry)
  const agent: Agent = {
    id, ctx: life.ctx, session: Session.create(id), options: {}, model: { current: () => undefined, select() {} }, status: 'idle',
    inbox: { nextTurn: [], nextStep: [], clear() {}, append() {}, prepend() {}, replace: () => false, remove: () => false, splice: () => [] },
    send() {}, followup() {}, steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }), inject() {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal), whenIdle: () => Promise.resolve(),
  }
  await life.ctx.agents.register(agent)
  const policy = life.config.sleep!
  const identity = (await life.core.snapshot()).identity.id
  const open = async (marked: boolean) => {
    const domain = await new DomainFacility(life.ctx, { backend: 'json' }).open(sleepDomain)
    const store = new SleepStore(domain, identity, policy, Date.now())
    await store.start(marked)
    return store
  }
  const store = await open(false)
  cleanup.push(() => store.close())
  let reject = true
  const organize = vi.fn(async () => {
    if (reject) throw new Error('Writer unavailable')
    return (await life.core.rememberBatch(plan)).map(memory => memory.id)
  })
  const engine = new LifeSleep(life.ctx, life.core, store, policy, () => true, organize, async () => null)
  cleanup.push(() => engine.close())
  await store.change(state => {
    state.mode = 'asleep'
    state.cycles.push({ id: 'merge-split', from: Date.now() - 1000, until: Date.now(), sessionId: id,
      pending: records.map(memory => memory.id), summaries: [], stage: 'failed', batch: 0, rounds: 0, failure: 'Interrupted' })
  })
  await engine.retry('merge-split')
  await vi.waitFor(() => expect(store.read().cycles[0]?.stage).toBe('failed'))
  expect(store.read().cycles[0]?.pending).toEqual(records.map(memory => memory.id))
  reject = false
  await engine.retry('merge-split')
  await vi.waitFor(() => expect(store.read().cycles[0]?.stage).toBe('completed'))
  expect(organize).toHaveBeenCalledTimes(2)
  expect(store.read().cycles[0]).toMatchObject({ pending: [], batch: 1, rounds: 1 })
  expect(store.read().cycles[0]?.summaries).toHaveLength(3)
  await engine.close()
  const restoredStore = await open(true)
  expect(restoredStore.read().cycles[0]).toMatchObject({ stage: 'completed', pending: [] })
  expect(restoredStore.read().cycles[0]?.summaries).toHaveLength(3)
  await restoredStore.close()
  await life.close()
  const restoredLife = await openCore(root)
  cleanup.push(() => restoredLife.close())
  const saved = (await restoredLife.core.snapshot()).memories
  expect(saved).toHaveLength(before.memories.length + 3)
  expect(saved.slice(before.memories.length).map(memory => memory.content)).toEqual(plan.map(memory => memory.content))
  expect(records.every(record => saved.some(memory => memory.id === record.id))).toBe(true)
})
