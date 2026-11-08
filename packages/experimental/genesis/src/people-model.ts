/** Transport-authenticated participants and sourced, independently estimated relationships. @module */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import type { MessageSource } from '@deepseek-ai/dsh-llm'
import { relationshipSchema } from './relationship-state.ts'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { LifeEventId } from './model.ts'

/** Stable person identity; names and conversation identifiers cannot substitute for it. */
export type PersonId = Branded<'GenesisPersonId'>
/** Platform conversation identity, distinct from its current Harness Session. */
export type ConversationId = Branded<'GenesisConversationId'>
/** Persisted person identifiers generated from authenticated platform addresses. */
export const personIdSchema = z.string().regex(/^person:[a-f0-9]{64}$/).transform(brandString<PersonId>)
/** Persisted conversation identifiers generated from authenticated platform routes. */
export const conversationIdSchema = z.string().regex(/^qq:(group|private):[1-9][0-9]*:[1-9][0-9]*$/).transform(brandString<ConversationId>)
/** QQ identity supplied by the authenticated transport, never parsed from message text. */
export const personSourceSchema = z.strictObject({
  kind: z.literal('genesis-person'), platform: z.literal('qq'),
  personId: personIdSchema, conversationId: conversationIdSchema,
  accountId: z.string().regex(/^[1-9][0-9]*$/), name: z.string().trim().min(1).max(200),
  messageId: z.string().min(1).max(200),
}).superRefine((source, ctx) => {
  if (source.personId !== qqPersonId(source.accountId)) ctx.addIssue({ code: 'custom', message: 'QQ person identity does not match its authenticated account.' })
  if (source.conversationId.split(':')[1] === 'private' && source.conversationId.split(':')[3] !== source.accountId) {
    ctx.addIssue({ code: 'custom', message: 'A private message author must match its conversation peer.' })
  }
})
/** Logged direct-human source with immutable author and conversation attribution. */
export type PersonSource = z.infer<typeof personSourceSchema>
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap { 'genesis-person': PersonSource }
}
/** A person is retained only after a meaningful, sourced relationship appraisal. */
export const personSchema = z.strictObject({
  id: personIdSchema, platform: z.literal('qq'), accountId: z.string().regex(/^[1-9][0-9]*$/),
  name: z.string().trim().min(1).max(200), updatedAt: z.iso.datetime(),
  relationship: relationshipSchema.extend({ scope: z.literal('person'), personId: personIdSchema }),
  sourceEventIds: z.array(z.uuid().transform(brandString<LifeEventId>)).min(1),
})
/** Current participant binding and the Session used to reconstruct its dialogue. */
export const conversationSchema = z.strictObject({
  id: conversationIdSchema, sessionId: z.string().min(1).transform(SessionId),
  kind: z.enum(['group', 'private']), personId: personIdSchema.optional(),
}).superRefine((conversation, ctx) => {
  const parts = conversation.id.split(':')
  if (parts[1] !== conversation.kind || (conversation.kind === 'group' ? conversation.personId !== undefined
    : conversation.personId !== qqPersonId(parts[3]!))) {
    ctx.addIssue({ code: 'custom', message: 'Conversation kind or private peer does not match its platform route.' })
  }
})
/** Optional versioned people projection; absence preserves existing single-operator data. */
export const peopleStateSchema = z.strictObject({
  version: z.literal(1), people: z.array(personSchema),
  // Keep earlier Sessions for evidence ownership; the final binding for a route receives new input.
  conversations: z.array(conversationSchema),
  operatorPersonId: personIdSchema.optional(),
})
/** Durable person profile and independently estimated relationship. */
export type LifePerson = z.infer<typeof personSchema>
/** Validated route owned by the transport adapter. */
export type LifeConversation = z.infer<typeof conversationSchema>

/**
 * Resolve the same QQ account across private chats, groups and nickname changes.
 * @param accountId - Canonical numeric QQ account supplied by the transport.
 * @returns Stable branded identifier; it carries no operator permissions.
 */
export function qqPersonId(accountId: string): PersonId {
  return brandString<PersonId>(`person:${createHash('sha256').update(`qq:${accountId}`).digest('hex')}`)
}

/**
 * Recognize real human input without treating injected notices as dialogue evidence.
 * @param source - Logged message source.
 * @returns Whether this source identifies direct human input.
 */
export function isHumanSource(source: MessageSource): boolean {
  return source.kind === 'user' || source.kind === 'genesis-person'
}

/**
 * Select optional transport identity from a typed message source.
 * @param source - Source already validated at the durable or transport parser.
 * @returns Author metadata only for authenticated social input.
 */
export function personSource(source: MessageSource): PersonSource | undefined {
  return source.kind === 'genesis-person' ? source : undefined
}
