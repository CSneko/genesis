/** Main-model plan edits share the atomic agency history without granting execution permission. @module */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { DeliberationConfig } from './config.ts'
import type { LifeState } from './model.ts'
import { applyDeliberation, type AgencyRecord } from './agency.ts'
import { readablePlanId, type DeliberationPlan, type LifeGoalId, type MotivationId } from './agency-state.ts'
import { GenesisError } from './error.ts'

const text = z.string().trim().min(1).max(800)
const common = { action: z.enum(['create', 'update']), id: z.string().min(1).max(80),
  revision: z.number().int().nonnegative(), content: text, reason: text }
/** Complete replacements for mutable plan fields; timestamps, sources and execution outcomes remain application-owned. */
export const planChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, id: common.id.transform(brandString<LifeGoalId>), kind: z.literal('goal'), origin: z.enum(['user', 'autonomous', 'event']),
    status: z.enum(['active', 'paused', 'abandoned']), priority: z.number().min(0).max(1), nextAction: text,
    motivationIds: z.array(z.string().min(1).max(80).transform(brandString<MotivationId>)).max(20) }),
  z.strictObject({ ...common, id: common.id.transform(brandString<MotivationId>), kind: z.literal('motivation'), status: z.enum(['active', 'paused', 'ended']),
    strength: z.number().min(0).max(1) }),
])
/** One explicit main-model edit, independent of tool transport and external model routes. */
export type PlanChange = z.infer<typeof planChangeSchema>

/**
 * Apply a sourced, revision-checked plan edit to a private life transaction.
 * @param state - Core-owned draft; failed validation is discarded by the owner.
 * @param change - Parsed main-model fields, including explicit create/update intent.
 * @param source - Actual calling Session and logged tool call, never model-supplied evidence.
 * @param config - Inventory and motivation-change limits.
 * @param record - Transaction-local append with agent attribution.
 * @returns Stable id and new revision, or the original receipt when the same call is replayed.
 */
export function applyPlanChange(state: LifeState, change: PlanChange, source: { sessionId: SessionId; callId: ToolCallId },
  config: DeliberationConfig, record: AgencyRecord): { id: PlanChange['id']; revision: number } {
  const agency = state.agency
  if (agency === undefined) throw new GenesisError('invalid-state', 'Enable deliberation before managing life plans.')
  const key = `plan-tool:${source.sessionId}:${source.callId}`
  const receipt = state.events.find(event => event.dedupKey === key)
  if (receipt !== undefined) {
    if (JSON.stringify(receipt.payload['change']) !== JSON.stringify(change)) {
      throw new GenesisError('invalid-source', 'This tool call already committed different plan fields. Inspect the current plan.')
    }
    return { id: change.id, revision: z.number().int().parse(receipt.payload['revision']) }
  }
  if (agency.revision !== change.revision) throw new GenesisError('configuration-conflict', 'Plans changed. List current plans and retry with their revision.')
  const existing = change.kind === 'goal' ? agency.goals.find(item => item.id === change.id)
    : agency.motivations.find(item => item.id === change.id)
  if (change.action === 'create') {
    readablePlanId.parse(change.id)
    if (existing !== undefined) throw new GenesisError('invalid-source', 'This plan id is reserved. Update the existing plan or choose a different descriptive id.')
  } else if (existing === undefined) throw new GenesisError('invalid-source', 'The plan is absent. List current plans before updating.')
  const event = record('decision.triggered', `plan-trigger:${source.sessionId}:${source.callId}`,
    { kind: 'main-model-tool', toolCallId: source.callId })
  const plan: DeliberationPlan = { motivations: [], goals: [], candidates: [{ disposition: 'wait',
    action: 'Record this plan change without starting execution.', reason: change.reason, goalIds: [], motivationIds: [],
    factors: { motivation: 0, interest: 0, commitment: 0, emotion: 0, needs: 0, benefit: 0,
      cost: 0, risk: 0, urgency: 0, relationship: 0, context: 0 } }], selected: 0, reason: change.reason }
  if (change.kind === 'goal') plan.goals.push({ id: brandString<LifeGoalId>(change.id), content: change.content,
    reason: change.reason, origin: change.origin, status: change.status, priority: change.priority, nextAction: change.nextAction,
    motivationIds: change.motivationIds, sourceEventIds: [event.id], memoryIds: [] })
  else plan.motivations.push({ id: brandString<MotivationId>(change.id), content: change.content, reason: change.reason,
    status: change.status, strength: change.strength, sourceEventIds: [event.id], memoryIds: [], interestIds: [] })
  applyDeliberation(state, { key, sessionId: source.sessionId, trigger: 'request', revision: change.revision,
    sourceEventIds: [event.id], memoryIds: [], interestIds: [], plan }, config, record)
  record('plan.edited', key, { change, revision: agency.revision, toolCallId: source.callId })
  return { id: change.id, revision: agency.revision }
}
