/** Revisioned auxiliary model routes; stored independently of immutable life history. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import type { Config, MemoryConfig } from './config.ts'
import type { MemoryModelsSettings } from './status-types.ts'
import { GenesisError } from './error.ts'

const endpoint = { url: z.url().refine((value) => {
  const url = new URL(value)
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
}), model: z.string().trim().min(1).max(512), keyRef: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional() }
const provider = z.strictObject({ kind: z.literal('provider'), provider: z.string().trim().min(1).max(512), model: endpoint.model })
const modelsSchema = z.strictObject({
  maxRetries: z.number().int().min(0).max(100).optional(),
  writerInherit: z.boolean().optional(),
  localDecision: z.boolean().optional(),
  decision: z.discriminatedUnion('kind', [provider, z.strictObject({ kind: z.literal('jev'), ...endpoint, threshold: z.number().min(0).max(1) }), z.strictObject({ kind: z.literal('openai'), ...endpoint })]),
  writer: z.discriminatedUnion('kind', [provider.extend({ provider: z.string().trim().max(512), model: z.string().trim().max(512) }),
    z.strictObject({ kind: z.literal('openai'), ...endpoint })]),
}).refine(value => value.writerInherit === true || value.writer.kind !== 'provider'
  || Boolean(value.writer.provider && value.writer.model), 'Select a writer provider and model, or inherit the DSH LLM.')
const rowSchema = z.strictObject({ schemaVersion: z.literal(1), revision: z.number().int().min(1), models: modelsSchema })
/** Separate schema generation: existing life and embedding domains are unchanged. */
export const modelPreferencesDomain = defineDomain({ name: 'genesis_model_settings', version: 1,
  tables: { settings: domainTable<'models', z.infer<typeof rowSchema>>(rowSchema) } })

/**
 * Resolve deployment routes before any GUI save.
 * @param memory - Optional memory deployment.
 * @returns Nonsecret decision and writer routes; missing models remain visibly pending.
 */
export function memoryModels(memory?: MemoryConfig): MemoryModelsSettings & { maxRetries: number } {
  return {
    maxRetries: memory?.maxRetries ?? 3,
    writerInherit: !memory?.writerProvider && !memory?.writerModel,
    decision: memory?.decisionUrl === undefined
      ? { kind: 'provider', provider: memory?.decisionProvider ?? '', model: memory?.decisionModel ?? '' }
      : { kind: 'jev', url: memory.decisionUrl, model: memory.decisionModel, threshold: memory.decisionThreshold ?? 0.5,
        ...(memory.decisionKeyEnv === undefined ? {} : { keyRef: memory.decisionKeyEnv }) },
    writer: { kind: 'provider', provider: memory?.writerProvider ?? '', model: memory?.writerModel ?? '' },
  }
}

/** Serializes revision checks and commits under the existing life writer lease. */
export class ModelPreferences {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  /**
   * @param domain - Exclusive preferences domain.
   * @param config - Deployment fallback.
   * @param chat - Current DSH default selection; absent uses the awakening deployment.
   * @param local - Owned runtime endpoint; required only when a local decision route is selected.
   */
  constructor(private readonly domain: Domain<typeof modelPreferencesDomain>, private readonly config: Config,
    private readonly chat?: () => { provider: string; model: string } | undefined,
    private readonly local?: () => MemoryModelsSettings['decision']) {}
  /** Read saved routes or deployment defaults.
   * @returns Detached effective routes and revision; zero means deployment values.
   */
  read(): { revision: number; models: MemoryModelsSettings; configuredDecision: MemoryModelsSettings['decision'] } {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'Memory model settings are closing.')
    const saved = this.domain.table('settings').get('models')
    const models = saved === undefined ? memoryModels(this.config.memory) : { ...structuredClone(saved.models),
      maxRetries: saved.models.maxRetries ?? memoryModels(this.config.memory).maxRetries }
    if (models.writerInherit) {
      const selected = this.chat?.() ?? this.config.awakening
      models.writer = { kind: 'provider', provider: selected?.provider ?? '', model: selected?.model ?? '' }
    }
    const configuredDecision = structuredClone(models.decision)
    if (models.localDecision) {
      if (this.local === undefined) throw new GenesisError('memory-provider', 'The local decision runtime is not loaded.')
      models.decision = this.local()
    }
    return { revision: saved?.revision ?? 0, models, configuredDecision }
  }
  /**
   * Persist only validated nonsecret routes; stale edits cannot overwrite newer settings.
   * @param settings - Independent decision and writer routes.
   * @param revision - Last displayed revision.
   * @returns Committed revision; uncertain writes stop dependent operations until verified reload.
   */
  save(settings: MemoryModelsSettings, revision: number): Promise<number> {
    const models = modelsSchema.parse(settings)
    this.read()
    const operation = this.tail.then(async () => {
      if (this.failure !== undefined) throw this.failure
      const current = this.domain.table('settings').get('models')?.revision ?? 0
      if (current !== revision) throw new GenesisError('configuration-conflict', 'Memory model settings changed. Refresh before saving again.')
      try { await this.domain.table('settings').put('models', { schemaVersion: 1, revision: current + 1, models }) }
      catch (error) {
        this.failure = new GenesisError('storage', 'Memory model settings write has an uncertain outcome. Reload verified storage before memory operations.', { cause: error })
        throw this.failure
      }
      return current + 1
    })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* The caller reports failures; disposal drains the settled queue. */ })
    return operation
  }
  /** Drain accepted writes and close the preferences domain. @returns After all accepted writes settle and the domain closes. */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
