/** Sanitized Session evidence, delivered modules and recoverable auxiliary assessments. @module */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { SessionSeq, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { isHumanSource } from './people-model.ts'

/** Only direct dialogue text and actual tool names enter temporary-memory evidence. */
export const temporaryEvidenceSchema = z.strictObject({ seq: z.number().int().nonnegative().transform(SessionSeq),
  role: z.enum(['user', 'assistant', 'tool']), text: z.string() })
/** Sanitized complete message; a threshold never splits one of these records. */
export type TemporaryEvidence = z.infer<typeof temporaryEvidenceSchema>
const route = z.object({ kind: z.literal('jev'), url: z.string(), model: z.string(), threshold: z.number() })
const assessment = z.object({ id: z.string(), requestSeq: z.number().int().nonnegative(),
  route: route.optional(), text: z.string().optional(), body: z.unknown().optional(), completed: z.boolean() })
const schema = z.strictObject({ messages: z.array(temporaryEvidenceSchema), lastActivity: z.number().nonnegative(),
  delivered: z.record(z.string(), z.string()), assessment: assessment.optional() })
const envelope = z.looseObject({ version: z.literal(1), phase: z.enum(['request', 'response']), role: z.string().optional(), input: z.string().optional(),
  text: z.string().optional(), requestSeq: z.number().int().nonnegative().optional(), body: z.unknown().optional(), route: z.unknown().optional() })
const marker = z.looseObject({ temporaryMemoryId: z.string() })
const PREFIX = 'genesis:temporary:'
/** Expiry/withdrawal instruction also clears this record from the delivery projection. */
export const TEMPORARY_REMOVED = 'This temporary memory has expired or been withdrawn. Do not use its earlier content.'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { genesisTemporary: z.infer<typeof schema> }
}
/** One replay fold owns evidence sanitization, context delivery and completed-importance recovery. */
export const temporaryProjection: ProjectionDefinition<'genesisTemporary'> = {
  key: 'genesisTemporary', stateVersion: 1, stateSchema: schema,
  init: () => ({ messages: [], lastActivity: 0, delivered: {} }),
  apply: (state, event) => {
    const content = event.type === 'user/message' && isHumanSource(event.data.source) ? event.data.content
      : event.type === 'assistant/message' ? event.data.message.content : undefined
    const text = event.type === 'tool/call' ? event.data.name
      : content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
    if (text.trim()) return { ...state, lastActivity: event.time, messages: [...state.messages,
      { seq: event.seq, role: event.type === 'tool/call' ? 'tool' : event.type === 'user/message' ? 'user' : 'assistant', text }] }
    if (event.type === 'user/message' && event.data.source.kind === 'genesis-state' && event.data.source.form === 'snapshot') {
      const delivered = { ...state.delivered }
      for (const section of event.data.source.sections) {
        if (!section.name.startsWith(PREFIX)) continue
        if (section.text === TEMPORARY_REMOVED) delete delivered[section.name]
        else delivered[section.name] = section.text
      }
      return { ...state, delivered }
    }
    const record = pluginRecordOf(event)
    if (record === undefined || !['plugin:genesis/memory-call', 'plugin:genesis/model-http'].includes(record.type)) return state
    const parsed = envelope.safeParse(record.data)
    if (!parsed.success) return state
    const data = parsed.data
    if (data.phase === 'response') {
      if (state.assessment === undefined || state.assessment.requestSeq !== data.requestSeq) return state
      return { ...state, assessment: { ...state.assessment, completed: true,
        ...(data.text === undefined ? { body: data.body } : { text: data.text }) } }
    }
    if (record.type === 'plugin:genesis/memory-call' && data.role === 'decision' && data.input !== undefined) {
      let input: unknown
      try { input = JSON.parse(data.input) } catch (_error) { return state /* Malformed optional audit data cannot establish an assessment. */ }
      const id = marker.safeParse(input)
      if (id.success) return { ...state, assessment: { id: id.data.temporaryMemoryId, requestSeq: event.seq, completed: false } }
    }
    if (record.type === 'plugin:genesis/model-http') {
      const body = z.looseObject({ state: marker }).safeParse(data.body)
      const selected = route.safeParse(data.route)
      if (body.success && selected.success) return { ...state, assessment: { id: body.data.state.temporaryMemoryId,
        requestSeq: event.seq, route: selected.data, completed: false } }
    }
    return state
  },
}
