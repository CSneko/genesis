import { GenesisContactsGateway } from './contacts-gateway.ts'
import './social-projection.ts'
import './task-source.ts'
import './session-evidence.ts'
import { LifeToolExecutor } from './tool-executor.ts'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { GenesisSessionEvidence } from './session-evidence.ts'
import { SLEEP_MEMORY_PROMPT, sleepMemoryPlan } from './sleep-memory.ts'
import { LifeSleep } from './sleep.ts'
import { SleepStore } from './sleep-store.ts'
import { sleepDomain } from './sleep-model.ts'
import { GenesisRhythmGateway } from './rhythm-gateway.ts'
import { auxiliaryCall } from './auxiliary-call.ts'
import { z } from 'zod'
/** Optional Genesis Phase 1 Cordis integration; no changes to the Agent Loop. @module */
import { installBoredom } from './boredom.ts'
import { installSpontaneity } from './spontaneity.ts'
import { TemporaryMemoryEngine } from './temporary.ts'
import { TemporaryStore } from './temporary-store.ts'
import { temporaryDomain } from './temporary-model.ts'
import { GenesisTemporaryGateway } from './temporary-gateway.ts'
import { GenesisPeopleGateway } from './people-gateway.ts'
import { isHumanSource, personSource } from './people-model.ts'
export { participantIdentity } from './participants.ts'
export { modelHeaders, modelJson } from './model-endpoint.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { GenesisAgencyGateway } from './agency-gateway.ts'
import { GenesisInitiativeGateway } from './initiative-gateway.ts'
import { SocialInitiative } from './social.ts'
import { LifeDeliberationEngine, GOAL_CONTEXT_GUIDANCE, agencyContext } from './deliberation.ts'
import { MemoryConsolidator } from './consolidation.ts'
import { Config } from './config.ts'
import { LocalDecision } from './local-decision.ts'
import { LifeMessageRouter } from './message-routing.ts'
import { LifeEmotionEngine, EMOTION_GUIDANCE } from './emotion.ts'
import { emotionSettingsSchema, resolveEmotion, initialEmotion } from './emotion-state.ts'
import { LifeInterestEngine, INTEREST_GUIDANCE } from './interest.ts'
import { LifeCore } from './core.ts'
import { GUIDANCE, selfContextSections, boundedJson } from './context.ts'
import { PERSONALITY_GUIDANCE } from './personality.ts'
import { lifeRecordsDomain, lifeDomain } from './model.ts'
import { statusFailure } from './status-error.ts'
import { GenesisError } from './error.ts'
import { acquireLease } from './lease.ts'
import { preparePersonalDirectory } from './personal-directory.ts'
import { PARTICIPANT_GUIDANCE } from './participants.ts'
import { GenesisStatusGateway } from './status.ts'
import { GenesisMemoryGateway } from './memory-gateway.ts'
import { registerTools } from './tools.ts'
import { LifeMemoryEngine, MEMORY_GUIDANCE } from './memory.ts'
import { backupPath } from './backup.ts'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { ModelPreferences, modelPreferencesDomain } from './model-preferences.ts'
import { PurgePreferences, purgePreferencesDomain } from './purge-preferences.ts'
import { EmbeddingPreferences, embeddingPreferencesDomain } from './embedding-preferences.ts'
import { installLearning, LEARN_TOOL, RECALL_TOOL, LIFE_GUIDANCE, PURGE_GUIDANCE } from './awakening.ts'
import { WritingRecords } from './records.ts'
import { writingsDomain } from './records-model.ts'
import { prepareWritingRoot } from './records-files.ts'
import { GenesisRecordsGateway } from './records-gateway.ts'
import { registerWritingTool } from './records-tool.ts'
import { installModeIsolation } from './mode.ts'
import { registerTaskTool } from './tasks.ts'
import { registerPlanTool } from './plan-tool.ts'
import { ToolkitPreferences, toolkitPreferencesDomain } from './toolkit-preferences.ts'
import { LifeToolkits, TOOLKIT_TOOL } from './toolkits.ts'
import { GenesisToolkitGateway } from './toolkit-gateway.ts'
import { lifeContextUpdate } from './context-update.ts'

export { LifeSleep } from './sleep.ts'
export { GenesisRhythmGateway } from './rhythm-gateway.ts'
export type { SleepTransition } from './sleep.ts'
export { LifeDeliberationEngine } from './deliberation.ts'
export type { IdleConversationProvider } from './spontaneity.ts'
export { Spontaneity } from './spontaneity.ts'
export type { ThoughtId, LifeThought, SpontaneityRun } from './spontaneity-state.ts'
export { SocialInitiative } from './social.ts'
export type { InteractionId, InteractionRecord } from './social-state.ts'
export type * from './agency-state.ts'
export type { DeliberationCommit } from './agency.ts'
export type { PlanChange } from './planning.ts'
export { Config } from './config.ts'
export { GenesisTemporaryGateway } from './temporary-gateway.ts'
export { GenesisToolkitGateway } from './toolkit-gateway.ts'
export { GenesisMemoryGateway } from './memory-gateway.ts'
export { GenesisStatusGateway } from './status.ts'
export { GenesisRecordsGateway } from './records-gateway.ts'
export type { WritingImportId, WritingTypeId, WritingDraft, WritingReceipt } from './records-model.ts'
export { GenesisAgencyGateway } from './agency-gateway.ts'
export { GenesisInitiativeGateway } from './initiative-gateway.ts'
export { GenesisTaskGateway } from './task-gateway.ts'
export { GenesisContactsGateway } from './contacts-gateway.ts'
export { GenesisPeopleGateway } from './people-gateway.ts'
export type { LifeStatus, AgencyStatus } from './status-types.ts'
export { LifeCore } from './core.ts'
export { LifeMessageRouter } from './message-routing.ts'
export type { MessageTargetId, MessageTarget, MessageProvider, MessageRequest, MessageInvocation, MessageOrigin } from './message-routing.ts'
export { qqPersonId, personSourceSchema, conversationIdSchema } from './people-model.ts'
export type { PersonId, ConversationId, PersonSource, LifeConversation, LifePerson } from './people-model.ts'
export { GenesisError } from './error.ts'
export type { EmotionState, Mood, Needs, EmotionCurrent, MoodHalfLives, EmotionHalfLives, EmotionSettings, EmotionAdjustment } from './emotion-state.ts'
export type * from './model.ts'
export type { ConsolidationCommit, ConsolidationChange, ReviewEvidence } from './consolidation-state.ts'
export type { EventQuery, MemoryQuery, ObservedInteraction, MemoryChange, ExperienceChange } from './core.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** One persistent life shared by all Sessions in this composition. */
    genesis: LifeCore
    /** Optional trusted autonomous deliberation entry; use ctx.get when optional. */
    genesisDeliberation: LifeDeliberationEngine
    /** Optional proactive conversation worker; use ctx.get when disabled. */
    genesisInitiative: SocialInitiative
  }
}
/** Loader plugin identifier. */
export const name = 'experimental-genesis'
/** Storage, scoped tools, prompts and real lifecycle owners must already exist. */
export const inject = ['storageDomain', 'tools', 'systemPrompt', 'agents', 'sessions', 'llm', 'sessionProjections', 'sandboxPolicy']

/**
 * Acquire exclusive life storage, restore identity and mount reversible contributions.
 * @param ctx - Cordis effect owner.
 * @param config - Validated deployment and context limits.
 * @returns After the life is restored and every registration is available.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if ((config.spontaneity !== undefined || config.sleep !== undefined) && (config.awakening?.lifePreset === undefined || config.deliberation === undefined
    || config.memory === undefined)) {
    throw new GenesisError('invalid-state', 'Spontaneity requires an exclusive Life preset, memory, deliberation and Session persistence. Load those services before Genesis.')
  }
  if (config.socialInitiative !== undefined && (config.deliberation === undefined || config.memory === undefined)) {
    throw new GenesisError('invalid-state', 'Social initiative requires deliberation and the independent memory writer route.')
  }
  if (config.spontaneity !== undefined && config.spontaneity.boredomMinIntervalMs > config.spontaneity.boredomMaxIntervalMs) {
    throw new GenesisError('invalid-state', 'spontaneity.boredomMinIntervalMs must not exceed boredomMaxIntervalMs. Correct the idle opportunity intervals before loading Genesis.')
  }
  if (config.records !== undefined && config.personalDirectory === undefined) {
    throw new GenesisError('invalid-state', 'Recording requires personalDirectory. Configure a private personal directory before enabling records.')
  }
  if (config.awakening !== undefined && config.memory === undefined) {
    throw new GenesisError('invalid-state', 'Awakening requires the independent memory pipeline. Configure memory before enabling awakening.')
  }
  if (config.emotion !== undefined && config.memory === undefined) {
    throw new GenesisError('invalid-state', 'Emotion requires independent decision and writer routes. Configure memory before enabling emotion.')
  }
  if (config.interest !== undefined && config.memory === undefined) {
    throw new GenesisError('invalid-state', 'Interest requires the independent memory writer route. Configure memory before enabling interest.')
  }
  if (config.emotion !== undefined) {
    emotionSettingsSchema.parse(resolveEmotion(config.emotion, initialEmotion(config.emotion, new Date().toISOString())))
  }
  ctx.provide('genesisSessionEvidence', await GenesisSessionEvidence.create(ctx, config))
  backupPath(config.leasePath, config.backupPath)
  const release = await acquireLease(config.leasePath)
  let core: LifeCore
  try {
    const domain = await ctx.storageDomain.open(lifeDomain)
    let records
    try { records = await ctx.storageDomain.open(lifeRecordsDomain) } catch (error) { await domain.close(); throw error }
    core = new LifeCore(domain, config, records)
    try {
      await core.start()
    } catch (error) {
      try { await records.close() } finally { await domain.close() }
      throw error
    }
  } catch (error) {
    await release()
    throw error
  }
  ctx.effect(() => async () => {
    try { await core.close() } finally { await release() }
  })
  ctx.provide('genesis', core)
  await ctx.plugin(LifeMessageRouter, config)
  if (config.emotion !== undefined) {
    const interval = config.emotion.clockCheckpointMs
    ctx.effect(() => {
      const lifetime = new AbortController()
      let timer: ReturnType<typeof setTimeout>
      const schedule = () => {
        timer = setTimeout(() => {
          void core.checkpointEmotion().then(() => { if (!lifetime.signal.aborted) schedule() }, (error: unknown) => {
            if (!lifetime.signal.aborted) ctx.logger.error(`Genesis emotion clock stopped. Reload after inspecting storage. ${statusFailure(error).message}`)
          })
        }, interval)
        timer.unref()
      }
      schedule()
      return () => { lifetime.abort(); clearTimeout(timer) }
    })
  }
  const lifeMode = (agent: Agent | undefined) => config.awakening !== undefined && (config.awakening.lifePreset === undefined
    || (agent !== undefined && ctx.get('agentPresets')?.composedPreset(agent.ctx) === config.awakening.lifePreset))
  const participates = (agent: Agent | undefined) => config.awakening === undefined || lifeMode(agent)
  if (config.emotion !== undefined) installBoredom(ctx, core, participates)
  ctx.tools.guard(exec => exec.agent !== undefined && core.isSpontaneitySession(exec.agent.id)
    && !ctx.get('genesisSpontaneity')?.admits(exec.agent)
    ? 'Internal cognition is stopped. Inspect its Session; a new opportunity must be explicitly admitted.' : undefined)
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const result = await next()
    return core.isSpontaneitySession(agent.id) && !ctx.get('genesisSpontaneity')?.admits(agent) ? { kind: 'reject' } : result
  }, { global: true })

  const personal = config.personalDirectory === undefined ? undefined : await preparePersonalDirectory(ctx, core, config.personalDirectory,
    session => participates(session === undefined ? undefined : ctx.agents.get(session.id)))
  let records: WritingRecords | undefined
  if (config.records !== undefined && personal !== undefined) {
    const root = await prepareWritingRoot(personal)
    records = new WritingRecords(await ctx.storageDomain.open(writingsDomain), root, (await core.snapshot()).identity.id, config.records)
    const owner = records
    ctx.effect(() => () => owner.close())
    await records.start()
    registerWritingTool(ctx, records, config.records)
  }
  await ctx.plugin(GenesisRecordsGateway, { records })
  const purge = new PurgePreferences(await ctx.storageDomain.open(purgePreferencesDomain), config)
  ctx.effect(() => () => purge.close())
  purge.read()
  const preferences = new EmbeddingPreferences(await ctx.storageDomain.open(embeddingPreferencesDomain), config)
  ctx.effect(() => () => preferences.close())
  const localDecision = new LocalDecision(ctx, config)
  ctx.provide('genesisLocalDecision', localDecision)
  ctx.effect(() => () => localDecision.close())
  const models = new ModelPreferences(await ctx.storageDomain.open(modelPreferencesDomain), config,
    () => ctx.get('agentDefaultModel')?.currentSelection(), () => localDecision.route())
  ctx.effect(() => () => models.close())
  if (models.read().models.localDecision) {
    try { await localDecision.start(false, new AbortController().signal) } catch (error) {
      ctx.logger.error(`Genesis local decision restoration failed. Retry deployment in model settings. ${statusFailure(error).message}`)
    }
  }
  const temporaryStorage = await ctx.storageDomain.open(temporaryDomain)
  let temporaryStore: TemporaryStore
  try {
    temporaryStore = new TemporaryStore(temporaryStorage, { schemaVersion: 1, lifeId: (await core.snapshot()).identity.id,
      revision: 0, settings: { enabled: config.temporaryMemory.enabled, idleMs: config.temporaryMemory.idleMs,
        inheritWriter: true, summary: models.read().models.writer }, sessions: [], memories: [] })
  } catch (error) { await temporaryStorage.close(); throw error }
  ctx.effect(() => () => temporaryStore.close())
  const temporary = new TemporaryMemoryEngine(ctx, core, temporaryStore, config, () => models.read().models, lifeMode)
  ctx.effect(() => () => temporary.close())
  temporary.start()
  await ctx.plugin(GenesisTemporaryGateway, { engine: temporary })
  // A busy QQ conversation may never reach the inactivity interval; summarize completed batches whenever it idles.
  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && participates(agent)) temporary.kick(agent.session)
  }, { global: true })
  const toolkitDomain = await ctx.storageDomain.open(toolkitPreferencesDomain)
  let toolkitPreferences: ToolkitPreferences
  try { toolkitPreferences = new ToolkitPreferences(toolkitDomain, config) }
  catch (error) { await toolkitDomain.close(); throw error }
  ctx.effect(() => () => toolkitPreferences.close())
  const toolkits = new LifeToolkits(ctx, core, toolkitPreferences, config)
  if (config.awakening !== undefined) toolkits.install(lifeMode)
  await ctx.plugin(GenesisToolkitGateway, { preferences: toolkitPreferences, config })
  installModeIsolation(ctx, participates)
  if (config.awakening?.lifePreset !== undefined) {
    ctx.inject(['workspaceRegistry', 'agentPresets', 'agentDefaultModel', 'sessions', 'sessionPersistence', 'sessionQuery'], async (child) => {
      await registerTaskTool(child, core, config, lifeMode)
    })
  }
  const deliberation = config.deliberation === undefined ? undefined
    : new LifeDeliberationEngine(ctx, core, config, config.deliberation, config.memory, () => models.read().models,
      agent => config.awakening === undefined || lifeMode(agent))
  if (deliberation !== undefined) {
    ctx.provide('genesisDeliberation', deliberation)
    ctx.effect(() => () => deliberation.close())
    ctx.on('agent/turn-stopping', async ({ agent }) => { await deliberation.settle(agent, false) }, { global: true })
  }
  let social: SocialInitiative | undefined
  if (config.socialInitiative !== undefined && deliberation !== undefined) {
    social = new SocialInitiative(ctx, core, deliberation, config.socialInitiative,
      agent => config.awakening === undefined || lifeMode(agent))
    const engine = social
    ctx.provide('genesisInitiative', engine)
    ctx.effect(() => () => engine.close())
    await engine.start()
    ctx.inject(['sessionPersistence'], async () => { await engine.resume() })
    ctx.on('agent/created', () => {
      void engine.resume().catch(error => ctx.logger.warn(`Genesis proactive delivery remains pending: ${statusFailure(error).message}`))
    }, { global: true })
    ctx.on('agent/status', ({ status }) => {
      if (status === 'idle') void engine.resume().catch(error => ctx.logger.warn(`Genesis proactive delivery remains pending: ${statusFailure(error).message}`))
    }, { global: true })
    ctx.tools.guard((exec) => {
      if (exec.agent === undefined) return undefined
      const receipt = ctx.genesisSessionEvidence.initiativeOf(exec.agent.session)
      return receipt?.id !== null && receipt?.id !== undefined && !receipt.ended
        ? 'A proactive conversation may send an assistant message but cannot execute task tools.' : undefined
    })
  }
  const memory = config.memory === undefined ? undefined
    : new LifeMemoryEngine(ctx, core, config, config.memory, () => preferences.read().embedding, () => models.read().models)
  const consolidation = memory === undefined || config.memory === undefined ? undefined
    : new MemoryConsolidator(ctx, core, memory, config.memory)
  if (memory !== undefined) {
    ctx.effect(() => () => memory.close())
    ctx.on('agent/turn-stopping', ({ agent, turn }) => {
      if (!participates(agent)) return
      void memory.review(agent, turn).catch((error) => {
        ctx.logger.error(`Genesis memory review failed. A storage or backup failure may follow a committed update; inspect storage before retrying. Otherwise check model and embedding configuration. ${statusFailure(error).message}`)
        // Background failure does not change the completed chat outcome.
      })
    }, { global: true })
  }
  let emotion: LifeEmotionEngine | undefined
  if (config.emotion !== undefined && config.memory !== undefined) {
    emotion = new LifeEmotionEngine(ctx, core, config.emotion, config.memory, () => models.read().models, config)
    const engine = emotion
    ctx.effect(() => () => engine.close())
    ctx.on('agent/turn-stopping', ({ agent, turn }) => {
      if (!participates(agent)) return
      void engine.review(agent, turn).catch((error) => {
        ctx.logger.error(`Genesis emotion review failed. Model or validation failures retain the previous anchor. Storage or backup uncertainty stops dependent life operations and may follow a committed update; inspect storage before retrying. ${statusFailure(error).message}`)
      })
    }, { global: true })
  }
  let interest: LifeInterestEngine | undefined
  const interestConfig = config.interest
  const memoryConfig = config.memory
  if (interestConfig !== undefined && memoryConfig !== undefined) {
    interest = new LifeInterestEngine(ctx, core, interestConfig, memoryConfig, () => models.read().models)
    const engine = interest
    ctx.effect(() => () => engine.close())
    ctx.on('agent/turn-stopping', ({ agent, turn }) => {
      if (!participates(agent)) return
      void engine.review(agent, turn).catch((error) => {
        ctx.logger.error(`Genesis interest review failed; prior interests remain. Inspect model configuration or life storage before retrying. ${statusFailure(error).message}`)
      })
    }, { global: true })
  }
  if (consolidation !== undefined) {
    ctx.effect(() => () => consolidation.close())
    ctx.on('agent/status', ({ agent, status }) => {
      if (!participates(agent)) return
      if (status === 'running') consolidation.activity()
      else consolidation.kick()
    }, { global: true })
    consolidation.kick()
  }
  await ctx.plugin(GenesisMemoryGateway, { memory, config, consolidation, participates })
  await ctx.plugin(GenesisPeopleGateway, config)
  await ctx.plugin(GenesisContactsGateway)
  await ctx.plugin(GenesisAgencyGateway, { config, lifeMode })
  await ctx.plugin(GenesisInitiativeGateway, { config, engine: social,
    applies: (agent: Agent) => config.awakening === undefined || lifeMode(agent) })
  await ctx.plugin(GenesisStatusGateway, { config, preferences, models, memory, emotion, interest, lifeMode, purge })
  const associations = new Map<object, string>()
  const selectTools = (agent: Agent, registered: readonly ToolDefinition[]) => {
    let eligible = [...registered]
    if (lifeMode(agent)) {
      const learned = core.learningStatus().tools
      eligible = eligible.filter(tool => tool.name === LEARN_TOOL || tool.name === RECALL_TOOL
        || (['genesis_contacts', 'genesis_search_contacts'].includes(tool.name) && core.isOperatorSession(agent.id))
        || (tool.name === 'genesis_message' && !core.isQqSession(agent.id) && core.isOperatorSession(agent.id))
        || (core.isQqSession(agent.id) && toolkits.qqAllowed(agent, tool.name, 'advertise'))
        || (config.deliberation !== undefined && tool.name === 'genesis_plan')
        || (config.spontaneity !== undefined && ['genesis_thought', 'genesis_socialize'].includes(tool.name))
        || (tool.name === TOOLKIT_TOOL && toolkits.discoverable(agent))
        || (learned.includes(tool.name) && toolkits.exposed(agent, tool.name)))
    }
    if (core.isQqSession(agent.id)) {
      if (!core.isOperatorSession(agent.id)) eligible = eligible.filter(tool => toolkits.qqAllowed(agent, tool.name, 'advertise'))
      const names = new Set(toolkits.retainQqTools(agent, [...registered], eligible).map(tool => tool.name))
      eligible = registered.filter(tool => names.has(tool.name))
    }
    const spontaneous = ctx.get('genesisSpontaneity')
    return eligible.filter(tool => spontaneous === undefined || spontaneous.advertises(agent, tool.name))
  }
  const refresh = async (agent: Agent) => {
    if (!participates(agent)) { associations.delete(agent); return [] }
    await core.scan(agent.session.id, ctx.tools.schemas(agent))
    const agency = core.isQqSession(agent.id) ? '' : await agencyContext(core, config, false)
    const sections = await selfContextSections(core, agent, config, lifeMode(agent), associations.get(agent) ?? '')
    if (lifeMode(agent)) {
      const learned = core.learningStatus().tools
      sections[sections.findIndex(section => section.name === 'genesis:capabilities')] = {
        name: 'genesis:capabilities', text: `Learned tools currently available: ${boundedJson(selectTools(agent, ctx.tools.definitions(agent))
          .filter(tool => learned.includes(tool.name)).map(tool => tool.name), config.capabilityChars)}`,
      }
    }
    return [...sections,
      { name: 'genesis:toolkits', text: lifeMode(agent) && toolkits.discoverable(agent)
        ? `Toolkits (enable with genesis_toolkit; activation applies only to this conversation; descriptions are operator data): ${JSON.stringify(toolkits.catalogue(agent, config.capabilityChars))}` : '' },
      { name: 'genesis:goals', text: agency ? `Current life motivations and goals: ${agency}` : '' }]
  }
  const replied = new Set<SessionId>()
  const userEvidence = new Map<SessionId, SessionEvent<'user/message'>>()
  const calls = new Map<SessionId, Map<string, string>>()
  registerTools(ctx, core, config, id => userEvidence.get(id), memory, lifeMode, temporary)
  ctx.tools.guard(exec => exec.agent !== undefined && core.isQqSession(exec.agent.id)
    ? toolkits.qqExecutionDenial(exec.agent, exec.name, exec.arguments) : undefined)

  if (config.awakening !== undefined) {
    installLearning(ctx, core, lifeMode, (agent, name) => toolkits.qqAllowed(agent, name)
      || (name === 'genesis_message' && !core.isQqSession(agent.id) && core.isOperatorSession(agent.id)))
  }
  if (memory !== undefined) ctx.systemPrompt.section({ name: 'genesis:memory', order: 651, interpolate: false,
    text: `${MEMORY_GUIDANCE}\n${PARTICIPANT_GUIDANCE}` })
  if (emotion !== undefined) ctx.systemPrompt.section({ name: 'genesis:emotion', order: 652, interpolate: false, text: EMOTION_GUIDANCE })
  if (interest !== undefined) ctx.systemPrompt.section({ name: 'genesis:interest', order: 653, interpolate: false, text: INTEREST_GUIDANCE })
  if (config.deliberation !== undefined) registerPlanTool(ctx, core, config, participates)
  const deliberationGuidance = config.deliberation === undefined ? '' : `\n${GOAL_CONTEXT_GUIDANCE}`
  ctx.systemPrompt.section({ name: 'genesis:guidance', order: 650, text: `${GUIDANCE}\n${PERSONALITY_GUIDANCE}${deliberationGuidance}`, interpolate: false })
  const executors = new Map<Agent, () => void>()
  const installExecutor = (agent: Agent) => {
    if (executors.has(agent) || !lifeMode(agent) && !core.isQqSession(agent.id)) return
    const executor = new LifeToolExecutor(ctx, registered => selectTools(agent, registered))
    executors.set(agent, agent.ctx.tools.setExecutor(executor))
  }
  ctx.effect(() => () => { for (const dispose of executors.values()) dispose(); executors.clear() })
  ctx.on('agent/disposed', ({ agent }) => { executors.get(agent)?.(); executors.delete(agent) }, { global: true })
  ctx.on('agent/status', ({ agent, status }) => { if (status === 'running') installExecutor(agent) }, { global: true })
  ctx.on('agent/created', async ({ agent, source }) => {
    if (!participates(agent)) return
    await core.bind(agent.session.id, source, ctx.tools.schemas(agent))
  }, { global: true })
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    if (lifeMode(context.agent)) {
      assembled.sections = [{ name: 'genesis:character', text: `${LIFE_GUIDANCE}\n${PERSONALITY_GUIDANCE}\n${PARTICIPANT_GUIDANCE}`
        + (config.emotion === undefined ? '' : `\n${EMOTION_GUIDANCE}`)
        + (config.interest === undefined ? '' : `\n${INTEREST_GUIDANCE}`)
        + deliberationGuidance, interpolate: false }]
      if (purge.read().enabled) assembled.sections.push({ name: 'genesis:purge', text: PURGE_GUIDANCE, interpolate: false })
      assembled.contexts = []
    }
    if (!participates(context.agent)) {
      assembled.sections = assembled.sections.filter(section => !section.name.startsWith('genesis:'))
      assembled.contexts = assembled.contexts.filter(section => !section.name.startsWith('genesis:'))
    }
    return assembled
  }, { global: true })
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    if (!participates(agent)) return next()
    if (lifeMode(agent) && !core.learningStatus().ready) {
      throw new GenesisError('invalid-state', 'Complete API configuration or account sign-in, then name this life before chatting.')
    }
    const decision = await next()
    if (social !== undefined && decision.kind === 'enter') decision.messages = await social.admit(agent, decision.messages)
    if (lifeMode(agent) && decision.kind === 'enter' && decision.messages.length > 0) {
      await core.beginConversation(agent.session.id)
    }
    if (deliberation !== undefined && decision.kind === 'enter') {
      decision.messages = await deliberation.admit(agent, decision.messages, signal)
    }
    const actualUsers = decision.kind === 'enter' ? decision.messages.filter(message => isHumanSource(message.source)) : []
    if (memory !== undefined && actualUsers.length > 0) {
      const text = actualUsers.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join(' ')
      associations.set(agent, await memory.associate(text, signal, agent.id))
    }
    if (decision.kind === 'enter') {
      const update = lifeContextUpdate(agent.session, await refresh(agent))
      if (update !== undefined) decision.messages.push(update)
      const temporaryUpdate = await temporary.context(agent)
      if (temporaryUpdate !== undefined) decision.messages.push(temporaryUpdate)
    }
    return decision
  }, { global: true })
  ctx.on('agent/request-error', async ({ agent, signal }, next) => {
    const action = await next()
    if (action?.kind === 'retry' && participates(agent)) {
      // Overflow recovery can remove modules without running another pre-step.
      const update = lifeContextUpdate(agent.session, await refresh(agent))
      signal.throwIfAborted()
      if (update !== undefined) agent.session.append('user/message', update, { surfaceOp: 'append' })
    }
    return action
  }, { global: true })
  ctx.on('agent/disposed', ({ agent }) => {
    if (deliberation !== undefined) void deliberation.settle(agent, true).catch((error) => {
      ctx.logger.error(`Genesis decision settlement failed during disposal. Inspect life storage. ${statusFailure(error).message}`)
    })
    memory?.forget(agent.session.id)
    replied.delete(agent.session.id)
    associations.delete(agent)
    userEvidence.delete(agent.session.id)
    calls.delete(agent.session.id)
  }, { global: true })
  ctx.on('session/event', (session, event) => {
    if (!participates(ctx.agents.get(session.id))) return
    temporary.observe(session, event)
    if (social !== undefined && (event.type === 'assistant/message' || event.type === 'turn/end')) social.observe(session)
    deliberation?.observe(session.id, event)
    if (deliberation !== undefined && event.type === 'turn/end' && event.data.reason.kind !== 'completed') {
      const agent = ctx.agents.list().find(candidate => candidate.session.id === session.id)
      if (agent !== undefined) void deliberation.settle(agent, true).catch((error) => {
        ctx.logger.error(`Genesis decision settlement failed. Inspect life storage before retrying. ${statusFailure(error).message}`)
      })
    }
    memory?.observe(session.id, event)
    if (event.type === 'user/message' && isHumanSource(event.data.source)) consolidation?.activity()
    if (event.type === 'turn/start') replied.delete(session.id)
    if (event.type === 'assistant/message' && !event.data.interrupted
      && event.data.message.content.some(block => block.type === 'text' && block.text.trim())) replied.add(session.id)
    if (event.type === 'turn/end' && event.data.reason.kind === 'completed' && replied.has(session.id)
      && core.learningStatus().firstSessionId === session.id && !core.learningStatus().firstConversationComplete) {
      void core.completeFirstConversation(session.id, String(event.seq), new Date(event.time).toISOString()).catch(() => {
        ctx.logger.error('First conversation completion could not be confirmed. Inspect Genesis storage before retrying initialization.')
      })
    }
    if (event.type === 'tool/call') {
      const pending = calls.get(session.id) ?? new Map<string, string>()
      pending.set(event.data.callId, event.data.name)
      calls.set(session.id, pending)
      return
    }
    if (event.type !== 'user/message' && event.type !== 'tool/result') return
    if (event.type === 'user/message' && !isHumanSource(event.data.source)) return
    if (event.type === 'user/message') userEvidence.set(session.id, event)
    // Life facts never emit Session events; live evidence is bounded to the latest user and pending calls.
    const toolName = event.type === 'tool/result' ? calls.get(session.id)?.get(event.data.message.toolCallId) : undefined
    if (event.type === 'tool/result') calls.get(session.id)?.delete(event.data.message.toolCallId)
    const observation = event.type === 'user/message'
      ? { sessionId: session.id, eventId: String(event.seq), timestamp: new Date(event.time).toISOString(), kind: 'user-message' as const, ...(personSource(event.data.source) === undefined ? {} : { participant: personSource(event.data.source) }) }
      : { sessionId: session.id, eventId: String(event.seq), timestamp: new Date(event.time).toISOString(), kind: 'tool-result' as const,
        ...(toolName === undefined ? {} : { tool: toolName }), success: !event.data.message.isError }
    void core.observe(observation).catch((error: unknown) => {
      ctx.logger.error(`Genesis observation failed; dependent Genesis operations may be unavailable. Inspect storage and capacity before retrying. ${error instanceof GenesisError ? error.code : 'unexpected-error'}`)
    })
  }, { global: true })
  for (const agent of ctx.agents.list()) {
    if (!participates(agent)) continue
    await core.bind(agent.session.id, 'plugin-enabled', ctx.tools.schemas(agent))
    if (agent.status === 'running') installExecutor(agent)
  }
  await ctx.plugin(GenesisRhythmGateway, config)
  if ((config.spontaneity !== undefined || config.sleep !== undefined) && deliberation !== undefined) {
    ctx.inject(['sessionPersistence', 'agentPresets'], async (child) => {
      if (config.sleep !== undefined) {
        const policy = config.sleep
        const life = await core.snapshot()
        const domain = await child.storageDomain.open(sleepDomain)
        const store = new SleepStore(domain, life.identity.id, policy, Date.now())
        try { await store.start(life.events.some(event => event.dedupKey === 'sleep:initialized')); await core.recordSleep('initialized', 'initialized', {}) }
        catch (error) { await store.close(); throw error }
        const sleep = new LifeSleep(child, core, store, policy, participates, async (session, ids, key, signal) => {
          const state = await core.snapshot()
          const records = ids.map(id => state.memories.find(memory => memory.id === id)).filter(item => item !== undefined)
          if (records.length !== ids.length) throw new GenesisError('invalid-source', 'A selected sleep memory was deleted. Inspect the cycle before retrying.')
          if (!records.length) return []
          const calls = config.memory
          if (calls === undefined) throw new GenesisError('invalid-state', 'Sleep memory review requires a writer route.')
          const maxResults = Math.min(calls.maxChanges, policy.memoryBatchSize)
          const input = { sleepBatchId: key, memories: records.map((record, index) => ({ id: `m${index + 1}`,
            content: record.content, attribution: record.attribution, category: record.category,
            confidence: record.confidence, importance: record.importance })), maxResults, maxContentChars: policy.summaryChars }
          if (JSON.stringify(input).length > calls.inputChars / 2) {
            throw new GenesisError('capacity', 'Sleep memories exceed the writer input budget. Reduce sleep.memoryBatchSize or increase memory.inputChars; no source was omitted.')
          }
          const raw = await auxiliaryCall(child, session, 'writer', SLEEP_MEMORY_PROMPT,
            input, signal, models.read().models, calls)
          const plan = sleepMemoryPlan(raw, records, maxResults, policy.summaryChars, config.timeZone)
          signal.throwIfAborted()
          return (await core.rememberBatch(plan)).map(memory => memory.id)
        }, async (session, event, personId, signal) => {
          const life = await core.snapshot()
          const person = life.people?.people.find(item => item.id === personId)
          const relationship = person?.relationship ?? (life.people?.operatorPersonId === personId ? life.emotion?.relationship : undefined)
          const calls = config.memory
          if (calls === undefined) return null
          const raw = await auxiliaryCall(child, session, 'writer',
            '你有一次向喜欢的人问候的机会，可以选择不发送。仅根据提供的关系与实际时间决定是否想说一句入睡或醒来的问候。白天休息不必硬说晚安或早安。不能索取关注、声称离线受苦、编造共同经历、泄露其他对话或发出任务。只返回 JSON {"send":true或false,"text":"简短的中文问候；不发送时为空"}。',
            { transition: event.mode, previous: event.previous, at: new Date().toISOString(), timeZone: 'Asia/Shanghai',
              participants: { character: { name: life.identity.name }, recipient: { name: person?.name ?? life.operator?.name ?? '操作者' } },
              relationship: relationship?.values ?? null, emotion: life.emotion?.current ?? null }, signal, models.read().models, calls)
          const result = z.strictObject({ send: z.boolean(), text: z.string().max(policy.summaryChars) }).parse(raw)
          return result.send && result.text.trim() ? result.text : null
        })
        child.provide('genesisSleep', sleep)
        sleep.install()
        await sleep.tick()
      }
      if (config.spontaneity !== undefined) await installSpontaneity(child, core, config, deliberation, participates)
    })
  }

}

export { lifeContextUpdate } from './context-update.ts'
