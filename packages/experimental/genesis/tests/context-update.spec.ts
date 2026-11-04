/** Module removal and compaction recovery use the real Session surface. */
import { expect, it } from 'vitest'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { lifeContextUpdate } from '../src/context-update.ts'

it('does not suppress uncommitted updates, clears removed content once and restores compacted modules', () => {
  const session = Session.create(SessionId('life-module-retention'))
  const initial = [{ name: 'genesis:emotion', text: 'happiness mild' }, { name: 'genesis:associated-memories', text: 'tea' }]
  const pending = lifeContextUpdate(session, initial)!
  expect(lifeContextUpdate(session, initial)?.source).toEqual(pending.source)
  const first = session.append('user/message', pending, { surfaceOp: 'append' })
  expect(lifeContextUpdate(session, initial)).toBeUndefined()
  const current = [initial[0]!, { name: 'genesis:associated-memories', text: '' }]
  const cleared = lifeContextUpdate(session, current)!
  expect(cleared.source).toMatchObject({ sections: [current[1]] })
  const second = session.append('user/message', cleared, { surfaceOp: 'append' })
  expect(lifeContextUpdate(session, current)).toBeUndefined()
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Conversation summary.' }] }),
    { surfaceOp: { op: 'replace', startSeq: first.seq, endSeq: second.seq }, sourceEventSeqs: [first.seq, second.seq] })
  expect(lifeContextUpdate(session, current)?.source).toMatchObject({ sections: [initial[0]] })
})

it('clears optional state from retained combined life context when upgrading a conversation', () => {
  const session = Session.create(SessionId('combined-life-context'))
  session.append('user/message', createUserMessage({ source: { kind: 'runtime-context', form: 'snapshot',
    sections: [{ name: 'genesis:self', text: 'Earlier simulated emotion and associated memories.' }] },
  content: [{ type: 'text', text: 'Earlier simulated emotion and associated memories.' }] }), { surfaceOp: 'append' })
  const current = [{ name: 'genesis:emotion', text: '' }, { name: 'genesis:associated-memories', text: '' }]
  const update = lifeContextUpdate(session, current)!
  expect(update.source).toMatchObject({ sections: current })
  session.append('user/message', update, { surfaceOp: 'append' })
  expect(lifeContextUpdate(session, current)).toBeUndefined()
})
