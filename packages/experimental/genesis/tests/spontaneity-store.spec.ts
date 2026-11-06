/** Thought continuity, exact replay, deletion and uncertain-write fencing on real storage. */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Config } from '../src/config.ts'
import { SpontaneityStore } from '../src/spontaneity-store.ts'
import { spontaneityDomain, type ThoughtEdit } from '../src/spontaneity-state.ts'
import { openCore } from './harness.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Thought fixture cleanup')
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-thoughts-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const life = await openCore(root)
  cleanup.push(() => life.close())
  const state = await life.core.snapshot()
  const policy = Config({ leasePath: join(root, 'unused'), spontaneity: {} }).spontaneity!
  const open = async () => {
    const domain = await new DomainFacility(life.ctx, { backend: 'json' }).open(spontaneityDomain)
    cleanup.push(() => domain.close())
    const store = new SpontaneityStore(domain, state.identity.id, policy)
    cleanup.push(() => store.close())
    return { domain, store }
  }
  const edit: ThoughtEdit = { action: 'save', title: 'Animation and my story', content: 'Try a paper bird.',
    reason: 'An interesting association.', sourceEventIds: [state.events[0]!.id], revisitAfter: null }
  return { ...life, open, state, edit }
}

it('keeps the thought identity across edits, replay, deletion and restart without recreating deleted text', async () => {
  const f = await fixture()
  const first = await f.open()
  await first.store.start(false)
  const source = { sessionId: SessionId('thought-source'), callId: ToolCallId('save') }
  const id = await first.store.edit(f.edit, source)
  expect(await first.store.edit(f.edit, source)).toBe(id)
  await expect(first.store.edit({ ...f.edit, title: 'Different' }, source)).rejects.toMatchObject({ code: 'invalid-source' })
  await first.store.edit({ ...f.edit, id, action: 'rest' }, { ...source, callId: ToolCallId('rest') })
  await first.store.close()
  const next = await f.open()
  await next.store.start(true)
  expect(next.store.read().thoughts[0]).toMatchObject({ id, status: 'resting' })
  await next.store.edit({ ...f.edit, id, action: 'delete' }, { ...source, callId: ToolCallId('delete') })
  expect(await next.store.edit(f.edit, source)).toBe(id)
  expect(next.store.read().thoughts).toEqual([])
  expect(JSON.stringify(next.store.read())).not.toContain(f.edit.content)
})

it('marks crash reservations interrupted, preserves replay keys and refuses missing initialized state', async () => {
  const f = await fixture()
  const first = await f.open()
  await first.store.start(false)
  const run = { key: 'source-event', sessionId: SessionId(randomUUID()), sourceEventId: f.state.events[0]!.id,
    createdAt: Date.now(), status: 'reserved' as const }
  expect(await first.store.reserve(run)).toBe(true)
  await first.store.close()
  const next = await f.open()
  await next.store.start(true)
  expect(next.store.read().runs[0]!.status).toBe('interrupted')
  expect(await next.store.reserve(run)).toBe(false)
  await next.domain.table('state').delete('current')
  await next.store.close()
  const missing = await f.open()
  await expect(missing.store.start(true)).rejects.toMatchObject({ code: 'invalid-state' })
})

it('fences reads and edits after a write with unknown outcome', async () => {
  const f = await fixture()
  const { domain, store } = await f.open()
  await store.start(false)
  const table = domain.table('state')
  vi.spyOn(table, 'put').mockRejectedValueOnce(new Error('uncertain write'))
  await expect(store.edit(f.edit, { sessionId: SessionId('write'), callId: ToolCallId('edit') })).rejects.toMatchObject({ code: 'storage' })
  expect(() => store.read()).toThrow('uncertain')
  expect(() => store.edit(f.edit, { sessionId: SessionId('write'), callId: ToolCallId('retry') })).toThrow('uncertain')
})
