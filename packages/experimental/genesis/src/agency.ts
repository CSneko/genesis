/** Atomic agency projection changes; inference supplies explanations, never permissions. @module */
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { DeliberationConfig } from './config.ts'
import type { LifeEvent, LifeEventId, LifeState, MemoryId, InterestId } from './model.ts'
import { deliberationPlanSchema, readablePlanId, motivationStrength, type DeliberationPlan, type LifeDecision,
  type DecisionId, type MotivationId, type LifeGoalId } from './agency-state.ts'
import { GenesisError, InactiveLifeGoalsError } from './error.ts'

/** Evidence captured by the integration before an auxiliary call; not supplied by the model. */
export interface DeliberationCommit {
  purpose?: 'interaction'
  key: string
  sessionId: SessionId
  trigger: 'request' | 'event'
  revision: number
  sourceEventIds: LifeEventId[]
  memoryIds: MemoryId[]
  interestIds: InterestId[]
  plan: DeliberationPlan
}
/** Core-owned append operation; projection and evidence share one transaction. */
export type AgencyRecord = (type: string, key: string, payload: LifeEvent['payload']) => LifeEvent

/**
 * Validate sourced proposals and commit one choice; repeat keys return the original choice.
 * @param state - Private transaction draft.
 * @param commit - Captured evidence and untrusted model proposal.
 * @param config - Deployment bounds.
 * @param record - Transaction-local life event append.
 * @returns Durable decision candidate, published only after the owning transaction succeeds.
 */
export function applyDeliberation(state: LifeState, commit: DeliberationCommit, config: DeliberationConfig,
  record: AgencyRecord): LifeDecision {
  const agency = state.agency
  if (agency === undefined) throw new GenesisError('invalid-state', 'Deliberation is disabled. Enable deliberation and reload Genesis.')
  const previous = agency.decisions.find(item => item.key === commit.key)
  if (previous !== undefined) return previous
  if (agency.revision !== commit.revision) throw new GenesisError('configuration-conflict', 'Life goals changed during deliberation. Retrieve current state and deliberate again.')
  const plan = deliberationPlanSchema.parse(commit.plan)
  const now = new Date().toISOString()
  const id = brandString<DecisionId>(randomUUID())
  const sources = new Set(commit.sourceEventIds)
  if (!sources.size || commit.sourceEventIds.some(id => !state.events.some(event => event.id === id))) {
    throw new GenesisError('invalid-source', 'Deliberation needs recorded life evidence.')
  }
  const check = (eventIds: LifeEventId[], memoryIds: MemoryId[]) => {
    if (eventIds.some(id => !sources.has(id))
      || memoryIds.some(id => !commit.memoryIds.includes(id) || !state.memories.some(item => item.id === id))) {
      throw new GenesisError('invalid-source', 'Deliberation referenced evidence outside the selected context.')
    }
  }
  const changedMotivations: MotivationId[] = []
  for (const proposal of plan.motivations) {
    check(proposal.sourceEventIds, proposal.memoryIds)
    if (proposal.interestIds.some(id => !commit.interestIds.includes(id) || !state.interests?.some(item => item.id === id))) {
      throw new GenesisError('invalid-source', 'Motivation referenced an absent or unselected interest.')
    }
    const old = proposal.id === undefined ? undefined : agency.motivations.find(item => item.id === proposal.id)
    if (old === undefined && proposal.id !== undefined) readablePlanId.parse(proposal.id)
    if (old !== undefined && changedMotivations.includes(old.id)) throw new GenesisError('invalid-source', 'Motivation changed twice in one proposal.')
    if (old === undefined && agency.motivations.some(item => item.content.toLocaleLowerCase() === proposal.content.toLocaleLowerCase())) {
      throw new GenesisError('invalid-source', 'Update the existing motivation instead of duplicating it.')
    }
    const anchor = old === undefined ? 0 : motivationStrength(old, now, config.motivationHalfLifeMs)
    const strength = Math.max(0, Math.min(1, anchor + Math.max(-config.maxStrengthDelta,
      Math.min(config.maxStrengthDelta, proposal.strength - anchor))))
    const item = { ...proposal, id: old?.id ?? proposal.id ?? brandString<MotivationId>(randomUUID()), strength,
      createdAt: old?.createdAt ?? now, updatedAt: now }
    if (old === undefined) agency.motivations.push(item)
    else agency.motivations[agency.motivations.indexOf(old)] = item
    changedMotivations.push(item.id)
    record('motivation.changed', `motivation:${id}:${item.id}`, { before: old ?? null, after: item, decisionId: id })
  }
  const changedGoals: LifeGoalId[] = []
  for (const proposal of plan.goals) {
    check(proposal.sourceEventIds, proposal.memoryIds)
    const old = proposal.id === undefined ? undefined : agency.goals.find(item => item.id === proposal.id)
    if (old === undefined) readablePlanId.parse(proposal.id)
    if (old !== undefined && (['completed', 'abandoned'].includes(old.status) || changedGoals.includes(old.id))) {
      throw new GenesisError('invalid-source', 'Terminal goals are immutable and each goal may change once per deliberation.')
    }
    if (old !== undefined && (old.content !== proposal.content || old.origin !== proposal.origin)) {
      throw new GenesisError('invalid-source', 'Life goal content and origin are immutable. Propose a separate goal when changing direction.')
    }
    if (old === undefined && proposal.origin === 'user' && commit.trigger !== 'request') {
      throw new GenesisError('invalid-source', 'An event deliberation cannot invent a user assignment.')
    }
    if (old === undefined && agency.goals.some(item => item.content.toLocaleLowerCase() === proposal.content.toLocaleLowerCase())) {
      throw new GenesisError('invalid-source', 'Update the existing life goal instead of duplicating it.')
    }
    const motivationIds = proposal.motivationIds.length ? proposal.motivationIds : changedMotivations
    if (motivationIds.some(id => !agency.motivations.some(item => item.id === id))
      || (proposal.origin === 'autonomous' && !motivationIds.length)) throw new GenesisError('invalid-source', 'Autonomous goals require recorded motivations.')
    const item = { ...proposal, id: old?.id ?? brandString<LifeGoalId>(readablePlanId.parse(proposal.id)), motivationIds,
      createdAt: old?.createdAt ?? now, updatedAt: now, failures: old?.failures ?? 0,
      history: [...(old?.history ?? []), { timestamp: now, status: proposal.status, nextAction: proposal.nextAction,
        reason: proposal.reason, decisionId: id }] }
    if (old === undefined) agency.goals.push(item)
    else agency.goals[agency.goals.indexOf(old)] = item
    changedGoals.push(item.id)
    const { history: _history, ...after } = item
    record('goal.changed', `life-goal:${id}:${item.id}`, { previousStatus: old?.status ?? null, after, decisionId: id })
  }
  if (agency.motivations.length > config.maxMotivations || agency.goals.length > config.maxGoals) {
    throw new GenesisError('capacity', 'Life goal or motivation inventory is full. Increase the configured limit before retrying.')
  }
  for (const candidate of plan.candidates) {
    if (candidate.goalIds.some(id => !agency.goals.some(item => item.id === id))
      || candidate.motivationIds.some(id => !agency.motivations.some(item => item.id === id))) {
      throw new GenesisError('invalid-source', 'Candidate referenced an absent life goal or motivation.')
    }
  }
  const selected = plan.candidates[plan.selected]
  if (selected === undefined) throw new GenesisError('invalid-source', 'The selected candidate is absent.')
  const goalIds = selected.goalIds.length ? selected.goalIds : changedGoals.filter(id => agency.goals.some(item => item.id === id && item.status === 'active'))
  const motivationIds = selected.motivationIds.length ? selected.motivationIds : changedMotivations
  if (selected.disposition === 'accept' && commit.trigger === 'event' && commit.purpose !== 'interaction' && !goalIds.length) {
    throw new GenesisError('invalid-source', 'Autonomous execution requires an active life goal.')
  }
  if (selected.disposition === 'accept') {
    const inactive = goalIds.filter(id => !agency.goals.some(item => item.id === id && item.status === 'active'))
    if (inactive.length) throw new InactiveLifeGoalsError(inactive)
  }
  if (['decline', 'defer', 'negotiate'].includes(selected.disposition) && !goalIds.length && !motivationIds.length) {
    throw new GenesisError('invalid-source', 'A refusal or trade-off needs a recorded goal or motivation, not arbitrary disagreement.')
  }
  const decision: LifeDecision = { id, key: commit.key, sessionId: commit.sessionId, trigger: commit.trigger,
    ...(commit.purpose === undefined ? {} : { purpose: commit.purpose }),
    sourceEventIds: commit.sourceEventIds, createdAt: now, candidates: plan.candidates, selected: plan.selected,
    reason: plan.reason, goalIds, motivationIds, outcome: { status: selected.disposition === 'wait' ? 'waiting' : 'pending',
      sourceEventIds: [], recordedAt: now } }
  agency.decisions.push(decision)
  agency.revision++
  const { purpose, ...recorded } = decision
  record('decision.made', `decision:${id}`, { decision: { ...recorded, ...(purpose === undefined ? {} : { purpose }) } })
  return decision
}
