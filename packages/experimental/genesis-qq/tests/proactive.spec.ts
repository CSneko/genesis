/** Separate autonomous destination policy and denial before any external action. @module */
import { expect, it, onTestFinished } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MessageTargetId } from '@deepseek-ai/dsh-experimental-genesis'
import { openCore } from '../../genesis/tests/harness.ts'
import { Config } from '../src/config.ts'
import { QqMessenger } from '../src/messages.ts'
import { QqMessageStore, qqMessagesDomain } from '../src/message-store.ts'

it('restricts proactive QQ targets to separate allowlists and refuses sends outside an admitted reflection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-proactive-policy-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const fixture = await openCore(root)
  onTestFinished(() => fixture.close())
  fixture.ctx.provide('genesis', fixture.core)
  const facility = new DomainFacility(fixture.ctx, { backend: 'json' })
  const store = new QqMessageStore(await facility.open(qqMessagesDomain), 10)
  onTestFinished(() => store.close())
  const config = Config({ cwd: root, botQq: '11111', outboundGroups: ['67890'], proactiveUsers: ['12345'] })
  const messenger = new QqMessenger(fixture.ctx, config, store,
    async () => { throw new Error('No destination should open before authorization.') }, async (_id, run) => run(), () => undefined)
  let externalSends = 0
  const provider = messenger.initiativeProvider({
    directory: async kind => kind === 'private' ? [{ user_id: 12345, nickname: 'Allowed' }, { user_id: 99999, nickname: 'Other' }]
      : [{ group_id: 67890, group_name: 'Operator outbound only' }],
    send: async () => { externalSends++; return { message_id: 'unexpected' } },
  }, () => {})
  const targets = await provider.targets(new AbortController().signal)
  expect(targets.map(item => item.target)).toEqual(['qq:private:11111:12345'])
  const agent = { id: SessionId('unadmitted') } as Parameters<typeof provider.send>[2]['agent']
  await expect(provider.send(brandString<MessageTargetId>('qq:private:11111:12345'), 'Hello.',
    { agent, callId: ToolCallId('unadmitted'), signal: new AbortController().signal })).rejects.toThrow('admission')
  expect(externalSends).toBe(0)
})
