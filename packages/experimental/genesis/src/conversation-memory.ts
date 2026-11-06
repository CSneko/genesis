/** Whole-conversation text evidence and the exact memory versions admitted to manual review. @module */
import { isHumanSource, personSource, personSourceSchema } from './people-model.ts'
import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { LifeMemory, LifeState, MemoryId } from './model.ts'

const schema = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']),
  seq: z.number().int().nonnegative(), timestamp: z.iso.datetime(), text: z.string(), participant: personSourceSchema.optional() })) })


/** Explicit operator review includes text messages only, never tools, reasoning or injected context. */
export const conversationMemoryProjection: ProjectionDefinition<'genesisConversationMemory', z.infer<typeof schema>> = {
  key: 'genesisConversationMemory', stateVersion: 1, stateSchema: schema,
  init: () => ({ messages: [] }),
  apply: (state, event) => {
    const content = event.type === 'user/message' && isHumanSource(event.data.source) ? event.data.content
      : event.type === 'assistant/message' ? event.data.message.content : undefined
    if (content === undefined) return state
    const text = content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (!text.trim()) return state
    return { messages: [...state.messages, { role: event.type === 'user/message' ? 'user' : 'assistant',
      ...(event.type === 'user/message' && personSource(event.data.source) !== undefined ? { participant: personSource(event.data.source) } : {}), seq: event.seq, timestamp: new Date(event.time).toISOString(), text }] }
  },
}

/** Frozen source versions; additions, edits and removals all invalidate a pending overview. */
export interface ConversationMemoryScope {
  sessionId: SessionId
  versions: Array<{ id: MemoryId; updatedAt: string }>
}

/**
 * Select every current memory citing this conversation, including shared and inferred records.
 * @param state - Trusted life snapshot.
 * @param sessionId - Conversation selected by the operator.
 * @returns Complete matching records, without a search or preview limit.
 */
export function conversationMemories(state: LifeState, sessionId: SessionId): LifeMemory[] {
  const evidence = new Set(state.events.filter(event => event.relatedSessionId === sessionId).map(event => event.id))
  return state.memories.filter(memory => memory.experience?.sessionId === sessionId
    || memory.sourceEventIds.some(id => evidence.has(id)))
}

/** The writer chooses retention and mutations only within the supplied conversation evidence. */
export const CONVERSATION_MEMORY_PROMPT = '这是操作者主动请求的整个会话总览整理。conversation 与 memories 存在时，包含完整聊天和全部会话关联记忆；overview 存在时，是逐段读完这些证据后的临时模型提要，sourceSeqs 和 memoryIds 是仍可引用的原始证据标识。summarized 为 true 时，只能将新写或改写的条目标为 declarative、model-inference，不能将临时提要当成用户原话或持久习惯。结合完整交流、记忆正文和以往认识，梳理主题、指代、事实变化及矛盾，避免逐条复述。自行决定保留、合并、更新、删除或新增：保留的条目不必写入 changes；合并时先通过 upsert 保存有用信息，再删除重复或已失效的来源；不要为凑数删除独有的经历或细节。只能修改或删除提供的记忆，不得波及无关会话。upsert 的 sourceSeqs 引用提供的聊天序号，memoryIds 引用提供的记忆 UUID；两者可分别为空，但必须至少有一项有效证据；每项变更只引用直接支撑结论的少量证据，不要复制提要中的全部引用。例如 {"action":"upsert","sourceSeqs":[],"memoryIds":["提供的记忆 UUID"],"memory":{"category":"semantic","content":"有归属的综合认识","summary":"简短摘要","importance":0.5,"confidence":0.5,"kind":"declarative","attribution":"model-inference"}}。引用记忆合成的内容必须标记 model-inference，不得变成用户原话；正文中的推测不能成为已确认事实。习惯不得凭一次总览获得额外支持，不得创建推断式行为习惯。仍然遵守 maxChanges；不需要变化时返回 {"changes":[]}。只返回完整 JSON，不输出分析过程。'
