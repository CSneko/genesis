/** Declarative organization preserves evidence and reads follow the retained conversation. */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MemoryId } from '../src/model.ts'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { memoryReading, memoryReadingSections, readingPresent, retainedMemoryReadings } from '../src/memory-delivery.ts'
import { memoryOrganization } from '../src/memory-organization.ts'
import { lifeContextUpdate } from '../src/context-update.ts'
import { memoryBrowserPage } from '../src/memory-browser.ts'
import { splitState } from '../src/storage-state.ts'
import { readBackup, writeBackup, hasBackup } from '../src/backup.ts'
import { openCore } from './harness.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
function sourceMemoryId(): MemoryId {
  return brandString<MemoryId>(randomUUID())
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-memory-organization-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await openCore(root)
  cleanup.push(() => first.close())
  return { ...first, root }
}

it('keeps organization edits atomic, preserves evidence and resumes after restart', async () => {
  const first = await fixture()
  const source = (await first.core.snapshot()).events[0]!
  const memory = await first.core.remember({
    category: 'semantic',
    content: '数据库事务保持原子性。',
    kind: 'declarative',
    attribution: 'model-inference',
    importance: 0.5,
    confidence: 0.4,
    sourceEventIds: [source.id],
  })
  expect(memoryOrganization(memory)?.type).toBe('unclassified')
  const organization = { version: 1 as const, type: 'knowledge' as const, paths: [['数据库', '事务']], reviewed: true }
  const draft = {
    content: memory.content,
    category: memory.category,
    kind: 'declarative' as const,
    importance: memory.importance,
    confidence: memory.confidence,
    organization,
  }
  await expect(first.core.editMemory(memory.id, draft, '2000-01-01T00:00:00.000Z')).rejects.toThrow('changed or was removed')
  expect((await first.core.getMemory(memory.id))?.organization?.type).toBe('unclassified')
  await first.core.editMemory(memory.id, draft, memory.updatedAt)
  const classified = (await first.core.getMemory(memory.id))!
  expect(classified).toMatchObject({
    content: memory.content,
    sourceEventIds: memory.sourceEventIds,
    confidence: memory.confidence,
    createdAt: memory.createdAt,
    organization,
  })
  expect(classified.history).toEqual(memory.history)
  const manual = await first.core.editMemory(
    memory.id,
    {
      content: classified.content,
      category: classified.category,
      kind: 'declarative',
      importance: classified.importance,
      confidence: classified.confidence,
      organization: { ...organization, paths: [['数据库', '事务原理']] },
    },
    classified.updatedAt,
  )
  expect(manual.attribution).toBe('model-inference')
  expect(manual.sourceEventIds).toEqual(memory.sourceEventIds)
  const identity = (await first.core.snapshot()).identity
  await first.close()
  const restored = await openCore(first.root)
  cleanup.push(() => restored.close())
  expect((await restored.core.snapshot()).identity).toEqual(identity)
  expect(await restored.core.retrieve({ text: '数据库', type: 'knowledge', path: ['数据库'], limit: 10, chars: 10000 })).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: classified.id, organization: manual.organization })]),
  )
})

it('suppresses retained summaries, permits full reads and restores compacted content', async () => {
  const { core } = await fixture()
  const memory = (await core.snapshot()).memories[0]!
  const session = Session.create(SessionId('memory-reading-retention'))
  const now = new Date('2026-11-10T00:00:00.000Z')
  const summary = memoryReading(memory, 'summary', now, 'UTC')
  const full = memoryReading(memory, 'full', now, 'UTC')
  const sections = memoryReadingSections([summary], session, 20000)
  const update = lifeContextUpdate(session, sections)!
  const first = session.append('user/message', update, { surfaceOp: 'append' })
  expect(memoryReadingSections([summary], session, 20000)).toEqual([])
  const lower = memoryReading({ ...memory, id: sourceMemoryId() }, 'summary', now, 'UTC')
  const singleBudget = JSON.stringify(sections).length
  expect(memoryReadingSections([summary, lower], session, singleBudget)).toEqual([])
  expect(readingPresent(full, retainedMemoryReadings(session))).toBe(false)
  // A summary edit invalidates the fingerprint even if a producer retained the same update timestamp.
  const revised = memoryReading({ ...memory, summary: '新的简述' }, 'summary', now, 'UTC')
  expect(readingPresent(revised, retainedMemoryReadings(session))).toBe(false)
  const replacement = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'An unrelated compressed summary.' }] })
  session.append('user/message', replacement, {
    surfaceOp: { op: 'replace', startSeq: first.seq, endSeq: first.seq },
    sourceEventSeqs: [first.seq],
  })
  expect(memoryReadingSections([summary], session, 20000)).toHaveLength(1)
  expect(memoryReadingSections([summary], session, 1)).toEqual([])
  session.append('user/message', lifeContextUpdate(session, memoryReadingSections([summary], session, 20000))!, { surfaceOp: 'append' })
  const removed = memoryReadingSections([], session, 20000, new Set())
  expect(removed[0]?.text).toContain('unavailable')
  session.append('user/message', lifeContextUpdate(session, removed)!, { surfaceOp: 'append' })
  expect(retainedMemoryReadings(session)).toEqual([])
})

it('reads old flat snapshots without creating migration backups and still deletes archived memory copies', async () => {
  const first = await fixture()
  const legacy = await first.core.snapshot()
  legacy.events = legacy.events.filter(event => event.dedupKey !== 'memory-organization:v1')
  for (const memory of legacy.memories) delete memory.organization
  const root = await mkdtemp(join(tmpdir(), 'genesis-memory-legacy-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const migrated = await openCore(root, 'json', {}, legacy)
  cleanup.push(() => migrated.close())
  const state = await migrated.core.snapshot()
  expect(state.identity).toEqual(legacy.identity)
  expect(state.memories.map(memory => ({ ...memory, organization: undefined }))).toEqual(
    legacy.memories.map(memory => ({ ...memory, organization: undefined })),
  )
  expect(state.memories[0]?.organization).toEqual({ version: 1, type: 'unclassified' })
  const archive = `${migrated.config.leasePath}.backup.json.pre-memory-organization-v1`
  expect(await hasBackup(archive)).toBe(false)
  await writeBackup(archive, splitState(legacy, migrated.config.storage.pageSize))
  await migrated.close()
  const resumed = await openCore(root)
  cleanup.push(() => resumed.close())
  expect((await resumed.core.snapshot()).events.some(event => event.dedupKey === 'memory-organization:v1')).toBe(false)
  expect(await readBackup(`${migrated.config.leasePath}.backup.json.pre-memory-organization-v1`)).toEqual(legacy)
  await resumed.core.deleteMemory(legacy.memories[0]!.id)
  expect((await readBackup(`${migrated.config.leasePath}.backup.json.pre-memory-organization-v1`)).memories).toEqual([])
})

it('filters the complete collection before paging and keeps unlinked same-name people separate', async () => {
  const { core, config } = await fixture()
  const source = (await core.snapshot()).events[0]!
  for (const path of [
    ['数据库', '事务'],
    ['数据库', '索引'],
  ]) {
    await core.remember({
      category: 'semantic',
      kind: 'declarative',
      content: path.join(' 的知识：'),
      importance: 0.5,
      confidence: 0.4,
      sourceEventIds: [source.id],
      organization: { version: 1, type: 'knowledge', paths: [path, ['数据库', '共同目录']], reviewed: true },
    })
  }
  for (const content of ['小明喜欢茶。', '另一位小明喜欢咖啡。']) {
    await core.remember({
      category: 'semantic',
      kind: 'declarative',
      content,
      importance: 0.5,
      confidence: 0.4,
      sourceEventIds: [source.id],
      organization: { version: 1, type: 'person', subjects: [{ name: '小明' }], reviewed: true },
    })
  }
  const state = await core.snapshot()
  const limits = { ...config, queryLimit: 1 }
  const root = memoryBrowserPage(state, '', 'all', 0, { type: 'knowledge', navigationOffset: 0 }, limits)
  expect(root.total).toBe(2)
  expect(root.items).toHaveLength(1)
  expect(root.browser.navigation).toEqual([{ kind: 'directory', path: ['数据库'], count: 2 }])
  const selected = memoryBrowserPage(state, '', 'all', 0, { type: 'knowledge', path: ['数据库', '事务'], navigationOffset: 0 }, limits)
  expect(selected.total).toBe(1)
  expect(selected.items[0]?.content).toContain('事务')
  const people = memoryBrowserPage(state, '', 'all', 0, { type: 'person', navigationOffset: 0 }, limits)
  expect(people.browser.navigationTotal).toBe(2)
  expect(people.browser.nextNavigationOffset).toBe(1)
  const person = people.browser.navigation[0]!
  if (person.kind !== 'person') throw new Error('Expected a person portrait')
  const portrait = memoryBrowserPage(state, '', 'all', 0, { type: 'person', subject: person.subject, navigationOffset: 0 }, limits)
  expect(portrait.total).toBe(1)
  expect(portrait.items[0]?.id).toBe(person.subject.memoryId)
})
