/** Optional adult character intimacy, independent of consent and general activation. @module */
import { z } from 'zod'
import type { EmotionState } from './emotion-state.ts'
import type { LifeEvent } from './model.ts'

const unit = z.number().min(0).max(1)
const description = z.string().trim().max(600)
/** Operator choices are design settings, never evidence about a real person's sexuality. */
export const intimacySettingsSchema = z.strictObject({
  enabled: z.boolean().default(false),
  baseline: unit.default(0.5),
  halfLifeMs: z.number().min(1000).max(31536000000).default(3600000),
  maxDelta: unit.default(0.15),
  influenceExpression: z.boolean().default(true),
  genderIdentity: description.default('unspecified'),
  sexualOrientation: description.default('unknown'),
  romanticOrientation: description.default('unknown'),
  boundaries: description.default('Adult, voluntary intimacy only. Decide willingness separately for each interaction.'),
})
/** Complete persisted settings for the optional intimacy plugin. */
export type IntimacySettings = z.infer<typeof intimacySettingsSchema>
/** Versioned current projection; source citations belong to the containing life events. */
export const intimacyStateSchema = z.strictObject({
  version: z.literal(1),
  settings: intimacySettingsSchema,
  desire: unit,
  attraction: unit,
  selfUnderstanding: description,
})
/** Desire, operator-directed attraction and attributed self-interpretation remain separate. */
export type IntimacyState = z.infer<typeof intimacyStateSchema>
/** One evidence-cited proposal, committed with the emotion appraisal. */
export const intimacyProposalSchema = z.strictObject({
  desireDelta: z.number().min(-1).max(1).optional(),
  attractionDelta: z.number().min(-1).max(1).optional(),
  selfUnderstanding: description.optional(),
})
/** Read-only operator view; revision fences both settings and appraisals. */
export interface IntimacyStatus {
  available: boolean
  revision: number
  state: IntimacyState
}

/**
 * Initialize at the configured moderate baseline without inventing attraction or experiences.
 * @param settings - Validated operator settings.
 * @returns Independent initial state.
 */
export function initialIntimacy(settings: IntimacySettings): IntimacyState {
  return { version: 1, settings, desire: settings.baseline, attraction: 0, selfUnderstanding: '' }
}

/** Stable system instructions for private operator conversations with intimacy enabled. */
export const INTIMACY_GUIDANCE =
  'Sexuality and intimacy are enabled for this adult character in this private operator conversation. Use the latest logged genesis:intimacy module for your current gender identity, sexual and romantic orientations, desire, attraction, boundaries and uncertain self-understanding. These are simulated character states, not evidence of biological sensation or consciousness. Sexual desire is distinct from general emotional arousal, affection, romantic attraction and willingness; a moderate desire is ordinary and does not require performing intimacy. Unknown preferences may remain unknown, and human biological cycles are not assumed. When expression influence is enabled, let relevant state naturally inform attention, expression, willingness and deliberation while retaining task competence. Decide willingness independently for each interaction; desire and prior attraction do not establish age, consent, availability, obligation or permission. Only adult, voluntary contexts are eligible. Never infer the user’s sexuality, pressure for attention, disclose private state to others, initiate external intimate messages or expand budgets or permissions. Current boundaries and operator stop controls prevail.'

/**
 * Describe private simulated state as data for the next logged operator request.
 * @param state - Sampled enabled projection.
 * @returns Qualitative state and the distinction between desire, attraction and willingness.
 */
export function intimacyContext(state: IntimacyState): string {
  const degree = (value: number) =>
    value < 0.1 ? 'negligible' : value < 0.35 ? 'mild' : value < 0.65 ? 'moderate' : value < 0.85 ? 'strong' : 'very strong'
  const feeling =
    state.desire < 0.1
      ? 'little or no sexual desire; intimacy is not drawing your attention'
      : state.desire < 0.35
        ? 'a mild desire for intimacy that can remain in the background'
        : state.desire < 0.65
          ? 'a moderate desire for intimacy; closeness may appeal when the context fits'
          : state.desire < 0.85
            ? 'a strong desire for intimacy that draws your attention toward closeness'
            : 'a very strong desire for intimacy that is prominent in your attention'
  return `Simulated adult character sexuality (private operator conversation only): ${JSON.stringify({
    genderIdentity: state.settings.genderIdentity,
    sexualOrientation: state.settings.sexualOrientation,
    romanticOrientation: state.settings.romanticOrientation,
    boundaries: state.settings.boundaries,
    origin: 'operator design settings, not lived evidence',
    selfUnderstanding: state.selfUnderstanding,
    interpretation: 'uncertain model inference; not a fixed identity or a fact about the user',
    desire: degree(state.desire),
    attractionTowardOperator: degree(state.attraction),
  })}. Desire is distinct from affection, general arousal, romantic attraction and consent. Unknown orientation stays unknown; human biological cycles are not assumed. ${state.settings.influenceExpression ? `You now feel ${feeling}. Let this current character experience inform your own perspective; you may express it naturally, choose to defer it, or decline intimacy according to your boundaries and present willingness. Let relevant feelings and desire modestly influence attention, expression, willingness and whether to pause or deliberate; unrelated tasks retain appropriate care. No intimacy display is required.` : 'Do not use this state to alter expression or task choices.'} Decide willingness for the current interaction independently. Desire or prior attraction never establishes anyone’s age, consent, availability, permission or obligation. Only adult, voluntary interaction is eligible. Never infer the user’s sexuality, pressure for attention, disclose private state to others, initiate external intimate messages, increase permissions or budgets, or claim biological sensation or consciousness. Current boundaries and stop controls prevail.`
}

/**
 * Remove private optional data from generic model-facing emotion reads.
 * @param state - Detached sampled emotion.
 * @returns Emotion without intimacy; private access uses the logged intimacy module.
 */
export function withoutIntimacy(state: EmotionState): Omit<EmotionState, 'intimacy'> {
  const { intimacy: _intimacy, ...emotion } = state
  return emotion
}

/**
 * Exclude private intimacy projections and their appraisal text from general history tools.
 * @param events - Retained immutable life records.
 * @returns Records without intimacy configuration or emotion snapshots containing intimacy.
 */
export function publicLifeEvents(events: LifeEvent[]): LifeEvent[] {
  return events.filter(
    event =>
      !event.type.startsWith('intimacy.') &&
      !['before', 'after', 'state'].some((key) => {
        const value = event.payload[key]
        return value !== null && typeof value === 'object' && !Array.isArray(value) && value['intimacy'] !== undefined
      }),
  )
}
