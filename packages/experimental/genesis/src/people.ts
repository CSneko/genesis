/** Evidence-checked person appraisals inside the existing atomic life transaction. @module */
import { randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Config } from './config.ts'
import type { LifeState, LifeEventId } from './model.ts'
import type { EmotionDialogue } from './emotion-projection.ts'
import type { EmotionState, EmotionUpdate, EmotionSettings } from './emotion-state.ts'
import type { RelationshipId } from './relationship-state.ts'
import { applyAppraisal } from './emotion-appraisal.ts'
import { GenesisError } from './error.ts'

/**
 * Apply per-person proposals only to their real current speakers; neutral strangers remain unretained.
 * @param state - Detached transaction state.
 * @param sessionId - Source Session.
 * @param current - Actual current exchange with authenticated speaker metadata.
 * @param update - Parsed model proposal; bounds are deployment-owned.
 * @param after - Current global emotional anchor, whose relationship remains unchanged here.
 * @param settings - Resolved emotion policy.
 * @param config - Per-person capacity and complete state budgets.
 * @param sources - Life event IDs indexed by cited Session message sequence.
 * @returns Detached applied changes suitable for the immutable appraisal event.
 */
export function applyPeople(state: LifeState, sessionId: SessionId, current: EmotionDialogue['turns'][number],
  update: EmotionUpdate, after: EmotionState, settings: EmotionSettings, config: Config['people'], sources: Map<number, LifeEventId>): object[] {
  const people = state.people
  const proposals = update.relationships ?? []
  if (proposals.length === 0) return []
  if (people === undefined || !people.conversations.some(item => item.sessionId === sessionId)) {
    throw new GenesisError('invalid-source', 'Per-person relationships require an authenticated conversation.')
  }
  if (proposals.length > config.maxChanges || new Set(proposals.map(item => item.personId)).size !== proposals.length) {
    throw new GenesisError('capacity', 'Too many or duplicate person appraisals. No relationship changes were applied.')
  }
  return proposals.map((proposal) => {
    const cited = current.messages.filter(message => proposal.sourceSeqs.includes(message.seq))
    const speakers = cited.filter(message => message.role === 'user' && message.participant?.personId === proposal.personId)
    if (new Set(proposal.sourceSeqs).size !== proposal.sourceSeqs.length || cited.length !== proposal.sourceSeqs.length
      || speakers.length === 0 || cited.some(message => message.role === 'user' && message.participant?.personId !== proposal.personId)) {
      throw new GenesisError('invalid-source', 'A relationship change must cite this person speaking in the current exchange, not a mention, quotation or another speaker.')
    }
    const source = speakers.at(-1)?.participant
    if (source === undefined) throw new GenesisError('invalid-source', 'The relationship author is unavailable.')
    const prior = people.people.find(person => person.id === proposal.personId)
    const legacy = prior === undefined && source.personId === people.operatorPersonId ? state.emotion?.relationship : undefined
    const initial = { id: legacy?.id ?? brandString<RelationshipId>(randomUUID()), scope: 'operator' as const, label: source.name,
      values: legacy?.values ?? { affection: 0, trust: 0.5, attachment: 0, familiarity: 0, feltSecurity: 0.5 },
      confidence: legacy?.confidence ?? { affection: 0, trust: 0, attachment: 0, familiarity: 0, feltSecurity: 0 },
      origins: legacy?.origins ?? { affection: 'unknown' as const, trust: 'unknown' as const, attachment: 'unknown' as const,
        familiarity: 'unknown' as const, feltSecurity: 'unknown' as const }, updatedAt: after.updatedAt }
    const anchor = structuredClone({ ...after, relationship: prior === undefined ? initial : { ...prior.relationship, scope: 'operator' as const } })
    const history = state.events.filter(event => event.type === 'emotion.reviewed'
      && Array.isArray(event.payload['people']) && event.payload['people'].some(item => item !== null && typeof item === 'object'
        && !Array.isArray(item) && item['personId'] === source.personId)).map((event) => {
      const item = Array.isArray(event.payload['people']) ? event.payload['people'].find(item => item !== null && typeof item === 'object'
        && !Array.isArray(item) && item['personId'] === source.personId) : undefined
      return { ...event, payload: item !== null && typeof item === 'object' && !Array.isArray(item) ? item : {} }
    })
    const applied = applyAppraisal(anchor, { delta: {}, moodDelta: {}, needsDelta: {},
      relationshipDelta: proposal.delta, appraisal: proposal.appraisal, reason: proposal.reason, sourceSeqs: proposal.sourceSeqs },
    settings, history, speakers.map(message => message.text))
    const meaningful = Object.values(applied.effects.relationship).some(value => value !== 0)
    if (meaningful) {
      if (prior === undefined && people.people.length >= config.maxPeople) throw new GenesisError('capacity', 'Person inventory is full. Increase people.maxPeople or delete an existing profile before retrying.')
      const sourceEventIds = [...new Set([...(prior?.sourceEventIds ?? []), ...proposal.sourceSeqs.map((seq) => {
        const id = sources.get(seq)
        if (id === undefined) throw new GenesisError('invalid-source', 'Person appraisal has an uncommitted source.')
        return id
      })])]
      if (sourceEventIds.length > config.maxEvidence) throw new GenesisError('capacity', 'Person evidence is full. Increase people.maxEvidence before recording more relationship changes.')
      const profile = { id: source.personId, platform: source.platform, accountId: source.accountId, name: source.name,
        relationship: { ...anchor.relationship, scope: 'person' as const, personId: source.personId }, updatedAt: after.updatedAt, sourceEventIds }
      if (prior === undefined) people.people.push(profile)
      else people.people[people.people.indexOf(prior)] = profile
    }
    return { personId: source.personId, ...applied, appraisal: proposal.appraisal, reason: proposal.reason,
      sourceEventIds: proposal.sourceSeqs.map(seq => sources.get(seq)) }
  })
}
