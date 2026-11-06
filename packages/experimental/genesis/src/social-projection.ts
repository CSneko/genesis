/** Correlate an internal initiative notice with actual assistant output, including replay. @module */
import { z } from 'zod'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { InteractionId } from './social-state.ts'

// The notice supplies model context; the outgoing message is always the loop's assistant/message.
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Persistent initiative attribution, never an operator-authored message. @persistenceAttribution */
    'genesis-initiative': { kind: 'genesis-initiative'; interactionId: InteractionId } & ContextFormed
  }
}
const schema = z.strictObject({ id: z.uuid().transform(brandString<InteractionId>).nullable(),
  currentTurn: z.number(), turn: z.number(), ended: z.boolean(),
  failure: z.string().nullable(),
  receipt: z.strictObject({ text: z.string(), seq: z.number(), timestamp: z.iso.datetime(), interrupted: z.boolean() }).nullable() })
/** Last attributed initiative in this Session; ordinary turns retain its receipt for recovery. */
export type InitiativeReceipt = z.infer<typeof schema>
/** Replay restores delivery evidence without treating idle as a per-message result. */
export const initiativeProjection: ProjectionDefinition<'genesisInitiative', InitiativeReceipt> = {
  key: 'genesisInitiative', stateVersion: 2, stateSchema: schema,
  init: () => ({ id: null, currentTurn: 0, turn: 0, ended: false, receipt: null, failure: null }),
  apply: (previous, event) => {
    if (event.type === 'turn/start') return { ...previous, currentTurn: event.data.turn }
    if (event.type === 'user/message' && event.data.source.kind === 'genesis-initiative') {
      return { id: event.data.source.interactionId, currentTurn: previous.currentTurn, turn: previous.currentTurn,
        ended: false, receipt: null, failure: null }
    }
    if (previous.id === null) return previous
    if (event.type === 'assistant/message' && event.data.turn === previous.turn && previous.receipt === null) {
      const text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (text.trim()) return { ...previous, receipt: { text, seq: event.seq,
        timestamp: new Date(event.time).toISOString(), interrupted: event.data.interrupted === true } }
    }
    if (event.type === 'turn/end' && event.data.turn === previous.turn) {
      const code = event.data.reason.kind === 'error' ? event.data.reason.error.code : undefined
      return { ...previous, ended: true, failure: typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(code) ? code : null }
    }
    return previous
  },
}
