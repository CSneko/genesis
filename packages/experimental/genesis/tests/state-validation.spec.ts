/** Incremental commits preserve the durable reader's reference and uniqueness rules. @module */
import { expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { LifeStateValidator, stateSchema, type GrowthId, type LifeEventId, type LifeState, type MemoryId } from '../src/model.ts'
import { Config } from '../src/config.ts'
import { initialEmotion } from '../src/emotion-state.ts'

const uuid = (value: number) => `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
const timestamp = '2026-01-01T00:00:00.000Z'
function fixture(): LifeState {
  const lifeId = uuid(1)
  return stateSchema.parse({
    schemaVersion: 1,
    identity: {
      id: lifeId,
      name: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lifeCoreVersion: '0.1.0-alpha.1',
      origin: { framework: 'DeepSeek Harness', initialVersion: '0.1.0-alpha.1' },
    },
    events: [
      { id: uuid(2), lifeId, timestamp, type: 'life.created', source: 'system', dedupKey: 'birth', payload: {} },
      { id: uuid(3), lifeId, timestamp, type: 'interaction.observed', source: 'user', dedupKey: 'user', payload: { kind: 'user-message' } },
    ],
    memories: [
      {
        id: uuid(4),
        lifeId,
        category: 'semantic',
        content: 'A sourced preference',
        importance: 0.5,
        confidence: 0.5,
        sourceEventIds: [uuid(3)],
        experienceIds: [uuid(5)],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: uuid(5),
        lifeId,
        category: 'episodic',
        content: 'A sourced experience',
        importance: 0.5,
        confidence: 0.5,
        sourceEventIds: [uuid(3)],
        experience: { sessionId: 'fixture', startedAt: timestamp, endedAt: timestamp, topics: [] },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    growth: [
      {
        id: uuid(6),
        lifeId,
        timestamp,
        category: 'system',
        title: 'A verified capability',
        description: 'Fixture',
        relatedEventIds: [uuid(3)],
      },
    ],
    sessions: {},
  })
}
function appendEvent(state: LifeState, number: number, type = 'interaction.observed') {
  const event = { ...state.events[1]!, id: brandString<LifeEventId>(uuid(number)), dedupKey: `event:${number}`, type }
  state.events.push(event)
  return event
}
const invalidChanges: Array<[string, (state: LifeState) => void]> = [
  [
    'duplicate event ID',
    (state) => {
      state.events.push({ ...state.events[0]!, dedupKey: 'another-key' })
    },
  ],
  [
    'duplicate delivery key',
    (state) => {
      appendEvent(state, 10).dedupKey = 'birth'
    },
  ],
  [
    'duplicate birth',
    (state) => {
      appendEvent(state, 10, 'life.created')
    },
  ],
  [
    'missing memory source',
    (state) => {
      state.memories[0]!.sourceEventIds = [brandString<LifeEventId>(uuid(99))]
    },
  ],
  [
    'deleted associated experience',
    (state) => {
      state.memories = state.memories.slice(0, 1)
    },
  ],
  [
    'changed birth timestamp',
    (state) => {
      state.identity.createdAt = '2026-01-02T00:00:00.000Z'
    },
  ],
  [
    'missing emotion initialization',
    (state) => {
      state.emotion = initialEmotion(Config({ leasePath: '/unused-validation.lock', emotion: {} }).emotion!, timestamp)
    },
  ],
  [
    'missing interest initialization',
    (state) => {
      state.interests = []
    },
  ],
  [
    'missing agency initialization',
    (state) => {
      state.agency = { version: 1, revision: 0, motivations: [], goals: [], decisions: [] }
    },
  ],
  [
    'nonhuman habit evidence',
    (state) => {
      state.memories[0] = {
        ...state.memories[0]!,
        category: 'procedural',
        attribution: 'model-inference',
        sourceEventIds: [state.events[0]!.id],
        habit: { cue: 'A cue', response: 'A response', active: true, supportEventIds: [state.events[0]!.id] },
      }
    },
  ],
  [
    'missing new emotion evidence',
    (state) => {
      appendEvent(state, 10, 'emotion.reviewed').payload = { sourceEventIds: [uuid(99)] }
    },
  ],
  [
    'missing new growth evidence',
    (state) => {
      state.growth.push({ ...state.growth[0]!, id: brandString<GrowthId>(uuid(10)), relatedEventIds: [brandString<LifeEventId>(uuid(99))] })
    },
  ],
  [
    'duplicate growth ID',
    (state) => {
      state.growth.push({ ...state.growth[0]! })
    },
  ],
]

it.each(invalidChanges)('rejects %s in both complete and incremental validation', async (_name, change) => {
  const state = fixture()
  const validator = new LifeStateValidator(state)
  const next = structuredClone(state)
  change(next)
  expect(stateSchema.safeParse(next).success).toBe(false)
  const publish = vi.fn(async () => {})
  await expect(validator.commit(next, publish)).rejects.toThrow()
  expect(publish).not.toHaveBeenCalled()
  await validator.commit(state, publish)
  expect(publish).toHaveBeenCalledOnce()
})

it('accepts references between new records and rolls back indexes after publication failure', async () => {
  const state = fixture()
  const validator = new LifeStateValidator(state)
  const next = structuredClone(state)
  const review = appendEvent(next, 10, 'emotion.reviewed')
  const source = appendEvent(next, 11)
  review.payload = { sourceEventIds: [source.id] }
  next.memories.push({ ...state.memories[0]!, id: brandString<MemoryId>(uuid(12)), sourceEventIds: [review.id] })
  expect(stateSchema.safeParse(next).success).toBe(true)
  await expect(
    validator.commit(next, async () => {
      throw new Error('Publication failed')
    }),
  ).rejects.toThrow('Publication failed')
  await validator.commit(next, async () => {})
  const duplicate = { ...next, events: [...next.events, { ...source, dedupKey: 'another-source-key' }] }
  await expect(validator.commit(duplicate, async () => {})).rejects.toThrow('duplicate')
  await validator.commit(next, async () => {})
})

it('checks historical interest references when the current inventory changes', async () => {
  const state = fixture()
  appendEvent(state, 10, 'interest.initialized')
  const change = appendEvent(state, 11, 'interest.changed')
  change.payload = { interestId: uuid(12), sourceEventIds: [state.events[1]!.id] }
  const seed = stateSchema.parse({
    ...state,
    interests: [
      {
        id: uuid(12),
        lifeId: state.identity.id,
        topic: 'A topic',
        stage: 'contact',
        createdAt: timestamp,
        updatedAt: timestamp,
        reason: 'An observed exchange',
        evidence: [{ sessionId: 'fixture', startSeq: 1, signal: 'contact', selfInitiated: false, sourceEventIds: [state.events[1]!.id] }],
      },
    ],
  })
  const next = { ...seed, interests: [] }
  expect(stateSchema.safeParse(next).success).toBe(false)
  const validator = new LifeStateValidator(seed)
  await expect(validator.commit(next, async () => {})).rejects.toThrow('absent interest')
  await validator.commit(seed, async () => {})
})
