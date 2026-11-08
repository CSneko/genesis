/** Revisioned embedding preferences owned by the life deployment, independent of profile patch precedence. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { Config } from './config.ts'
import type { EmbeddingSettings } from './status-types.ts'
import { GenesisError } from './error.ts'
import { embeddingSettings } from './embedding.ts'

const configuredSchema = z.strictObject({
  enabled: z.boolean().optional(),
  url: z.url().refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
  }, 'Use an HTTP(S) embedding endpoint without credentials, query parameters or a fragment.'),
  model: z.string().trim().min(1).max(512), dimensions: z.number().int().min(1).max(65536),
  keyRef: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
})
const settingsSchema = z.union([configuredSchema, z.strictObject({ enabled: z.literal(false),
  url: z.literal(''), model: z.literal(''), dimensions: z.literal(0) })])
const preferenceSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().min(1), embedding: settingsSchema })

/** Validated preferences have their own versioned domain; life identity and history stay in the life domain. */
export const embeddingPreferencesDomain = defineDomain({
  name: 'genesis_embedding_settings', version: 1,
  tables: { settings: domainTable<'embedding', z.infer<typeof preferenceSchema>>(preferenceSchema) },
})

/** One writer serializes revision checks and commits; uncertain writes stop dependent embedding operations until reload. */
export class EmbeddingPreferences {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined

  /**
   * @param domain - Exclusive domain opened under the life writer lease.
   * @param config - Legacy deployment values used until the first GUI save.
   */
  constructor(private readonly domain: Domain<typeof embeddingPreferencesDomain>, private readonly config: Config) {}

  /**
   * Read current preferences without exposing credential values.
   * @returns A detached configuration and its optimistic revision; zero denotes inherited deployment values.
   */
  read(): { revision: number; embedding: EmbeddingSettings } {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'Embedding settings are closing.')
    const saved = this.domain.table('settings').get('embedding')
    if (saved !== undefined) return { revision: saved.revision, embedding: structuredClone(saved.embedding) }
    return { revision: 0, embedding: embeddingSettings(this.config.memory) }
  }

  /**
   * Validate and commit one nonsecret configuration after checking its revision.
   * @param settings - HTTP(S) endpoint, model, dimensions and optional credential reference.
   * @param revision - Revision shown when the editor opened or last saved.
   * @returns The committed revision; conflicts preserve both the stored configuration and caller's draft.
   */
  save(settings: EmbeddingSettings, revision: number): Promise<number> {
    const embedding = settingsSchema.parse(settings)
    this.read()
    const operation = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const current = this.domain.table('settings').get('embedding')?.revision ?? 0
      if (current !== revision) throw new GenesisError('configuration-conflict', 'Embedding settings changed. Refresh before saving your draft again.')
      const next = current + 1
      try {
        await this.domain.table('settings').put('embedding', { schemaVersion: 1, revision: next, embedding })
      } catch (error) {
        this.failure = new GenesisError('storage', 'Embedding settings write failed with an uncertain outcome. Stop embedding operations and reload verified storage.', { cause: error })
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
