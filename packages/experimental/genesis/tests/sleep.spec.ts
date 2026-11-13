/** Minimal schedule, interruption and restart continuity smoke with real life storage. */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { Config } from '../src/config.ts'
import { sleepDomain } from '../src/sleep-model.ts'
import { sleepWindows } from '../src/sleep-calendar.ts'
import { SleepStore } from '../src/sleep-store.ts'
import { LifeSleep } from '../src/sleep.ts'
import { openCore } from './harness.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  try {
    for (const close of cleanup.splice(0).reverse()) await close()
  } finally {
    vi.useRealTimers()
  }
})
it('honors holidays, bounds stable jitter, and distinguishes temporary wake from keeping awake through restart', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T08:00:00+08:00'))
  const root = await mkdtemp(join(tmpdir(), 'genesis-sleep-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const resolved = Config({ leasePath: join(root, 'life.lock'), sleep: {} })
  const policy = resolved.sleep!
  const life = await openCore(root, 'json', { sleep: policy })
  cleanup.push(() => life.close())
  await life.ctx.plugin(SessionProjectionRegistry)
  await life.ctx.plugin(AgentRegistry)
  const identity = (await life.core.snapshot()).identity.id
  const open = async (marked: boolean) => {
    const domain = await new DomainFacility(life.ctx, { backend: 'json' }).open(sleepDomain)
    const store = new SleepStore(domain, identity, policy, Date.now())
    cleanup.push(() => store.close())
    await store.start(marked)
    const engine = new LifeSleep(
      life.ctx,
      life.core,
      store,
      policy,
      () => true,
      async () => [],
      async () => null,
    )
    return { engine, store }
  }
  const first = await open(false)
  await first.engine.tick()
  expect(first.engine.inspect().mode).toBe('awake')
  const settings = first.store.read().settings,
    seed = first.store.read().seed
  expect(sleepWindows('2026-10-01', settings, seed)).toEqual([])
  expect(sleepWindows('2026-11-07', settings, seed)).toEqual([])
  expect(sleepWindows('2027-01-04', settings, seed)).toEqual([])
  const sampled = sleepWindows('2026-11-02', settings, seed)
  expect(sampled).toEqual(sleepWindows('2026-11-02', settings, seed))
  expect(Math.abs(sampled[0]!.start - Date.parse('2026-11-02T09:00:00+08:00'))).toBeLessThanOrEqual(300000)
  expect(Math.abs(sampled[0]!.end - Date.parse('2026-11-02T12:00:00+08:00'))).toBeLessThanOrEqual(300000)
  vi.setSystemTime(new Date('2026-11-02T10:00:00+08:00'))
  await first.engine.tick()
  expect(first.engine.conversationAllowed(true)).toBe(false)
  await first.engine.wake('temporary')
  expect(first.engine.conversationAllowed(true)).toBe(true)
  expect(first.engine.conversationAllowed(false)).toBe(false)
  expect(first.engine.autonomousAllowed()).toBe(false)
  vi.setSystemTime(new Date('2026-11-02T10:11:00+08:00'))
  await first.engine.tick()
  expect(first.engine.inspect().mode).toBe('asleep')
  await first.engine.wake('keep-awake')
  expect(first.engine.autonomousAllowed()).toBe(true)
  const window = first.engine.inspect().current
  await first.engine.close()
  const restored = await open(true)
  await restored.engine.tick()
  expect(restored.engine.inspect().mode).toBe('keep-awake')
  expect(restored.engine.inspect().current).toEqual(window)
  vi.setSystemTime(new Date('2026-11-02T15:00:00+08:00'))
  await restored.engine.tick()
  expect(restored.engine.inspect().mode).toBe('asleep')
  await restored.engine.close()
})
