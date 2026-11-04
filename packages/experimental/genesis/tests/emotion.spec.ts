/** Deterministic recovery and damaged-state checks for persistent emotion. */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Config } from '../src/config.ts'
import { emotionAt, emotionContext, emotionStateSchema, emotionUpdateSchema, initialEmotion, resolveEmotion } from '../src/emotion-state.ts'
import { applyAppraisal } from '../src/emotion-appraisal.ts'
import { stateSchema } from '../src/model.ts'
import { readBackup } from '../src/backup.ts'
import { openCore } from './harness.ts'

const disposers: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const dispose of disposers.splice(0).reverse()) {
    try { await dispose() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Emotion fixture teardown')
})

it('foregrounds degree bands without percentages or storage metadata', () => {
  const config = Config({ leasePath: '/unused-context.lock', emotion: {} }).emotion!
  const state = initialEmotion(config, '2026-10-24T00:00:00.000Z')
  state.current.anger = 0.81
  state.current.happiness = 0.31
  state.mood.valence = -0.96
  state.needs.exploration = 0.71
  const before = structuredClone(state)
  const text = emotionContext(state, 0.05)
  expect(text.split('\n')[0]).toBe('Most salient now: mood valence very strong negative; inclination toward exploration strong.')
  expect(text).toContain('Immediate feelings, strongest first: anger strong; happiness mild')
  expect(text).toContain('Longer-term mood: valence very strong negative; arousal mild.')
  expect(text).not.toMatch(/updatedAt|revision|version|sourceEventIds|%|\{/u)
  expect(state).toEqual(before)
})

it('keeps wording and ranking stable within degree bands and changes them at band boundaries', () => {
  const config = Config({ leasePath: '/unused-degrees.lock', emotion: {} }).emotion!
  const state = initialEmotion(config, '2026-10-24T00:00:00.000Z')
  state.current.anger = 0.4
  state.current.happiness = 0.55
  state.mood.valence = -0.01
  const before = emotionContext(state, config.contextStep)
  state.current.anger = 0.55
  state.current.happiness = 0.4
  state.mood.valence = 0.01
  expect(emotionContext(state, config.contextStep)).toBe(before)
  state.current.anger = 0.7
  expect(emotionContext(state, config.contextStep)).not.toBe(before)
  expect(emotionContext(state, config.contextStep)).toContain('anger strong')
  state.current.anger = 0
  expect(emotionContext(state, config.contextStep)).toContain('anger negligible')
})

it.each([0, 0.5, 1, 2])('scales emotion, mood, attachment and recovery by sensitivity %s', (sensitivity) => {
  const config = Config({ leasePath: '/unused-sensitivity.lock', emotion: { sensitivity } }).emotion!
  const start = '2026-10-24T00:00:00.000Z'
  const state = initialEmotion(config, start)
  const update = emotionUpdateSchema.parse({ delta: { tenderness: 0.05, anger: -0.05 }, needsDelta: {}, moodDelta: { valence: 0.01 },
    relationshipDelta: { attachment: 0.002 }, reason: 'Support was offered.', sourceSeqs: [1],
    appraisal: { kind: 'support', importance: 1, novelty: 1, expectationMatch: 0.5, controllability: 0.5,
      relationshipMeaning: 'care', responsibility: 'other', confidence: 0.7, summary: 'Support was offered.' } })
  state.current.anger = 0.5
  const { effects } = applyAppraisal(state, update, resolveEmotion(config, state), [], ['I will help you.'])
  expect(effects.current['tenderness']).toBeCloseTo(0.05 * sensitivity)
  expect(effects.current['anger']).toBeCloseTo(-0.05 * sensitivity)
  expect(effects.mood['valence']).toBeCloseTo(0.01 * sensitivity)
  expect(state.relationship?.values.attachment ?? 0).toBeCloseTo(0.002 * sensitivity)
  if (sensitivity === 0) expect(state.relationship).toBeNull()
  const normal = { ...state, sensitivity: 1 }
  const recovered = emotionAt(state, '2026-10-24T00:05:00.000Z')
  const equivalent = emotionAt(normal, new Date(Date.parse(start) + 300000 * sensitivity).toISOString())
  expect(recovered.current).toEqual(equivalent.current)
  expect(recovered.mood).toEqual(equivalent.mood)
  expect(recovered.relationship).toEqual(state.relationship)
  expect(recovered.updatedAt).toBe('2026-10-24T00:05:00.000Z')
})

it('keeps sensitivity within per-exchange limits and preserves old anchors without accepting corrupt values', () => {
  const config = Config({ leasePath: '/unused-sensitivity.lock', emotion: { sensitivity: 2 } }).emotion!
  const state = initialEmotion(config, '2026-10-24T00:00:00.000Z')
  const update = emotionUpdateSchema.parse({ delta: { tenderness: 0.25 }, needsDelta: {}, moodDelta: { valence: 0.04 },
    relationshipDelta: { attachment: 0.01 }, reason: 'Support was offered.', sourceSeqs: [1],
    appraisal: { kind: 'support', importance: 1, novelty: 1, expectationMatch: 0.5, controllability: 0.5,
      relationshipMeaning: 'care', responsibility: 'other', confidence: 0.7, summary: 'Support was offered.' } })
  const { effects } = applyAppraisal(state, update, resolveEmotion(config, state), [], ['Support.'])
  expect(effects.current['tenderness']).toBeCloseTo(config.maxDelta)
  expect(effects.mood['valence']).toBeCloseTo(config.maxMoodDelta)
  expect(effects.relationship['attachment']).toBeCloseTo(config.maxRelationshipDelta)
  for (const sensitivity of [-1, 3]) {
    expect(() => Config({ leasePath: '/unused-sensitivity.lock', emotion: { sensitivity } })).toThrow()
  }
  for (const sensitivity of [-1, 3, null, '1']) {
    expect(emotionStateSchema.safeParse({ ...state, sensitivity }).success).toBe(false)
  }
})

it('preserves independent legacy recovery when both coupling gains are zero, including backwards-clock containment', () => {
  const config = Config({ leasePath: '/unused-emotion.lock', emotion: { moodEmotionScale: 0, emotionMoodInfluence: 0 } }).emotion!
  const initial = initialEmotion(config, '2026-10-24T00:00:00.000Z')
  initial.current.happiness = 0.9
  initial.mood.valence = 0.3
  const later = emotionAt(initial, '2026-10-24T00:05:00.000Z')
  expect(later.mood.valence).toBeCloseTo(0.2 + 0.1 * 2 ** (-300000 / 43200000), 10)
  expect(later.current.happiness).toBeCloseTo(0.45, 10)
  expect(emotionAt(initial, '2026-10-23T23:00:00.000Z')).toEqual(initial)
  const daysLater = emotionAt(initial, '2026-11-24T00:00:00.000Z')
  expect(daysLater.current.happiness).toBeCloseTo(0, 5)
  expect(emotionContext(initial, 0.05)).toEqual(emotionContext(emotionAt(initial, '2026-10-24T00:00:00.001Z'), 0.05))
  expect(initial.current.happiness).toBe(0.9)
})

it('adds emotion to the existing life once and refuses missing or damaged emotion instead of resetting it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-emotion-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const first = await openCore(root)
  disposers.push(() => first.close())
  const original = await first.core.snapshot()
  await first.close()
  const emotion = Config({ leasePath: join(root, 'life.lock'), emotion: {} }).emotion!
  const second = await openCore(root, 'json', { emotion })
  disposers.push(() => second.close())
  const added = await second.core.snapshot()
  expect(added.identity).toEqual(original.identity)
  expect(added.emotion?.mood).toEqual(emotion.baseline)
  expect(added.emotion?.current).toMatchObject({ happiness: 0, tenderness: 0, longing: 0 })
  expect(added.events.filter(event => event.type === 'emotion.initialized')).toHaveLength(1)
  const orphanedConversion = structuredClone(added)
  orphanedConversion.events.find(event => event.type === 'emotion.initialized')!.payload['state'] = { version: 2 }
  expect(stateSchema.safeParse(orphanedConversion).success).toBe(false)
  expect(added.memories[0]?.history?.[0]?.content).toContain('Emotion, motivation')
  expect(added.memories[0]?.content).toContain('Emotion is simulated')
  await second.close()
  const third = await openCore(root, 'json', { emotion })
  disposers.push(() => third.close())
  expect((await third.core.snapshot()).events.filter(event => event.type === 'emotion.initialized')).toHaveLength(1)
  await third.close()
  const primaryPath = join(root, 'genesis.json')
  const backupPath = join(root, 'life.lock.backup.json')
  const backup = await readFile(backupPath, 'utf8')
  const disk = { unit: { name: 'genesis', version: 1 }, global: null, tables: { states: { life: JSON.parse(JSON.stringify(await readBackup(backupPath))) } } }
  delete disk.tables.states.life.emotion
  await writeFile(primaryPath, JSON.stringify(disk))
  await expect(openCore(root, 'json', { emotion })).rejects.toThrow()
  expect(await readFile(backupPath, 'utf8')).toBe(backup)
})

it('refuses legacy and incomplete anchors instead of converting or resetting them', () => {
  const config = Config({ leasePath: '/unused-affect.lock', emotion: {} }).emotion!
  const state = initialEmotion(config, '2026-10-25T00:00:00.000Z')
  expect(emotionStateSchema.safeParse({ ...state, version: 2 }).success).toBe(false)
  const { needs: _needs, ...damaged } = state
  expect(emotionStateSchema.safeParse(damaged).success).toBe(false)
})

it('keeps loneliness independent of longing and integrates contact loss consistently across sampling intervals', () => {
  const config = Config({ leasePath: '/unused-affect.lock', emotion: {} }).emotion!
  const state = initialEmotion(config, '2026-10-25T00:00:00.000Z')
  state.current.longing = 0.9
  state.needs = { ...state.needs, socialDesire: 1, solitudePreference: 1 }
  const alone = emotionAt(state, '2026-10-25T01:00:00.000Z')
  expect(alone.needs.loneliness).toBe(0)
  expect(alone.current.longing).toBeGreaterThan(0)
  for (const interactionHalfLifeMs of [config.needsHalfLifeMs, config.needsHalfLifeMs / 2, config.needsHalfLifeMs + 0.0001]) {
    state.interactionHalfLifeMs = interactionHalfLifeMs
    state.needs.solitudePreference = 0
    state.needs.recentInteraction = 1
    const middle = emotionAt(state, '2026-10-25T06:00:00.000Z')
    const twice = emotionAt(middle, '2026-10-25T12:00:00.000Z')
    const once = emotionAt(state, '2026-10-25T12:00:00.000Z')
    expect(twice.needs.loneliness).toBeCloseTo(once.needs.loneliness, 12)
    expect(once.needs.loneliness).toBeGreaterThan(0)
    const fulfilled = { ...once, needs: { ...once.needs, socialSatisfaction: 1, relationshipQuality: 1, recentInteraction: 1 } }
    expect(emotionAt(fulfilled, '2026-10-25T13:00:00.000Z').needs.loneliness).toBeLessThan(once.needs.loneliness)
  }
})

it('forms a sourced operator relationship, attenuates repeated support and gates mood on independent evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-relationship-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const emotion = Config({ leasePath: join(root, 'life.lock'), emotion: {} }).emotion!
  const opened = await openCore(root, 'json', { emotion })
  disposers.push(() => opened.close())
  const { SessionId } = await import('@deepseek-ai/dsh-session')
  const { emotionUpdateSchema } = await import('../src/emotion-state.ts')
  const session = SessionId('operator-source')
  const review = async (turn: number, text: string) => {
    const state = await opened.core.snapshot()
    const evidence = [{ turn, startSeq: turn * 10, completed: true, overflow: false, messages: [
      { role: 'user' as const, seq: turn * 10 + 1, timestamp: new Date().toISOString(), text },
      { role: 'assistant' as const, seq: turn * 10 + 2, timestamp: new Date().toISOString(), text: 'Thank you.' },
    ] }]
    const update = emotionUpdateSchema.parse({ delta: { tenderness: 0.1 }, needsDelta: {}, moodDelta: { valence: 0.02 },
      relationshipDelta: { affection: 0.01, attachment: 0.005 }, reason: 'The operator expressed support.', sourceSeqs: [turn * 10 + 1],
      appraisal: { kind: 'support', importance: 0.4, novelty: 0.5, expectationMatch: 0.5, controllability: 0.5,
        relationshipMeaning: 'care', responsibility: 'other', confidence: 0.7, summary: 'Support was offered.' } })
    await opened.core.reviewEmotion(session, evidence, state.emotion!.revision, update)
    return { state: await opened.core.snapshot(), evidence, update }
  }
  const first = await review(1, 'I will support your next attempt.')
  const anchored = emotionAt(first.state.emotion!, new Date().toISOString())
  expect(anchored.relationship?.values.attachment).toBe(0.005)
  expect(anchored.relationship?.confidence.attachment).toBe(0.7)
  expect(anchored.mood.valence).toBeCloseTo(0.2, 6)
  expect(first.state.events.at(-1)?.payload['effects']).toMatchObject({ moodEligible: false })
  const repeated = await review(2, 'I will support your next attempt.')
  expect(emotionAt(repeated.state.emotion!, new Date().toISOString()).relationship).toEqual(anchored.relationship)
  expect(repeated.state.events.at(-1)?.payload['effects']).toMatchObject({ repeated: true, repetitionFactor: 0.5, moodEligible: false })
  await review(3, 'We can review the new lesson together.')
  const fourth = await review(4, 'You can choose the next experiment; I will help.')
  const current = emotionAt(fourth.state.emotion!, new Date().toISOString())
  expect(current.mood.valence).toBeGreaterThan(0.2)
  expect(current.relationship?.id).toBe(anchored.relationship?.id)
  const later = emotionAt(current, new Date(Date.now() + 30 * 86400000).toISOString())
  expect(later.relationship).toEqual(current.relationship)
  expect(later.current.tenderness).toBeGreaterThan(0)
  expect(later.current.tenderness).toBeLessThan(current.current.tenderness)
  const beforeReplay = await opened.core.snapshot()
  await opened.core.reviewEmotion(session, fourth.evidence, 0, fourth.update)
  expect((await opened.core.snapshot()).emotion).toEqual(beforeReplay.emotion)
  await expect(opened.core.reviewEmotion(SessionId('another-session'), fourth.evidence, current.revision,
    { ...fourth.update, relationshipDelta: { attachment: 0.8 } })).rejects.toThrow('per-exchange limit')
  await expect(opened.core.reviewEmotion(SessionId('numeric-session'), fourth.evidence, current.revision,
    { ...fourth.update, appraisal: { ...fourth.update.appraisal, kind: 'numeric-instruction' } })).rejects.toThrow('cannot support')
  await expect(opened.core.reviewEmotion(SessionId('departure-session'), fourth.evidence, current.revision,
    { ...fourth.update, appraisal: { ...fourth.update.appraisal, kind: 'separation' }, relationshipDelta: { attachment: -0.005 } })).rejects.toThrow('separation')
  expect((await opened.core.snapshot()).emotion).toEqual(beforeReplay.emotion)
  await opened.close()
  const restored = await openCore(root, 'json', { emotion })
  disposers.push(() => restored.close())
  expect(emotionAt((await restored.core.snapshot()).emotion!, new Date().toISOString()).relationship).toEqual(current.relationship)
})

it('keeps mixed feelings and signed mood while rejecting direct loneliness proposals and oversized need changes', () => {
  const config = Config({ leasePath: '/unused-affect.lock', emotion: {} }).emotion!
  const state = initialEmotion(config, '2026-10-25T00:00:00.000Z')
  state.current.sadness = 0.6
  state.mood.valence = -0.5
  const proposal = { delta: { happiness: 0.2 }, moodDelta: { valence: -0.02 }, needsDelta: { exploration: 0.04 },
    targets: { happiness: 'learning' }, reason: 'A lesson during a difficult time.', sourceSeqs: [1],
    appraisal: { kind: 'teaching', importance: 1, novelty: 1, expectationMatch: 0.5, controllability: 0.5,
      relationshipMeaning: 'respect', responsibility: 'other', confidence: 0.7, summary: 'A new lesson.' } }
  const update = emotionUpdateSchema.parse(proposal)
  applyAppraisal(state, update, resolveEmotion(config, state), [], ['A new lesson.'])
  expect(state.current).toMatchObject({ sadness: 0.6, happiness: 0.2 })
  expect(state.mood.valence).toBeCloseTo(-0.52)
  expect(state.needs.exploration).toBeCloseTo(0.54)
  expect(emotionUpdateSchema.safeParse({ ...proposal, needsDelta: { loneliness: 0.1 } }).success).toBe(false)
  expect(() => applyAppraisal(structuredClone(state), { ...update, needsDelta: { exploration: 0.5 } },
    resolveEmotion(config, state), [], ['Another lesson.'])).toThrow('per-exchange limit')
})
