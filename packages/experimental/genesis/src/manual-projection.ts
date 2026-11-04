/** Replayable reply evidence for explicitly requested memory generation. @module */
import { isHumanSource, personSource, personSourceSchema } from './people-model.ts'
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const evidenceSchema = z.object({ role: z.enum(['user', 'assistant']), seq: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(), text: z.string(), participant: personSourceSchema.optional() })
const replySchema = z.object({ turn: z.number().int().nonnegative(), complete: z.boolean(), messages: z.array(evidenceSchema) })
const projectionSchema = z.object({ turn: z.number().int().nonnegative(), users: z.array(evidenceSchema),
  replies: z.record(z.string(), replySchema) })

/** Private source-text projection; inference still enforces the configured input budget before sending evidence. */
export type ManualMemoryProjection = z.infer<typeof projectionSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { genesisManualMemory: ManualMemoryProjection }
}

/** Logged user evidence and individual completed replies, rebuilt across restart without synchronous event reads. */
export const manualMemoryProjection: ProjectionDefinition<'genesisManualMemory'> = {
  key: 'genesisManualMemory', stateVersion: 1, stateSchema: projectionSchema,
  init: () => ({ turn: 0, users: [], replies: {} }),
  apply: (state, event) => {
    if (event.type === 'turn/start') return { ...state, turn: event.data.turn, users: [] }
    if (event.type === 'user/message' && isHumanSource(event.data.source)) {
      return { ...state, users: [...state.users, { role: 'user', ...(personSource(event.data.source) === undefined ? {} : { participant: personSource(event.data.source) }), seq: event.seq, timestamp: new Date(event.time).toISOString(),
        text: event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n') }] }
    }
    if (event.type === 'assistant/message' && !event.data.interrupted && state.users.length > 0) {
      const text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (!text.trim()) return state
      return { ...state, replies: { ...state.replies, [event.data.message.id]: { turn: state.turn, complete: false,
        messages: [...state.users, { role: 'assistant', seq: event.seq, timestamp: new Date(event.time).toISOString(), text }] } } }
    }
    if (event.type === 'turn/end') {
      const replies = { ...state.replies }
      for (const [id, reply] of Object.entries(replies)) {
        if (reply.turn === state.turn) replies[id] = { ...reply, complete: event.data.reason.kind === 'completed' }
      }
      return { ...state, replies }
    }
    return state
  },
}
