/** Bounded, replayable dialogue windows for post-reply emotion appraisal. @module */
import { isHumanSource, personSource, personSourceSchema } from './people-model.ts'
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const messageSchema = z.strictObject({ role: z.enum(['user', 'assistant']), seq: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(), text: z.string(), participant: personSourceSchema.optional() })
const turnSchema = z.strictObject({ turn: z.number().int().nonnegative(), startSeq: z.number().int().nonnegative(),
  completed: z.boolean(), overflow: z.boolean(), messages: z.array(messageSchema) })
const projectionSchema = z.strictObject({ turns: z.array(turnSchema) })
/** Only real user input and uninterrupted assistant text; injected context is excluded. */
export type EmotionDialogue = z.infer<typeof projectionSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { genesisEmotion: EmotionDialogue }
}

/**
 * Register a restart-reconstructable window with complete-message and total-retention limits.
 * @param windowTurns - Maximum recent exchanges retained.
 * @param chars - Maximum retained serialized dialogue characters.
 * @returns Pure projection; oversized current exchanges retain an explicit overflow marker.
 */
export function emotionProjection(windowTurns: number, chars: number): ProjectionDefinition<'genesisEmotion'> {
  const bounded = (turns: EmotionDialogue['turns']): EmotionDialogue => {
    while (turns.length > 1 && JSON.stringify({ turns }).length > chars) turns.shift()
    const current = turns.at(-1)
    if (current !== undefined && JSON.stringify({ turns }).length > chars) { current.messages = []; current.overflow = true }
    return { turns }
  }
  return {
    key: 'genesisEmotion', stateVersion: 1, stateSchema: projectionSchema, init: () => ({ turns: [] }),
    apply: (previous, event) => {
      if (!['turn/start', 'turn/end', 'user/message', 'assistant/message'].includes(event.type)) return previous
      const turns = structuredClone(previous.turns).slice(-windowTurns)
      if (event.type === 'turn/start') {
        return bounded([...turns, { turn: event.data.turn, startSeq: event.seq, completed: false, overflow: false, messages: [] }].slice(-windowTurns))
      }
      const current = turns.at(-1)
      if (current === undefined) return previous
      if (event.type === 'turn/end') {
        current.completed = event.data.reason.kind === 'completed'
        return { turns }
      }
      if (current.overflow) return previous
      if (event.type === 'user/message' && isHumanSource(event.data.source)) {
        current.messages.push({ role: 'user', ...(personSource(event.data.source) === undefined ? {} : { participant: personSource(event.data.source) }), seq: event.seq, timestamp: new Date(event.time).toISOString(),
          text: event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n') })
      } else if (event.type === 'assistant/message' && !event.data.interrupted) {
        const text = event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
        if (text.trim()) current.messages.push({ role: 'assistant', seq: event.seq, timestamp: new Date(event.time).toISOString(), text })
      } else return previous
      return bounded(turns)
    },
  }
}
