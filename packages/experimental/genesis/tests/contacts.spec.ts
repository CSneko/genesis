/** Contact identity continuity and restart durability through the real life storage. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it } from 'vitest'
import { openCore } from './harness.ts'
import { participantIdentity } from '../src/participants.ts'
import { personSourceSchema, qqPersonId } from '../src/people-model.ts'
import { stateSchema } from '../src/model.ts'
import { GenesisContactsGateway } from '../src/contacts-gateway.ts'

it('links addresses to relationship identities, restores updates, and keeps deletion across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-contacts-'))
  let fixture: Awaited<ReturnType<typeof openCore>> | undefined
  try {
    fixture = await openCore(root)
    fixture.ctx.provide('genesis', fixture.core)
    await fixture.ctx.plugin(GenesisContactsGateway)
    const signal = new AbortController().signal
    const input = { name: '小明', qq: '12345', emails: ['xiaoming@example.com'],
      handles: [{ kind: '微信', value: 'xiaoming' }], notes: '一起写代码的朋友' }
    await fixture.ctx.genesisContacts.save(input, false, signal)
    const contact = (await fixture.ctx.genesisContacts.inspect(input.emails[0]!, 0, signal)).items[0]!
    expect(contact.personId).toBe(qqPersonId(input.qq))
    const participant = personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq', personId: contact.personId,
      accountId: input.qq, conversationId: 'qq:private:11111:12345', name: '新昵称', messageId: '1' })
    expect(participantIdentity(await fixture.core.snapshot(), participant)).toMatchObject({ name: input.name, seenBefore: false })
    expect((await fixture.core.contacts(contact.personId)).items).toEqual([contact])
    const identity = (await fixture.core.snapshot()).identity
    await fixture.core.saveContact(input)
    expect((await fixture.core.snapshot()).events.filter(event => event.type === 'contact.saved')).toHaveLength(1)
    await fixture.core.saveContact({ ...input, personId: contact.personId, name: '小明同学', emails: ['new@example.com'] })
    expect((await fixture.core.contacts('xiaoming@example.com')).total).toBe(0)
    expect(() => fixture!.core.saveContact({ ...input, personId: qqPersonId('99999') })).toThrow('must match')
    await fixture.close()
    fixture = await openCore(root)
    expect((await fixture.core.snapshot()).identity).toEqual(identity)
    expect((await fixture.core.contacts('new@example.com')).items[0]).toMatchObject({ personId: contact.personId, name: '小明同学' })
    await fixture.core.saveContact({ ...input, emails: ['operator@example.com'] }, undefined, true)
    expect(fixture.core.isOperatorEmail('operator@example.com')).toBe(true)
    expect(fixture.core.isOperatorPerson(contact.personId)).toBe(true)
    const other = await fixture.core.saveContact({ ...input, qq: '99999', emails: ['other@example.com'] }, undefined, true)
    expect(fixture.core.isOperatorEmail('operator@example.com')).toBe(false)
    expect(fixture.core.isOperatorEmail('other@example.com')).toBe(true)
    await expect(fixture.core.saveContact({ ...input, qq: '99999', emails: ['injected@example.com'] },
      { sessionId: SessionId('operator-contact-test'), eventId: 'tool-call' })).rejects.toThrow('not through a model tool')
    expect(await fixture.core.deleteContact(other.personId)).toBe(true)
    expect(fixture.core.isOperatorPerson(other.personId)).toBe(false)
    const damaged = await fixture.core.snapshot()
    damaged.contacts!.items[0]!.sourceEventId = damaged.events[0]!.id
    expect(stateSchema.safeParse(damaged).success).toBe(false)
    expect(await fixture.core.deleteContact(contact.personId)).toBe(true)
    await fixture.close()
    fixture = await openCore(root)
    expect((await fixture.core.contacts('')).total).toBe(0)
  } finally {
    await fixture?.close()
    await rm(root, { recursive: true, force: true })
  }
})
