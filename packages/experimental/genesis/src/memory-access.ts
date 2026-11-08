/** Deployment-selected memory sharing for prompts, recall and auxiliary inference. @module */
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Config } from './config.ts'
import type { LifeMemory, LifeState } from './model.ts'
import { personSourceSchema } from './people-model.ts'

/**
 * Apply the deployment sharing policy to current memories, history and linked experiences.
 * Life-wide sharing preserves source references; conversation mode intersects all source audiences.
 * @param state - Committed life and source metadata.
 * @param memory - Candidate memory; its source restrictions intersect rather than widen.
 * @param sharing - Explicit deployment policy; life shares memory across all participating conversations.
 * @param sessionId - Calling conversation; omission is reserved for authenticated host management.
 * @returns Whether the selected policy permits this memory; missing sources or linked experiences remain unavailable.
 */
export function memoryVisible(state: LifeState, memory: LifeMemory, sharing: Config['memorySharing'],
  sessionId?: SessionId): boolean {
  if (sessionId === undefined) return true
  const conversation = state.people?.conversations.find(item => item.sessionId === sessionId)
  const operator = conversation === undefined || (conversation.kind === 'private'
    && conversation.personId === state.people?.operatorPersonId)
  const visited = new Set<string>()
  const inspect = (candidate: LifeMemory): boolean => {
    if (visited.has(candidate.id)) return true
    visited.add(candidate.id)
    const sourceIds = [...candidate.sourceEventIds, ...(candidate.history ?? []).flatMap(version => version.sourceEventIds)]
    const allowed = sourceIds.every((id) => {
      const event = state.events.find(item => item.id === id)
      if (event === undefined) return false
      if (sharing === 'life') return true
      if (event.type === 'personality.initialized' && event.source === 'system') return true
      const parsed = personSourceSchema.safeParse(event.payload['participant'])
      if (!parsed.success) {
        const origin = state.people?.conversations.find(item => item.sessionId === event.relatedSessionId)
        if (origin !== undefined) return conversation?.id === origin.id
        return operator
      }
      if (conversation === undefined) return sourceIsOperator(parsed.data, state)
      const source = parsed.data
      const origin = source.conversationId.split(':')[1]
      return origin === 'private'
        ? conversation.kind === 'private' && conversation.personId === source.personId
        : conversation.id === source.conversationId
    })
    return allowed && (candidate.experienceIds ?? []).every((id) => {
      const experience = state.memories.find(item => item.id === id)
      return experience !== undefined && inspect(experience)
    })
  }
  return inspect(memory)
}

/**
 * Filter detached current state before any model-facing selection or auxiliary inference.
 * @param state - Snapshot owned by the caller.
 * @param sessionId - Actual calling conversation.
 * @param sharing - Explicit deployment sharing policy.
 * @returns Snapshot with only permitted memory records; original state is unchanged.
 */
export function memoryViewFor(state: LifeState, sessionId: SessionId, sharing: Config['memorySharing']): LifeState {
  return { ...state, memories: state.memories.filter(memory => memoryVisible(state, memory, sharing, sessionId)) }
}

function sourceIsOperator(source: import('./people-model.ts').PersonSource, state: LifeState): boolean {
  return source.conversationId.split(':')[1] === 'private' && source.personId === state.people?.operatorPersonId
}

/**
 * Identify memories whose current sources include the calling conversation.
 * @param state - Committed source events.
 * @param memory - Current memory version, including any revised sources.
 * @param sessionId - Conversation whose own memories need no automatic reminder.
 * @returns Whether at least one current source belongs to this Session.
 */
export function memoryFromSession(state: LifeState, memory: LifeMemory, sessionId: SessionId): boolean {
  return memory.sourceEventIds.some(id => state.events.some(event => event.id === id && event.relatedSessionId === sessionId))
}
