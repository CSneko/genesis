/** Durable nonsecret connection choices, separate from QQ admission policy and credentials. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import type { Config } from './config.ts'
import type { QqConnection } from './types.ts'

const account = z.string().regex(/^[1-9][0-9]*$/u).refine(value => Number.isSafeInteger(Number(value)))
/** Accept only local OneBot endpoints; URL credentials and query strings are forbidden. */
export const connectionSchema = z.strictObject({
  enabled: z.boolean(), wsUrl: z.union([z.literal(''), z.url().refine((value) => {
    const url = new URL(value)
    return url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash
  })]),
  port: z.number().int().min(0).max(65535), botQq: z.union([z.literal(''), account]),
  operatorQq: z.union([z.literal(''), account]),
}).refine(value => !value.enabled || value.botQq !== '', 'Configure the bot account before enabling QQ.')
const rowSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().positive(), connection: connectionSchema })
/** Independent version-1 domain; existing route policy rows remain unchanged. */
export const qqConnectionDomain = defineDomain({ name: 'genesis_qq_connection', version: 1,
  tables: { settings: domainTable<'connection', z.infer<typeof rowSchema>>(rowSchema) } })

/** Saves run under the channel controller's serialized operation lifetime. */
export class QqConnectionPreferences {
  private failure: GenesisError | undefined
  /**
   * @param domain - Exclusive connection storage.
   * @param config - Explicit deployment defaults for unsaved connections.
   */
  constructor(private readonly domain: Domain<typeof qqConnectionDomain>, private readonly config: Config) { this.read() }
  /**
   * Read detached choices; malformed saved data never falls back to deployment values.
   * @returns Nonsecret choices and revision.
   */
  read(): { connection: QqConnection; connectionRevision: number } {
    if (this.failure !== undefined) throw this.failure
    const saved = this.domain.table('settings').get('connection')
    return saved === undefined ? { connectionRevision: 0, connection: connectionSchema.parse({ enabled: this.config.botQq !== '',
      wsUrl: this.config.wsUrl, port: this.config.port, botQq: this.config.botQq, operatorQq: this.config.operatorQq }) }
      : { connectionRevision: saved.revision, connection: connectionSchema.parse(saved.connection) }
  }
  /**
   * Reject stale drafts before stopping the existing connection.
   * @param revision - Displayed revision.
   */
  checkRevision(revision: number): void {
    z.number().int().nonnegative().parse(revision)
    if (this.read().connectionRevision !== revision) throw new GenesisError('configuration-conflict', 'QQ connection changed. Reload before saving.')
  }
  /**
   * Persist validated choices; an unknown write blocks all later connection use.
   * @param connection - Complete operator choices.
   * @param revision - Last displayed revision.
   * @returns Committed revision.
   */
  async save(connection: QqConnection, revision: number): Promise<number> {
    const value = connectionSchema.parse(connection); this.checkRevision(revision)
    try { await this.domain.table('settings').put('connection', { schemaVersion: 1, revision: revision + 1, connection: value }) }
    catch (error) {
      this.failure = new GenesisError('storage', 'QQ connection write has an uncertain outcome. Reload verified storage before reconnecting.', { cause: error })
      throw this.failure
    }
    return revision + 1
  }
  /**
   * Release storage after the controller drains saves.
   * @returns After the domain closes.
   */
  close(): Promise<void> { return this.domain.close() }
}
