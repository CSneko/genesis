import type { LifeGoalId } from '@deepseek-ai/dsh-experimental-genesis'
/** Persistent life choices use real storage; the model proposal is the only synthetic input. */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { LifeEventId } from '../src/model.ts'
import { deliberationPlanSchema, motivationStrength, type DeliberationPlan } from '../src/agency-state.ts'
import type { DeliberationCommit } from '../src/agency.ts'
import { Config } from '../src/config.ts'
import { stateSchema } from '../src/model.ts'
import { openCore } from './harness.ts'

const disposers: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
const factors = { motivation: 0.7, interest: 0.5, commitment: 0.6, emotion: 0.2, needs: 0.5,
  benefit: 0.8, cost: 0.2, risk: 0.1, urgency: 0.4, relationship: 0.5, context: 0.8 }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-agency-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const opened = await openCore(root, 'json', { deliberation: Config({ leasePath: join(root, 'life.lock'), deliberation: {} }).deliberation })
  disposers.push(() => opened.close())
  return { ...opened, root }
}
function proposal(source: LifeEventId): DeliberationPlan {
  return { motivations: [{ content: 'Understand my recorded capability changes', reason: 'The startup is an opportunity to review growth.',
    strength: 0.9, status: 'active', interestIds: [], memoryIds: [], sourceEventIds: [source] }],
  goals: [{ id: brandString<LifeGoalId>('review-capability-growth'), content: 'Review one capability change', reason: 'Ground my next choice in actual growth.', origin: 'autonomous',
    motivationIds: [], memoryIds: [], sourceEventIds: [source], priority: 0.6, status: 'active', nextAction: 'Read the recorded growth history.' }],
  candidates: [{ disposition: 'accept', action: 'Read one recorded change.', reason: 'A bounded review is useful.', factors,
    goalIds: [], motivationIds: [] }, { disposition: 'wait', action: 'Wait for more evidence.', reason: 'No urgent external action is needed.',
    factors: { ...factors, benefit: 0.1 }, goalIds: [], motivationIds: [] }], selected: 0, reason: 'Choose a small review grounded in recorded startup.' }
}
async function commitInput(opened: Awaited<ReturnType<typeof fixture>>, key: string): Promise<DeliberationCommit> {
  const state = await opened.core.snapshot()
  const source = state.events[0]!.id
  const trigger = await opened.core.prepareDeliberation(SessionId('agency-session'), key, 'event', source)
  return { key: `agency-session:${key}`, sessionId: SessionId('agency-session'), trigger: 'event', revision: state.agency!.revision,
    sourceEventIds: [trigger.id, source], memoryIds: [], interestIds: [], plan: proposal(source) }
}

it('persists sourced motivations and autonomous life goals, bounds strength, rejects forged evidence and restores the same choice', async () => {
  const opened = await fixture()
  const input = await commitInput(opened, 'growth-review')
  const choice = await opened.core.commitDeliberation(input)
  const state = await opened.core.snapshot()
  expect(state.agency!.motivations[0]!.strength).toBe(opened.config.deliberation!.maxStrengthDelta)
  expect(state.agency!.goals[0]!.origin).toBe('autonomous')
  expect(choice.goalIds).toEqual([state.agency!.goals[0]!.id])
  const legacy = JSON.stringify(state).replaceAll(state.agency!.goals[0]!.id, randomUUID())
  expect(stateSchema.safeParse(JSON.parse(legacy)).success).toBe(true)
  expect(await opened.core.commitDeliberation(input)).toEqual(choice)
  expect((await opened.core.snapshot()).agency).toEqual(state.agency)
  expect(await opened.core.reserveDecisionDispatch(choice.id)).toBe(true)
  expect(await opened.core.reserveDecisionDispatch(choice.id)).toBe(false)
  const invalid = await commitInput(opened, 'invalid-source')
  invalid.plan.motivations[0]!.sourceEventIds = [brandString<LifeEventId>('00000000-0000-4000-8000-000000000000')]
  await expect(opened.core.commitDeliberation(invalid)).rejects.toThrow('outside the selected context')
  const invalidState = structuredClone(await opened.core.snapshot())
  invalidState.agency!.decisions[0]!.sourceEventIds = [brandString<LifeEventId>('00000000-0000-4000-8000-000000000000')]
  expect(stateSchema.safeParse(invalidState).success).toBe(false)
  await opened.close()
  const reopened = await openCore(opened.root, 'json', { deliberation: opened.config.deliberation })
  disposers.push(() => reopened.close())
  expect((await reopened.core.snapshot()).identity).toEqual(state.identity)
  expect((await reopened.core.snapshot()).agency).toEqual(state.agency)
})

it('pauses, resumes, advances and completes goals only through observed linked execution, retaining failures and transition history', async () => {
  const opened = await fixture()
  const first = await opened.core.commitDeliberation(await commitInput(opened, 'first'))
  const goal = (await opened.core.snapshot()).agency!.goals[0]!
  const change = async (key: string, status: 'active' | 'paused' | 'abandoned') => {
    const input = await commitInput(opened, key)
    input.plan.motivations = []
    input.plan.goals = [{ id: goal.id, content: goal.content, reason: goal.reason, origin: goal.origin,
      motivationIds: goal.motivationIds, memoryIds: [], sourceEventIds: input.sourceEventIds, priority: goal.priority,
      status, nextAction: `${key}: revise the review strategy.` }]
    input.plan = deliberationPlanSchema.parse({ ...input.plan, goals: input.plan.goals.map(item => ({ ...item, failures: 999 })) })
    expect(input.plan.goals[0]).not.toHaveProperty('failures')
    input.plan.candidates[0]!.disposition = status === 'active' ? 'accept' : 'wait'
    input.plan.candidates[0]!.goalIds = [goal.id]
    return opened.core.commitDeliberation(input)
  }
  const failed = await opened.core.observe({ sessionId: SessionId('agency-session'), eventId: '11', kind: 'tool-result',
    timestamp: '2026-10-26T00:00:00.000Z', success: false })
  await opened.core.settleDecision(first.id, 'failed', [failed.id])
  expect((await opened.core.snapshot()).agency!.goals[0]!.failures).toBe(1)
  await change('pause', 'paused')
  const resumed = await change('resume', 'active')
  expect(opened.core.permitsDecision(resumed.id)).toBe(true)
  await expect(opened.core.completeLifeGoal(goal.id, resumed.id, failed.id)).rejects.toThrow('independently verified')
  await expect(opened.core.settleDecision(resumed.id, 'succeeded', [failed.id])).rejects.toThrow('successful tool result')
  const success = await opened.core.observe({ sessionId: SessionId('agency-session'), eventId: '12', kind: 'tool-result',
    timestamp: '2026-10-26T00:00:01.000Z', success: true })
  await opened.core.settleDecision(resumed.id, 'succeeded', [success.id])
  expect(opened.core.permitsDecision(resumed.id)).toBe(false)
  await opened.core.completeLifeGoal(goal.id, resumed.id, success.id)
  await opened.core.completeLifeGoal(goal.id, resumed.id, success.id)
  const current = (await opened.core.snapshot()).agency!.goals[0]!
  expect(current.history.map(item => item.status)).toEqual(['active', 'paused', 'active', 'completed'])
  expect(current.failures).toBe(1)
  expect((await opened.core.snapshot()).growth.some(item => item.title === 'Life goal completed')).toBe(true)
  await expect(change('reopen', 'active')).rejects.toThrow('Terminal goals')
  await opened.close()
  const restored = await openCore(opened.root, 'json', { deliberation: opened.config.deliberation })
  disposers.push(() => restored.close())
  expect((await restored.core.snapshot()).agency!.goals[0]).toEqual(current)
})

it('rejects completion text, stale revisions, invalid selections, arbitrary refusals and unknown event triggers', async () => {
  const opened = await fixture()
  const input = await commitInput(opened, 'validation')
  expect(deliberationPlanSchema.safeParse({ ...input.plan, goals: [{ ...input.plan.goals[0], status: 'completed' }] }).success).toBe(false)
  expect(deliberationPlanSchema.safeParse({ ...input.plan, goals: [{ ...input.plan.goals[0], failures: -1 }] }).success).toBe(false)
  expect(deliberationPlanSchema.safeParse({ ...input.plan, goals: [{ ...input.plan.goals[0], failures: '1' }] }).success).toBe(false)
  expect(deliberationPlanSchema.safeParse({ ...input.plan, goals: [{ ...input.plan.goals[0], unexpected: true }] }).success).toBe(false)
  for (const field of ['createdAt', 'updatedAt', 'currentStrength', 'permissions']) {
    expect(deliberationPlanSchema.safeParse({ ...input.plan,
      motivations: [{ ...input.plan.motivations[0], [field]: 1 }] }).success).toBe(false)
  }
  for (const field of ['motivations', 'goals'] as const) {
    for (const metadata of [{ createdAt: 'invalid-date' }, { updatedAt: 1 }, { history: [] }]) {
      expect(deliberationPlanSchema.safeParse({ ...input.plan, [field]: [{ ...input.plan[field][0], ...metadata }] }).success).toBe(false)
    }
  }
  expect(deliberationPlanSchema.safeParse({ ...input.plan, selected: 5 }).success).toBe(false)
  await expect(opened.core.prepareDeliberation(SessionId('agency-session'), 'bad-trigger', 'event',
    brandString<LifeEventId>('00000000-0000-4000-8000-000000000000'))).rejects.toThrow('existing life event')
  await opened.core.commitDeliberation(input)
  const next = await commitInput(opened, 'arbitrary')
  next.plan.goals = []; next.plan.motivations = []; next.plan.candidates[0]!.disposition = 'decline'
  await expect(opened.core.commitDeliberation(next)).rejects.toThrow('not arbitrary disagreement')
  await expect(opened.core.commitDeliberation({ ...next, revision: 0 })).rejects.toThrow('changed during deliberation')
  const motivation = (await opened.core.snapshot()).agency!.motivations[0]!
  const later = new Date(Date.parse(motivation.updatedAt) + 1000).toISOString()
  expect(motivationStrength(motivation, later, 1000)).toBe(motivation.strength / 2)
  expect(motivationStrength({ ...motivation, status: 'paused' }, later, 1000)).toBe(0)
})

it('keeps multiple life goals and abandons one without replacing another goal or its commitment', async () => {
  const opened = await fixture()
  await opened.core.commitDeliberation(await commitInput(opened, 'one'))
  const first = (await opened.core.snapshot()).agency!.goals[0]!
  const second = await commitInput(opened, 'two')
  second.plan.motivations = []
  second.plan.goals[0]!.id = brandString<LifeGoalId>('compare-capability-changes')
  second.plan.goals[0]!.content = 'Compare two recorded capability changes'
  second.plan.goals[0]!.motivationIds = first.motivationIds
  const choice = await opened.core.commitDeliberation(second)
  expect((await opened.core.snapshot()).agency!.goals.map(item => item.status)).toEqual(['active', 'active'])
  const abandon = await commitInput(opened, 'abandon-two')
  abandon.plan.motivations = []
  abandon.plan.goals = [{ ...second.plan.goals[0]!, id: choice.goalIds[0]!, status: 'abandoned',
    sourceEventIds: abandon.sourceEventIds, reason: 'The bounded comparison has no further value.' }]
  abandon.plan.candidates[0]!.disposition = 'wait'
  await opened.core.commitDeliberation(abandon)
  const goals = (await opened.core.snapshot()).agency!.goals
  expect(goals[0]).toEqual(first)
  expect(opened.core.permitsDecision(choice.id)).toBe(false)
  expect(goals[1]!.history.map(item => item.status)).toEqual(['active', 'abandoned'])
})

it('records operator goal adjustments with reasons, refuses stale edits and cannot mark goals complete', async () => {
  const opened = await fixture()
  const decision = await opened.core.commitDeliberation(await commitInput(opened, 'operator-review'))
  const initial = await opened.core.snapshot()
  const goal = initial.agency!.goals[0]!
  await opened.core.setLifeGoalStatus(goal.id, 'paused', initial.agency!.revision, 'Wait until resources are available.')
  const paused = await opened.core.snapshot()
  expect(paused.agency!.goals[0]!.history.at(-1)).toMatchObject({ actor: 'operator', status: 'paused' })
  expect(opened.core.permitsDecision(decision.id)).toBe(false)
  await expect(opened.core.setLifeGoalStatus(goal.id, 'active', initial.agency!.revision, 'Resume.')).rejects.toThrow('Refresh')
  expect(() => opened.core.setLifeGoalStatus(goal.id, 'active', paused.agency!.revision, ' ')).toThrow()
  await opened.core.setLifeGoalStatus(goal.id, 'active', paused.agency!.revision, 'Resources are now available.')
  expect((await opened.core.snapshot()).agency!.goals[0]!.status).toBe('active')
  expect((await opened.core.snapshot()).events.filter(event => event.type === 'goal.adjusted').map(event => event.source)).toEqual(['user', 'user'])
})
