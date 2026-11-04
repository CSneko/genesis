/** Replayable, bounded exchange evidence for interest review. @module */
import { isHumanSource, personSource, personSourceSchema } from './people-model.ts'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { DecisionId } from './agency-state.ts'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const turnSchema = z.strictObject({
  turn: z.number().int().nonnegative(), startSeq: z.number().int().nonnegative(),
  decisionId: z.uuid().transform(brandString<DecisionId>).optional(),
  completed: z.boolean(), overflow: z.boolean(),
  messages: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), seq: z.number().int().nonnegative(),
    timestamp: z.iso.datetime(), text: z.string(), participant: personSourceSchema.optional() })),
  tools: z.array(z.strictObject({ callId: z.string(), name: z.string(), resultSeq: z.number().int().nonnegative().optional(),
    timestamp: z.iso.datetime().optional(), success: z.boolean().optional() })),
})
const projectionSchema = z.strictObject({ turns: z.array(turnSchema) })
/** Exchange text and tool outcomes; tool arguments and result bodies stay in the Session log. */
export type InterestDialogue = z.infer<typeof projectionSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { genesisInterest: InterestDialogue }
}

/**
 * Retain recent complete exchanges with an explicit overflow marker.
 * @param windowTurns - Maximum exchanges retained for review.
 * @param chars - Complete projection character limit.
 * @returns A deterministic Session projection restored on restart.
 */
export function interestProjection(windowTurns: number, chars: number): ProjectionDefinition<'genesisInterest'> {
  const bounded = (turns: InterestDialogue['turns']): InterestDialogue => {
    while (turns.length > 1 && JSON.stringify({ turns }).length > chars) turns.shift()
    const current = turns.at(-1)
    if (current !== undefined && JSON.stringify({ turns }).length > chars) {
      current.messages = []; current.tools = []; current.overflow = true
    }
    return { turns }
  }
  return { key: 'genesisInterest', stateVersion: 2, stateSchema: projectionSchema, init: () => ({ turns: [] }),
    apply: (previous, event) => {
      if (!['turn/start', 'turn/end', 'user/message', 'assistant/message', 'tool/call', 'tool/result'].includes(event.type)) return previous
      const turns = structuredClone(previous.turns).slice(-windowTurns)
      if (event.type === 'turn/start') return bounded([...turns, { turn: event.data.turn, startSeq: event.seq,
        completed: false, overflow: false, messages: [], tools: [] }].slice(-windowTurns))
      const current = turns.at(-1)
      if (current === undefined) return previous
      if (event.type === 'turn/end') { current.completed = event.data.reason.kind === 'completed'; return { turns } }
      if (current.overflow) return previous
      if (event.type === 'user/message' && event.data.source.kind === 'genesis-deliberation') {
        current.decisionId = event.data.source.decisionId
      } else if (event.type === 'user/message' && isHumanSource(event.data.source)) {
        current.messages.push({ role: 'user', ...(personSource(event.data.source) === undefined ? {} : { participant: personSource(event.data.source) }), seq: event.seq, timestamp: new Date(event.time).toISOString(),
          text: event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n') })
      } else if (event.type === 'assistant/message' && !event.data.interrupted) {
        const text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        if (text.trim()) current.messages.push({ role: 'assistant', seq: event.seq, timestamp: new Date(event.time).toISOString(), text })
      } else if (event.type === 'tool/call') {
        current.tools.push({ callId: event.data.callId, name: event.data.name })
      } else if (event.type === 'tool/result') {
        const tool = current.tools.find(item => item.callId === event.data.message.toolCallId)
        if (tool === undefined) return previous
        tool.resultSeq = event.seq; tool.timestamp = new Date(event.time).toISOString(); tool.success = !event.data.message.isError
      } else return previous
      return bounded(turns)
    } }
}
