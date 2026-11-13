/** Bounded declarative directories and subject portraits derived from authorized current records. @module */
import type { LifeMemory, MemoryId } from './model.ts'
import { memoryOrganization } from './memory-organization.ts'
import { readMemory } from './memory-time.ts'

/**
 * List immediate directory children with source-backed overview excerpts.
 * @param memories - Current records already filtered for audience and memory layer.
 * @param prefix - Exact path whose immediate children are requested; empty lists domains.
 * @param now - Shared date-rendering instant.
 * @param timeZone - Configured calendar zone.
 * @returns Deterministically ordered nodes; callers apply their complete output and pagination budgets.
 */
export function knowledgeDirectory(
  memories: readonly LifeMemory[],
  prefix: readonly string[],
  now: Date,
  timeZone: string,
): Array<{
  path: string[]
  overview: Array<{ id: MemoryId; text: string }>
}> {
  const nodes = new Map<string, { path: string[]; overview: Array<{ id: MemoryId; text: string }> }>()
  for (const memory of memories) {
    if (memoryOrganization(memory)?.type !== 'knowledge') continue
    for (const path of memory.organization?.paths ?? []) {
      if (!prefix.every((part, index) => path[index] === part) || path.length <= prefix.length) continue
      const child = path.slice(0, prefix.length + 1)
      const key = JSON.stringify(child)
      const node = nodes.get(key) ?? { path: child, overview: [] }
      if (!node.overview.some(item => item.id === memory.id)) {
        const reading = readMemory(memory, now, timeZone)
        node.overview.push({ id: memory.id, text: reading.summary ?? Array.from(reading.content).slice(0, 80).join('') })
      }
      nodes.set(key, node)
    }
  }
  return [...nodes.values()].sort((a, b) => JSON.stringify(a.path).localeCompare(JSON.stringify(b.path)))
}
