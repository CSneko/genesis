/** Versioned motivation, cross-Session goals and explainable decision records. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { LifeEventId, MemoryId, InterestId } from './model.ts'

/** Stable identifier of a persistent action inclination. */
export type MotivationId = Branded<'GenesisMotivationId'>
/** Stable identifier of a life goal, independent of Harness Session goals. */
export type LifeGoalId = Branded<'GenesisLifeGoalId'>
/** Stable identifier of one deliberation and its observed outcome. */
export type DecisionId = Branded<'GenesisDecisionId'>
/** Model-chosen names for new commitments; UUIDs remain readable only in existing records. */
export const readablePlanId = z.string().min(2).max(80)
  .regex(/^[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*$/u)
  .refine(value => /\p{L}/u.test(value) && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu.test(value) && !/^[a-f\d]{24,}$/iu.test(value),
    'Choose a descriptive name, not a UUID or opaque numeric/hex identifier')
const storedPlanId = z.union([z.uuid(), readablePlanId])
const motivationId = storedPlanId.transform(brandString<MotivationId>)
const goalId = storedPlanId.transform(brandString<LifeGoalId>)
const decisionId = z.uuid().transform(brandString<DecisionId>)
const text = z.string().trim().min(1).max(800)
const unit = z.number().min(0).max(1)
const time = z.iso.datetime()
const eventRefs = z.array(z.uuid().transform(brandString<LifeEventId>)).max(20)
const memoryRefs = z.array(z.uuid().transform(brandString<MemoryId>)).max(20)
const interestRefs = z.array(z.uuid().transform(brandString<InterestId>)).max(20)
const factors = z.strictObject({ motivation: unit, interest: unit, commitment: unit, emotion: unit,
  needs: unit, benefit: unit, cost: unit, risk: unit, urgency: unit, relationship: unit, context: unit })
const goalStatus = z.enum(['active', 'paused', 'completed', 'abandoned'])
const disposition = z.enum(['accept', 'negotiate', 'defer', 'decline', 'clarify', 'wait'])
const proposalTimes = { createdAt: time.optional(), updatedAt: time.optional() }
/** Untrusted proposals discard valid read-only timestamp and failure echoes; completion and permission changes remain forbidden. */
export const deliberationPlanSchema = z.strictObject({
  motivations: z.array(z.strictObject({ id: motivationId.optional(), content: text, reason: text, strength: unit,
    status: z.enum(['active', 'paused', 'ended']), interestIds: interestRefs, memoryIds: memoryRefs, sourceEventIds: eventRefs.min(1),
    ...proposalTimes,
  }).transform(({ createdAt: _createdAt, updatedAt: _updatedAt, ...proposal }) => proposal)).max(4),
  goals: z.array(z.strictObject({ id: goalId.optional(), content: text, reason: text,
    origin: z.enum(['autonomous', 'user', 'event']), motivationIds: z.array(motivationId).max(20),
    memoryIds: memoryRefs, sourceEventIds: eventRefs.min(1), priority: unit, status: z.enum(['active', 'paused', 'abandoned']),
    nextAction: text, failures: z.number().int().nonnegative().optional(), ...proposalTimes,
  }).transform(({ failures: _failures, createdAt: _createdAt, updatedAt: _updatedAt, ...proposal }) => proposal)).max(4),
  candidates: z.array(z.strictObject({ disposition, action: text, reason: text, factors,
    goalIds: z.array(goalId).max(20).describe('For accept, link only active goals from the supplied context. Never link a paused or terminal goal to accepted execution.'),
    motivationIds: z.array(motivationId).max(20) })).min(1).max(6),
  selected: z.number().int().min(0).max(5), reason: text,
}).refine(plan => plan.selected < plan.candidates.length, 'Selected candidate is absent')
/** Validated model proposal; all references are checked against the supplied evidence before commit. */
export type DeliberationPlan = z.infer<typeof deliberationPlanSchema>
/** Persistent projection with append-only decisions and goal transition histories. */
export const agencySchema = z.strictObject({
  version: z.literal(1), revision: z.number().int().nonnegative(),
  motivations: z.array(z.strictObject({ id: motivationId, content: text, reason: text, strength: unit,
    status: z.enum(['active', 'paused', 'ended']), createdAt: time, updatedAt: time,
    interestIds: interestRefs, memoryIds: memoryRefs, sourceEventIds: eventRefs.min(1) })),
  goals: z.array(z.strictObject({ id: goalId, content: text, reason: text, origin: z.enum(['autonomous', 'user', 'event']),
    motivationIds: z.array(motivationId).max(20), memoryIds: memoryRefs, sourceEventIds: eventRefs.min(1), priority: unit,
    status: goalStatus, nextAction: text, createdAt: time, updatedAt: time, failures: z.number().int().nonnegative(),
    history: z.array(z.strictObject({ actor: z.enum(['agent', 'operator', 'application']).optional(), timestamp: time, status: goalStatus, nextAction: text, reason: text, decisionId })).min(1) })),
  decisions: z.array(z.strictObject({ id: decisionId, key: z.string().min(1).max(300),
    sessionId: z.string().min(1).transform(brandString<SessionId>),
    trigger: z.enum(['request', 'event']), purpose: z.literal('interaction').optional(), sourceEventIds: eventRefs.min(1), createdAt: time,
    candidates: deliberationPlanSchema.shape.candidates, selected: z.number().int().min(0).max(5), reason: text,
    goalIds: z.array(goalId), motivationIds: z.array(motivationId),
    outcome: z.strictObject({ status: z.enum(['pending', 'responded', 'succeeded', 'failed', 'interrupted', 'waiting']),
      sourceEventIds: eventRefs, recordedAt: time }),
  }).refine(item => item.selected < item.candidates.length, 'Missing chosen action')),
})
/** Detached persistent agency state. */
export type AgencyState = z.infer<typeof agencySchema>
/** One committed choice with observed results; reasons are summaries, never private reasoning. */
export type LifeDecision = AgencyState['decisions'][number]
/** One retained life goal with its complete transition history. */
export type LifeGoal = AgencyState['goals'][number]
/** One experience-grounded current motivation. */
export type LifeMotivation = AgencyState['motivations'][number]

/**
 * Read decayed action inclination without mutating its last recorded anchor.
 * @param item - Persistent motivation anchor.
 * @param now - Explicit evaluation instant.
 * @param halfLifeMs - Deployment-owned half-life.
 * @returns Strength in [0, 1]; paused and ended inclinations exert no current pressure.
 */
export function motivationStrength(item: LifeMotivation, now: string, halfLifeMs: number): number {
  return item.status !== 'active' ? 0 : item.strength * 2 ** (-Math.max(0, Date.parse(now) - Date.parse(item.updatedAt)) / halfLifeMs)
}
