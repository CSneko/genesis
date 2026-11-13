/** Complete-state filtering and bounded navigation for the authenticated memory browser. @module */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { personIdSchema } from './people-model.ts'
import type { LifeState, MemoryId } from './model.ts'
import type { MemoryBrowserFilter, MemoryBrowserCatalog, MemoryNavigationItem, MemoryKind } from './status-types.ts'
import type { Config } from './config.ts'
import { memoryOrganization, organizationMatches } from './memory-organization.ts'
import { memoryReading } from './memory-delivery.ts'
import { memoryView } from './memory.ts'
import { memoryDocument, searchText } from './search.ts'
import { GenesisError } from './error.ts'

/** Filters are validated at the remote request parser, independently of the current page. */
export const memoryBrowserFilterSchema = z.strictObject({
  type: z.enum(['knowledge', 'person', 'event', 'unclassified']).optional(),
  path: z.array(z.string().min(1).max(80)).max(8).optional(),
  subject: z
    .strictObject({
      name: z.string().min(1).max(200),
      personId: personIdSchema.optional(),
      memoryId: z
        .uuid()
        .transform(brandString<MemoryId>)
        .optional(),
    })
    .optional(),
  navigationOffset: z.number().int().nonnegative(),
})

/**
 * Build a filtered page and independently paged directory or person navigation.
 * @param state - Authorized operator snapshot; all records participate in filtering and counts.
 * @param query - Search text applied to records and root navigation.
 * @param kind - Requested declarative or behavioral layer, or both.
 * @param offset - Record offset within the filtered ranking.
 * @param filter - Parsed organization and navigation selection.
 * @param config - Complete result and item budgets.
 * @returns A bounded page with organization navigation; oversized individual records fail visibly.
 */
export function memoryBrowserPage(
  state: LifeState,
  query: string,
  kind: MemoryKind | 'all',
  offset: number,
  filter: MemoryBrowserFilter,
  config: Config,
): MemoryBrowserCatalog {
  const declarative = state.memories.filter(memory => memoryOrganization(memory) !== undefined)
  const eligible = state.memories
    .filter(
      memory =>
        (kind === 'all' || (memory.kind ?? (memory.category === 'procedural' ? 'non-declarative' : 'declarative')) === kind) &&
        organizationMatches(memory, {
          ...(filter.type === undefined || filter.subject !== undefined ? {} : { type: filter.type }),
          ...(filter.path?.length ? { path: filter.path } : {}),
        }) &&
        (filter.subject === undefined ||
          memory.organization?.subjects?.some(subject =>
            filter.subject?.personId !== undefined
              ? subject.personId === filter.subject.personId
              : memory.id === filter.subject?.memoryId && subject.name === filter.subject.name,
          )),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
  const found = query.trim() ? searchText(query, eligible.map(memoryDocument)).map(match => match.value) : eligible
  const nodes = new Map<string, MemoryNavigationItem>()
  const prefix = filter.path ?? []
  for (const memory of declarative) {
    const counted = new Set<string>()
    if (filter.type === 'knowledge') {
      for (const path of memory.organization?.type === 'knowledge' ? (memory.organization.paths ?? []) : []) {
        if (path.length <= prefix.length || !prefix.every((part, index) => part === path[index])) continue
        const child = path.slice(0, prefix.length + 1)
        const key = JSON.stringify(child)
        if (counted.has(key)) continue
        counted.add(key)
        const previous = nodes.get(key)
        nodes.set(key, { kind: 'directory', path: child, count: (previous?.count ?? 0) + 1 })
      }
    } else if (filter.type === 'person' && filter.subject === undefined) {
      for (const subject of memory.organization?.subjects ?? []) {
        const key = subject.personId ?? JSON.stringify([memory.id, subject.name])
        if (counted.has(key)) continue
        counted.add(key)
        const previous = nodes.get(key)
        nodes.set(key, {
          kind: 'person',
          subject: { name: subject.name, ...(subject.personId === undefined ? { memoryId: memory.id } : { personId: subject.personId }) },
          overview: previous?.kind === 'person' ? previous.overview : memoryReading(memory, 'summary', new Date(), config.timeZone).text,
          count: (previous?.count ?? 0) + 1,
        })
      }
    }
  }
  const navigation = [...nodes.values()]
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    .filter(
      node =>
        !query.trim() ||
        (node.kind === 'directory' ? node.path.join(' ') : `${node.subject.name} ${node.overview}`)
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    )
  const result: MemoryBrowserCatalog = {
    items: found.slice(offset, offset + config.queryLimit).map(memoryView),
    total: found.length,
    nextOffset: null,
    browser: {
      navigation: navigation.slice(filter.navigationOffset, filter.navigationOffset + config.queryLimit),
      navigationTotal: navigation.length,
      nextNavigationOffset: null,
    },
  }
  const updateOffsets = () => {
    result.nextOffset = offset + result.items.length < found.length ? offset + result.items.length : null
    result.browser.nextNavigationOffset =
      filter.navigationOffset + result.browser.navigation.length < navigation.length
        ? filter.navigationOffset + result.browser.navigation.length
        : null
  }
  updateOffsets()
  while (JSON.stringify(result).length > config.resultChars && result.browser.navigation.length > 1) {
    result.browser.navigation.pop()
    updateOffsets()
  }
  while (JSON.stringify(result).length > config.resultChars && result.items.length > 1) {
    result.items.pop()
    updateOffsets()
  }
  if (
    JSON.stringify(result).length > config.resultChars ||
    (!result.browser.navigation.length && navigation.length > filter.navigationOffset)
  ) {
    throw new GenesisError('capacity', 'Memory browser exceeds resultChars. Increase the response budget or narrow the search.')
  }
  return result
}
