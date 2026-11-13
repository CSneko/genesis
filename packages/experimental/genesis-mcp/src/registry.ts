/** Bounded, cached reads of an operator-selected official-registry-compatible API. @module */
import { McpError } from './error.ts'
import { z } from 'zod'
import { serverSchema, httpUrl, product, type Server } from './catalog.ts'
import type { Config } from './config.ts'
import type { McpCatalogPage } from './types.ts'
const record = z.object({ server: serverSchema, _meta: z.record(z.string(), z.unknown()).optional() })
/** Plugin-owned registry cache; no catalog query starts a local program. */
export class Registry {
  private readonly cache = new Map<string, { at: number; value: unknown }>()
  /** @param config - Fixed API origin and response/cache budgets. */
  constructor(private readonly config: Config) {
    httpUrl(config.registryUrl)
  }
  private async read(path: string, signal: AbortSignal): Promise<unknown> {
    const cached = this.cache.get(path)
    if (cached && Date.now() - cached.at < this.config.cacheMs) return cached.value
    const response = await fetch(`${this.config.registryUrl.replace(/\/$/u, '')}${path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMs)]),
      redirect: 'error',
    })
    if (!response.ok || response.body === null) {
      await response.body?.cancel()
      throw new McpError('registry')
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > this.config.maxResponseBytes) throw new McpError('registry-size')
        chunks.push(chunk.value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (this.cache.size >= this.config.cacheEntries) {
      const oldest = this.cache.keys().next().value
      if (oldest !== undefined) this.cache.delete(oldest)
    }
    this.cache.set(path, { at: Date.now(), value })
    return value
  }
  /** Search one page, retaining the registry cursor and exact latest-version filter.
   * @param query - Empty or at least three characters.
   * @param cursor - Prior next cursor, or null for a fresh search.
   * @param signal - Caller/plugin cancellation.
   * @returns Validated display-only records.
   */
  async search(query: string, cursor: string | null, signal: AbortSignal): Promise<McpCatalogPage> {
    query = z.string().trim().max(200).parse(query)
    if (query && [...query].length < 3) throw new McpError('query')
    const params = new URLSearchParams({ limit: String(this.config.pageSize), version: 'latest' })
    if (query) params.set('search', query)
    if (cursor !== null) params.set('cursor', z.string().max(2000).parse(cursor))
    const page = z
      .object({ servers: z.array(record).max(this.config.pageSize), metadata: z.object({ nextCursor: z.string().max(2000).optional() }) })
      .parse(await this.read(`/v0.1/servers?${params}`, signal))
    return {
      products: page.servers.filter(row => this.active(row._meta)).map(row => product(row.server)),
      cursor: page.metadata.nextCursor ?? null,
    }
  }
  private active(meta: Record<string, unknown> | undefined): boolean {
    const status = meta?.['io.modelcontextprotocol.registry/official']
    return status === undefined || z.object({ status: z.string() }).parse(status).status === 'active'
  }
  /** Fetch the exact selected version; removed records cannot be installed.
   * @param name - Official registry identifier.
   * @param version - Explicit product version.
   * @param signal - Caller/plugin cancellation.
   * @returns Current validated metadata for that exact record.
   */
  async server(name: string, version: string, signal: AbortSignal): Promise<Server> {
    z.string().min(1).max(256).parse(name)
    z.string().min(1).max(128).parse(version)
    const row = record.parse(await this.read(`/v0.1/servers/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`, signal))
    if (row.server.name !== name || row.server.version !== version || !this.active(row._meta)) throw new McpError('registry')
    return row.server
  }
}
