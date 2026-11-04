/** Operator-scoped relationship estimates and sourced event appraisals. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'

/** Persistent relationship identity; it is neither a Session nor a nickname. */
export type RelationshipId = Branded<'GenesisRelationshipId'>
/** Independent relationship estimates, not permissions or established facts about a person. */
export const relationshipVectorSchema = z.strictObject({
  affection: z.number().min(0).max(1), trust: z.number().min(0).max(1), attachment: z.number().min(0).max(1),
  familiarity: z.number().min(0).max(1), feltSecurity: z.number().min(0).max(1),
})
/** Five independent estimates; zero confidence means unknown, rather than distrust. */
export type RelationshipVector = z.infer<typeof relationshipVectorSchema>
const origin = z.enum(['unknown', 'model-inference', 'user-stated'])
const originsSchema = z.strictObject({ affection: origin, trust: origin, attachment: origin, familiarity: origin, feltSecurity: origin })
/** Explicit operator or authenticated-person association; names never establish identity. */
export const relationshipSchema = z.strictObject({
  id: z.uuid().transform(value => brandString<RelationshipId>(value)), scope: z.literal('operator'),
  label: z.string().trim().min(1).max(200), values: relationshipVectorSchema, confidence: relationshipVectorSchema, origins: originsSchema,
  updatedAt: z.iso.datetime(),
})
/** One persistent relationship with per-field inference confidence. */
export type RelationshipState = z.infer<typeof relationshipSchema>
/** A bounded interpretation of new dialogue; all fields remain model inferences. */
export const appraisalSchema = z.strictObject({
  kind: z.enum(['support', 'teaching', 'shared-experience', 'achievement', 'conflict', 'disappointment',
    'separation', 'reunion', 'loss', 'neutral', 'numeric-instruction']),
  importance: z.number().min(0).max(1), novelty: z.number().min(0).max(1),
  expectationMatch: z.number().min(-1).max(1), controllability: z.number().min(0).max(1),
  relationshipMeaning: z.enum(['care', 'respect', 'rupture', 'repair', 'neutral', 'uncertain']),
  responsibility: z.enum(['self', 'other', 'environment', 'uncertain']),
  confidence: z.number().min(0).max(1), summary: z.string().trim().min(1).max(600),
})
/** Event meaning, attribution and uncertainty; never a clinical assessment. */
export type EmotionAppraisal = z.infer<typeof appraisalSchema>
/** Writer proposals are signed; runtime limits and source checks apply independently. */
export const relationshipDeltaSchema = z.strictObject({
  affection: z.number().min(-1).max(1).optional(), trust: z.number().min(-1).max(1).optional(),
  attachment: z.number().min(-1).max(1).optional(), familiarity: z.number().min(-1).max(1).optional(),
  feltSecurity: z.number().min(-1).max(1).optional(),
})
/** An operator-authored replacement, distinct from dialogue-derived learning. */
export const relationshipAdjustmentSchema = z.strictObject({
  label: z.string().trim().min(1).max(200), values: relationshipVectorSchema,
  reason: z.string().trim().min(1).max(1000),
})
/** Validated relationship editor input. */
export type RelationshipAdjustment = z.infer<typeof relationshipAdjustmentSchema>

/** Actual committed changes and evidence gates, distinct from the model's requested deltas. */
export const appraisalEffectsSchema = z.strictObject({
  current: z.record(z.string(), z.number()), mood: z.record(z.string(), z.number()), relationship: z.record(z.string(), z.number()),
  needs: z.record(z.string(), z.number()).optional(),
  repetitionFactor: z.number().min(0).max(1), moodEligible: z.boolean(), repeated: z.boolean(),
})
