/** Whole-message batching, private audiences and changed-only context use actual Session records. */
import { afterEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Session, SessionId, appendPluginRecord } from '@deepseek-ai/dsh-session'
import { ToolCallId, createUserMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { temporaryDialogue, temporaryBatch, temporaryContextUpdate, temporaryVisible } from '../src/temporary-evidence.ts'
import { completedTemporaryAssessment } from '../src/temporary-recovery.ts'
import { temporaryMemorySchema } from '../src/temporary-model.ts'
import { qqPersonId, conversationSchema, personSourceSchema } from '../src/people-model.ts'
import { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { GenesisSessionEvidence } from '../src/session-evidence.ts'
import { Config } from '../src/config.ts'
import { TemporaryStore } from '../src/temporary-store.ts'
import { TemporaryMemoryEngine } from '../src/temporary.ts'
import { temporaryDomain } from '../src/temporary-model.ts'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { openCore } from './harness.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const dispose: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of dispose.splice(0).reverse()) await close() })
async function reader() {
  const ctx = new Context()
  await ctx.plugin(SessionProjectionRegistry)
  ctx.provide('genesisSessionEvidence', await GenesisSessionEvidence.create(ctx, Config({ leasePath: join(tmpdir(), 'unused-life-lease') })))
  dispose.push(() => ctx.fiber.dispose())
  return ctx
}


it('counts Unicode characters, retains the complete threshold-crossing message and omits all tool data', async () => {
  const ctx = await reader()
  const session = Session.create(SessionId('temporary-batches'))
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '鲸'.repeat(999) }] }), { surfaceOp: 'append' })
  const second = session.append('assistant/message', { turn: 1, step: 1, stream: [], message: createAssistantMessage({
    source: { provider: 'fixture', model: 'fixture' }, content: [{ type: 'reasoning', text: 'hidden-reasoning' }, { type: 'text', text: '🐋'.repeat(300) }] }) }, { surfaceOp: 'append' })
  const callId = ToolCallId('temporary-call')
  session.append('tool/call', { turn: 1, step: 1, callId, name: 'read_file', arguments: '{"secret-tool-arguments":true}' })
  session.append('tool/result', { turn: 1, step: 1, message: createToolResultMessage({ callId, isError: false, content: [{ type: 'text', text: 'secret-tool-output' }] }) }, { surfaceOp: 'append' })
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '短尾批' }] }), { surfaceOp: 'append' })
  const batch = temporaryBatch(ctx.genesisSessionEvidence.temporaryOf(session)!.messages, -1, 10000)
  expect(batch.map(item => item.text)).toEqual(['鲸'.repeat(999), '🐋'.repeat(300)])
  const tail = temporaryBatch(ctx.genesisSessionEvidence.temporaryOf(session)!.messages, second.seq, 10000)
  expect(tail.map(item => item.text)).toEqual(['read_file', '短尾批'])
  expect(JSON.stringify([...batch, ...tail])).not.toMatch(/hidden-reasoning|secret-tool-arguments|secret-tool-output/u)
  expect(() => temporaryBatch(ctx.genesisSessionEvidence.temporaryOf(session)!.messages, -1, 100)).toThrow(/entire message/u)
})

it('labels QQ summary evidence with logged nicknames and the verified operator name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'temporary-names-'))
  dispose.push(() => rm(root, { recursive: true, force: true }))
  const life = await openCore(root)
  dispose.push(() => life.close())
  const state = await life.core.snapshot()
  const ctx = await reader()
  const session = Session.create(SessionId('temporary-names'))
  for (const [id, qq, nickname] of [['one', '12345', '小明'], ['two', '99999', '小明'], ['three', '55555', '群里昵称']]) {
    session.append('user/message', createUserMessage({ source: personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq',
      personId: qqPersonId(qq!), conversationId: 'qq:group:11111:67890', accountId: qq, name: nickname, messageId: id }),
    content: [{ type: 'text', text: 'fixture dialogue' }] }), { surfaceOp: 'append' })
  }
  const evidence = ctx.genesisSessionEvidence.temporaryOf(session)!.messages
  const named = temporaryDialogue(session, evidence, { ...state, operator: { name: '妈妈', identity: 'private fixture', revision: 1 },
    people: { version: 1, people: [], conversations: [], operatorPersonId: qqPersonId('55555') } })
  expect(named.map(row => 'speaker' in row ? row.speaker : undefined)).toEqual([
    { name: '小明', nickname: '小明' }, { name: '小明', nickname: '小明' }, { name: '妈妈', nickname: '群里昵称' },
  ])
  expect(named.map(row => row.seq)).toEqual(evidence.map(row => row.seq))
  expect(JSON.stringify(named)).not.toContain('private fixture')
})

it('emits only additions, updates and removals and replays the per-record delivery ledger', async () => {
  const ctx = await reader()
  const session = Session.create(SessionId('temporary-context'))
  const updateFor = (memories: readonly import('../src/temporary-model.ts').TemporaryMemory[]) => temporaryContextUpdate(session, memories,
    Object.keys(ctx.genesisSessionEvidence.temporaryOf(session)!.delivered))
  const memory = temporaryMemorySchema.parse({ id: randomUUID(), sessionId: 'source', sourceSeqs: [1], audience: { kind: 'operator' },
    summary: '临时任务进展', days: 1, createdAt: 0, expiresAt: 86400000 })
  const update = updateFor([memory])!
  session.append('user/message', update, { surfaceOp: 'append' })
  expect(updateFor([memory])).toBeUndefined()
  const next = { ...memory, id: brandString<typeof memory.id>(randomUUID()), summary: '第二条临时记忆' }
  const addition = updateFor([memory, next])!
  expect(JSON.stringify(addition)).not.toContain(memory.summary)
  session.append('user/message', addition, { surfaceOp: 'append' })
  const changed = { ...next, summary: '第二条临时记忆的最新进展' }
  const revision = updateFor([memory, changed])!
  expect(JSON.stringify(revision)).toContain(changed.summary)
  expect(JSON.stringify(revision)).not.toContain(memory.summary)
  session.append('user/message', revision, { surfaceOp: 'append' })
  const removal = updateFor([changed])!
  expect(JSON.stringify(removal)).toContain('expired or been withdrawn')
  expect(JSON.stringify(removal)).not.toContain(next.summary)
  session.append('user/message', removal, { surfaceOp: 'append' })
  expect(updateFor([changed])).toBeUndefined()
})

it('recovers the exact completed importance response without making a second model call', async () => {
  const ctx = await reader()
  const session = Session.create(SessionId('temporary-recovery'))
  const id = brandString<import('../src/temporary-model.ts').TemporaryMemoryId>(randomUUID())
  const requestSeq = appendPluginRecord(session, 'plugin:genesis/memory-call', { version: 1, phase: 'request', role: 'decision',
    config: { provider: 'fixture', model: 'decision' }, system: 'importance', input: JSON.stringify({ temporaryMemoryId: id, summary: '摘要' }) })
  expect(completedTemporaryAssessment(ctx, session, id)).toBeUndefined()
  appendPluginRecord(session, 'plugin:genesis/memory-call', { version: 1, phase: 'response', requestSeq, text: '{"importance":0.8}' })
  expect(completedTemporaryAssessment(ctx, session, id)).toEqual({ value: { importance: 0.8 } })
})

it('forgets expired current records and preserves QQ audiences independently of long-term memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'temporary-expiration-'))
  dispose.push(() => rm(root, { recursive: true, force: true }))
  const life = await openCore(root)
  dispose.push(() => life.close())
  const state = await life.core.snapshot()
  const personId = qqPersonId('12345')
  const privateChat = conversationSchema.parse({ id: 'qq:private:11111:12345', sessionId: 'private', kind: 'private', personId })
  const other = conversationSchema.parse({ id: 'qq:private:11111:99999', sessionId: 'other', kind: 'private', personId: qqPersonId('99999') })
  const group = conversationSchema.parse({ id: 'qq:group:11111:67890', sessionId: 'group', kind: 'group' })
  const operator = conversationSchema.parse({ id: 'qq:private:11111:55555', sessionId: 'operator', kind: 'private', personId: qqPersonId('55555') })
  const audience = { ...state, people: { version: 1 as const, people: [], operatorPersonId: operator.personId, conversations: [privateChat, other, group, operator] } }
  const memory = temporaryMemorySchema.parse({ id: randomUUID(), sessionId: 'private', sourceSeqs: [1], audience: { kind: 'private', personId },
    summary: '私聊内容', days: 1, createdAt: 0, expiresAt: 86400000 })
  expect(temporaryVisible(memory, audience, 'conversation', SessionId('private'))).toBe(true)
  expect(temporaryVisible(memory, audience, 'conversation', SessionId('other'))).toBe(false)
  expect(temporaryVisible(memory, audience, 'conversation', SessionId('group'))).toBe(false)
  expect(temporaryVisible(memory, audience, 'conversation', SessionId('web'))).toBe(false)
  const own = { ...memory, audience: { kind: 'operator' as const } }
  expect(temporaryVisible(own, audience, 'conversation', SessionId('web'))).toBe(true)
  expect(temporaryVisible(own, audience, 'conversation', SessionId('operator'))).toBe(true)
  expect(temporaryVisible(own, audience, 'conversation', SessionId('private'))).toBe(false)
  expect(temporaryVisible(own, audience, 'conversation', SessionId('group'))).toBe(false)
  const shared = { ...memory, audience: { kind: 'group' as const, conversationId: group.id } }
  expect(temporaryVisible(shared, audience, 'conversation', SessionId('group'))).toBe(true)
  expect(temporaryVisible(shared, audience, 'conversation', SessionId('web'))).toBe(false)
  expect(temporaryVisible(shared, audience, 'conversation', SessionId('private'))).toBe(false)
  const store = new TemporaryStore(await new DomainFacility(life.ctx, { backend: 'json' }).open(temporaryDomain), { schemaVersion: 1, lifeId: state.identity.id,
    revision: 0, settings: { enabled: false, idleMs: 1000, summary: { kind: 'provider', provider: '', model: '' } },
    sessions: [], memories: [memory] })
  dispose.push(() => store.close())
  const engine = new TemporaryMemoryEngine(life.ctx, life.core, store, life.config,
    () => ({ decision: { kind: 'provider', provider: '', model: '' }, writer: { kind: 'provider', provider: '', model: '' } }), () => true)
  dispose.push(() => engine.close())
  expect(engine.inspect().count).toBe(0)
  await engine.sweep()
  expect(store.read().memories).toEqual([])
  await expect(store.change((draft) => { draft.memories = [{ ...memory, expiresAt: 1 }] })).rejects.toThrow(/expiry/u)
  expect(store.read().memories).toEqual([])
  const initial = store.read()
  await engine.close()
  await store.close()
  const reopened = new TemporaryStore(await new DomainFacility(life.ctx, { backend: 'json' }).open(temporaryDomain),
    { ...initial, memories: [memory] })
  dispose.push(() => reopened.close())
  expect(reopened.read().memories).toEqual([])
  expect((await life.core.snapshot()).memories).toEqual(state.memories)
})


it.each(['life', 'conversation'] as const)('applies %s sharing to unexpired temporary keyword recall', async (memorySharing) => {
  const root = await mkdtemp(join(tmpdir(), 'temporary-sharing-'))
  dispose.push(() => rm(root, { recursive: true, force: true }))
  const life = await openCore(root, 'json', { memorySharing })
  new AgentRegistry(life.ctx)
  dispose.push(() => life.close())
  await life.core.bindConversation({ id: conversationSchema.parse({ id: 'qq:group:11111:67890', sessionId: 'target-group', kind: 'group' }).id,
    sessionId: SessionId('target-group'), kind: 'group' })
  const state = await life.core.snapshot()
  const createdAt = Date.now()
  const memory = temporaryMemorySchema.parse({ id: randomUUID(), sessionId: 'web', sourceSeqs: [1], audience: { kind: 'operator' },
    summary: '共同记忆：一起种过薄荷。', createdAt, expiresAt: createdAt + 86400000, days: 1 })
  const facility = new DomainFacility(life.ctx, { backend: 'json' })
  const store = new TemporaryStore(await facility.open(temporaryDomain), { schemaVersion: 1, lifeId: state.identity.id,
    revision: 0, settings: { enabled: true, idleMs: 1000, summary: { kind: 'provider', provider: 'fixture', model: 'summary' } }, sessions: [], memories: [memory] })
  dispose.push(() => facility.closeAll())
  dispose.push(() => store.close())
  const engine = new TemporaryMemoryEngine(life.ctx, life.core, store, life.config,
    () => ({ decision: { kind: 'provider', provider: '', model: '' }, writer: { kind: 'provider', provider: '', model: '' } }), () => true)
  dispose.push(() => engine.close())
  const found = await engine.search('薄荷 共同记忆', SessionId('target-group'))
  expect(found.length).toBe(memorySharing === 'life' ? 1 : 0)
  if (memorySharing === 'life') expect(found[0]).toContain(memory.summary)
  expect(store.read().memories[0]?.audience).toEqual({ kind: 'operator' })
})
