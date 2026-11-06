/** Durable toolkit catalogue under the existing exclusive life writer lease. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { toolkitSchema, type ToolkitDefinition } from './toolkit-model.ts'
import type { Config } from './config.ts'
import { GenesisError } from './error.ts'

const entriesSchema = z.array(toolkitSchema).refine(entries => new Set(entries.map(entry => entry.id)).size === entries.length)
const rowSchema = z.union([
  z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().positive(), entries: z.array(toolkitSchema.omit({ qqAccess: true })) }),
  z.strictObject({ schemaVersion: z.literal(2), revision: z.number().int().positive(), entries: entriesSchema }),
])
/** Independently versioned mutable operator preferences; no life identity or learning records are rewritten. */
export const toolkitPreferencesDomain = defineDomain({ name: 'genesis_toolkits', version: 1,
  tables: { settings: domainTable<'toolkits', z.infer<typeof rowSchema>>(rowSchema) } })
/** Revision checks and accepted writes serialize; uncertain storage stops all dependent reads. */
export class ToolkitPreferences {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  private readonly defaults: ToolkitDefinition[]
  /** @param domain - Exclusively owned catalogue storage. @param config - Deployment defaults and bounds. */
  constructor(private readonly domain: Domain<typeof toolkitPreferencesDomain>, private readonly config: Config) {
    this.defaults = this.validate(config.toolkits)
    this.read()
  }
  private validate(value: unknown): ToolkitDefinition[] {
    const entries = entriesSchema.parse(value)
    if (entries.length + entries.reduce((count, entry) => count + entry.tools.length, 0) > this.config.maxRecords
      || JSON.stringify(entries).length > this.config.maxStateChars) {
      throw new GenesisError('capacity', 'Toolkit catalogue exceeds maxRecords or maxStateChars. Reduce its entries or increase these limits.')
    }
    if (entries.some(entry => entry.tools.some(rule => ['learn', 'genesis_recall', 'genesis_thought', 'genesis_plan', 'genesis_toolkit', 'genesis_qq_history', 'genesis_qq_read_media', 'genesis_qq_send']
      .some(name => rule.endsWith('*') ? name.startsWith(rule.slice(0, -1)) : name === rule)))) {
      throw new GenesisError('invalid-source', 'Innate tools cannot be placed in a toolkit. Remove their membership rules.')
    }
    return entries
  }
  /** Read a detached saved catalogue, or deployment defaults at revision zero. @returns Trusted current entries and revision. */
  read(): { revision: number; entries: ToolkitDefinition[] } {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'Toolkit settings are closing.')
    const saved = this.domain.table('settings').get('toolkits')
    return saved === undefined ? { revision: 0, entries: structuredClone(this.defaults) }
      : { revision: saved.revision, entries: this.validate(saved.entries) }
  }
  /**
   * Save a complete validated catalogue; failures preserve the previous confirmed catalogue.
   * @param value - Operator definitions; unknown tool names may be configured before installation or learning.
   * @param revision - Last inspected revision; stale edits are refused.
   * @returns Committed revision; uncertain writes stop use until verified reload.
   */
  save(value: ToolkitDefinition[], revision: number): Promise<number> {
    const entries = this.validate(value)
    this.read()
    const operation = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const current = this.domain.table('settings').get('toolkits')?.revision ?? 0
      if (current !== revision) throw new GenesisError('configuration-conflict', 'Toolkit settings changed. Reload before saving again.')
      try { await this.domain.table('settings').put('toolkits', { schemaVersion: 2, revision: current + 1, entries }) }
      catch (error) {
        this.failure = new GenesisError('storage', 'Toolkit settings write has an uncertain outcome. Stop toolkit use and reload verified storage.', { cause: error })
        throw this.failure
      }
      return current + 1
    })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* The caller reports errors; teardown drains accepted writes. */ })
    return operation
  }
  /** Drain admitted saves before releasing storage. @returns After the domain closes. */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
