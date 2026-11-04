/** Split storage migration, interrupted publication and independent backup recovery. */
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBackup } from '../src/backup.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import { manifestSchema, indexPageSchema, recordHash } from '../src/storage-layout.ts'
import { manifestReferences } from '../src/storage-state.ts'
import { openCore } from './harness.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.restoreAllMocks()
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Split storage fixture cleanup')
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-split-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function setup(root: string) {
  const fixture = await openCore(root)
  cleanup.push(() => fixture.close())
  return fixture
}

it('converts a legacy snapshot without changing identity, evidence, memory ordering or vectors', async () => {
  const root = await directory()
  const first = await setup(root)
  const source = (await first.core.snapshot()).events[0]!
  await first.core.reviewMemory('legacy', [{ action: 'upsert', input: { category: 'semantic', content: 'Legacy tea preference', importance: 0.9,
    confidence: 0.7, sourceEventIds: [source.id] }, embedding: { space: 'fixture', vector: [1, 2] } }], 20)
  const memory = (await first.core.snapshot()).memories.find(item => item.content === 'Legacy tea preference')!
  await first.close()
  const legacy = await readBackup(join(root, 'life.lock.backup.json'))
  await writeFile(join(root, 'genesis.json'), JSON.stringify({ unit: { name: 'genesis', version: 1 }, global: null,
    tables: { states: { life: legacy } } }))
  await writeFile(join(root, 'life.lock.backup.json'), JSON.stringify(legacy))
  await rm(join(root, 'genesis_records'), { recursive: true })
  await rm(join(root, 'life.lock.backup.json.d'), { recursive: true })
  const next = await setup(root)
  const migrated = await next.core.snapshot()
  expect(migrated.identity).toEqual(legacy.identity)
  expect(migrated.memories).toEqual(legacy.memories)
  expect(migrated.events.slice(0, legacy.events.length)).toEqual(legacy.events)
  expect(await next.core.getMemory(memory.id)).toEqual(memory)
  expect(manifestSchema.safeParse(next.domain.table('states').get('life')).success).toBe(true)
  expect(await readBackup(join(root, 'life.lock.backup.json'))).toEqual(migrated)
  expect(await readFile(join(root, 'genesis.json'), 'utf8')).not.toContain(memory.content)
  await next.close()
  const restored = await setup(root)
  expect((await restored.core.snapshot()).identity).toEqual(legacy.identity)
  expect(await restored.core.getMemory(memory.id)).toEqual(memory)
})

it('writes only changed records and deletes superseded text, vectors and versions from both copies', async () => {
  const root = await directory()
  const fixture = await setup(root)
  const source = (await fixture.core.snapshot()).events[0]!
  await fixture.core.reviewMemory('private', [{ action: 'upsert', input: { category: 'semantic', content: 'Unique private memory', importance: 0.9,
    confidence: 0.7, sourceEventIds: [source.id] }, embedding: { space: 'fixture', vector: [1, 2] } }], 20)
  const memory = (await fixture.core.snapshot()).memories.find(item => item.content === 'Unique private memory')!
  const vectorRef = manifestSchema.parse(fixture.domain.table('states').get('life')).records.find(ref => ref.table === 'embeddings')!
  await fixture.core.updateMemory(memory.id, { category: 'semantic', content: 'Corrected private memory', importance: 0.9,
    confidence: 0.8, sourceEventIds: [source.id] })
  const manifest = manifestSchema.parse(fixture.domain.table('states').get('life'))
  const identity = manifest.records.find(ref => ref.table === 'identity')!
  const file = join(root, 'genesis_records', identity.table, `${identity.key}.json`)
  const before = await stat(file)
  const put = vi.spyOn(fixture.records.table('identity'), 'put')
  await fixture.core.bind(SessionId('unrelated-session'), 'fixture')
  expect(put).not.toHaveBeenCalled()
  expect((await stat(file)).mtimeMs).toBe(before.mtimeMs)
  expect(manifest.records.some(ref => ref.table === 'memory_revisions')).toBe(true)
  await expect(readFile(join(root, 'genesis_records', vectorRef.table, `${vectorRef.key}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(join(root, 'life.lock.backup.json.d', vectorRef.table, `${vectorRef.key}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
  await fixture.core.deleteMemory(memory.id)
  const retained = manifestSchema.parse(fixture.domain.table('states').get('life'))
  const obsolete = manifest.records.filter(ref => !retained.records.some(item => item.table === ref.table && item.key === ref.key))
  for (const ref of obsolete) {
    await expect(readFile(join(root, 'genesis_records', ref.table, `${ref.key}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'life.lock.backup.json.d', ref.table, `${ref.key}.json`))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  expect((await readBackup(join(root, 'life.lock.backup.json'))).memories.some(item => item.id === memory.id)).toBe(false)
})

it('recovers the prior commit after an interrupted record write without accepting orphan records', async () => {
  const root = await directory()
  const first = await setup(root)
  const previous = await first.core.snapshot()
  const descriptor = await readFile(join(root, 'genesis.json'), 'utf8')
  const backup = await readFile(join(root, 'life.lock.backup.json'), 'utf8')
  vi.spyOn(first.records.table('events'), 'put').mockRejectedValueOnce(new Error('interrupted record write'))
  await expect(first.core.rename('Uncommitted name')).rejects.toMatchObject({ code: 'storage' })
  expect(await readFile(join(root, 'genesis.json'), 'utf8')).toBe(descriptor)
  expect(await readFile(join(root, 'life.lock.backup.json'), 'utf8')).toBe(backup)
  await expect(first.close()).rejects.toMatchObject({ code: 'storage' })
  const second = await setup(root)
  expect((await second.core.snapshot()).identity).toEqual(previous.identity)
  expect(second.records.table('identity').size).toBe(1)
})

it('restores the committed primary after publication uncertainty while retaining the independent earlier backup', async () => {
  const root = await directory()
  const first = await setup(root)
  const previous = await first.core.snapshot()
  const table = first.domain.table('states')
  const put = table.put.bind(table)
  vi.spyOn(table, 'put').mockImplementationOnce(async (...args) => {
    await put(...args)
    throw new Error('publication acknowledgement interrupted')
  })
  await expect(first.core.rename('Committed name')).rejects.toMatchObject({ code: 'storage' })
  await expect(first.core.snapshot()).rejects.toMatchObject({ code: 'storage' })
  expect(await readBackup(join(root, 'life.lock.backup.json'))).toEqual(previous)
  await expect(first.close()).rejects.toMatchObject({ code: 'storage' })
  const second = await setup(root)
  expect((await second.core.snapshot()).identity).toMatchObject({ id: previous.identity.id, name: 'Committed name' })
  expect(await readBackup(join(root, 'life.lock.backup.json'))).toEqual(await second.core.snapshot())
})

it.each(['missing', 'malformed', 'future-version', 'changed-content'] as const)(
  'refuses a %s referenced record without replacing identity or backup', async (damage) => {
    const root = await directory()
    const first = await setup(root)
    await first.close()
    const descriptor = await readFile(join(root, 'genesis.json'), 'utf8')
    const document = z.object({ tables: z.object({ states: z.object({ life: manifestSchema }) }) }).parse(JSON.parse(descriptor))
    const manifest = document.tables.states.life
    const ref = manifest.records.find(record => record.table === 'identity')!
    const path = join(root, 'genesis_records', ref.table, `${ref.key}.json`)
    const record = z.object({ version: z.number(), record: z.record(z.string(), z.json()) }).parse(JSON.parse(await readFile(path, 'utf8')))
    const backup = await readFile(join(root, 'life.lock.backup.json'), 'utf8')
    if (damage === 'missing') await rm(path)
    else if (damage === 'malformed') await writeFile(path, '{')
    else {
      if (damage === 'future-version') record.version = 999
      else record.record['name'] = 'Tampered identity'
      await writeFile(path, JSON.stringify(record))
    }
    await expect(openCore(root)).rejects.toThrow()
    expect(await readFile(join(root, 'genesis.json'), 'utf8')).toBe(descriptor)
    expect(await readFile(join(root, 'life.lock.backup.json'), 'utf8')).toBe(backup)
    expect((await readBackup(join(root, 'life.lock.backup.json'))).identity.name).toBeNull()
  },
)

it('pages a growing history beyond former global budgets and restores its full ordered evidence', async () => {
  const root = await directory()
  const first = await openCore(root, 'json', { maxRecords: 20, maxStateChars: 10000, storage: { pageSize: 4, maxRecordChars: 20000 } })
  cleanup.push(() => first.close())
  for (let index = 0; index < 80; index++) await first.core.observe({ sessionId: SessionId('paged-life'), eventId: String(index),
    timestamp: '2026-11-04T00:00:00.000Z', kind: 'user-message' })
  const before = await first.core.snapshot()
  expect(before.events.length).toBeGreaterThan(20)
  expect(JSON.stringify(before).length).toBeGreaterThan(10000)
  const manifest = manifestSchema.parse(first.domain.table('states').get('life'))
  expect(manifest.format).toBe('genesis-tree-v2')
  expect(manifest.records.length).toBeLessThanOrEqual(4)
  const refs = await manifestReferences(manifest, (table, key) => first.records.table(table).get(key))
  expect(refs.filter(ref => ref.table === 'indexes').length).toBeGreaterThan(1)
  for (const ref of refs.filter(ref => ref.table === 'indexes')) {
    expect(indexPageSchema.parse(first.records.table(ref.table).get(ref.key)).records.length).toBeLessThanOrEqual(4)
  }
  expect((await stat(join(root, 'genesis.json'))).size).toBeLessThan(1000)
  await first.close()
  const second = await openCore(root, 'json', { storage: { pageSize: 4, maxRecordChars: 20000 } })
  cleanup.push(() => second.close())
  const restored = await second.core.snapshot()
  expect(restored.identity).toEqual(before.identity)
  expect(restored.events.slice(0, before.events.length)).toEqual(before.events)
  const source = restored.events.find(event => event.relatedEventId === '0')!
  expect(await second.core.observe({ sessionId: SessionId('paged-life'), eventId: '0', timestamp: source.timestamp, kind: 'user-message' })).toEqual(source)
  expect((await readBackup(join(root, 'life.lock.backup.json'))).identity).toEqual(before.identity)
})

it('migrates a flat split-v1 manifest and grouped memory versions without losing earlier interpretations', async () => {
  const root = await directory()
  const first = await setup(root)
  const source = (await first.core.snapshot()).events[0]!
  const memory = await first.core.remember({ content: 'old wording', category: 'semantic', importance: 0.5, confidence: 0.5, sourceEventIds: [source.id] })
  await first.core.updateMemory(memory.id, { content: 'new wording', category: 'semantic', importance: 0.5, confidence: 0.5, sourceEventIds: [source.id] })
  await first.close()
  const saved = await readBackup(join(root, 'life.lock.backup.json'))
  const disk = JSON.parse(await readFile(join(root, 'genesis.json'), 'utf8')) as { tables: { states: { life: unknown } } }
  const refs = await manifestReferences(manifestSchema.parse(disk.tables.states.life), async (table, key) => {
    const component = JSON.parse(await readFile(join(root, 'genesis_records', table, `${key}.json`), 'utf8')) as { record: object }
    return component.record
  })
  const flat = refs.filter(ref => ref.table !== 'indexes' && ref.table !== 'memory_revisions')
  for (const item of saved.memories) if (item.history?.length) {
    const value = { id: item.id, history: item.history }; const key = recordHash(value)
    await mkdir(join(root, 'genesis_records', 'memory_history'), { recursive: true })
    await writeFile(join(root, 'genesis_records', 'memory_history', `${key}.json`), JSON.stringify({ version: 1, record: value }))
    flat.push({ table: 'memory_history', key })
  }
  disk.tables.states.life = { format: 'genesis-split-v1', records: flat }
  await writeFile(join(root, 'genesis.json'), JSON.stringify(disk))
  const next = await setup(root)
  expect((await next.core.snapshot()).identity).toEqual(saved.identity)
  expect((await next.core.snapshot()).memories).toEqual(saved.memories)
  expect(manifestSchema.parse(next.domain.table('states').get('life')).format).toBe('genesis-tree-v2')
})

it.each(['missing', 'changed'] as const)('refuses a %s index page without replacing the prior backup', async (damage) => {
  const root = await directory()
  const first = await openCore(root, 'json', { storage: { pageSize: 2, maxRecordChars: 20000 } })
  cleanup.push(() => first.close())
  await first.close()
  const primary = await readFile(join(root, 'genesis.json'), 'utf8')
  const disk = JSON.parse(primary) as { tables: { states: { life: unknown } } }
  const ref = manifestSchema.parse(disk.tables.states.life).records.find(row => row.table === 'indexes')!
  const path = join(root, 'genesis_records', ref.table, `${ref.key}.json`)
  const backup = await readFile(join(root, 'life.lock.backup.json'), 'utf8')
  if (damage === 'missing') await rm(path)
  else await writeFile(path, JSON.stringify({ version: 1, record: { format: 'genesis-index-v1', records: [] } }))
  await expect(openCore(root)).rejects.toThrow()
  expect(await readFile(join(root, 'genesis.json'), 'utf8')).toBe(primary)
  expect(await readFile(join(root, 'life.lock.backup.json'), 'utf8')).toBe(backup)
  expect((await readBackup(join(root, 'life.lock.backup.json'))).identity).toBeDefined()
})
