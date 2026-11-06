/** Bounded original text and current-turn operator evidence, restored from the Session log. @module */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { SessionSeq, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { personSourceSchema } from '@deepseek-ai/dsh-experimental-genesis'
import type { Config } from './config.ts'
import { qqMessageRecordSchema } from './message-model.ts'

const schema = z.strictObject({
  inputs: z.array(qqMessageRecordSchema.options[0]),
  speaker: z.strictObject({ source: personSourceSchema, seq: z.number().int().nonnegative().transform(SessionSeq) }).optional(),
  calls: z.record(z.string(), z.strictObject({ seq: z.number().int().nonnegative().transform(SessionSeq), arguments: z.string() })),
})
/** Synchronous access to prepared QQ message evidence. */
export type QqEvidenceReader = (session: import('@deepseek-ai/dsh-session').Session) => z.infer<typeof schema>

/**
 * Fold original text and execution evidence without synchronous historical reads.
 * @param config - The existing historyLimit bounds retained original-message count.
 * @returns Host-only projection; old messages outside its window cannot be forwarded.
 */
export function qqMessageProjection(config: Pick<Config, 'historyLimit'>): ProjectionDefinition<'genesisQqMessages', z.infer<typeof schema>> {
  return {
    key: 'genesisQqMessages', stateVersion: 1, stateSchema: schema,
    init: () => ({ inputs: [], calls: {} }),
    apply: (state, event) => {
      if (event.type === 'turn/start') return { inputs: state.inputs, calls: {} }
      if (event.type === 'user/message') {
        if (event.data.source.kind === 'genesis-person') return { ...state, speaker: { source: event.data.source, seq: event.seq } }
        if (event.data.source.kind === 'user') return { inputs: state.inputs, calls: {} }
      }
      if (event.type === 'tool/call' && event.data.name === 'genesis_message') {
        return { ...state, calls: { ...state.calls, [event.data.callId]: { seq: event.seq, arguments: event.data.arguments } } }
      }
      const record = pluginRecordOf(event)
      if (record?.type !== 'plugin:genesis-qq/message') return state
      const data = qqMessageRecordSchema.parse(record.data)
      return data.kind === 'input' ? { ...state, inputs: [...state.inputs, data].slice(-config.historyLimit) } : state
    },
  }
}
