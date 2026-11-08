/** Independent, versioned short-lived summaries and operator settings. @module */
import { z } from 'zod'
import type { LifeId } from './model.ts'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { conversationIdSchema, personIdSchema } from './people-model.ts'

/** Stable summary identity, unrelated to the originating Session or life identity. */
export type TemporaryMemoryId = Branded<'GenesisTemporaryMemoryId'>
const id = z.uuid().transform(brandString<TemporaryMemoryId>)
/** Configurable auxiliary summary route; secrets remain in the credential provider. */
export const temporarySettingsSchema = z.strictObject({
  enabled: z.boolean(), idleMs: z.number().int().min(1000).max(604800000),
  inheritWriter: z.boolean().optional(),
  summary: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('provider'), provider: z.string().trim().max(512), model: z.string().trim().max(512) }),
    z.strictObject({ kind: z.literal('openai'), url: z.url().refine((value) => {
      const parsed = new URL(value)
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
    }), model: z.string().trim().min(1).max(512), keyRef: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional() }),
  ]),
}).refine(value => !value.enabled || value.inheritWriter === true || (value.summary.model !== '' && (value.summary.kind !== 'provider' || value.summary.provider !== '')),
  'Select a summary provider and model before enabling temporary memory.')
/** Authenticated operator policy. The importance route uses the existing memory decision settings. */
export type TemporarySettings = z.infer<typeof temporarySettingsSchema>
/** Captured audience survives deletion or renaming of the original conversation binding. */
export const temporaryAudienceSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('operator') }),
  z.strictObject({ kind: z.literal('private'), personId: personIdSchema }),
  z.strictObject({ kind: z.literal('group'), conversationId: conversationIdSchema })])
/** Durable temporary interpretation; raw tool parameters and results are never copied here. */
export const temporaryMemorySchema = z.strictObject({ id, sessionId: z.string().min(1).transform(SessionId),
  sourceSeqs: z.array(z.number().int().nonnegative().transform(SessionSeq)).min(1), audience: temporaryAudienceSchema,
  summary: z.string().trim().min(1).max(1000), createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
  days: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})
/** One committed, expiring summary. */
export type TemporaryMemory = z.infer<typeof temporaryMemorySchema>
const pendingSchema = z.strictObject({ id, sourceSeqs: z.array(z.number().int().nonnegative().transform(SessionSeq)).min(1),
  through: z.number().int().nonnegative(), audience: temporaryAudienceSchema,
  summary: z.string().min(1).max(1000), assessment: z.enum(['ready', 'requested']),
})
const cursorSchema = z.strictObject({ sessionId: z.string().min(1).transform(SessionId), through: z.number().int().min(-1),
  lastActivity: z.number().int().nonnegative(), due: z.boolean(), dirty: z.boolean(), failure: z.string().max(100).optional(), pending: pendingSchema.optional() })
/** Atomic state keeps each committed summary and its source high-water mark together. */
export const temporaryStateSchema = z.strictObject({ schemaVersion: z.literal(1), lifeId: z.uuid().transform(brandString<LifeId>), revision: z.number().int().nonnegative(),
  settings: temporarySettingsSchema, activeSession: z.string().min(1).transform(SessionId).optional(),
  sessions: z.array(cursorSchema).max(10000), memories: z.array(temporaryMemorySchema).max(10000),
}).superRefine((state, ctx) => {
  if (new Set(state.sessions.map(item => item.sessionId)).size !== state.sessions.length
    || new Set(state.memories.map(item => item.id)).size !== state.memories.length) {
    ctx.addIssue({ code: 'custom', message: 'Temporary memory identities and source cursors must be unique.' })
  }
  if (state.activeSession !== undefined && !state.sessions.some(item => item.sessionId === state.activeSession)) {
    ctx.addIssue({ code: 'custom', message: 'The active temporary-memory conversation has no progress cursor.' })
  }
  for (const cursor of state.sessions) {
    const pending = cursor.pending
    if (pending !== undefined && (pending.through <= cursor.through || pending.sourceSeqs.at(-1) !== pending.through
      || pending.sourceSeqs.some((seq, index) => index > 0 && seq <= pending.sourceSeqs[index - 1]!))) {
      ctx.addIssue({ code: 'custom', message: 'Temporary-memory pending progress is invalid.' })
    }
  }
  for (const memory of state.memories) {
    if (memory.expiresAt !== memory.createdAt + memory.days * 86400000
      || memory.sourceSeqs.some((seq, index) => index > 0 && seq <= memory.sourceSeqs[index - 1]!)) {
      ctx.addIssue({ code: 'custom', message: 'Temporary memory expiry or source ordering is invalid.' })
    }
  }
})
/** Atomic temporary-memory state under the Genesis writer lease. */
export type TemporaryState = z.infer<typeof temporaryStateSchema>
/** Separate storage leaves existing life identity, events and long-term memories unchanged. */
export const temporaryDomain = defineDomain({ name: 'genesis_temporary_memory', version: 1,
  tables: { state: domainTable<'current', TemporaryState>(temporaryStateSchema) } })
/** Bounded settings-page sample; only authenticated operator management sees all audiences. */
export interface TemporaryStatus {
  revision: number
  failure: string | null
  settings: TemporarySettings
  count: number
  memories: TemporaryMemory[]
  omitted: number
  failures: Array<{ sessionId: SessionId; reason: string; message?: string }>
}
