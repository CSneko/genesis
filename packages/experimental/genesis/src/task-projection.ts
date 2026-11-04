/** Replayable assignment identity and latest task settlement, separate from life memory. @module */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from './task-source.ts'

const reasonSchema = z.object({ kind: z.string(), canceledBy: z.string().optional(),
  error: z.object({ message: z.string(), code: z.string(), status: z.number().optional(), providerRetryAfterMs: z.number().optional(),
    requestId: z.string().optional(), offloadImages: z.number().optional() }).optional() })
const attemptSchema = z.object({ turn: z.number().int().positive(), startSeq: z.number().int().nonnegative(), startedAt: z.number(),
  endSeq: z.number().int().nonnegative().nullable(), endedAt: z.number().nullable(), reason: reasonSchema.nullable(),
  resultSeqs: z.array(z.number().int().nonnegative()) })
const schema = z.object({
  assignment: z.object({ requester: z.string().transform(brandString<SessionId>),
    requestId: z.string(), fingerprint: z.string() }).nullable(),
  inputIds: z.array(z.string().transform(brandString<MessageId>)), attempts: z.array(attemptSchema),
})
/** Session-derived attempt history and delivery receipts; result bodies remain in their original events. */
export type TaskProjection = z.infer<typeof schema>
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { genesisTask: TaskProjection }
  interface SessionProjectionMap { genesisTask: TaskProjection }
}
/** Assignment survives inbox admission and restart; status derives only from actual turn events. */
export const taskProjection = {
  key: 'genesisTask', stateVersion: 2, stateSchema: schema,
  init: () => ({ assignment: null, inputIds: [], attempts: [] }),
  apply(state, event) {
    const messages = event.type === 'user/message' ? [event.data]
      : event.type === 'agent/inbox/spliced' ? event.data.inserted : []
    for (const message of messages) {
      const source = message.source
      if (source.kind !== 'genesis-task') continue
      if (state.assignment === null) state = { ...state, assignment: {
        requester: source.requester, requestId: source.requestId, fingerprint: source.fingerprint } }
      if (!state.inputIds.includes(message.id)) state = { ...state, inputIds: [...state.inputIds, message.id] }
    }
    if (event.type === 'turn/start') return { ...state, attempts: [...state.attempts, {
      turn: event.data.turn, startSeq: event.seq, startedAt: event.time, endSeq: null, endedAt: null, reason: null, resultSeqs: [] }] }
    const latest = state.attempts.at(-1)
    if (latest === undefined) return state
    if (event.type === 'turn/end') return { ...state, attempts: [...state.attempts.slice(0, -1), { ...latest,
      endSeq: event.seq, endedAt: event.time, reason: { kind: event.data.reason.kind,
        ...(event.data.reason.kind === 'aborted' ? { canceledBy: event.data.reason.reason.kind } : {}),
        ...(event.data.reason.kind === 'error' ? { error: event.data.reason.error } : {}) } }] }
    if (event.type === 'assistant/message') return { ...state, attempts: [...state.attempts.slice(0, -1), {
      ...latest, resultSeqs: [...latest.resultSeqs, event.seq] }] }
    return state
  },
  wire: { viewSchema: schema, view: state => state },
} satisfies ProjectionDefinition<'genesisTask'>
