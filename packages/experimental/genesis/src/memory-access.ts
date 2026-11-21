/** Deployment-selected memory sharing for prompts, recall and auxiliary inference. @module */
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Config } from './config.ts'
import type { LifeEvent, LifeEventId, LifeMemory, LifeState, MemoryId } from './model.ts'
import { personSourceSchema, type LifeConversation, type PersonId } from './people-model.ts'

/** Internal read operations shared by Genesis request hooks and memory engines. */
export const lifeReads = Symbol('genesis.life-reads')

/** Verified requesting conversation and current operator binding. */
export interface MemoryAudience {
  conversation: LifeConversation | undefined
  operatorPersonId: PersonId | undefined
}

/** Source facts and memory links belonging to one state revision. */
export interface MemoryIndex {
  events: ReadonlyMap<LifeEventId, LifeEvent>
  memories: ReadonlyMap<MemoryId, LifeMemory>
  linked: ReadonlyMap<MemoryId, readonly LifeMemory[]>
}

/**
 * Index the records owned by this state revision.
 * @param state - Life state whose indexed records and links must remain stable during use.
 * @returns Borrowed records by ID and reverse experience links in storage order.
 */
export function indexMemories(state: LifeState): MemoryIndex {
  const events = new Map<LifeEventId, LifeEvent>()
  const memories = new Map<MemoryId, LifeMemory>()
  const linked = new Map<MemoryId, LifeMemory[]>()
  for (const event of state.events) events.set(event.id, event)
  for (const memory of state.memories) {
    memories.set(memory.id, memory)
    if (memory.experienceIds === undefined) continue
    for (const id of new Set(memory.experienceIds)) {
      const entries = linked.get(id)
      if (entries === undefined) linked.set(id, [memory])
      else entries.push(memory)
    }
  }
  return { events, memories, linked }
}

/**
 * Apply sharing to each current record, its history and its linked experiences.
 * @param people - Account and conversation bindings from the same state revision.
 * @param index - Source event and memory lookups for that revision.
 * @param sharing - Deployment sharing policy.
 * @param sessionId - Calling conversation. Omission is reserved for authenticated host management.
 * @returns Audience checks and source-Session matching for candidate records.
 */
export function memoryAccess(people: LifeState['people'], index: MemoryIndex, sharing: Config['memorySharing'], sessionId?: SessionId) {
  const conversation = people?.conversations.find(item => item.sessionId === sessionId)
  const operator = conversation === undefined || (conversation.kind === 'private'
    && conversation.personId === people?.operatorPersonId)
  const allowedSource = (id: LifeEventId): boolean => {
    const event = index.events.get(id)
    if (event === undefined) return false
    if (sharing === 'life' || (event.type === 'personality.initialized' && event.source === 'system')) return true
    const parsed = personSourceSchema.safeParse(event.payload['participant'])
    if (!parsed.success) {
      const origin = people?.conversations.find(item => item.sessionId === event.relatedSessionId)
      return origin === undefined ? operator : conversation?.id === origin.id
    }
    const source = parsed.data
    const privateSource = source.conversationId.split(':')[1] === 'private'
    if (conversation === undefined) return privateSource && source.personId === people?.operatorPersonId
    return privateSource
      ? conversation.kind === 'private' && conversation.personId === source.personId
      : conversation.id === source.conversationId
  }
  return {
    visible(memory: LifeMemory): boolean {
      if (sessionId === undefined) return true
      const visited = new Set<MemoryId>()
      const inspect = (candidate: LifeMemory): boolean => {
        if (visited.has(candidate.id)) return true
        visited.add(candidate.id)
        return candidate.sourceEventIds.every(allowedSource)
          && (candidate.history ?? []).every(version => version.sourceEventIds.every(allowedSource))
          && (candidate.experienceIds ?? []).every((id) => {
            const experience = index.memories.get(id)
            return experience !== undefined && inspect(experience)
          })
      }
      return inspect(memory)
    },
    fromSession(memory: LifeMemory): boolean {
      return sessionId !== undefined && memory.sourceEventIds.some(id => index.events.get(id)?.relatedSessionId === sessionId)
    },
  }
}

/**
 * Filter current state before any model-facing selection or auxiliary inference.
 * @param state - Life state supplying the records and account bindings.
 * @param sessionId - Actual calling conversation.
 * @param sharing - Deployment sharing policy.
 * @returns State with only permitted memory records, borrowing entries from the input.
 */
export function memoryViewFor(state: LifeState, sessionId: SessionId, sharing: Config['memorySharing']): LifeState {
  const { visible } = memoryAccess(state.people, indexMemories(state), sharing, sessionId)
  return { ...state, memories: state.memories.filter(visible) }
}

/**
 * Select memory metadata and text for prompt, search or tool output.
 * @param memory - Current memory whose nested content remains owned by the caller.
 * @returns Memory fields without the cached vector or internal decay timestamp.
 */
export function memoryView(memory: LifeMemory): LifeMemory {
  const { embedding: _embedding, contentChangedAt: _contentChangedAt, ...view } = memory
  return view
}
