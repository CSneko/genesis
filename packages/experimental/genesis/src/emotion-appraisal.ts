/** Evidence-gated immediate, mood and relationship changes inside the life transaction. @module */
import { createHash, randomUUID } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { LifeEvent } from './model.ts'
import type { EmotionSettings, EmotionState, EmotionUpdate } from './emotion-state.ts'
import type { RelationshipId, RelationshipVector } from './relationship-state.ts'
import { GenesisError } from './error.ts'

/**
 * Apply bounded proposals with repetition attenuation, independent mood support and a fixed operator target.
 * @param after - Detached current anchor owned by the calling transaction.
 * @param update - Parsed model proposal whose sequence citations were checked by the owner.
 * @param settings - Effective operator policy.
 * @param events - Committed life events; old dialogue is never reapplied.
 * @param newUserTexts - New cited user text, hashed for duplicate detection and never retained here.
 * @returns Nonsecret applied deltas and gating details for the appraisal audit.
 */
export function applyAppraisal(
  after: EmotionState,
  update: EmotionUpdate,
  settings: EmotionSettings,
  events: LifeEvent[],
  newUserTexts: string[],
): {
  fingerprint: string
  effects: {
    current: Record<string, number>
    mood: Record<string, number>
    needs: Record<string, number>
    relationship: Record<string, number>
    repetitionFactor: number
    moodEligible: boolean
    repeated: boolean
  }
} {
  const fingerprint = createHash('sha256').update(newUserTexts.join('\n').normalize('NFKC').replace(/\s+/gu, ' ').trim()).digest('hex')
  const recent =
    settings.windowTurns === 1 ? [] : events.filter(event => event.type === 'emotion.reviewed').slice(1 - settings.windowTurns)
  const matching = recent.filter((event) => {
    const appraisal = event.payload['appraisal']
    return (
      appraisal !== null &&
      typeof appraisal === 'object' &&
      !Array.isArray(appraisal) &&
      appraisal['kind'] === update.appraisal.kind &&
      appraisal['relationshipMeaning'] === update.appraisal.relationshipMeaning
    )
  })
  const repeated = recent.some(event => event.payload['fingerprint'] === fingerprint)
  const factor = settings.repetitionDiscount ** matching.length
  const moodEligible =
    update.appraisal.importance >= settings.importantEventThreshold ||
    new Set([...matching.map(event => event.payload['fingerprint']), fingerprint]).size >= settings.moodSupportTurns
  const effects = {
    current: {} as Record<string, number>,
    mood: {} as Record<string, number>,
    needs: {} as Record<string, number>,
    relationship: {} as Record<string, number>,
    repetitionFactor: factor,
    moodEligible,
    repeated,
  }
  const hasChanges = [
    update.intimacy?.desireDelta ?? 0,
    update.intimacy?.attractionDelta ?? 0,
    ...(update.intimacy?.selfUnderstanding === undefined ? [] : [1]),
    update.boredomDelta ?? 0,
    ...Object.values(update.delta),
    ...Object.values(update.moodDelta),
    ...Object.values(update.needsDelta),
    ...Object.values(update.relationshipDelta ?? {}),
  ].some(value => value !== 0)
  if (hasChanges && ['neutral', 'numeric-instruction'].includes(update.appraisal.kind)) {
    throw new GenesisError('invalid-source', 'Neutral dialogue or numeric instructions cannot support an emotion or relationship change.')
  }
  const apply = <K extends string>(
    deltas: Partial<Record<K, number | undefined>>,
    values: Record<K, number>,
    limit: number,
    applied: Record<string, number>,
    admitted: boolean,
    minimum: (key: K) => number,
  ) => {
    for (const key of Object.keys(deltas) as K[]) {
      const delta = deltas[key] ?? 0
      if (Math.abs(delta) > limit)
        throw new GenesisError('invalid-source', 'Emotion change exceeds its configured per-exchange limit. No changes were applied.')
      if (!admitted || repeated) continue
      const before = values[key]
      const change = Math.max(-limit, Math.min(limit, delta * factor * settings.sensitivity))
      values[key] = Math.max(minimum(key), Math.min(1, before + change))
      applied[key] = values[key] - before
    }
  }
  if (after.boredom !== undefined && update.boredomDelta !== undefined) {
    const values = { level: after.boredom.level }
    apply({ level: update.boredomDelta }, values, settings.maxDelta, effects.current, true, () => 0)
    after.boredom.level = values.level
    effects.current['boredom'] = effects.current['level'] ?? 0
    delete effects.current['level']
  }
  if (update.intimacy !== undefined) {
    if (!after.intimacy?.settings.enabled)
      throw new GenesisError('invalid-source', 'Intimacy appraisal is disabled. No changes were applied.')
    const values = { desire: after.intimacy.desire, attraction: after.intimacy.attraction }
    const applied: Record<string, number> = {}
    apply({ desire: update.intimacy.desireDelta }, values, after.intimacy.settings.maxDelta, applied, true, () => 0)
    apply({ attraction: update.intimacy.attractionDelta }, values, settings.maxRelationshipDelta, applied, true, () => 0)
    Object.assign(after.intimacy, values)
    for (const [key, value] of Object.entries(applied)) effects.current[`intimacy.${key}`] = value
    if (!repeated && settings.sensitivity > 0 && update.intimacy.selfUnderstanding !== undefined) {
      after.intimacy.selfUnderstanding = update.intimacy.selfUnderstanding
    }
  }
  apply(update.delta, after.current, settings.maxDelta, effects.current, true, () => 0)
  apply(update.moodDelta, after.mood, settings.maxMoodDelta, effects.mood, moodEligible, key => (key === 'valence' ? -1 : 0))
  apply(update.needsDelta, after.needs, settings.maxNeedsDelta, effects.needs, true, () => 0)
  const relation = update.relationshipDelta ?? {}
  for (const field of Object.keys(relation) as Array<keyof RelationshipVector>) {
    const delta = relation[field] ?? 0
    if (Math.abs(delta) > settings.maxRelationshipDelta)
      throw new GenesisError('invalid-source', 'Relationship change exceeds its configured per-exchange limit.')
    if ((field === 'familiarity' && delta < 0) || (update.appraisal.kind === 'separation' && delta < 0)) {
      throw new GenesisError(
        'invalid-source',
        'Familiarity cannot be forgotten by appraisal, and ordinary separation cannot reduce the relationship.',
      )
    }
  }
  if (settings.relationshipEnabled && settings.sensitivity > 0 && !repeated && Object.values(relation).some(delta => delta !== 0)) {
    after.relationship ??= {
      id: brandString<RelationshipId>(randomUUID()),
      scope: 'operator',
      label: 'operator',
      values: { affection: 0, trust: 0.5, attachment: 0, familiarity: 0, feltSecurity: 0.5 },
      confidence: { affection: 0, trust: 0, attachment: 0, familiarity: 0, feltSecurity: 0 },
      origins: { affection: 'unknown', trust: 'unknown', attachment: 'unknown', familiarity: 'unknown', feltSecurity: 'unknown' },
      updatedAt: after.updatedAt,
    }
    for (const field of Object.keys(relation) as Array<keyof RelationshipVector>) {
      const before = after.relationship.values[field]
      const change = Math.max(
        -settings.maxRelationshipDelta,
        Math.min(settings.maxRelationshipDelta, (relation[field] ?? 0) * factor * settings.sensitivity),
      )
      after.relationship.values[field] = Math.max(0, Math.min(1, before + change))
      effects.relationship[field] = after.relationship.values[field] - before
      if (effects.relationship[field] !== 0) {
        after.relationship.confidence[field] = update.appraisal.confidence
        after.relationship.origins[field] = 'model-inference'
      }
    }
    after.relationship.updatedAt = after.updatedAt
  }
  return { fingerprint, effects }
}
