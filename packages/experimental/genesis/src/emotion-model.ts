/** Readable model targets are resolved to internal identities before evidence-checked appraisal. @module */
import { z } from 'zod'
import { emotionUpdateSchema, type EmotionUpdate } from './emotion-state.ts'
import { qqPersonId } from './people-model.ts'

const relationship = emotionUpdateSchema.shape.relationships.unwrap().element.omit({ personId: true }).extend({
  qq: z.string().regex(/^[1-9][0-9]*$/u).refine(value => Number.isSafeInteger(Number(value))),
})
const proposal = emotionUpdateSchema.omit({ relationships: true }).extend({ relationships: z.array(relationship).optional() })

/**
 * Parse model output without allowing nicknames or model-supplied internal IDs to choose a person.
 * @param raw - Untrusted model JSON using authenticated QQ account numbers as appraisal targets.
 * @returns Internal proposal; the core still requires matching actual speakers and citations.
 */
export function modelEmotionUpdate(raw: unknown): EmotionUpdate {
  const { relationships, ...update } = proposal.parse(raw)
  return { ...update, ...(relationships === undefined ? {} : { relationships: relationships.map(({ qq, ...item }) => ({
    ...item, personId: qqPersonId(qq),
  })) }) }
}
