declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'test-guest': { readonly kind: 'test-guest'; readonly guest: string } }
}
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PeerId } from '@deepseek-ai/dsh-typert-protocol'
/** Persistent social identity, independently sourced relationships and audience refusal. */
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { openCore } from './harness.ts'
import { personSourceSchema, qqPersonId, conversationIdSchema } from '../src/people-model.ts'
import { emotionUpdateSchema } from '../src/emotion-state.ts'
import { memoryVisible } from '../src/memory-access.ts'
import { GenesisPeopleGateway } from '../src/people-gateway.ts'
import type { RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { stateSchema } from '../src/model.ts'
import type { EmotionDialogue } from '../src/emotion-projection.ts'
import { participantIdentity, dialogueForModel } from '../src/participants.ts'
import { modelEmotionUpdate } from '../src/emotion-model.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const dispose of cleanup.splice(0).reverse()) {
    try { await dispose() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'People test teardown')
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-people-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const opened = await openCore(root, 'json', { emotion: {} })
  cleanup.push(() => opened.close())
  opened.ctx.provide('genesis', opened.core)
  await opened.ctx.plugin(GenesisPeopleGateway, opened.config)
  return { ...opened, root }
}
function source(account = '12345', kind: 'group' | 'private' = 'group', target = '67890', message = '1', name = '小明') {
  return personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq', personId: qqPersonId(account), accountId: account,
    conversationId: `qq:${kind}:11111:${kind === 'private' ? account : target}`, name, messageId: message })
}
const appraisal = { kind: 'shared-experience', importance: 0.5, novelty: 0.5, expectationMatch: 0, controllability: 0.5,
  relationshipMeaning: 'neutral', responsibility: 'uncertain', confidence: 0.6, summary: '一起讨论并完成了一件事。' }
function update(personId: string, seq = 2) {
  return emotionUpdateSchema.parse({ delta: {}, moodDelta: {}, needsDelta: {}, reason: '有意义的共同交流。', sourceSeqs: [seq], appraisal,
    relationships: [{ personId, delta: { familiarity: 0.005 }, sourceSeqs: [seq], reason: '共同经历增加熟悉程度。', appraisal }] })
}
function exchange(participant = source(), startSeq = 1): EmotionDialogue['turns'] {
  const timestamp = new Date().toISOString()
  return [{ turn: startSeq, startSeq, completed: true, overflow: false, messages: [
    { role: 'user', seq: startSeq + 1, timestamp, text: '我们一起把这件事做完了。', participant },
    { role: 'assistant', seq: startSeq + 2, timestamp, text: '这次合作让我更了解你了。' },
  ] }]
}

it('keeps strangers unretained and carries the same sourced relationship across group, private chat, rename and restart', async () => {
  const f = await fixture()
  const group = SessionId('people-group')
  const dm = SessionId('people-private')
  const sender = source()
  await f.core.bindConversation({ id: sender.conversationId, sessionId: group, kind: 'group' })
  await f.core.reviewEmotion(group, exchange(), (await f.core.snapshot()).emotion!.revision)
  expect((await f.core.snapshot()).people!.people).toEqual([])
  const meaningful = exchange(source('12345', 'group', '67890', '2'), 4)
  await f.core.reviewEmotion(group, meaningful, (await f.core.snapshot()).emotion!.revision, update(sender.personId, 5))
  const initial = await f.core.snapshot()
  expect(initial.people!.people).toHaveLength(1)
  expect(initial.emotion!.relationship).toBeNull()
  const profile = initial.people!.people[0]!
  const signal = new AbortController().signal
  expect((await f.ctx.genesisPeople.inspect(0, signal)).items[0]!.id).toBe(profile.id)
  const detail = await f.ctx.genesisPeople.detail(profile.id, 0, signal)
  expect(detail.events[0]!.sources.some(source => source.sessionId === group)).toBe(true)
  await expect(f.ctx.genesisPeople.forget(profile.id, '2000-01-01T00:00:00.000Z', signal)).rejects.toThrow()
  expect((await f.core.snapshot()).people!.people).toHaveLength(1)
  const guest = f.ctx.extend({ invocation: { request: { namespace: 'fixture', method: 'inspect', args: {} }, service: 'genesis', signal, async *uplink() {}, peer: { id: brandString<PeerId>('guest'), ctx: f.ctx, principal: { kind: 'test-guest', guest: 'genesis-fixture' }, signal, interactions: 'none', async dispose() {} } } satisfies RemoteInvocation })
  await expect(guest.genesisPeople.inspect(0, signal)).rejects.toThrow('operator access')
  const relationship = initial.people!.people[0]!.relationship
  expect(relationship.values.familiarity).toBeGreaterThan(0)
  expect(relationship.confidence.trust).toBe(0)
  const privateSender = source('12345', 'private', '', '3', '改名的小明')
  await f.core.bindConversation({ id: privateSender.conversationId, sessionId: dm, kind: 'private', personId: privateSender.personId })
  await f.core.observe({ sessionId: dm, eventId: '2', timestamp: new Date().toISOString(), kind: 'user-message', participant: privateSender })
  expect((await f.core.snapshot()).people!.people[0]!.name).toBe('改名的小明')
  await f.close()
  const restored = await openCore(f.root, 'json', { emotion: {} })
  cleanup.push(() => restored.close())
  expect((await restored.core.snapshot()).identity).toEqual(initial.identity)
  expect((await restored.core.snapshot()).people!.people[0]!.relationship.id).toBe(relationship.id)
  const before = (await restored.core.snapshot()).emotion!.revision
  await restored.core.reviewEmotion(group, meaningful, before, update(sender.personId, 5))
  expect((await restored.core.snapshot()).emotion!.revision).toBe(before)
  const renamed = source('12345', 'group', '77777', '4', '新群名片')
  const current = await restored.core.snapshot()
  expect(participantIdentity(current, renamed)).toMatchObject({ qq: '12345', nickname: '新群名片', name: '改名的小明', seenBefore: true })
  expect(JSON.stringify(dialogueForModel(exchange(renamed)[0]!.messages, current))).not.toContain(sender.personId)
  await restored.core.forgetPerson(sender.personId)
  expect(participantIdentity(await restored.core.snapshot(), renamed)).toMatchObject({ seenBefore: false, name: null })
})

it('resolves model QQ appraisal targets to internal identities and rejects model-supplied person IDs', () => {
  const original = update(qqPersonId('12345'))
  const { personId: _personId, ...fields } = original.relationships![0]!
  const raw = { ...original, relationships: [{ ...fields, qq: '12345' }] }
  expect(modelEmotionUpdate(raw)).toEqual(original)
  expect(() => modelEmotionUpdate(original)).toThrow()
  expect(() => modelEmotionUpdate({ ...raw, relationships: [{ ...fields, qq: '12345', personId: qqPersonId('99999') }] })).toThrow()
})

it('forgets prior account recognition even when no relationship profile was retained', async () => {
  const { core } = await fixture()
  const sender = source()
  const sessionId = SessionId('unretained-contact')
  await core.bindConversation({ id: sender.conversationId, sessionId, kind: 'group' })
  await core.observe({ sessionId, eventId: 'first', kind: 'user-message', timestamp: new Date().toISOString(), participant: sender })
  const next = source('12345', 'group', '77777', 'second', '新群名片')
  expect(participantIdentity(await core.snapshot(), next).seenBefore).toBe(true)
  expect(await core.forgetPerson(sender.personId)).toBe(false)
  expect(participantIdentity(await core.snapshot(), next)).toMatchObject({ seenBefore: false, name: null })
})

it('refuses a relationship change attributed to a mentioned or different person and commits no partial state', async () => {
  const { core } = await fixture()
  const group = SessionId('people-targets')
  await core.bindConversation({ id: source().conversationId, sessionId: group, kind: 'group' })
  const before = await core.snapshot()
  await expect(core.reviewEmotion(group, exchange(), before.emotion!.revision, update(qqPersonId('99999')))).rejects.toThrow('this person speaking')
  expect(await core.snapshot()).toEqual(before)
  const corrupt = { ...source(), personId: qqPersonId('99999') }
  expect(personSourceSchema.safeParse(corrupt).success).toBe(false)
  expect(personSourceSchema.safeParse({ ...source('12345', 'private'), conversationId: 'qq:private:11111:99999' }).success).toBe(false)
})

it('filters private, group and legacy memory before lexical recall, including mixed-source synthesis and exact IDs', async () => {
  const { core } = await fixture()
  const group = SessionId('scope-group')
  const otherGroup = SessionId('scope-other-group')
  const dm = SessionId('scope-dm')
  const otherDm = SessionId('scope-other-dm')
  const web = SessionId('scope-operator-web')
  for (const [sessionId, sender] of [[group, source()], [otherGroup, source('12345', 'group', '77777')],
    [dm, source('12345', 'private')], [otherDm, source('99999', 'private')]] as const) {
    await core.bindConversation({ id: sender.conversationId, sessionId, kind: sessionId === dm || sessionId === otherDm ? 'private' : 'group',
      ...(sessionId === dm || sessionId === otherDm ? { personId: sender.personId } : {}) })
  }
  const store = async (sessionId: SessionId, participant?: ReturnType<typeof source>) => {
    const observed = await core.observe({ sessionId, eventId: '2', kind: 'user-message', timestamp: new Date().toISOString(), ...(participant === undefined ? {} : { participant }) })
    return core.remember({ category: 'semantic', content: `秘密-${sessionId}`, importance: 0.5, confidence: 0.5, sourceEventIds: [observed.id] })
  }
  const privateMemory = await store(dm, source('12345', 'private'))
  const groupMemory = await store(group, source())
  const legacyMemory = await store(web)
  const mixed = await core.remember({ category: 'semantic', content: '秘密-混合推断', importance: 0.8, confidence: 0.5,
    sourceEventIds: [...privateMemory.sourceEventIds, ...groupMemory.sourceEventIds] })
  const find = (sessionId: SessionId, text = '秘密') => core.retrieve({ sessionId, text, limit: 20, chars: 10000 })
  expect((await find(dm)).map(item => item.id)).toEqual([privateMemory.id])
  expect((await find(group)).map(item => item.id)).toEqual([groupMemory.id])
  expect(await find(otherGroup)).toEqual([])
  expect(await find(otherDm)).toEqual([])
  expect(await find(group, privateMemory.id)).toEqual([])
  expect((await find(web)).map(item => item.id)).toEqual([legacyMemory.id])
  expect(memoryVisible(await core.snapshot(), mixed, 'conversation', group)).toBe(false)
  expect(memoryVisible(await core.snapshot(), mixed, 'life', group)).toBe(true)
  expect(memoryVisible(await core.snapshot(), privateMemory, 'life', otherGroup)).toBe(true)
  expect(memoryVisible(await core.snapshot(), { ...groupMemory, history: [{ category: privateMemory.category,
    content: privateMemory.content, importance: privateMemory.importance, confidence: privateMemory.confidence,
    sourceEventIds: privateMemory.sourceEventIds, recordedAt: privateMemory.createdAt, supersededAt: groupMemory.updatedAt }] }, 'conversation', group)).toBe(false)
  expect(memoryVisible(await core.snapshot(), privateMemory, 'conversation')).toBe(true)
  await core.forgetPerson(qqPersonId('12345'))
  const retained = (await core.snapshot()).memories.map(memory => memory.id)
  expect(retained).toContain(legacyMemory.id)
  for (const removed of [privateMemory, groupMemory, mixed]) expect(retained).not.toContain(removed.id)
  expect((await core.snapshot()).events.some(event => event.type === 'person.forgotten')).toBe(true)
})

it('reserves external input and actual send receipts once, refuses conflicting replay and preserves unresolved delivery', async () => {
  const { core, root, close } = await fixture()
  const sessionId = SessionId('receipt-session')
  await core.bindConversation({ id: source().conversationId, sessionId, kind: 'group' })
  expect(await core.reservePersonMessage(sessionId, source(), 'content-hash')).toBe(true)
  expect(await core.reservePersonMessage(sessionId, source(), 'content-hash')).toBe(false)
  await expect(core.reservePersonMessage(sessionId, source(), 'other-content')).rejects.toThrow('conflicting')
  await expect(core.bindConversation({ id: source().conversationId, sessionId: SessionId('replacement'), kind: 'group' })).rejects.toThrow('another Session')
  expect(await core.reserveQqReply(sessionId, 10, 2)).toBe(true)
  await expect(core.settleQqReply(sessionId, 10, 'confirmed', ['one'])).rejects.toThrow('every reserved part')
  await core.settleQqReply(sessionId, 10, 'uncertain', ['one'])
  await close()
  const restored = await openCore(root, 'json', { emotion: {} })
  cleanup.push(() => restored.close())
  expect(await restored.core.reserveQqReply(sessionId, 10, 2)).toBe(false)
  expect((await restored.core.snapshot()).events.find(event => event.type === 'qq.receipt')!.payload).toMatchObject({ status: 'uncertain', messageIds: ['one'] })
  const damaged = await restored.core.snapshot()
  damaged.people!.conversations.push({ id: conversationIdSchema.parse('qq:group:11111:77777'), kind: 'group', sessionId })
  expect(stateSchema.safeParse(damaged).success).toBe(false)
})

it('backfills legacy relationships on restart and attaches new relationships to existing contacts without replacing addresses', async () => {
  const f = await fixture()
  const sender = source()
  const sessionId = SessionId('contact-backfill')
  await f.core.bindConversation({ id: sender.conversationId, sessionId, kind: 'group' }, sender.personId)
  await f.core.saveContact({ name: '联系人称呼', qq: sender.accountId, emails: ['friend@example.com'], handles: [], notes: '保留备注' })
  await f.core.reviewEmotion(sessionId, exchange(), (await f.core.snapshot()).emotion!.revision, update(sender.personId))
  expect((await f.core.contacts('')).items).toHaveLength(1)
  expect((await f.core.contacts('friend@example.com')).items[0]!.name).toBe('联系人称呼')
  const legacy = await f.core.snapshot()
  delete legacy.contacts
  await f.close()
  const path = join(f.root, 'genesis.json')
  const stored: { tables: { states: { life: typeof legacy } } } = JSON.parse(await readFile(path, 'utf8'))
  stored.tables.states.life = legacy
  await writeFile(path, JSON.stringify(stored))
  const restored = await openCore(f.root, 'json', { emotion: {} })
  cleanup.push(() => restored.close())
  const contacts = await restored.core.contacts('')
  expect(contacts.items).toHaveLength(1)
  expect(contacts.items[0]).toMatchObject({ personId: sender.personId, qq: sender.accountId, operator: true, emails: [] })
  expect((await restored.core.snapshot()).identity).toEqual(legacy.identity)
  expect((await restored.core.snapshot()).people!.people).toEqual(legacy.people!.people)
})
