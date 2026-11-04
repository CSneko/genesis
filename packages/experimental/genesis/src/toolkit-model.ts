/** Operator tool groups and replayable per-conversation activation. @module */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { pluginRecordOf, SessionId } from '@deepseek-ai/dsh-session'
import { personIdSchema } from './people-model.ts'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

import type { ToolkitId, ToolkitDefinition } from './toolkit-types.ts'
export type { ToolkitId, ToolkitDefinition, ToolkitStatus } from './toolkit-types.ts'
/** Parser shared by configuration persistence and authenticated edits. */
export const toolkitSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u).transform(brandString<ToolkitId>),
  name: z.string().trim().min(1).max(200), description: z.string().trim().max(2000),
  qqAccess: z.enum(['disabled', 'anyone', 'operator']).optional(),
  tools: z.array(z.string().trim().regex(/^[^\s*]+\*?$/u).max(512)).refine(items => new Set(items).size === items.length),
})
const sessionIdSchema = z.string().min(1).transform(SessionId)
const legacyActivationSchema = z.strictObject({ version: z.literal(1), sessionId: sessionIdSchema, id: toolkitSchema.shape.id, enabled: z.boolean() })
const grantSchema = z.strictObject({ actor: personIdSchema, sourceSeq: z.number().int().nonnegative() })
const activationSchema = z.union([legacyActivationSchema, legacyActivationSchema.extend({ version: z.literal(2), grant: grantSchema.optional() })])
const projectionSchema = z.strictObject({ sessionId: sessionIdSchema.nullable(), enabled: z.array(toolkitSchema.shape.id),
  grants: z.record(z.string(), grantSchema) })
/** Validated Session-local activation reconstructed from plugin records. */
export type ToolkitActivation = z.infer<typeof projectionSchema>
declare module '@deepseek-ai/dsh-session/types' {
  interface PluginRecordMap {
    /** Versioned Session-local activation; QQ records cite authenticated speakers, with current policy and caller checked at execution. */
    'plugin:genesis/toolkit': z.infer<typeof activationSchema>
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { genesisToolkits: ToolkitActivation }
}
/** Unknown or damaged owner records stop activation recovery instead of unlocking tools. */
export const toolkitProjection: ProjectionDefinition<'genesisToolkits'> = {
  key: 'genesisToolkits', stateVersion: 2, stateSchema: projectionSchema,
  init: () => ({ sessionId: null, enabled: [], grants: {} }),
  apply: (state, event) => {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis/toolkit') return state
    const activation = activationSchema.parse(record.data)
    const enabled = state.sessionId === activation.sessionId ? state.enabled.filter(id => id !== activation.id) : []
    const grants = state.sessionId === activation.sessionId ? { ...state.grants } : {}
    delete grants[activation.id]
    if (activation.enabled && activation.version === 2 && activation.grant !== undefined) grants[activation.id] = activation.grant
    return { sessionId: activation.sessionId, enabled: activation.enabled ? [...enabled, activation.id] : enabled, grants }
  },
}
/**
 * Match an exact tool name or one explicit trailing-prefix wildcard.
 * @param toolkit - Validated operator membership rules.
 * @param name - Actual registered or learned tool name.
 * @returns Whether this tool belongs to the group.
 */
export function toolkitContains(toolkit: ToolkitDefinition, name: string): boolean {
  return toolkit.tools.some(rule => rule.endsWith('*') ? name.startsWith(rule.slice(0, -1)) : name === rule)
}
