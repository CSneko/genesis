/** Revisioned Purge preferences owned by the life deployment, independent of profile patch precedence. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { Config } from './config.ts'
import type { PurgeSettings } from './status-types.ts'
import { GenesisError } from './error.ts'

const preferenceSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().min(1), enabled: z.boolean() })

/** Validated preferences have their own versioned domain; life identity and history stay in the life domain. */
export const purgePreferencesDomain = defineDomain({
  name: 'genesis_purge_settings', version: 1,
  tables: { settings: domainTable<'purge', z.infer<typeof preferenceSchema>>(preferenceSchema) },
})

/** One writer serializes revision checks and commits; uncertain writes stop dependent Purge-guided requests until reload. */
export class PurgePreferences {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined

  /**
   * @param domain - Exclusive domain opened under the life writer lease.
   * @param config - Deployment value used until the first GUI save.
   */
  constructor(private readonly domain: Domain<typeof purgePreferencesDomain>, private readonly config: Config) {}

  /**
   * Read current preferences without exposing credential values.
   * @returns A detached configuration and its optimistic revision; zero denotes inherited deployment values.
   */
  read(): PurgeSettings {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'Purge settings are closing.')
    const saved = this.domain.table('settings').get('purge')
    if (saved !== undefined) return { revision: saved.revision, enabled: saved.enabled }
    return { revision: 0, enabled: this.config.purge.get() }
  }

  /**
   * Validate and commit one nonsecret configuration after checking its revision.
   * @param enabled - Operator-selected action guidance switch.
   * @param revision - Revision shown when the editor opened or last saved.
   * @returns The committed revision; conflicts preserve both the stored configuration and caller's draft.
   */
  save(enabled: boolean, revision: number): Promise<number> {
    z.boolean().parse(enabled)
    this.read()
    const operation = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const current = this.domain.table('settings').get('purge')?.revision ?? 0
      if (current !== revision) throw new GenesisError('configuration-conflict', 'Purge settings changed. Refresh before saving your draft again.')
      const next = current + 1
      try {
        await this.domain.table('settings').put('purge', { schemaVersion: 1, revision: next, enabled })
      } catch (error) {
        this.failure = new GenesisError('storage', 'Purge settings write failed with an uncertain outcome. Stop Purge-guided requests and reload verified storage.', { cause: error })
        throw this.failure
      }
      return next
    })
    this.tail = operation.then(() => {}, (_error: unknown) => {
      // The awaiting Remote reports failures; this tail retains settlement for disposal.
    })
    return operation
  }

  /**
   * Stop new writes and drain admitted writes before closing the preferences domain.
   * @returns After all accepted writes and domain teardown settle.
   */
  close(): Promise<void> {
    this.closing ??= this.tail.then(() => this.domain.close())
    return this.closing
  }
}
