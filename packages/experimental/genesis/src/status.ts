/** Life status and one-time naming, exported through the existing authenticated Gateway. @module */
import { searchText, memoryDocument } from './search.ts'
import { isNonDeclarative } from './personality.ts'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { LifeMemoryEngine } from './memory.ts'
import type { ModelPreferences } from './model-preferences.ts'
import { catalogModels, modelCatalogUrl, modelHeaders, modelJson } from './model-endpoint.ts'
import type { MemoryModelsSettings } from './status-types.ts'
import type { LifeStatus, MemoryCatalog, MemoryKind, PersonalityStatus } from './status-types.ts'
import type { Config } from './config.ts'
import { auxiliaryCall } from './auxiliary-call.ts'
import { reviewDecisionSchema } from './model-endpoint.ts'
import { GenesisError } from './error.ts'
import { memoryView } from './memory.ts'
import { configuredEmbeddings } from './embedding.ts'
import type { EmbeddingPreferences } from './embedding-preferences.ts'
import type { EmbeddingSettings } from './status-types.ts'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { LifeEmotionEngine } from './emotion.ts'
import type { LifeInterestEngine } from './interest.ts'
import { interestSchema } from './model.ts'
import { z } from 'zod'
import { appraisalSchema, appraisalEffectsSchema, relationshipAdjustmentSchema, type RelationshipAdjustment } from './relationship-state.ts'
import { emotionAt, resolveEmotion, emotionUpdateSchema, emotionStateSchema, emotionSettingsSchema, emotionAdjustmentSchema, type EmotionSettings, type EmotionAdjustment } from './emotion-state.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap { 'genesis-awakening': { kind: 'genesis-awakening' } & ContextFormed }
}

declare module '@deepseek-ai/cordis' {
  interface Context { genesisStatus: GenesisStatusGateway }
}

/** Sample shared life state and initialize its name without changing its identity or permissions. */
export class GenesisStatusGateway extends TypertRemoteService {
  static inject = ['genesis', 'agents', 'tools', 'llm']
  private readonly lifetime = new AbortController()
  private greeting: Promise<SessionId> | undefined
  private readonly operations = new Set<Promise<unknown>>()

  /**
   * @param ctx - Life state and real Agent registry.
   * @param options - Projection limits and the owned durable embedding preferences.
   */
  constructor(ctx: Context, private readonly options: {
    config: Config
    preferences: EmbeddingPreferences
    models: ModelPreferences
    memory: LifeMemoryEngine | undefined
    emotion: LifeEmotionEngine | undefined
    interest: LifeInterestEngine | undefined
    lifeMode: (agent: Agent | undefined) => boolean
  }) {
    super(ctx, 'genesisStatus')
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled(this.operations)
    })
  }

  /** Read the current auxiliary decision route without constructing a full status response.
   * @returns Detached operator route.
   */
  decisionModel(): MemoryModelsSettings['decision'] { return this.options.models.read().models.decision }

  /**
   * Evaluate a binary question through the configured decision route with durable request/response audit.
   * @param session - Actual caller's inference log.
   * @param question - Trusted binary question; generative routes receive explicit JSON output instructions.
   * @param input - Complete bounded evidence with explicitly scoped participants.
   * @param criteria - Trusted yes/no interpretations for binary endpoints.
   * @param signal - Caller cancellation; the shared auxiliary deadline also applies.
   * @param route - Optional channel-only decision route; shared settings remain unchanged.
   * @returns Validated answer and genuine endpoint probability when supplied; failure authorizes no action.
   */
  async decide(session: Session, question: string, input: Record<string, unknown> & { participants: object },
    criteria: { true: string; false: string }, signal: AbortSignal, route?: MemoryModelsSettings['decision']): Promise<{ update: boolean; decision?: { probability: number; threshold: number } | undefined }> {
    return this.operation(signal, async (owned) => {
      const config = this.options.config.memory
      if (config === undefined) throw new GenesisError('invalid-state', 'Configure the Genesis decision model before enabling automatic group replies.')
      const shared = this.options.models.read().models
      const models = route === undefined ? shared : { ...shared, decision: route }
      const system = models.decision.kind === 'jev' ? question : `${question}\nReturn only JSON: {"update":true} or {"update":false}.`
      const result = await auxiliaryCall(this.ctx, session, 'decision', system, input,
        AbortSignal.any([owned, AbortSignal.timeout(config.timeoutMs)]), models, config, criteria)
      const answer = reviewDecisionSchema.parse(result)
      return models.decision.kind === 'jev' ? answer : { update: answer.update }
    })
  }

  private async operation<T>(signal: AbortSignal, run: (owned: AbortSignal) => Promise<T>): Promise<T> {
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    owned.throwIfAborted()
    const pending = run(owned)
    this.operations.add(pending)
    try { return await pending } catch (error) { throw statusFailure(error) } finally { this.operations.delete(pending) }
  }

  private async prepare(signal: AbortSignal): Promise<void> {
    const { awakening, memory } = this.options.config
    if (awakening === undefined || memory === undefined) throw new GenesisError('invalid-state', 'Enable awakening with memory configuration first.')
    await this.ctx.llm.prepareCall(awakening, signal)
    const models = this.options.models.read().models
    for (const role of ['decision', 'writer'] as const) {
      const route = models[role]
      signal.throwIfAborted()
      if (route.kind === 'provider') await this.ctx.llm.prepareCall(route, signal)
      else await modelHeaders(this.ctx, route)
    }
    await configuredEmbeddings(this.ctx, memory, this.options.preferences.read().embedding).credential()
  }

  /**
   * Check configured chat/reviewer/writer routes and the embedding service, then name this existing life once.
   * Credentials use the existing provider settings or account sign-in; no secrets are accepted or stored here.
   * @param name - User-chosen name, retained across Sessions and restarts.
   * @param signal - Caller cancellation; an admitted storage commit may still finish after cancellation.
   * @returns After naming commits; errors leave initialization pending unless a storage write has uncertain outcome.
   */
  @Remote('initialize')
  async initialize(name: string, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async (signal) => {
      const memory = this.options.config.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Configure independent memory before initialization.')
      if (!name.trim() || name.trim().length > 200) throw new GenesisError('invalid-source', 'Choose a name of 1 to 200 characters.')
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(memory.timeoutMs)])
      await this.prepare(deadline)
      await configuredEmbeddings(this.ctx, memory, this.options.preferences.read().embedding).embed('Memory initialization', deadline)
      deadline.throwIfAborted()
      await this.ctx.genesis.awaken(name)
    })
  }

  /**
   * Persist independent memory routes without credentials or profile-overlay precedence.
   * @param settings - Decision and writer routes.
   * @param revision - Displayed revision; stale changes are refused.
   * @param signal - Caller cancellation; admitted writes still drain.
   * @returns Committed revision.
   */
  @Remote('saveModels')
  async saveModels(settings: MemoryModelsSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async () => this.options.models.save(settings, revision))
  }

  /**
   * Check a saved provider route, or authenticate against an endpoint's model catalog without sending conversation data.
   * @param role - Independent decision or writer configuration to check.
   * @param signal - Caller cancellation; the memory timeout bounds network work.
   * @returns After provider preparation or a valid model catalog containing the selected model.
   */
  @Remote('testModel')
  async testModel(role: 'decision' | 'writer', signal: AbortSignal): Promise<void> {
    return this.operation(signal, async (signal) => {
      const memory = this.options.config.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Enable memory before checking its models.')
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(memory.timeoutMs)])
      const route = this.options.models.read().models[role]
      if (route.kind === 'provider') { await this.ctx.llm.prepareCall(route, deadline); return }
      const headers = await modelHeaders(this.ctx, route)
      const url = modelCatalogUrl(route)
      const result = await modelJson(await fetch(url, { headers, signal: deadline, redirect: 'error' }),
        this.options.config.modelCatalogChars, 'modelCatalogChars')
      const catalog = catalogModels(result)
      if (!catalog.includes(route.model)) throw new GenesisError('memory-provider', 'The selected model is absent from the endpoint catalog.')
    })
  }

  /**
   * Start the logged built-in awakening in an existing blank life-mode Session, once per life.
   * @param sessionId - Session created through the supported Web Session API.
   * @param language - UI language used only for the first greeting.
   * @param signal - Caller cancellation before admission; queued work belongs to the Agent thereafter.
   * @returns Canonical first Session, including when another browser already started it.
   */
  @Remote('greet')
  async greet(sessionId: SessionId, language: 'en' | 'zh', signal: AbortSignal): Promise<SessionId> {
    return this.operation(signal, async (signal) => {
      if (this.greeting !== undefined) return this.greeting
      const prior = this.ctx.genesis.learningStatus().firstSessionId
      if (prior !== undefined) return prior
      const agent = this.ctx.agents.get(sessionId)
      if (agent === undefined || !this.options.lifeMode(agent)) throw new GenesisError('invalid-state', 'Open a life-mode conversation before awakening.')
      const boundary = this.ctx.agents.turnBoundaryOf(agent.session)
      if (boundary === undefined) throw new GenesisError('invalid-state', 'The turn projection is unavailable.')
      if (boundary.lastTurn !== 0) throw new GenesisError('invalid-state', 'Awakening requires a blank conversation.')
      signal.throwIfAborted()
      const pending = (async () => {
        await this.ctx.genesis.beginConversation(sessionId)
        agent.followup(createUserMessage({ source: { kind: 'genesis-awakening', form: 'notice',
          summary: language === 'zh' ? '第一次醒来' : 'First awakening' }, content: [{ type: 'text',
          text: `This is your first awakening. Your recorded name and birth are in your life context. You have no shared experiences or personal knowledge of the user. Greet them with gentle, innocent curiosity, introduce yourself by your name, and ask one simple question to get to know them. Do not invent a relationship or claim memories have been saved. Reply in ${language === 'zh' ? 'Chinese' : 'English'}.` }] }))
        return sessionId
      })()
      this.greeting = pending
      try { return await pending } catch (error) { throw statusFailure(error) } finally { this.greeting = undefined }
    })
  }

  /**
   * Save complete operator emotion rules without changing life identity or permissions.
   * @param settings - JSON-validated enabled state, appraisal bounds and recovery parameters.
   * @param revision - Last displayed emotion revision; stale drafts are rejected.
   * @param signal - Caller cancellation; admitted writes still drain.
   * @returns Committed revision; refresh status before making a subsequent edit.
   */
  @Remote('saveEmotionSettings')
  async saveEmotionSettings(settings: EmotionSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async (owned) => {
      const parsed = emotionSettingsSchema.parse(settings)
      owned.throwIfAborted()
      return this.ctx.genesis.configureEmotion(parsed, revision)
    })
  }

  /**
   * Apply an explicit operator adjustment, recorded separately from model appraisals.
   * @param adjustment - Absolute intensities and the operator's reason.
   * @param revision - Last displayed revision; stale drafts cannot overwrite newer state.
   * @param signal - Caller cancellation; accepted writes complete before disposal.
   * @returns Committed revision; the next logged request context reflects this adjustment.
   */
  @Remote('adjustEmotion')
  async adjustEmotion(adjustment: EmotionAdjustment, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async (owned) => {
      const parsed = emotionAdjustmentSchema.parse(adjustment)
      owned.throwIfAborted()
      return this.ctx.genesis.adjustEmotion(parsed, revision)
    })
  }

  /**
   * Adjust the persistent single-operator relationship without creating conversation evidence.
   * @param adjustment - Absolute values, display label and operator reason.
   * @param revision - Last sampled emotion revision; stale edits are refused.
   * @param signal - Caller cancellation; accepted atomic writes drain.
   * @returns Committed revision; refresh the shared status after saving.
   */
  @Remote('adjustRelationship')
  async adjustRelationship(adjustment: RelationshipAdjustment, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async (owned) => {
      const parsed = relationshipAdjustmentSchema.parse(adjustment)
      owned.throwIfAborted()
      return this.ctx.genesis.adjustRelationship(parsed, revision)
    })
  }

  /**
   * Retry the latest failed review while its live evidence remains available.
   * @param sessionId - Conversation that owns the failed review.
   * @param signal - Caller cancellation; no new chat reply is generated.
   * @returns After the retry settles; restart or newer-turn evidence requires a new conversation turn.
   */
  @Remote('retryMemory')
  async retryMemory(sessionId: SessionId, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async (signal) => {
      const memory = this.options.memory
      const status = memory?.status()
      const agent = this.ctx.agents.get(sessionId)
      if (memory === undefined) throw new GenesisError('invalid-state', 'The memory pipeline is disabled. Enable it before retrying.')
      if (status?.state !== 'failed') throw new GenesisError('invalid-state', 'No failed memory review is retained in this runtime. After a restart, continue the conversation to provide new evidence.')
      if (status.sessionId !== sessionId) throw new GenesisError('invalid-state', 'The latest failed review belongs to another conversation. Retry from its original conversation.')
      if (agent === undefined) throw new GenesisError('invalid-state', 'The original conversation is no longer active. Reopen it and continue chatting to provide new evidence.')
      if (this.options.config.awakening !== undefined && !this.options.lifeMode(agent)) throw new GenesisError('invalid-source', 'Only Life conversations can update life memory.')
      await agent.whenIdle()
      await memory.retry(agent, status.turn, signal)
    })
  }

  /**
   * Save nonsecret embedding preferences independently of command-line profile overlays.
   * @param settings - Validated endpoint, model, dimensions and optional credential reference.
   * @param revision - Revision from the displayed status sample.
   * @param signal - Caller cancellation; an admitted write drains even if cancelled later.
   * @returns The committed revision, after durable storage has accepted the update.
   */
  @Remote('saveEmbedding')
  async saveEmbedding(settings: EmbeddingSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, async () => {
      try { return await this.options.preferences.save(settings, revision) } catch (error) {
        if (error instanceof GenesisError && error.code === 'storage') {
          this.ctx.logger.error('Genesis embedding settings write has an uncertain outcome. Embedding operations are stopped; inspect preference storage before reload.')
        }
        throw error
      }
    })
  }

  /**
   * Probe the saved embedding configuration without changing identity or memories.
   * @param signal - Caller cancellation; the configured memory deadline bounds the request.
   * @returns After one response with the expected vector dimensions has been verified.
   */
  @Remote('testEmbedding')
  async testEmbedding(signal: AbortSignal): Promise<void> {
    return this.operation(signal, async (signal) => {
      const memory = this.options.config.memory
      if (memory === undefined) throw new GenesisError('invalid-state', 'Enable the memory overlay before testing embeddings.')
      await configuredEmbeddings(this.ctx, memory, this.options.preferences.read().embedding).embed('Memory configuration check',
        AbortSignal.any([signal, AbortSignal.timeout(memory.timeoutMs)]))
    })
  }

  /**
   * Read personality and expression memories independently of unrelated memory previews.
   * @param signal - Caller cancellation before the bounded read.
   * @returns Current behavioral records and an explicit count of omitted matches, without vector caches.
   */
  @Remote('personality')
  personality(signal: AbortSignal): Promise<PersonalityStatus> {
    return this.operation(signal, async (owned) => {
      const state = await this.ctx.genesis.snapshot()
      owned.throwIfAborted()
      const found = state.memories.filter(memory => isNonDeclarative(memory)
        && (memory.category === 'self' || memory.category === 'procedural'))
        .sort((a, b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt))
      const entries: LifeStatus['memories'] = []
      for (const memory of found) {
        if (entries.length >= this.options.config.queryLimit) break
        const view = memoryView(memory)
        if (JSON.stringify({ entries: [...entries, view], omitted: found.length - entries.length - 1 }).length
          <= this.options.config.resultChars) entries.push(view)
      }
      return { entries, omitted: found.length - entries.length }
    })
  }

  /**
   * Search stored memories by relevance, or browse newest first, without an embedding request.
   * @param query - Multilingual keywords, partial names or an exact memory ID; blank text lists every memory.
   * @param kind - Layer filter; `all` includes both layers.
   * @param offset - Zero-based page offset within the filtered ranking.
   * @param signal - Caller cancellation.
   * @returns One bounded page, its filtered total and the continuation offset; vectors are excluded.
   */
  @Remote('memories')
  async memories(query: string, kind: MemoryKind | 'all', offset: number, signal: AbortSignal): Promise<MemoryCatalog> {
    return this.operation(signal, async (signal) => {
      z.enum(['all', 'declarative', 'non-declarative']).parse(kind)
      z.number().int().nonnegative().parse(offset)
      if (query.length > this.options.config.resultChars) throw new GenesisError('capacity', 'Narrow the memory search text.')
      const state = await this.ctx.genesis.snapshot()
      signal.throwIfAborted()
      const needle = query.trim()
      const eligible = state.memories.filter(memory => (kind === 'all'
        || (memory.kind ?? (memory.category === 'procedural' ? 'non-declarative' : 'declarative')) === kind))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.updatedAt.localeCompare(left.updatedAt))
      const found = needle ? searchText(needle, eligible.map(memoryDocument)).map(match => match.value) : eligible
      const items: LifeStatus['memories'] = []
      for (const memory of found.slice(offset, offset + this.options.config.queryLimit)) items.push(memoryView(memory))
      const result: MemoryCatalog = { items, total: found.length,
        nextOffset: offset + items.length < found.length ? offset + items.length : null }
      while (items.length > 1 && JSON.stringify(result).length > this.options.config.resultChars) {
        items.pop(); result.nextOffset = offset + items.length
      }
      if (JSON.stringify(result).length > this.options.config.resultChars) {
        throw new GenesisError('capacity', 'Memory page exceeds resultChars. Increase the response budget before browsing memories.')
      }
      return result
    })
  }

  /**
   * Sample live tools, identity, counts and bounded memory/growth previews.
   * Historical scopes are excluded from current availability. Errors reject;
   * callers keep their previous sample visibly stale and offer retry.
   * @param signal - Caller cancellation; already-started life writes retain their durability semantics.
   * @returns A bounded detached status sample with explicit omission counts.
   */
  @Remote('inspect')
  async inspect(signal: AbortSignal): Promise<LifeStatus> {
    return this.operation(signal, async (signal) => {
      signal.throwIfAborted()
      const agents = this.ctx.agents.list().filter(agent => this.options.config.awakening === undefined || this.options.lifeMode(agent))
      for (const agent of agents) {
        signal.throwIfAborted()
        await this.ctx.genesis.scan(agent.session.id, this.ctx.tools.schemas(agent))
      }
      const state = await this.ctx.genesis.snapshot()
      const capabilities = agents.flatMap(agent => (state.sessions[agent.session.id] ?? [])
        .filter(capability => capability.available).map(capability => ({ sessionId: agent.session.id, capability })))
      const result: LifeStatus = {
        ...(this.options.config.awakening?.lifePreset === undefined ? {} : { lifePreset: this.options.config.awakening.lifePreset }),
        identity: state.identity, sampledAt: new Date().toISOString(),
        operator: state.operator ?? { name: '', identity: '', revision: 0 },
        runtime: { platform: process.platform, node: process.versions.node, liveSessions: agents.length },
        counts: { events: state.events.length, memories: state.memories.length, growth: state.growth.length },
        capabilities: [], memories: [], growth: [],
        omitted: { capabilities: capabilities.length, memories: state.memories.length, growth: state.growth.length },
      }
      if (this.options.emotion !== undefined && state.emotion !== undefined) {
        const review = this.options.emotion.status()
        const emotionConfig = this.options.config.emotion
        if (emotionConfig === undefined) throw new GenesisError('invalid-state', 'Emotion status is available without emotion configuration.')
        result.emotion = { ...emotionAt(state.emotion, result.sampledAt), settings: resolveEmotion(emotionConfig, state.emotion),
          history: [], omitted: 0, ...(review === undefined ? {} : { review }) }
      }
      if (this.options.interest !== undefined && state.interests !== undefined) {
        const review = this.options.interest.status()
        result.interest = { entries: [], omitted: state.interests.length, history: [], historyOmitted: 0,
          ...(review === undefined ? {} : { review }) }
      }
      const policy = this.options.config.memory?.consolidation
      if (this.options.config.memory !== undefined) result.organization = {
        selectionLimit: this.options.config.memory.organizationLimit, maxResults: this.options.config.memory.maxChanges,
      }
      if (policy !== undefined) result.consolidation = { ...(state.consolidation ?? {
        revision: 0, completed: 0, failures: 0, requestedAt: state.identity.createdAt }),
      enabled: state.consolidation?.enabled ?? policy.enabled, maxFailures: policy.maxFailures, minHabitSupport: policy.minHabitSupport }
      const review = this.options.memory?.status()
      if (review !== undefined) result.review = review
      const models = this.options.models.read()
      const keys = { decision: { configured: true, writable: false }, writer: { configured: true, writable: false } }
      for (const role of ['decision', 'writer'] as const) {
        const route = models.models[role]
        const ref = route.kind === 'provider' ? undefined : route.keyRef
        const key = await this.ctx.get('credentials')?.describe(credentialRef(ref ?? `GENESIS_${role.toUpperCase()}_API_KEY`))
        keys[role] = { configured: ref === undefined || (key?.configured ?? Boolean(process.env[ref]?.trim())),
          writable: key?.writable ?? false }
      }
      result.models = { ...models.models, revision: models.revision, keys }
      const { embedding, revision } = this.options.preferences.read()
      const credentials = this.ctx.get('credentials')
      const key = await credentials?.describe(credentialRef(embedding.keyRef ?? 'GENESIS_EMBEDDING_API_KEY'))
      result.embedding = { ...embedding, revision,
        keyConfigured: embedding.keyRef === undefined || (key?.configured ?? Boolean(process.env[embedding.keyRef]?.trim())),
        keyWritable: key?.writable ?? false }
      if (this.options.config.awakening !== undefined) {
        const memory = this.options.config.memory
        if (memory === undefined) throw new GenesisError('invalid-state', 'Awakening requires independent memory configuration.')
        if (state.identity.name !== null) {
          const firstSessionId = this.ctx.genesis.learningStatus().firstSessionId
          result.setup = this.ctx.genesis.learningStatus().firstConversationComplete
            ? { phase: 'ready', ...(firstSessionId === undefined ? {} : { firstSessionId }) }
            : { phase: 'conversation', ...(firstSessionId === undefined ? {} : { firstSessionId }) }
        }
        else {
          try {
            await this.prepare(AbortSignal.any([signal, AbortSignal.timeout(memory.timeoutMs)]))
            result.setup = { phase: 'naming' }
          } catch {
            // Readiness failures contain provider/credential details; the UI receives only the recoverable setup phase.
            signal.throwIfAborted()
            result.setup = { phase: 'credentials' }
          }
        }
      }
      const admit = <T>(entries: T[], source: T[], kind: keyof LifeStatus['omitted']) => {
        for (const item of source.slice(0, this.options.config.queryLimit)) {
          entries.push(item)
          result.omitted[kind] -= 1
          if (JSON.stringify(result).length > this.options.config.resultChars) {
            entries.pop()
            result.omitted[kind] += 1
          }
        }
      }
      admit(result.memories, state.memories.slice().sort((a, b) => b.importance - a.importance).map(memoryView), 'memories')
      admit(result.growth, state.growth.slice().reverse(), 'growth')
      admit(result.capabilities, capabilities, 'capabilities')
      if (result.interest !== undefined) {
        const interests = state.interests ?? []
        const recent = interests.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, this.options.config.queryLimit)
        for (const item of recent) {
          result.interest.entries.push({ id: item.id, topic: item.topic, stage: item.stage, reason: item.reason,
            createdAt: item.createdAt, updatedAt: item.updatedAt, evidenceCount: item.evidence.length,
            sourceEventIds: item.evidence.at(-1)?.sourceEventIds ?? [] })
          result.interest.omitted--
          if (JSON.stringify(result).length > this.options.config.resultChars) {
            result.interest.entries.pop(); result.interest.omitted++; break
          }
        }
        const history = state.events.filter(event => event.type === 'interest.changed').reverse()
        result.interest.historyOmitted = history.length
        for (const event of history.slice(0, this.options.config.queryLimit)) {
          const interestId = z.string().parse(event.payload['interestId'])
          const item = interests.find(value => value.id === interestId)
          if (item === undefined) throw new GenesisError('invalid-state', 'Interest history refers to an absent topic. Restore verified life storage.')
          const sourceEventIds = state.events.filter(source => Array.isArray(event.payload['sourceEventIds'])
            && event.payload['sourceEventIds'].includes(source.id)).map(source => source.id)
          result.interest.history.push({ id: event.id, interestId: item.id, timestamp: event.timestamp,
            topic: item.topic, before: interestSchema.shape.stage.nullable().parse(event.payload['before']),
            after: interestSchema.shape.stage.parse(event.payload['after']),
            signal: z.enum(['contact', 'curiosity', 'exploration', 'return', 'disinterest']).parse(event.payload['signal']),
            reason: z.string().parse(event.payload['reason']), sourceEventIds })
          result.interest.historyOmitted--
          if (JSON.stringify(result).length > this.options.config.resultChars) {
            result.interest.history.pop(); result.interest.historyOmitted++; break
          }
        }
      }
      if (result.emotion !== undefined) {
        const history = state.events.filter(event => event.type === 'emotion.initialized' || event.type === 'emotion.configured'
          || event.type === 'emotion.adjusted' || event.type === 'emotion.upgraded' || event.type === 'relationship.adjusted' || (event.type === 'emotion.reviewed' && event.payload['changed'] === true)).reverse()
        result.emotion.omitted = history.length
        for (const event of history.slice(0, this.options.config.queryLimit)) {
          const sample = event.type === 'emotion.initialized' ? event.payload['state'] : event.payload['after']
          // Historical generations remain in the event store; current readouts never reinterpret them.
          if (sample !== null && typeof sample === 'object' && !Array.isArray(sample) && sample['version'] !== 3) continue
          const after = emotionStateSchema.parse(sample)
          const sourceEventIds = state.events.filter(source => Array.isArray(event.payload['sourceEventIds'])
            && event.payload['sourceEventIds'].includes(source.id)).map(source => source.id)
          result.emotion.history.push({ id: event.id, timestamp: event.timestamp,
            source: event.source === 'user' ? 'user' : event.source === 'agent' ? 'agent' : 'system',
            kind: event.type === 'emotion.initialized' ? 'initialized' : event.type === 'emotion.configured' ? 'configured'
              : event.type === 'emotion.adjusted' ? 'adjusted' : event.type === 'emotion.upgraded' ? 'upgraded'
                : event.type === 'relationship.adjusted' ? 'relationship-adjusted' : 'reviewed',
            reason: typeof event.payload['reason'] === 'string' ? event.payload['reason'] : '',
            current: after.current, mood: after.mood, needs: after.needs,
            ...(event.payload['targets'] === undefined ? {} : { targets: emotionUpdateSchema.shape.targets.parse(event.payload['targets']) }), relationship: after.relationship, sourceEventIds,
            ...(event.payload['appraisal'] === undefined ? {} : { appraisal: appraisalSchema.parse(event.payload['appraisal']) }),
            ...(event.payload['effects'] === undefined ? {} : { effects: appraisalEffectsSchema.parse(event.payload['effects']) }) })
          result.emotion.omitted--
          if (JSON.stringify(result).length > this.options.config.resultChars) {
            result.emotion.history.pop(); result.emotion.omitted++; break
          }
        }
      }
      if (JSON.stringify(result).length > this.options.config.resultChars) {
        throw new GenesisError('capacity', 'Genesis status exceeds resultChars. Increase the response budget before querying status.')
      }
      return result
    })
  }
}
