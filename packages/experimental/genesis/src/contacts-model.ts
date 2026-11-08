/** Contact addresses share the identities used by per-person relationships. @module */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { LifeEventId } from './model.ts'
import { z } from 'zod'
import { personIdSchema, qqPersonId } from './people-model.ts'

/** Complete replacement supplied by the operator or a sourced tool call. */
export const contactInputSchema = z.strictObject({
  personId: personIdSchema.optional(),
  name: z.string().trim().min(1).max(200),
  qq: z.string().regex(/^[1-9][0-9]*$/),
  emails: z.array(z.email().max(320)).max(32),
  handles: z.array(z.strictObject({ kind: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(320) })).max(32),
  notes: z.string().trim().max(2000),
}).refine(value => value.personId === undefined || value.personId === qqPersonId(value.qq),
  'Contact QQ must match its relationship person ID.')
/** Current contact data; the last update points to a durable life event. */
export const contactSchema = z.strictObject({
  ...contactInputSchema.shape, operator: z.boolean().default(false), personId: personIdSchema, updatedAt: z.iso.datetime(), sourceEventId: z.uuid().transform(brandString<LifeEventId>),
}).refine(value => value.personId === qqPersonId(value.qq), 'Contact person ID must match its QQ account.')
/** Optional versioned address book, independent of relationship estimates. */
export const contactsStateSchema = z.strictObject({ version: z.literal(1), items: z.array(contactSchema), peopleImported: z.boolean().optional(), operatorConfigured: z.boolean().optional() })
/** Operator and model input; updates replace all editable fields. */
export type ContactInput = z.infer<typeof contactInputSchema>
/** One person's addresses; an association does not authenticate an email sender. */
export type LifeContact = z.infer<typeof contactSchema>
/** Bounded contact search result. */
export interface ContactCatalog {
  items: LifeContact[]
  total: number
  nextOffset: number | null
}
