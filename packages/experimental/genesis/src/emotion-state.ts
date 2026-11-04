/** Three-layer affect state, bounded proposals and elapsed-time recovery. @module */
import { z } from 'zod'
import type { EmotionConfig } from './config.ts'
import { personIdSchema } from './people-model.ts'
import { relationshipSchema, appraisalSchema, relationshipDeltaSchema } from './relationship-state.ts'
import { evolveAffect } from './affect-dynamics.ts'

const intensity = z.number().min(0).max(1)
const duration = z.number().min(1000).max(31536000000)
const signed = z.number().min(-1).max(1).optional()
/** Nine independent immediate intensities; mixed feelings need not sum to one. */
export const emotionCurrentSchema = z.strictObject({ happiness: intensity, sadness: intensity, anger: intensity,
  fear: intensity, tenderness: intensity, gratitude: intensity, longing: intensity, frustration: intensity, disappointment: intensity })
/** Nine immediate feelings, separate from mood and needs. */
export type EmotionCurrent = z.infer<typeof emotionCurrentSchema>
/** Two continuous long-term mood dimensions. */
export const moodSchema = z.strictObject({ valence: z.number().min(-1).max(1), arousal: intensity })
/** Valence ranges from negative to positive; arousal measures activation. */
export type Mood = z.infer<typeof moodSchema>
/** Independent needs and social evidence; loneliness is a gradual projection, never a writer delta. */
export const needsSchema = z.strictObject({ socialDesire: intensity, socialSatisfaction: intensity,
  relationshipQuality: intensity, recentInteraction: intensity, solitudePreference: intensity,
  exploration: intensity, autonomy: intensity, creativity: intensity, loneliness: intensity })
/** Persistent inclinations and fulfillment estimates; longing has its own immediate field. */
export type Needs = z.infer<typeof needsSchema>
/** Recovery half-lives for immediate feelings, in milliseconds. */
export const emotionHalfLivesSchema = z.strictObject({ happiness: duration, sadness: duration, anger: duration,
  fear: duration, tenderness: duration, gratitude: duration, longing: duration, frustration: duration, disappointment: duration })
/** Per-emotion decay durations. */
export type EmotionHalfLives = z.infer<typeof emotionHalfLivesSchema>
/** Slow recovery durations for the two mood dimensions. */
export const moodHalfLivesSchema = z.strictObject({ valence: duration, arousal: duration })
/** Mood recovery durations in milliseconds. */
export type MoodHalfLives = z.infer<typeof moodHalfLivesSchema>
/** Maximum retained dialogue exchanges. */
export const MAX_EMOTION_WINDOW_TURNS = 12
/** Operator policy, persisted on the same revision as the current state. */
export const emotionControlsSchema = z.strictObject({ enabled: z.boolean(),
  windowTurns: z.number().int().min(1).max(MAX_EMOTION_WINDOW_TURNS), maxDelta: intensity, maxMoodDelta: intensity,
  maxNeedsDelta: intensity, contextStep: z.number().min(0.001).max(1), relationshipEnabled: z.boolean(),
  maxRelationshipDelta: intensity, moodSupportTurns: z.number().int().min(1).max(12),
  importantEventThreshold: intensity, repetitionDiscount: intensity })
const recoverySchema = z.strictObject({ sensitivity: z.number().min(0).max(2), baseline: moodSchema,
  shortHalfLifeMs: emotionHalfLivesSchema, moodHalfLifeMs: moodHalfLivesSchema,
  needsHalfLifeMs: duration, interactionHalfLifeMs: duration,
  offlineChanges: z.boolean().optional(), moodEmotionScale: intensity.optional(),
  emotionMoodInfluence: z.number().min(0).max(0.5).optional() })
/** Complete operator settings; mood recovery cannot be faster than any immediate feeling. */
export const emotionSettingsSchema = emotionControlsSchema.extend(recoverySchema.shape).extend({
  offlineChanges: z.boolean(), moodEmotionScale: intensity, emotionMoodInfluence: z.number().min(0).max(0.5),
}).superRefine((settings, context) => {
  if (Math.min(...Object.values(settings.moodHalfLifeMs)) < Math.max(...Object.values(settings.shortHalfLifeMs))) {
    context.addIssue({ code: 'custom', path: ['moodHalfLifeMs'], message: 'Mood recovery must be slower than immediate emotion recovery.' })
  }
})
/** Validated recovery and appraisal settings. */
export type EmotionSettings = z.infer<typeof emotionSettingsSchema>
/** Explicit operator replacement with an attributed audit reason. */
export const emotionAdjustmentSchema = z.strictObject({ current: emotionCurrentSchema, mood: moodSchema,
  needs: needsSchema, reason: z.string().trim().min(1).max(1000) })
/** Absolute state adjustment; it never counts as a new experience. */
export type EmotionAdjustment = z.infer<typeof emotionAdjustmentSchema>
/** Version-three anchors accept either all evolution fields or the legacy independent-recovery representation. */
export const emotionStateSchema = recoverySchema.extend({ version: z.literal(3), revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(), controls: emotionControlsSchema.optional(), current: emotionCurrentSchema, mood: moodSchema,
  needs: needsSchema, relationship: relationshipSchema.nullable() }).refine((state) => {
  const present = [state.offlineChanges, state.moodEmotionScale, state.emotionMoodInfluence].filter(value => value !== undefined).length
  return present === 0 || present === 3
}, 'Evolution settings must be present together')
/** Durable state; historical event payloads retain their original representation. */
export type EmotionState = z.infer<typeof emotionStateSchema>
/** Strict currently supported anchor. */
export type StoredEmotionState = EmotionState
/** Model proposals carry cited evidence and optional object attribution. */
export const emotionUpdateSchema = z.strictObject({
  delta: z.strictObject({ happiness: signed, sadness: signed, anger: signed, fear: signed, tenderness: signed,
    gratitude: signed, longing: signed, frustration: signed, disappointment: signed }),
  moodDelta: z.strictObject({ valence: signed, arousal: signed }),
  needsDelta: z.strictObject({ socialDesire: signed, socialSatisfaction: signed, relationshipQuality: signed,
    recentInteraction: signed, solitudePreference: signed, exploration: signed, autonomy: signed, creativity: signed }),
  targets: z.partialRecord(z.enum(['happiness', 'sadness', 'anger', 'fear', 'tenderness', 'gratitude', 'longing', 'frustration', 'disappointment']),
    z.string().trim().min(1).max(200)).optional(),
  relationships: z.array(z.strictObject({ personId: personIdSchema, delta: relationshipDeltaSchema,
    sourceSeqs: z.array(z.number().int().nonnegative()).min(1).max(100),
    appraisal: appraisalSchema, reason: z.string().trim().min(1).max(1000) })).optional(),
  appraisal: appraisalSchema, relationshipDelta: relationshipDeltaSchema.optional(),
  reason: z.string().trim().min(1).max(1000), sourceSeqs: z.array(z.number().int().nonnegative()).min(1).max(100),
})
/** Attributed model interpretation; never an established psychological fact. */
export type EmotionUpdate = z.infer<typeof emotionUpdateSchema>

/**
 * Calculate desired loneliness from connection gap, quality, contact and solitude preference.
 * @param needs - Current social inclinations and evidence estimates.
 * @returns Zero-to-one target, independent of object-directed longing.
 */
export function lonelinessTarget(needs: Needs): number {
  return needs.socialDesire * (1 - needs.solitudePreference)
    * ((1 - needs.socialSatisfaction) * 0.5 + (1 - needs.relationshipQuality) * 0.3 + (1 - needs.recentInteraction) * 0.2)
}

/**
 * Recover feelings quickly, mood slowly and loneliness continuously without inventing offline events.
 * @param state - Committed recovery anchor; LifeCore rebases excluded stopped intervals before sampling.
 * @param now - Observation time; backwards clocks leave the anchor unchanged.
 * @returns Detached sampled state; no model call or durable mutation occurs.
 */
export function emotionAt(state: EmotionState, now: string): EmotionState {
  const result = structuredClone(state)
  const duration = Math.max(0, Date.parse(now) - Date.parse(state.updatedAt))
  const elapsed = duration * state.sensitivity
  Object.assign(result, evolveAffect(state, elapsed))
  // Exact integration preserves the result when observation intervals are subdivided.
  const a = Math.LN2 / state.needsHalfLifeMs
  const b = Math.LN2 / state.interactionHalfLifeMs
  const p = 2 ** (-elapsed / state.needsHalfLifeMs)
  const q = 2 ** (-elapsed / state.interactionHalfLifeMs)
  const contactWeight = state.needs.socialDesire * (1 - state.needs.solitudePreference) * 0.2
  const targetWithoutContact = lonelinessTarget({ ...state.needs, recentInteraction: 0 })
  const rateDifference = a - b
  const integral = a === b ? a * elapsed * p : a > b
    ? a * q * -Math.expm1(-rateDifference * elapsed) / rateDifference
    : a * p * Math.expm1(rateDifference * elapsed) / rateDifference
  result.needs.recentInteraction *= q
  result.needs.loneliness = Math.max(0, Math.min(1, state.needs.loneliness * p
    + targetWithoutContact * (1 - p) - contactWeight * state.needs.recentInteraction * integral))
  if (duration > 0) result.updatedAt = now
  return result
}

/**
 * Initialize affect layers without changing life identity.
 * @param config - Resolved deployment settings.
 * @param now - Birth time of this projection.
 * @returns Strict version-three state.
 */
export function initialEmotion(config: EmotionConfig, now: string): EmotionState {
  return { version: 3, revision: 0, updatedAt: now, sensitivity: config.sensitivity,
    offlineChanges: config.offlineChanges, moodEmotionScale: config.moodEmotionScale, emotionMoodInfluence: config.emotionMoodInfluence,
    current: { happiness: 0, sadness: 0, anger: 0, fear: 0, tenderness: 0, gratitude: 0, longing: 0, frustration: 0, disappointment: 0 },
    mood: { ...config.baseline }, baseline: { ...config.baseline }, needs: { ...config.initialNeeds },
    shortHalfLifeMs: { ...config.shortHalfLifeMs }, moodHalfLifeMs: { ...config.moodHalfLifeMs },
    needsHalfLifeMs: config.needsHalfLifeMs, interactionHalfLifeMs: config.interactionHalfLifeMs, relationship: null }
}

/**
 * Describe affect in stable degree bands, ranking only by those displayed bands.
 * @param state - Recovered current state.
 * @param step - Numerical resolution before degree mapping; storage retains full precision.
 * @returns Qualitative feelings, mood, needs and relationship estimates; no permissions are granted.
 */
export function emotionContext(state: EmotionState, step: number): string {
  const quantize = (value: number) => Math.max(0, Math.min(1, Math.round(Math.abs(value) / step) * step))
  const level = (value: number) => {
    const magnitude = quantize(value)
    return magnitude < 0.1 ? 0 : magnitude < 0.35 ? 1 : magnitude < 0.65 ? 2 : magnitude < 0.85 ? 3 : 4
  }
  const degree = (value: number) => ['negligible', 'mild', 'moderate', 'strong', 'very strong'][level(value)]!
  const valence = level(state.mood.valence) === 0 ? 'neutral'
    : `${degree(state.mood.valence)} ${state.mood.valence < 0 ? 'negative' : 'positive'}`
  const ranked = (vector: Record<string, number>) => Object.entries(vector)
    .sort((a, b) => level(b[1]) - level(a[1]))
  const describe = (entries: Array<[string, number]>) => entries.map(([name, value]) => `${name} ${degree(value)}`).join('; ')
  const feelings = ranked(state.current)
  const priorities = ranked({ connection: lonelinessTarget(state.needs), exploration: state.needs.exploration,
    autonomy: state.needs.autonomy, creativity: state.needs.creativity,
    caution: Math.max(state.current.fear, state.current.frustration * (1 - state.mood.arousal)) })
  const salient = [...feelings, ['mood valence', state.mood.valence] as [string, number],
    ['loneliness', state.needs.loneliness] as [string, number]]
    .sort((a, b) => level(b[1]) - level(a[1]))
  const foreground = [...salient.slice(0, 1), ...priorities.slice(0, 1).map(([name, value]): [string, number] => [`inclination toward ${name}`, value])]
    .filter(([, value]) => level(value) !== 0).sort((a, b) => level(b[1]) - level(a[1]))
  const lines = [
    `Most salient now: ${foreground.length ? foreground.map(([name, value]) => `${name} ${name === 'mood valence' ? valence : degree(value)}`).join('; ') : 'no pronounced feeling or action inclination'}.`,
    `Immediate feelings, strongest first: ${describe(feelings)}.`,
    `Action inclinations, strongest first: ${describe(priorities)}.`,
    `Longer-term mood: valence ${valence}; arousal ${degree(state.mood.arousal)}.`,
    `Needs and fulfillment: ${describe(ranked({ 'desire for contact': state.needs.socialDesire,
      'social satisfaction': state.needs.socialSatisfaction, 'relationship quality': state.needs.relationshipQuality,
      'recent contact': state.needs.recentInteraction, 'preference for solitude': state.needs.solitudePreference,
      exploration: state.needs.exploration, autonomy: state.needs.autonomy, creativity: state.needs.creativity,
      loneliness: state.needs.loneliness }))}.`,
  ]
  if (state.relationship !== null) {
    const relationship = state.relationship
    lines.push(`Relationship estimates toward ${JSON.stringify(relationship.label)} (operator): ${ranked(Object.fromEntries(Object.entries(relationship.values)
      .map(([name, value]) => [name, level(relationship.confidence[name as keyof typeof relationship.confidence]) === 0 ? 0 : value])))
      .map(([name, value]) => {
        const confidence = relationship.confidence[name as keyof typeof relationship.confidence]
        return `${name} ${level(confidence) === 0 ? 'unknown' : degree(value)} (confidence ${level(confidence) === 0 ? 'unknown' : degree(confidence)}; ${relationship.origins[name as keyof typeof relationship.origins]})`
      }).join('; ')}.`)
  }
  return lines.join('\n')
}

/**
 * Resolve operator controls over deployment defaults with anchor-owned recovery settings.
 * @param config - Validated deployment defaults.
 * @param state - Current trusted anchor.
 * @returns Complete effective settings.
 */
export function resolveEmotion(config: EmotionConfig, state: EmotionState): EmotionSettings {
  return { enabled: true, windowTurns: config.windowTurns, maxDelta: config.maxDelta, maxMoodDelta: config.maxMoodDelta,
    maxNeedsDelta: config.maxNeedsDelta, contextStep: config.contextStep, relationshipEnabled: config.relationshipEnabled,
    maxRelationshipDelta: config.maxRelationshipDelta, moodSupportTurns: config.moodSupportTurns,
    importantEventThreshold: config.importantEventThreshold, repetitionDiscount: config.repetitionDiscount, ...state.controls,
    sensitivity: state.sensitivity, baseline: { ...state.baseline }, shortHalfLifeMs: { ...state.shortHalfLifeMs },
    moodHalfLifeMs: { ...state.moodHalfLifeMs }, needsHalfLifeMs: state.needsHalfLifeMs, interactionHalfLifeMs: state.interactionHalfLifeMs,
    offlineChanges: state.offlineChanges ?? config.offlineChanges, moodEmotionScale: state.moodEmotionScale ?? config.moodEmotionScale,
    emotionMoodInfluence: state.emotionMoodInfluence ?? config.emotionMoodInfluence }
}
