/** Life-bound thoughts and exploration receipts, separate from factual memory. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { LifeId, LifeEventId } from './model.ts'
import type { MessageTargetId } from './message-routing.ts'
import type { DecisionId, LifeGoalId } from './agency-state.ts'

/** Stable identity of a revisitable idea, independent of goals and Sessions. */
export type ThoughtId = Branded<'GenesisThoughtId'>
const thoughtId = z.uuid().transform(brandString<ThoughtId>)
const sourceId = z.uuid().transform(brandString<LifeEventId>)
/** Model-authored interpretation with explicit disposition; timestamps belong to the host. */
export const thoughtEditSchema = z.strictObject({
  action: z.enum(['save', 'rest', 'drop', 'explore', 'promote', 'delete']),
  id: thoughtId.optional(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(2000),
  reason: z.string().trim().min(1).max(500),
  sourceEventIds: z.array(sourceId).min(1).max(20),
  revisitAfter: z.iso.datetime().nullable(),
  goalId: z.string().optional(),
})
/** Validated tool request; an omitted id creates a thought, while an id must already exist. */
export type ThoughtEdit = z.infer<typeof thoughtEditSchema>
const thoughtSchema = z.strictObject({
  id: thoughtId,
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  reason: z.string().min(1).max(500),
  status: z.enum(['saved', 'resting', 'exploring', 'dropped', 'promoted']),
  sourceEventIds: z.array(sourceId).min(1).max(20),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  revisitAfter: z.iso.datetime().nullable(),
  goalId: z
    .string()
    .transform(brandString<LifeGoalId>)
    .optional(),
})
/** Current thought projection; its origin and prior edits remain in the audit history. */
export type LifeThought = z.infer<typeof thoughtSchema>
const runSchema = z.strictObject({
  key: z.string().min(1).max(200),
  sessionId: z.string().transform(SessionId),
  sourceEventId: sourceId,
  createdAt: z.number().int().nonnegative(),
  status: z.enum(['reserved', 'completed', 'interrupted', 'failed']),
  thoughtId: thoughtId.optional(),
  decisionId: z
    .uuid()
    .transform(brandString<DecisionId>)
    .optional(),
  social: z
    .strictObject({
      target: z
        .string()
        .min(1)
        .max(200)
        .transform(brandString<MessageTargetId>),
      at: z.number().int().nonnegative(),
      status: z.enum(['reserved', 'confirmed', 'uncertain']),
    })
    .optional(),
  note: z.string().max(1000).optional(),
})
/** One reserved inference interval; reservation does not prove delivery or successful work. */
export type SpontaneityRun = z.infer<typeof runSchema>
/** Operator-editable cognition budgets; tool authorization remains deployment-owned. */
export const spontaneitySettingsSchema = z.strictObject({
  enabled: z.boolean(),
  idleMs: z.number().int().min(0).max(86400000),
  maxDurationMs: z.number().int().min(1000).max(3600000),
  maxOutputTokens: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  maxPer24Hours: z.number().int().min(1).max(1000),
})
/** Complete authenticated cognition draft. */
export type SpontaneitySettings = z.infer<typeof spontaneitySettingsSchema>
// Version-one stored controls included three execution caps; normalize them before the next write.
const storedSettingsSchema = z.union([
  spontaneitySettingsSchema,
  spontaneitySettingsSchema
    .extend({
      requestTokens: z.number().int().min(1).max(100000),
      maxRequests: z.number().int().min(1).max(100),
      maxToolCalls: z.number().int().min(1).max(1000),
    })
    .transform(({ requestTokens: _requestTokens, maxRequests: _maxRequests, maxToolCalls: _maxToolCalls, ...settings }) => settings),
])
/** Versioned authoritative state; edits and text-free deletion receipts are bounded together. */
export const spontaneityStateSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    lifeId: z.uuid().transform(brandString<LifeId>),
    revision: z.number().int().nonnegative(),
    controlsRevision: z.number().int().nonnegative().optional(),
    controls: storedSettingsSchema.optional(),
    thoughts: z.array(thoughtSchema),
    runs: z.array(runSchema),
    history: z.array(
      z.strictObject({
        key: z.string(),
        fingerprint: z.string(),
        thoughtId,
        at: z.iso.datetime(),
        action: thoughtEditSchema.shape.action,
        sessionId: z.string().transform(SessionId),
        sourceEventIds: z.array(sourceId),
        after: thoughtSchema.nullable(),
      }),
    ),
  })
  .superRefine((state, ctx) => {
    if (
      new Set(state.thoughts.map(item => item.id)).size !== state.thoughts.length ||
      new Set(state.runs.map(item => item.key)).size !== state.runs.length ||
      new Set(state.runs.map(item => item.sessionId)).size !== state.runs.length ||
      new Set(state.history.map(item => item.key)).size !== state.history.length
    ) {
      ctx.addIssue({ code: 'custom', message: 'Spontaneity identities and replay keys must be unique.' })
    }
  })
/** Detached committed thought inventory and append-only receipts. */
export type SpontaneityState = z.infer<typeof spontaneityStateSchema>
/** Independent storage; back up together with life identity and source Sessions. */
export const spontaneityDomain = defineDomain({
  name: 'genesis_spontaneity',
  version: 1,
  tables: { state: domainTable<'current', SpontaneityState>(spontaneityStateSchema) },
})

/** Complete bounded cognition status for authenticated operator inspection. */
export interface SpontaneityStatus {
  enabled: boolean
  working: boolean
  failure: string | null
  revision: number
  settings: SpontaneitySettings
  thoughts: number
  items: LifeThought[]
  itemsOmitted: number
  runs: SpontaneityRun[]
  runsOmitted: number
}
