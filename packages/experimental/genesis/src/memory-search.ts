/** Rank a captured life revision using lexical matches and optional semantic recall. @module */
import type { Config } from './config.ts'
import type { MemoryQuery } from './core.ts'
import { cosine, type MemoryEmbeddings } from './embedding.ts'
import { type MemoryIndex, type memoryAccess, memoryView } from './memory-access.ts'
import { accessibleMemories, memoryAccessibility } from './memory-dynamics.ts'
import { readMemory } from './memory-time.ts'
import type { LifeMemory, LifeState, MemoryEmbedding, MemoryId } from './model.ts'
import { memoryDocument, searchText } from './search.ts'

/** Query policy and embedding resources owned by the calling memory engine. */
export interface MemorySearchOptions {
  automatic: boolean
  signal: AbortSignal
  minSimilarity: number
  cache: Map<MemoryId, { content: string; embedding: MemoryEmbedding }>
  embeddings: () => MemoryEmbeddings | null | undefined
  onEmbeddingFailure: (error: unknown, hasLexicalMatches: boolean) => void
}

/**
 * Rank one stable, already filtered corpus across the embedding await.
 * @param query - Explicit result and character bounds.
 * @param state - Committed revision retained until the search settles.
 * @param index - Lookup tables from that revision.
 * @param eligible - Current authorized candidates in storage order.
 * @param access - Audience and current-Session checks for linked results.
 * @param config - Retrieval and output budgets.
 * @param options - Caller-owned embedding provider, cache and fallback policy.
 * @returns Detached memories fitting the output budget, with embeddings omitted.
 */
export async function rankMemories(
  query: MemoryQuery,
  state: LifeState,
  index: MemoryIndex,
  eligible: LifeMemory[],
  access: ReturnType<typeof memoryAccess>,
  config: Config,
  options: MemorySearchOptions,
): Promise<LifeMemory[]> {
  const lexical = searchText(query.text, eligible.map(memoryDocument))
  const semantic: Array<{ memory: LifeMemory; score: number }> = []
  const { cache, signal } = options
  for (const id of cache.keys()) if (!index.memories.has(id)) cache.delete(id)
  try {
    const provider = options.embeddings()
    if (provider != null) {
      const needle = await provider.embed(query.text, signal)
      for (const memory of eligible) {
        signal.throwIfAborted()
        let embedding = memory.embedding
        if (embedding?.space !== provider.space || embedding.vector.length !== needle.vector.length) {
          const cached = cache.get(memory.id)
          if (cached?.content === memory.content && cached.embedding.space === provider.space) embedding = cached.embedding
          else if (options.automatic) continue
          else embedding = await provider.embed(memory.content, signal)
          cache.set(memory.id, { content: memory.content, embedding })
        }
        const score = cosine(needle, embedding)
        if (score >= options.minSimilarity) semantic.push({ memory, score })
      }
    }
  } catch (error) {
    options.onEmbeddingFailure(error, lexical.length > 0)
    semantic.length = 0
  }
  semantic.sort((a, b) => b.score - a.score || b.memory.importance - a.memory.importance || a.memory.id.localeCompare(b.memory.id))
  // Reciprocal rank fusion combines independent score scales without replacing either retriever.
  const fused = new Map<MemoryId, { memory: LifeMemory; score: number }>()
  for (const list of [lexical.map(match => match.value), semantic.map(match => match.memory)]) {
    for (const [index, memory] of list.entries()) {
      const previous = fused.get(memory.id)?.score ?? 0
      fused.set(memory.id, { memory: memoryView(memory), score: previous + 1 / (60 + index + 1) })
    }
  }
  const ranked = accessibleMemories([...fused.values()].map(({ memory, score }) => ({ value: memory, score })),
    memoryAccessibility(eligible, state.events, config.memoryDynamics, new Date()), query.text)
  const result: LifeMemory[] = []
  const chars = Math.max(0, query.chars)
  const now = new Date()
  const associated = ranked.flatMap(memory => [
    memory,
    ...(memory.experience === undefined ? [] : (index.linked.get(memory.id) ?? []).map(memoryView)),
  ])
  for (const memory of associated) {
    if (!access.visible(memory) || (options.automatic && access.fromSession(memory)))
      continue
    if (result.some(item => item.id === memory.id)) continue
    if (
      (query.category !== undefined && memory.category !== query.category) ||
      (query.after !== undefined && memory.createdAt < query.after) ||
      (query.before !== undefined && memory.createdAt > query.before)
    )
      continue
    if (result.length >= Math.max(0, Math.min(query.limit, config.queryLimit))) break
    const next = [...result, memory]
    if (
      JSON.stringify(query.contentOnly ? next.map(item => readMemory(item, now, config.timeZone).content) : next).length <= chars
    )
      result.push(memory)
  }
  return structuredClone(result)
}
