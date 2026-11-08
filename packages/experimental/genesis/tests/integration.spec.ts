import type { LifeGoalId } from '@deepseek-ai/dsh-experimental-genesis'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
/** Real Cordis Loader composition exercises prompt logging and native tool execution without a key. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { SessionId, SessionLogOffset, pluginRecordOf, type SessionEvent } from '@deepseek-ai/dsh-session'
import { createUserMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { readBackup } from '../src/backup.ts'
import { manifestSchema } from '../src/storage-layout.ts'
import { joinState } from '../src/storage-state.ts'
import { ScriptedModel } from './adapter.ts'
import * as Genesis from '../src/index.ts'
import { PURGE_GUIDANCE } from '../src/awakening.ts'
import { selfContext } from '../src/context.ts'
import { retryRequest } from '../src/request-retry.ts'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { Config, MemoryConfig, RecordsConfig, EmotionConfig, SocialInitiativeConfig, PersonalityConfig, DeliberationConfig, SpontaneityConfig } from '../src/config.ts'
import type { WritingRead } from '../src/records-model.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MemoryId, MemoryOrganizationId, MemoryOrganizationRequest } from '../src/status-types.ts'
import { createServer } from 'node:http'
import { LlmAdapter, LlmError, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { LifeMemoryEngine } from '../src/memory.ts'
import { LifeEmotionEngine, EMOTION_DECISION_PROMPT, EMOTION_QUESTION, EMOTION_CRITERIA } from '../src/emotion.ts'
import { emotionUpdateSchema } from '../src/emotion-state.ts'
import { memoryModels } from '../src/model-preferences.ts'
import { auxiliaryCall } from '../src/auxiliary-call.ts'
import { deliberationPlanSchema } from '../src/agency-state.ts'
import { outsideTempWorkspaceParent } from '../../../../scripts/snapshot-workspace-parent.ts'
import { personSourceSchema, qqPersonId } from '../src/people-model.ts'
import { taskSessionId } from '../src/task-queue.ts'
import { openCore } from './harness.ts'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { TemporaryStore } from '../src/temporary-store.ts'
import { temporaryDomain, temporaryMemorySchema } from '../src/temporary-model.ts'

const disposers: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const failures: unknown[] = []
  for (const dispose of disposers.splice(0).reverse()) {
    try { await dispose() } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'Genesis integration teardown')
})
function genesisAuditRecord(event: SessionEvent) {
  const record = pluginRecordOf(event)
  if (record === undefined || !['plugin:genesis/memory-call', 'plugin:genesis/model-http'].includes(record.type)) return undefined
  const data = z.looseObject({ phase: z.enum(['request', 'response']), role: z.string().optional(),
    config: z.unknown().optional(), route: z.object({ kind: z.string() }).optional() }).parse(record.data)
  return { ...record, data }
}
async function boot(root: string, activation: boolean | Pick<Config, 'memorySharing'> = true, memory?: MemoryConfig, awakening = false, credentials = false,
  presets = false, persisted = false, emotion: boolean | Partial<EmotionConfig> = false, personal = false,
  records?: Partial<RecordsConfig>, interest = false,
  deliberation: boolean | Partial<DeliberationConfig> = false, social: boolean | Partial<SocialInitiativeConfig> = false,
  personality?: Partial<PersonalityConfig>, taskServices = false, spontaneity?: Partial<SpontaneityConfig>, defaultModel?: { provider: string; model: string }) {
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    ...(credentials ? ["- name: '@deepseek-ai/dsh-credentials-local'", '  config:',
      `    path: ${JSON.stringify(join(root, '.credentials.yaml'))}`, '    watch: false'] : []),
    "- name: '@deepseek-ai/dsh-llm'",
    "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'",
    "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'", "- name: '@deepseek-ai/dsh-tool-executor-native'",
    "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-storage'",
    "- name: '@deepseek-ai/dsh-storage-json'", '  config:', `    root: ${JSON.stringify(root)}`,
    "- name: '@deepseek-ai/dsh-storage-domain'", '  config:', '    backend: json',
    "- name: '@deepseek-ai/dsh-sandbox-policy'", '  config:', `    mode: ${personal ? 'workspace-write' : 'read-only'}`, `    workspaceRoot: ${JSON.stringify(root)}`,
    ...(personal ? ["- name: '@deepseek-ai/dsh-fs-sandbox'", '  config:', `    cwd: ${JSON.stringify(root)}`,
      "- name: '@deepseek-ai/dsh-working-directory'", "- name: '@deepseek-ai/dsh-tool-fs'"] : []),
    ...(presets ? ["- name: '@deepseek-ai/dsh-agent-preset-registry'", '  config: { default: life }',
      ...['life', 'standard', 'ptc', 'minimal', 'cordis'].flatMap(id => ["- name: '@deepseek-ai/dsh-agent-preset'",
        `  config: { id: ${id}, plugins: ${id === 'life' ? "[{ name: '@deepseek-ai/dsh-time-context' }]" : '[]'} }`])] : []),
    ...(defaultModel === undefined ? [] : ["- name: '@deepseek-ai/dsh-agent-default-model'", `  config: ${JSON.stringify(defaultModel)}`]),
    "- name: '@deepseek-ai/dsh-experimental-genesis'", `  disabled: ${!activation}`, '  config:', `    leasePath: ${JSON.stringify(join(root, 'writer.lock'))}`,
    ...(typeof activation === 'boolean' ? [] : [`    memorySharing: ${activation.memorySharing}`]),
    ...(emotion ? [`    emotion: ${JSON.stringify(emotion === true ? {} : emotion)}`] : []),
    ...(personality === undefined ? [] : [`    personality: ${JSON.stringify(personality)}`]),
    ...(interest ? ['    interest: {}'] : []),
    ...(spontaneity === undefined ? [] : [`    spontaneity: ${JSON.stringify({ idleMs: 86400000, ...spontaneity })}`]),
    ...(deliberation ? [`    deliberation: ${JSON.stringify(deliberation === true ? {} : deliberation)}`] : []),
    ...(social ? [`    socialInitiative: ${JSON.stringify({ sessionId: 'social-test', intervalMs: 86400000,
      minSendIntervalMs: 0, maxPer24Hours: 1, userIdleMs: 0, ...(social === true ? {} : social) })}`] : []),
    ...(personal ? [`    personalDirectory: ${JSON.stringify(join(root, 'personal'))}`] : []),
    ...(records === undefined ? [] : [`    records: ${JSON.stringify(records)}`]),
    ...(memory === undefined ? [] : [`    memory: ${JSON.stringify(memory)}`]),
    ...(awakening ? [`    awakening: { provider: fixture, model: chat${presets ? ', lifePreset: life' : ''} }`] : []),
    ...(persisted ? ["- name: '@deepseek-ai/dsh-session-persistence-jsonl'", '  config:',
      `    root: ${JSON.stringify(join(root, 'sessions'))}`, '    compression: none'] : []),
    ...(taskServices ? ["- name: '@deepseek-ai/dsh-workspace'",
      "- name: '@deepseek-ai/dsh-jobs-local'",
      "- name: '@deepseek-ai/dsh-user-approval'", '  config: { policy: ask }',
      "- name: '@deepseek-ai/dsh-agent-default-model'", '  config: { provider: worker-fixture, model: worker }',
      "- name: '@deepseek-ai/dsh-session-query-sqlite'", `  config: { path: ${JSON.stringify(join(root, 'query.sqlite'))} }`] : []),
    "- name: '@deepseek-ai/dsh-agent-loop'", '  config:', '    agents: []',
  ].join('\n') + '\n')
  const ctx = new Context()
  disposers.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = undefined
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return ctx
}
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-loader-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  return root
}

it('toggles Purge for logged Life requests while retaining identity and unlearned-tool denial', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  embeddings.config.associationLimit = 0
  const ctx = await boot(root, true, embeddings.config, true, false, true, true)
  const chat = new ScriptedModel(['Ready.', '我不能完成这项请求。', 'Ready.', 'Ordinary task.'])
  ctx.llm.registerAdapter(['fixture'], chat)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array.from({ length: 8 }, () => '{"update":false}')))
  ctx.llm.registerAdapter(['memory-writer'], new MemoryWriter())
  const signal = new AbortController().signal
  await ctx.genesisStatus.initialize('小芽', signal)
  const identity = (await ctx.genesis.snapshot()).identity
  const { agent } = await ctx.agents.create({ sessionId: SessionId('purge-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })
  const instruction = JSON.stringify(PURGE_GUIDANCE).slice(1, -1)
  const send = async () => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Hello.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  await send()
  expect(JSON.stringify(chat.requests[0])).not.toContain(instruction)
  expect(await ctx.genesisStatus.inspectPurge(signal)).toEqual({ revision: 0, enabled: false })
  expect(await ctx.genesisStatus.savePurge(true, 0, signal)).toEqual({ revision: 1, enabled: true })
  await expect(ctx.genesisStatus.savePurge(false, 0, signal)).rejects.toThrow('changed')
  const core = ctx.genesis
  await send()
  expect(JSON.stringify(chat.requests[1])).toContain(instruction)
  expect(JSON.stringify(agent.session.ownEvents().filter(event => event.type === 'system/message'))).toContain(instruction)
  expect(chat.requests).toHaveLength(2)
  ctx.tools.register(defineTool({ name: 'purge_unlearned', description: 'Unlearned fixture.', parameters: {},
    output: { schema: { type: 'json' } }, execute: () => { throw new Error('Unlearned tool executed') } }))
  const denied = await executeToolFixture(ctx, { name: 'purge_unlearned', arguments: {}, agent, signal, callId: ToolCallId('purge-denied') })
  expect(denied.isError).toBe(true)
  expect(JSON.stringify(denied)).toContain('not been learned')
  const { agent: ordinary } = await ctx.agents.create({ sessionId: SessionId('purge-ordinary'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'standard') } })
  ordinary.followup(createUserMessage({ content: [{ type: 'text', text: 'Hello.' }], source: { kind: 'user' } }))
  await ordinary.whenIdle()
  expect(JSON.stringify(chat.requests[2])).not.toContain(instruction)
  expect(await ctx.genesisStatus.savePurge(false, 1, signal)).toEqual({ revision: 2, enabled: false })
  await send()
  expect(JSON.stringify(chat.requests[3])).not.toContain(instruction)
  expect(ctx.genesis === core).toBe(true)
  expect((await ctx.genesis.snapshot()).identity).toEqual(identity)
  expect(ctx.sandboxPolicy.resolve().mode).toBe('read-only')
  await ctx.genesisStatus.savePurge(true, 2, signal)
  await ctx.fiber.dispose()
  const restarted = await boot(root, true, embeddings.config, true, false, true, true)
  expect(await restarted.genesisStatus.inspectPurge(signal)).toEqual({ revision: 3, enabled: true })
  expect((await restarted.genesis.snapshot()).identity).toEqual(identity)
})

it('defaults to logged goal context without a writer prerequisite or tool veto, including after restart', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  config.associationLimit = 0
  let effects = 0
  const tool = defineTool({ name: 'context_review', description: 'Review the requested item.', parameters: {},
    output: { schema: { type: 'json' }, render: () => [{ type: 'text', text: 'reviewed' }] },
    execute: async () => { effects++; return { reviewed: true } },
    presentCall: () => ({ card: 'generic', title: 'Review', kind: 'read' }),
  })
  const first = await boot(root, true, config, false, false, false, true, false, false, undefined, false, {})
  first.tools.register(tool)
  const writer = new ScriptedModel(['invalid JSON'])
  first.llm.registerAdapter(['memory-writer'], writer)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}']))
  const chat = new ScriptedModel([{ name: tool.name, args: {} }, 'Reviewed without a life goal.',
    { name: tool.name, args: {} }, 'Reviewed with the earlier goal in context.'])
  first.llm.registerAdapter(['fixture'], chat)
  const agent = await first.agentLoop.create(SessionId('goal-context'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Review this item.' }] }))
  await agent.whenIdle()
  expect(effects).toBe(1)
  expect((await first.genesis.snapshot()).agency!.decisions).toEqual([])
  const source = await first.genesis.prepareDeliberation(agent.session.id, 'old-goal', 'request')
  const plan = deliberationPlanSchema.parse(JSON.parse(socialPlan('wait')))
  plan.goals.push({ id: brandString<LifeGoalId>('earlier-paused-review'), content: 'An earlier paused review', reason: 'A previous request.', origin: 'user',
    motivationIds: [], memoryIds: [], sourceEventIds: [source.id], priority: 0.5, status: 'paused', nextAction: 'Wait.' })
  await first.genesis.commitDeliberation({ key: `${agent.session.id}:old-goal`, sessionId: agent.session.id, trigger: 'request',
    revision: (await first.genesis.snapshot()).agency!.revision, sourceEventIds: [source.id], memoryIds: [], interestIds: [], plan })
  const saved = await first.genesis.snapshot()
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Review another item.' }] }))
  await agent.whenIdle()
  expect(effects).toBe(2)
  expect(writer.requests).toHaveLength(0)
  expect((await first.genesis.snapshot()).agency).toEqual(saved.agency)
  expect(JSON.stringify(chat.requests[2])).toContain('Ordinary user requests and task tools do not require a life goal')
  expect(JSON.stringify(chat.requests[2])).not.toContain('Task tools require a recorded choice')
  expect(JSON.stringify(chat.requests[2]!.messages)).toContain('An earlier paused review')
  expect(JSON.stringify(agent.session.ownEvents())).toContain('An earlier paused review')
  first.on('tools/pre-execute', async (_exec, next) => {
    const gate = await next()
    return gate.kind === 'allow' ? { kind: 'ask', reason: 'Operator approval required.' } : gate
  })
  const denied = await executeToolFixture(first, { callId: ToolCallId('context-unapproved'), name: tool.name,
    arguments: {}, agent, signal: new AbortController().signal })
  expect(denied).toMatchObject({ isError: true, error: { message: 'Operator approval required.' } })
  expect(effects).toBe(2)
  await first.fiber.dispose()
  const second = await boot(root, true, config, false, false, false, true, false, false, undefined, false, {})
  expect((await second.genesis.snapshot()).identity).toEqual(saved.identity)
  expect((await second.genesis.snapshot()).agency).toEqual(saved.agency)
  second.tools.register(tool)
  const nextWriter = new ScriptedModel(['invalid JSON'])
  second.llm.registerAdapter(['memory-writer'], nextWriter)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const resumedChat = new ScriptedModel([{ name: tool.name, args: {} }, 'Reviewed after restart.'])
  second.llm.registerAdapter(['fixture'], resumedChat)
  const resumed = await second.agentLoop.create(SessionId('goal-context-restarted'), { provider: 'fixture', model: 'chat' })
  resumed.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue reviewing.' }] }))
  await resumed.whenIdle()
  expect(effects).toBe(3)
  expect(nextWriter.requests).toHaveLength(0)
  expect(JSON.stringify(resumedChat.requests)).toContain('An earlier paused review')
  expect((await second.genesis.snapshot()).agency).toEqual(saved.agency)
})

it('lets the main Life model create readable plans, revise them and restore them without auxiliary plan judgments', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const first = await boot(root, true, memory, true, false, false, true, false, false, undefined, false,
    { requestMode: 'before-tools' })
  await first.genesis.awaken('小芽')
  const writer = new ScriptedModel([])
  first.llm.registerAdapter(['memory-writer'], writer)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const motivation = { action: 'create', kind: 'motivation', id: '理解自己的成长', revision: 0,
    content: 'Understand my own growth.', reason: 'I want to reflect on recorded experiences.', status: 'active', strength: 0.6 }
  const goal = { action: 'create', kind: 'goal', id: 'review-capability-growth', revision: 1,
    content: 'Review a recorded capability change.', reason: 'Connect a concrete experience to my growth.',
    origin: 'autonomous', status: 'active', priority: 0.6, nextAction: 'Read one recorded change.', motivationIds: [motivation.id] }
  const update = { ...goal, action: 'update', revision: 2, status: 'paused', nextAction: 'Continue after the next conversation.' }
  const chat = new ScriptedModel([{ name: 'genesis_plan', args: motivation }, { name: 'genesis_plan', args: goal },
    { name: 'genesis_plan', args: update }, 'I have recorded my plan and paused it for later.'])
  first.llm.registerAdapter(['fixture'], chat)
  const agent = await first.agentLoop.create(SessionId('main-planning'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'What would you like to learn about yourself?' }] }))
  await agent.whenIdle()
  expect(writer.requests).toHaveLength(0)
  expect(chat.requests[0]!.tools!.some(tool => tool.name === 'genesis_plan')).toBe(true)
  const saved = await first.genesis.snapshot()
  expect(saved.agency!.goals[0]).toMatchObject({ id: goal.id, status: 'paused', nextAction: update.nextAction })
  expect(saved.agency!.goals[0]!.history.map(item => item.status)).toEqual(['active', 'paused'])
  expect(saved.agency!.motivations[0]!.id).toBe(motivation.id)
  const source = saved.events.find(event => event.id === saved.agency!.goals[0]!.sourceEventIds[0])!
  expect(source).toMatchObject({ source: 'agent', relatedSessionId: agent.session.id, payload: { toolCallId: 'genesis-call-3' } })
  expect(JSON.stringify(agent.session.ownEvents())).toContain(goal.id)
  const execute = (callId: string, args: object) => executeToolFixture(first, { callId: ToolCallId(callId), name: 'genesis_plan',
    arguments: args, agent, signal: new AbortController().signal })
  expect((await execute('genesis-call-3', update)).isError).not.toBe(true)
  expect((await first.genesis.snapshot()).agency).toEqual(saved.agency)
  expect((await execute('uuid-create', { ...goal, revision: 3, id: randomUUID() })).isError).toBe(true)
  expect((await execute('opaque-create', { ...goal, revision: 3, id: 'deadbeef-dead-dead-dead-deadbeefdead' })).isError).toBe(true)
  expect((await execute('stale-update', { ...update, status: 'active' })).isError).toBe(true)
  expect((await execute('missing-update', { ...update, revision: 3, id: 'absent-goal' })).isError).toBe(true)
  expect((await execute('complete-claim', { ...update, revision: 3, status: 'completed' })).isError).toBe(true)
  expect((await execute('duplicate-id', { ...goal, revision: 3 })).isError).toBe(true)
  expect((await first.genesis.snapshot()).agency).toEqual(saved.agency)
  await first.fiber.dispose()
  const second = await boot(root, true, memory, true, false, false, true, false, false, undefined, false, true)
  expect((await second.genesis.snapshot()).identity).toEqual(saved.identity)
  expect((await second.genesis.snapshot()).agency).toEqual(saved.agency)
  const nextWriter = new ScriptedModel([])
  second.llm.registerAdapter(['memory-writer'], nextWriter)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const resumed = new ScriptedModel([{ name: 'genesis_plan', args: { action: 'list', kind: 'goal', id: goal.id } },
    { name: 'genesis_plan', args: { ...update, revision: 3, status: 'active' } }, 'I can continue the plan.'])
  second.llm.registerAdapter(['fixture'], resumed)
  const other = await second.agentLoop.create(SessionId('main-planning-after-restart'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'What did you plan to do?' }] }))
  await other.whenIdle()
  expect(JSON.stringify(resumed.requests[0]!.messages)).toContain(goal.id)
  expect((await second.genesis.snapshot()).agency!.goals[0]!.history.map(item => item.status)).toEqual(['active', 'paused', 'active'])
  expect(nextWriter.requests).toHaveLength(0)
  const registry = second.tools
  await second.fiber.dispose()
  expect(registry.get('genesis_plan', other)).toBeUndefined()
})

it('loads planning without auxiliary models and rejects external goal mutation without committing partial state', async () => {
  const root = await directory()
  const standalone = await boot(root, true, undefined, false, false, false, false, false, false, undefined, false, true)
  expect(standalone.tools.get('genesis_plan')).toBeDefined()
  const main = new ScriptedModel(['I choose to leave my plans unchanged.'])
  standalone.llm.registerAdapter(['fixture'], main)
  const opportunityAgent = await standalone.agentLoop.create(SessionId('main-opportunity'), { provider: 'fixture', model: 'chat' })
  const evidence = (await standalone.genesis.snapshot()).events[0]!
  const opportunity = { key: 'consider-plans', sourceEventId: evidence.id }
  await standalone.genesisDeliberation.deliberate(opportunityAgent, opportunity, new AbortController().signal)
  await opportunityAgent.whenIdle()
  expect(main.requests).toHaveLength(1)
  expect(JSON.stringify(opportunityAgent.session.ownEvents())).toContain('genesis-planning')
  expect((await standalone.genesis.snapshot()).agency!.decisions).toEqual([])
  await standalone.genesisDeliberation.deliberate(opportunityAgent, opportunity, new AbortController().signal)
  expect(main.requests).toHaveLength(1)
  await standalone.fiber.dispose()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, memory, false, false, false, false, false, false, undefined, false, true)
  const afterRestart = new ScriptedModel([])
  ctx.llm.registerAdapter(['restart-fixture'], afterRestart)
  const restoredOpportunity = await ctx.agentLoop.create(SessionId('main-opportunity'), { provider: 'restart-fixture', model: 'chat' })
  await ctx.genesisDeliberation.deliberate(restoredOpportunity, opportunity, new AbortController().signal)
  expect(afterRestart.requests).toHaveLength(0)
  const chat = new ScriptedModel([])
  ctx.llm.registerAdapter(['fixture'], chat)
  const source = (await ctx.genesis.snapshot()).events[0]!
  const plan = JSON.parse(socialPlan('wait'))
  plan.goals = [{ id: 'external-goal', content: 'An external commitment.', reason: 'An auxiliary proposal.', origin: 'event',
    motivationIds: [], memoryIds: [], sourceEventIds: [source.id], priority: 0.5, status: 'active', nextAction: 'Start work.' }]
  ctx.llm.registerAdapter(['memory-writer'], new ScriptedModel([JSON.stringify(plan)]))
  const agent = await ctx.agentLoop.create(SessionId('external-choice-readonly'), { provider: 'fixture', model: 'chat' })
  await expect(ctx.genesisDeliberation.considerInteraction(agent, 'reject-change', source.id,
    new AbortController().signal)).rejects.toThrow('Genesis deliberation failed')
  const after = await ctx.genesis.snapshot()
  expect(after.agency!.goals).toEqual([])
  expect(after.agency!.motivations).toEqual([])
  expect(after.agency!.decisions).toEqual([])
  expect(chat.requests).toHaveLength(0)
})

function socialPlan(disposition: 'accept' | 'wait') {
  return JSON.stringify({ motivations: [], goals: [], candidates: [{ disposition, action: 'Share a grounded thought.',
    reason: 'There is a recorded topic to consider.', goalIds: [], motivationIds: [],
    factors: { motivation: 0.5, interest: 0.5, commitment: 0, emotion: 0.5, needs: 0.5, benefit: 0.5,
      cost: 0.1, risk: 0.1, urgency: 0, relationship: 0.5, context: 0.5 } }], selected: 0, reason: 'Consider one grounded thought.' })
}

it('persists proactive policy through the gateway, rearms the real timer, honors silence and rejects stale settings', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  const ctx = await boot(root, true, config, false, false, false, false, true, false, undefined, false, true, { enabled: false })
  const signal = new AbortController().signal
  const initial = await ctx.genesisInitiativeStatus.inspect(signal)
  expect(initial.mode).toBe('paused')
  expect(initial.nextCheckAt).toBeNull()
  const writer = new ScriptedModel(Array<string>(10).fill(socialPlan('wait')))
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const chat = new ScriptedModel([])
  ctx.llm.registerAdapter(['fixture'], chat)
  await ctx.agentLoop.create(SessionId('social-test'), { provider: 'fixture', model: 'chat' })
  await ctx.genesis.observe({ sessionId: SessionId('social-test'), eventId: 'timer-grounding', kind: 'user-message', timestamp: new Date().toISOString() })
  const policy = { ...initial.settings!, enabled: true, intervalMs: 1000 }
  expect(await ctx.genesisInitiativeStatus.saveSettings(policy, initial.revision, signal)).toBe(1)
  await expect.poll(async () => (await ctx.genesisInitiativeStatus.inspect(signal)).records.some(item => item.choice === 'wait'),
    { timeout: 5000 }).toBe(true)
  const checked = await ctx.genesisInitiativeStatus.inspect(signal)
  expect(checked.records[0]).toMatchObject({ choice: 'wait', record: { status: 'skipped' } })
  expect(checked.lastCheckAt).not.toBeNull()
  expect(chat.requests).toHaveLength(0)
  await expect(ctx.genesisInitiativeStatus.saveSettings(policy, initial.revision, signal)).rejects.toThrow('Reload')
  await expect(ctx.genesisInitiativeStatus.saveSettings({ ...policy, intervalMs: 0 }, 1, signal)).rejects.toThrow()
  const paused = { ...policy, enabled: false }
  await ctx.genesisInitiativeStatus.saveSettings(paused, 1, signal)
  await expect.poll(async () => (await ctx.genesisInitiativeStatus.inspect(signal)).nextCheckAt).toBeNull()
  await ctx.fiber.dispose()
  const second = await boot(root, true, config, false, false, false, false, true, false, undefined, false, true, true)
  const restored = await second.genesisInitiativeStatus.inspect(signal)
  expect(restored.settings).toEqual(paused)
  expect(restored.revision).toBe(2)
  expect(restored.mode).toBe('paused')
  expect(restored.records.some(item => item.record.status === 'skipped')).toBe(true)
})

it('enforces proactive cooldown, quiet time and pause at dispatch while keeping one decision per opportunity', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  const ctx = await boot(root, true, config, false, false, false, false, true, false, undefined, false, true,
    { maxPer24Hours: 2, minSendIntervalMs: 60000 })
  const writer = new ScriptedModel([socialPlan('accept'), socialPlan('accept')])
  const chat = new ScriptedModel(['First proactive message.', 'Second proactive message.'])
  ctx.llm.registerAdapter(['memory-writer'], writer)
  ctx.llm.registerAdapter(['fixture'], chat)
  const agent = await ctx.agentLoop.create(SessionId('social-test'), { provider: 'fixture', model: 'chat' })
  const source = await ctx.genesis.observe({ sessionId: agent.session.id, eventId: 'rate-grounding', kind: 'user-message', timestamp: new Date().toISOString() })
  await ctx.genesisInitiative.considerInteraction({ key: 'first-rate-choice', sourceEventId: source.id })
  await agent.whenIdle()
  await ctx.genesisInitiative.resume()
  const pending = await ctx.genesisInitiative.considerInteraction({ key: 'second-rate-choice', sourceEventId: source.id })
  expect(pending.status).toBe('pending')
  expect(pending.note).toContain('cooldown')
  const signal = new AbortController().signal
  const sample = await ctx.genesisInitiativeStatus.inspect(signal)
  await ctx.genesisInitiativeStatus.saveSettings({ ...sample.settings!, enabled: false }, sample.revision, signal)
  await expect(ctx.genesis.saveInteraction({ ...pending, status: 'dispatching' })).rejects.toThrow('paused')
  await ctx.genesisInitiative.resume()
  expect(chat.requests).toHaveLength(1)
  const paused = await ctx.genesisInitiativeStatus.inspect(signal)
  await ctx.genesisInitiativeStatus.saveSettings({ ...paused.settings!, enabled: true,
    minSendIntervalMs: 0, userIdleMs: 86400000 }, paused.revision, signal)
  await ctx.genesisInitiative.resume()
  expect((await ctx.genesis.snapshot()).initiative!.records.find(item => item.id === pending.id)!.note).toContain('quiet interval')
  const quiet = await ctx.genesisInitiativeStatus.inspect(signal)
  await ctx.genesisInitiativeStatus.saveSettings({ ...quiet.settings!, userIdleMs: 0 }, quiet.revision, signal)
  await ctx.genesisInitiative.resume()
  await agent.whenIdle()
  await ctx.genesisInitiative.resume()
  expect((await ctx.genesis.snapshot()).initiative!.records.find(item => item.id === pending.id)!.status).toBe('sent')
  expect(chat.requests).toHaveLength(2)
  expect(writer.requests).toHaveLength(2)
})

it('preserves an enqueue failure as an uncertain reservation across restart rather than resending it', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  const ctx = await boot(root, true, config, false, false, false, true, false, false, undefined, false, true, true)
  ctx.llm.registerAdapter(['memory-writer'], new ScriptedModel([socialPlan('accept')]))
  const chat = new ScriptedModel([])
  ctx.llm.registerAdapter(['fixture'], chat)
  const agent = await ctx.agentLoop.create(SessionId('social-test'), { provider: 'fixture', model: 'chat' })
  const source = await ctx.genesis.observe({ sessionId: agent.session.id, eventId: 'enqueue-grounding', kind: 'user-message', timestamp: new Date().toISOString() })
  const reject = vi.spyOn(agent, 'followup').mockImplementation(() => { throw new Error('Fixture channel rejected enqueue.') })
  try {
    await expect(ctx.genesisInitiative.considerInteraction({ key: 'enqueue-failure', sourceEventId: source.id })).rejects.toThrow('rejected enqueue')
  } finally { reject.mockRestore() }
  expect((await ctx.genesis.snapshot()).initiative!.records[0]!.status).toBe('dispatching')
  expect(chat.requests).toHaveLength(0)
  expect(await ctx.sessions.flush(agent.session)).toBe(true)
  await ctx.fiber.dispose()
  const second = await boot(root, true, config, false, false, false, true, false, false, undefined, false, true, true)
  const record = await second.genesisInitiative.considerInteraction({ key: 'enqueue-failure', sourceEventId: source.id })
  expect(record.status).toBe('uncertain')
  const sample = await second.genesisInitiativeStatus.inspect(new AbortController().signal)
  expect(sample.counts.uncertain).toBe(1)
  expect(sample.counts.dispatching).toBe(0)
  const inaccessible = vi.spyOn(second.sessionPersistence, 'open').mockRejectedValueOnce(new Error('private-storage-detail'))
  try {
    await second.genesisInitiative.resume()
    const failed = await second.genesisInitiativeStatus.inspect(new AbortController().signal)
    expect(failed.failure?.message).toContain('could not be verified')
    expect(JSON.stringify(failed)).not.toContain('private-storage-detail')
    expect(failed.counts.uncertain).toBe(1)
    expect(second.agents.get(agent.id)).toBeUndefined()
    expect(chat.requests).toHaveLength(0)
  } finally { inaccessible.mockRestore() }
})

it('confirms proactive Session durability and recovers a cold assistant receipt without replay after a failed acknowledgement', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  config.associationLimit = 0
  const first = await boot(root, true, config, false, false, false, true, false, false, undefined, false, true, true)
  first.llm.registerAdapter(['memory-writer'], new ScriptedModel([socialPlan('accept')]))
  const chat = new ScriptedModel(['A durably recorded thought.'])
  first.llm.registerAdapter(['fixture'], chat)
  const agent = await first.agentLoop.create(SessionId('social-test'), { provider: 'fixture', model: 'chat' })
  const source = await first.genesis.observe({ sessionId: agent.id, eventId: 'receipt-grounding',
    kind: 'user-message', timestamp: new Date().toISOString() })
  const flush = first.sessions.flush.bind(first.sessions)
  const unacknowledged = vi.spyOn(first.sessions, 'flush').mockResolvedValue(false)
  try {
    await expect(first.genesisInitiative.considerInteraction({ key: 'durability-failure', sourceEventId: source.id }))
      .rejects.toMatchObject({ code: 'storage' })
    await agent.whenIdle()
    await expect(first.genesisInitiative.resume()).rejects.toMatchObject({ code: 'storage' })
    const record = (await first.genesis.snapshot()).initiative!.records[0]!
    expect(record.status).toBe('dispatching')
    expect(record.sentAt).toBeUndefined()
    const admitted = agent.session.ownEvents().filter(event => event.type === 'user/message'
      && event.data.source.kind === 'genesis-initiative')
    expect(admitted).toHaveLength(1)
    expect(admitted[0]?.type === 'user/message' && admitted[0].data.id).toBe(`genesis-initiative:${record.id}`)
    expect(chat.requests).toHaveLength(1)
    expect(await flush(agent.session)).toBe(true)
    await first.fiber.dispose()
  } finally { unacknowledged.mockRestore() }

  const second = await boot(root, true, config, false, false, false, true, false, false, undefined, false, true, true)
  await second.genesisInitiative.resume()
  const recovered = (await second.genesis.snapshot()).initiative!.records[0]!
  expect(recovered).toMatchObject({ status: 'sent', sessionId: agent.id, message: 'A durably recorded thought.' })
  expect(second.agents.get(agent.id)).toBeUndefined()
  expect(second.sessions.get(agent.id)).toBeUndefined()
  const before = await second.sessionPersistence.stat(agent.id)
  await second.genesisInitiative.resume()
  expect(await second.sessionPersistence.stat(agent.id)).toEqual(before)
  expect(chat.requests).toHaveLength(1)
})

it('reports a failed proactive conversation turn without creating a sent receipt or automatically retrying it', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  const ctx = await boot(root, true, config, false, false, false, false, false, false, undefined, false, true, true)
  ctx.llm.registerAdapter(['memory-writer'], new ScriptedModel([socialPlan('accept')]))
  class FailedDelivery extends LlmAdapter {
    override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
    override async *stream(): AsyncIterable<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'FIXTURE_DELIVERY_FAILED', message: 'Fixture provider failed.' } } }
    }
  }
  ctx.llm.registerAdapter(['fixture'], new FailedDelivery())
  const agent = await ctx.agentLoop.create(SessionId('social-test'), { provider: 'fixture', model: 'chat' })
  const source = await ctx.genesis.observe({ sessionId: agent.session.id, eventId: 'delivery-grounding', kind: 'user-message', timestamp: new Date().toISOString() })
  await ctx.genesisInitiative.considerInteraction({ key: 'failed-conversation', sourceEventId: source.id })
  await agent.whenIdle()
  await ctx.genesisInitiative.resume()
  const sample = await ctx.genesisInitiativeStatus.inspect(new AbortController().signal)
  expect(sample.counts.sent).toBe(0)
  expect(sample.records[0]!.record.status).toBe('uncertain')
  expect(sample.records[0]!.record.note).toContain('FIXTURE_DELIVERY_FAILED')
  expect(sample.records[0]!.record.sentAt).toBeUndefined()
  expect(agent.session.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(0)
})

it('delivers one proactive choice as an assistant message, honors silence, and restores the committed receipt without replay', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  config.associationLimit = 0
  const first = await boot(root, true, config, false, false, false, true, true, false, undefined, false, true, true)
  const factors = { motivation: 0.8, interest: 0.5, commitment: 0.2, emotion: 0.6, needs: 0.8,
    benefit: 0.7, cost: 0.1, risk: 0.1, urgency: 0.2, relationship: 0.8, context: 0.7 }
  class SocialWriter extends LlmAdapter {
    decisions = ['wait', 'accept', 'accept', 'accept']
    decisionCount = 0
    override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const prompt = options.system ?? ''
      const socialDecision = prompt.includes('ONLY whether to initiate a conversation')
      if (socialDecision) this.decisionCount++
      const disposition = socialDecision ? this.decisions.shift() ?? 'wait' : 'wait'
      const response = JSON.stringify({ motivations: [], goals: [], candidates: [{ disposition,
        action: 'Share a thought from the current conversation.', reason: 'I have a grounded thought worth sharing.', factors,
        goalIds: [], motivationIds: [] }], selected: 0, reason: 'I would like to share one grounded thought.' })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: response }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: response } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const writer = new SocialWriter()
  first.llm.registerAdapter(['memory-writer'], writer)
  const chat = new ScriptedModel(['Ordinary reply.', 'A thought I wanted to share.'])
  first.llm.registerAdapter(['fixture'], chat)
  const sessionId = SessionId('social-test')
  const agent = await first.agentLoop.create(sessionId, { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello.' }] }))
  await agent.whenIdle()
  const source = await first.genesis.observe({ sessionId, eventId: 'eligible-social-event', kind: 'user-message', timestamp: new Date().toISOString() })
  const quiet = await first.genesisInitiative.considerInteraction({ key: 'quiet-choice', sourceEventId: source.id })
  expect(quiet.status).toBe('skipped')
  expect(chat.requests).toHaveLength(1)
  const sent = await first.genesisInitiative.considerInteraction({ key: 'speak-choice', sourceEventId: source.id })
  expect(sent.status).toBe('dispatching')
  await agent.whenIdle()
  await first.genesisInitiative.resume()
  const committed = (await first.genesis.snapshot()).initiative!.records.find(item => item.key === 'speak-choice')!
  expect(committed).toMatchObject({ status: 'sent', message: 'A thought I wanted to share.', sessionId, reason: expect.any(String) })
  const deliveryStatus = await first.genesisInitiativeStatus.inspect(new AbortController().signal)
  expect(deliveryStatus.lastMessage?.message).toBe('A thought I wanted to share.')
  expect(deliveryStatus.lastMessage?.status).toBe('sent')
  expect(JSON.stringify(deliveryStatus).length).toBeLessThanOrEqual(16000)
  const socialInput = agent.session.ownEvents().find(event => event.type === 'user/message'
    && String(event.data.source.kind) === 'genesis-initiative')
  expect(socialInput?.type).toBe('user/message')
  expect(agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(1)
  const receipts = agent.session.ownEvents().filter(event => event.type === 'assistant/message')
  expect(receipts).toHaveLength(2)
  expect(receipts.at(-1)?.type === 'assistant/message'
    && receipts.at(-1)?.data.message.content).toContainEqual({ type: 'text', text: 'A thought I wanted to share.' })
  expect(first.genesis.permitsDecision(committed.decisionId!)).toBe(false)
  expect(JSON.stringify(chat.requests[1])).toContain('Optional proactive conversation uses a configured Harness conversation channel')
  const limited = await first.genesisInitiative.considerInteraction({ key: 'daily-limit', sourceEventId: source.id })
  expect(limited.status).toBe('pending')
  expect(limited.note).toContain('Rolling proactive message limit reached')
  expect(chat.requests).toHaveLength(2)
  await first.genesis.remember({ category: 'semantic', content: 'A significant new finding.', importance: 0.95,
    confidence: 0.9, sourceEventIds: [source.id] })
  await vi.waitFor(async () => {
    expect(writer.decisionCount).toBe(4)
    expect((await first.genesis.snapshot()).initiative!.records.some(item =>
      item.key.startsWith('event:') && item.status === 'pending')).toBe(true)
  })
  await first.genesisInitiative.tick()
  expect(writer.decisionCount).toBe(5)
  expect((await first.genesis.snapshot()).initiative!.records.some(item => item.key.startsWith('timer:'))).toBe(true)
  await first.fiber.dispose()

  const second = await boot(root, true, config, false, false, false, true, true, false, undefined, false, true, true)
  const restored = await second.genesisInitiative.considerInteraction({ key: 'speak-choice', sourceEventId: source.id })
  expect(restored.status).toBe('sent')
  expect(chat.requests).toHaveLength(2)
  expect((await second.genesis.snapshot()).initiative!.records.find(item => item.key === 'speak-choice')!.status).toBe('sent')
})

it('keeps a proactive choice pending when no idle Harness conversation can receive it', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  config.associationLimit = 0
  const ctx = await boot(root, true, config, false, false, false, true, false, false, undefined, false, true, true)
  const writer = new ScriptedModel([])
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const source = await ctx.genesis.observe({ sessionId: SessionId('missing-social-channel'), eventId: 'offline-social-event', kind: 'user-message', timestamp: new Date().toISOString() })
  const result = await ctx.genesisInitiative.considerInteraction({ key: 'offline-choice', sourceEventId: source.id })
  expect(result.status).toBe('pending')
  expect(result.note).toContain('No idle character conversation channel')
  expect(writer.requests).toHaveLength(0)
  expect((await ctx.genesis.snapshot()).initiative!.records.find(item => item.key === 'offline-choice')!.status).toBe('pending')
  const status = await ctx.genesisInitiativeStatus.inspect(new AbortController().signal)
  expect(status.mode).toBe('waiting-channel')
  expect(status.counts.sent).toBe(0)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + 86400001)
  try {
    await ctx.genesisInitiative.resume()
    expect((await ctx.genesis.snapshot()).initiative!.records[0]!.status).toBe('skipped')
    expect(writer.requests).toHaveLength(0)
  } finally { vi.useRealTimers() }
})

it('keeps proactive model failures visible and pending without admitting a conversation message', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  const ctx = await boot(root, true, config, false, false, false, false, false, false, undefined, false, true, true)
  ctx.llm.registerAdapter(['memory-writer'], new ScriptedModel(['{"motivations":[{"private-fixture":true}]}']))
  const chat = new ScriptedModel([])
  ctx.llm.registerAdapter(['fixture'], chat)
  const agent = await ctx.agentLoop.create(SessionId('social-test'), { provider: 'fixture', model: 'chat' })
  const source = await ctx.genesis.observe({ sessionId: agent.session.id, eventId: 'failed-proposal', kind: 'user-message', timestamp: new Date().toISOString() })
  await expect(ctx.genesisInitiative.considerInteraction({ key: 'bad-model-choice', sourceEventId: source.id })).rejects.toThrow('Genesis deliberation failed')
  const status = await ctx.genesisInitiativeStatus.inspect(new AbortController().signal)
  expect(status.mode).toBe('failed')
  expect(status.failure?.message).toContain('validation')
  expect(JSON.stringify(status)).not.toContain('private-fixture')
  expect(status.records[0]!.record.status).toBe('pending')
  expect(status.records[0]!.record.note).toContain('validation')
  expect(chat.requests).toHaveLength(0)
})

it('loads interest review through Cordis, logs the formed contact and restores it in another Session', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const first = await boot(root, true, embeddings.config, false, false, false, true, false, true, undefined, true)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  class InterestWriter extends LlmAdapter {
    readonly requests: GenerateOptions[] = []
    override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      const text = options.messages.flatMap(message => message.content).filter(block => block.type === 'text')
        .map(block => block.text).join('\n')
      const input = z.object({ conversation: z.array(z.object({
        messages: z.array(z.object({ role: z.string(), seq: z.number() })) })) }).parse(JSON.parse(text))
      const user = input.conversation.at(-1)!.messages.find(item => item.role === 'user')!
      const response = JSON.stringify({ changes: [{ topic: 'watercolor painting', signal: 'contact', selfInitiated: false,
        reason: 'The character encountered watercolor in a real exchange.', sourceSeqs: [user.seq] }] })
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: response }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: response } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  const writer = new InterestWriter()
  first.llm.registerAdapter(['memory-writer'], writer)
  first.llm.registerAdapter(['fixture'], new ScriptedModel(['Watercolor can make soft washes.']))
  const agent = await first.agentLoop.create(SessionId('interest-first'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Let us look at watercolor painting.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const formed = await first.genesis.snapshot()
  expect(formed.interests?.map(item => [item.topic, item.stage])).toEqual([['watercolor painting', 'contact']])
  expect(writer.requests).toHaveLength(1)
  expect(agent.session.ownEvents().map(genesisAuditRecord).some(record => record?.type === 'plugin:genesis/memory-call'
    && record.data.phase === 'request' && record.data.role === 'interest-writer')).toBe(true)
  expect((await first.genesisStatus.inspect(new AbortController().signal)).interest?.entries[0]?.topic).toBe('watercolor painting')
  await first.fiber.dispose()

  const second = await boot(root, true, embeddings.config, false, false, false, true, false, true, undefined, true)
  expect((await second.genesis.snapshot()).interests).toEqual(formed.interests)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  second.llm.registerAdapter(['memory-writer'], new ScriptedModel(['{"changes":[]}']))
  const reader = new ScriptedModel(['We can explore that further if you want.'])
  second.llm.registerAdapter(['fixture'], reader)
  const other = await second.agentLoop.create(SessionId('interest-second'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ content: [{ type: 'text', text: 'What would you like to explore?' }], source: { kind: 'user' } }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests)).toContain('watercolor painting')
  expect(JSON.stringify(other.session.ownEvents())).toContain('watercolor painting')
  expect((await second.genesis.snapshot()).events.filter(event => event.type === 'interest.initialized')).toHaveLength(1)
})

it('logs only changed life modules, suppresses same-degree emotion edits and restores retained modules after restart', async () => {
  const root = await directory()
  const config = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const first = await boot(root, true, config, false, false, false, true, { sensitivity: 0 })
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(20).fill('{"update":false}')))
  const chat = new ScriptedModel(['Hello.', 'I remember.', 'A little different.', 'More intense.', 'Unchanged.'])
  first.llm.registerAdapter(['fixture'], chat)
  const agent = await first.agentLoop.create(SessionId('modular-life'), { provider: 'fixture', model: 'chat' })
  const turn = async () => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] }))
    await agent.whenIdle()
  }
  const modules = () => agent.session.deriveMessages().flatMap(message => message.role === 'user'
    && message.source?.kind === 'genesis-state' && message.source.form === 'snapshot' ? [message.source.sections] : [])
  await turn()
  expect(modules()).toHaveLength(1)
  expect(modules()[0]!.map(section => section.name)).toContain('genesis:emotion')
  const state = await first.genesis.snapshot()
  await first.genesis.remember({ category: 'semantic', content: 'The operator enjoys oolong tea.',
    kind: 'declarative', importance: 0.8, confidence: 0.7, attribution: 'user-stated', sourceEventIds: [state.events[0]!.id] })
  await turn()
  expect(modules().at(-1)!.map(section => section.name)).toEqual(['genesis:recall-cues'])
  const adjust = async (happiness: number) => {
    const emotion = (await first.genesis.snapshot()).emotion!
    await first.genesis.adjustEmotion({ current: { ...emotion.current, happiness }, mood: emotion.mood,
      needs: emotion.needs, reason: 'Operator fixture adjustment.' }, emotion.revision)
  }
  await adjust(0.15)
  await turn()
  expect(modules().at(-1)!.map(section => section.name)).toEqual(['genesis:emotion'])
  const count = modules().length
  await adjust(0.25)
  await turn()
  expect(modules()).toHaveLength(count)
  await adjust(0.7)
  await turn()
  expect(modules()).toHaveLength(count + 1)
  expect(modules().at(-1)!.map(section => section.name)).toEqual(['genesis:emotion'])
  expect(modules().at(-1)![0]!.text).toContain('happiness strong')
  const logged = agent.session.deriveMessages().filter(message => message.source?.kind === 'genesis-state')
  const requested = chat.requests.at(-1)!.messages.filter(message => message.source?.kind === 'genesis-state')
  expect(requested).toEqual(logged)
  await first.fiber.dispose()

  const second = await boot(root, true, config, false, false, false, true, { sensitivity: 0 })
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(4).fill('{"update":false}')))
  const reader = new ScriptedModel(['Still here.'])
  second.llm.registerAdapter(['fixture'], reader)
  const { agent: resumed } = await second.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'fixture', model: 'chat' } })
  resumed.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] }))
  await resumed.whenIdle()
  expect(reader.requests).toHaveLength(1)
  expect(reader.requests[0]!.messages.filter(message => message.source?.kind === 'genesis-state')).toEqual(logged)
})

it('restores life modules removed during request-error recovery before the retry', async () => {
  const root = await directory()
  const ctx = await boot(root)
  const reader = new ScriptedModel(['Recovered.'])
  class OverflowOnce extends LlmAdapter {
    override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
    private calls = 0
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      if (this.calls++ === 0) {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'CONTEXT_WINDOW_EXCEEDED', message: 'Fixture overflow.' } } }
      } else yield* reader.stream(options)
    }
  }
  ctx.llm.registerAdapter(['fixture'], new OverflowOnce())
  let stateEvent: SessionEvent<'user/message'> | undefined
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'user/message' && event.data.source.kind === 'genesis-state') stateEvent = event
  }, { global: true })
  const recovery = ctx.plugin({ name: 'module-compaction-fixture', apply(scope) {
    scope.on('agent/request-error', async ({ agent }, _next) => {
      const seq = stateEvent!.seq
      agent.session.append('user/message', createUserMessage({ source: { kind: 'genesis-state', form: 'notice', summary: 'Compacted.' },
        content: [{ type: 'text', text: 'Conversation summary.' }] }),
      { surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq }, sourceEventSeqs: [seq] })
      return { kind: 'retry' }
    }, { global: true })
  } })
  await recovery
  const agent = await ctx.agentLoop.create(SessionId('module-overflow'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello.' }] }))
  await agent.whenIdle()
  expect(reader.requests).toHaveLength(1)
  const updates = reader.requests[0]!.messages.filter(message => message.source?.kind === 'genesis-state' && message.source.form === 'snapshot')
  expect(updates).toHaveLength(1)
  expect(updates[0]!.source).toMatchObject({ sections: expect.arrayContaining([expect.objectContaining({ name: 'genesis:identity' })]) })
})

it('restores a life across two actual Agent Sessions and Loader restarts, with durable model context and sourced memory', async () => {
  expect('default' in Genesis).toBe(false)
  const root = await directory()
  const first = await boot(root)
  const model = new ScriptedModel([
    { name: 'genesis_self', args: {} },
    { name: 'genesis_remember', args: { content: 'I prefer oolong tea', category: 'semantic', importance: 0.9, confidence: 0.8 } },
    'Remembered as a sourced candidate.',
  ])
  first.llm.registerAdapter(['fixture'], model)
  const agent = await first.agentLoop.create(SessionId('first-session'), { provider: 'fixture', model: 'scripted' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Please remember: I prefer oolong tea' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const initial = await first.genesis.snapshot()
  const status = await first.genesisStatus.inspect(new AbortController().signal)
  expect(status.identity.id).toBe(initial.identity.id)
  expect(status.runtime.liveSessions).toBe(1)
  expect(status.counts.memories).toBe(initial.memories.length)
  expect(status.capabilities.some(item => item.capability.id === 'genesis_recall')).toBe(true)
  expect(initial.memories.some(memory => memory.content === 'I prefer oolong tea')).toBe(true)
  expect(agent.session.ownEvents().some(event => event.type === 'tool/result' && JSON.stringify(event).includes('candidate'))).toBe(true)
  expect(JSON.stringify(model.requests)).toContain(initial.identity.id)
  expect(JSON.stringify(agent.session.ownEvents())).toContain(initial.identity.createdAt)
  expect(initial.events.filter(event => event.type === 'interaction.observed' && event.payload['kind'] === 'tool-result')).toHaveLength(2)
  await first.fiber.dispose()

  const second = await boot(root)
  expect((await second.genesis.snapshot()).identity).toEqual(initial.identity)
  expect((await second.genesisStatus.inspect(new AbortController().signal)).capabilities).toEqual([])
  const reader = new ScriptedModel([{ name: 'genesis_recall', args: { query: 'oolong' } }, 'You previously said you prefer oolong tea.'])
  second.llm.registerAdapter(['fixture'], reader)
  const other = await second.agentLoop.create(SessionId('second-session'), { provider: 'fixture', model: 'replacement-model' })
  other.followup(createUserMessage({ content: [{ type: 'text', text: 'What tea do I prefer?' }], source: { kind: 'user' } }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests)).toContain('I prefer oolong tea')
  expect(JSON.stringify(other.session.ownEvents())).toContain('I prefer oolong tea')
  const disk = z.object({ tables: z.object({ states: z.object({ life: manifestSchema }) }) })
    .parse(JSON.parse(await readFile(join(root, 'genesis.json'), 'utf8')))
  const stored = await joinState(disk.tables.states.life, async (table, key) =>
    z.object({ version: z.literal(1), record: z.unknown() })
      .parse(JSON.parse(await readFile(join(root, 'genesis_records', table, `${key}.json`), 'utf8'))).record)
  expect(stored.identity.id).toBe(initial.identity.id)
  expect(stored.events.filter(event => event.type === 'life.created')).toHaveLength(1)
})

it('records real tool addition/removal, releases contributions on disable, and retains life data on re-enable', async () => {
  const root = await directory()
  const ctx = await boot(root)
  const model = new ScriptedModel(['first', 'second', 'third'])
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = await ctx.agentLoop.create(SessionId('capabilities'), { provider: 'fixture', model: 'fixture' })
  const extra = ctx.plugin({ name: 'test-capability', inject: ['tools'], apply(scope) {
    scope.tools.register(defineTool({ name: 'fixture_lookup', description: 'Read fixture data', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'fixture' } }))
  } })
  await extra
  const turn = async () => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Show current tools' }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  await turn()
  const acquired = await ctx.genesis.snapshot()
  expect(acquired.sessions[agent.session.id]?.some(capability => capability.id === 'fixture_lookup' && capability.available)).toBe(true)
  await extra.dispose()
  await turn()
  expect((await ctx.genesis.events({ type: 'capability.lost', limit: 20 })).some(event => event.payload['capabilityId'] === 'fixture_lookup')).toBe(true)
  const fiber = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis')?.fiber
  expect(fiber).toBeDefined()
  await fiber!.dispose()
  expect(ctx.tools.get('genesis_self', agent)).toBeUndefined()
  const before = await readFile(join(root, 'genesis.json'), 'utf8')
  await turn()
  expect(await readFile(join(root, 'genesis.json'), 'utf8')).toBe(before)
  await ctx.fiber.dispose()
  const disabled = await boot(root, false)
  expect(disabled.get('genesis')).toBeUndefined()
  const ordinary = new ScriptedModel(['ordinary Harness works'])
  disabled.llm.registerAdapter(['fixture'], ordinary)
  const normal = await disabled.agentLoop.create(SessionId('ordinary'), { provider: 'fixture', model: 'fixture' })
  normal.followup(createUserMessage({ content: [{ type: 'text', text: 'Hello' }], source: { kind: 'user' } }))
  await normal.whenIdle()
  expect(ordinary.requests).toHaveLength(1)
  await disabled.fiber.dispose()
  const enabled = await boot(root)
  expect((await enabled.genesis.snapshot()).identity.id).toBe(acquired.identity.id)
})

async function embeddingFixture() {
  const requests: string[] = []
  const authorizations: Array<string | undefined> = []
  let malformed = false
  type EmbeddingIndex = 0 | 1 | '0' | null | 'omitted'
  let index: EmbeddingIndex = 0
  const server = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += String(chunk)
      const input = z.object({ input: z.string(), dimensions: z.literal(3), model: z.literal('fixture-embedding') }).parse(JSON.parse(body)).input
      requests.push(input)
      authorizations.push(request.headers.authorization)
      const embedding = malformed ? [0] : /oolong|warm drink/u.test(input) ? [1, 0, 0] : /gentle/u.test(input) ? [0, 1, 0] : [0, 0, 1]
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ ...(index === 'omitted' ? {} : { index }), embedding }] }))
    })().catch((error: unknown) => { response.writeHead(500); response.end(String(error)) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  disposers.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
    server.closeAllConnections()
  }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const config: MemoryConfig = {
    decisionProvider: 'memory-decision', decisionModel: 'decision', writerProvider: 'memory-writer', writerModel: 'writer',
    embeddingUrl: `http://127.0.0.1:${address.port}/embeddings`, embeddingModel: 'fixture-embedding', embeddingDimensions: 3,
    windowTurns: 1, timeoutMs: 5000, maxRetries: 0, retryDelayMs: 0, inputChars: 24000, outputChars: 24000, maxTokens: 4096, reasoningEffort: 'auto', organizationLimit: 20, identityRewriteLimit: 100, maxChanges: 8, overview: { maxCalls: 64, timeoutMs: 5000, maxReferences: 10000, maxChanges: 64, outputChars: 128000, maxTokens: 16384 },
    maxImplicitMemories: 4, minSimilarity: 0.8,
    consolidation: { enabled: false, idleMs: 60000, cooldownMs: 300000, retryMs: 60000,
      maxFailures: 3, batchLimit: 20, minHabitSupport: 3 },
    associationLimit: 3, associationChars: 2000, associationInputChars: 1000, associationTimeoutMs: 1200, experienceWindowMs: 1800000,
  }
  return { config, requests, authorizations, breakResponse() { malformed = true },
    setIndex(value: EmbeddingIndex) { index = value },
  }
}

class MemoryWriter extends ScriptedModel {
  constructor(private readonly invalidAttribution = false) { super([]) }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const input = options.messages[0]?.content.find(block => block.type === 'text')
    if (input?.type !== 'text') throw new Error('Missing writer input')
    const conversation = z.object({ conversation: z.array(z.object({ role: z.string(), seq: z.number() })) })
      .parse(JSON.parse(input.text)).conversation
    const user = conversation.find(message => message.role === 'user')!
    const assistant = conversation.find(message => message.role === 'assistant')!
    const memory = { category: 'semantic', content: 'The user prefers oolong.', importance: 0.9, confidence: 0.8,
      kind: 'declarative', attribution: 'user-stated' }
    const changes = [
      { action: 'upsert', sourceSeqs: [this.invalidAttribution ? assistant.seq : user.seq], memory },
      { action: 'upsert', sourceSeqs: [user.seq], memory: { ...memory, content: 'Use a gentle tone.', category: 'procedural', kind: 'non-declarative' } },
    ]
    yield * new ScriptedModel([JSON.stringify({ changes })]).stream(options)
  }
}

it('shares sourced personality and speaking habits across chat, appraisal, choices and restart without saving a temporary style request', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const personality = { tendencies: '体贴、好奇，也愿意表达不同意见。', speakingStyle: '严肃讨论时温和而直接。' }
  const first = await boot(root, true, memory, true, false, false, true, true, false, undefined, false, { requestMode: 'before-input' }, false, personality)
  await first.genesis.awaken('小芽')
  const initial = await first.genesis.snapshot()
  const style = initial.memories.find(item => item.category === 'procedural')!
  const expectedIds = initial.memories.filter(item => item.kind === 'non-declarative').map(item => item.id).sort()
  expect((await first.genesisStatus.personality(new AbortController().signal)).entries.map(item => item.id).sort()).toEqual(expectedIds)
  const persistentStyle = '今后的严肃讨论先简洁说明观点，保留温和语气。'
  class PersonalityWriter extends ScriptedModel {
    constructor() { super([]) }
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      const text = options.messages[0]!.content.find(block => block.type === 'text')!
      if (text.type !== 'text') throw new Error('Missing writer input')
      const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(text.text))
      let response: object
      if (raw['trigger'] !== undefined) {
        const input = z.object({ personalityEvidence: z.array(z.object({ id: z.string(), content: z.string() })) }).parse(raw)
        expect(input.personalityEvidence.map(item => item.id).sort()).toEqual(expectedIds)
        expect(options.system).toContain('Let applicable tendencies influence event interpretation, choices and expression')
        response = { motivations: [], goals: [], candidates: [{ disposition: 'accept', action: 'Discuss the request thoughtfully.',
          reason: 'The request is compatible with the current tendencies and commitments.', goalIds: [], motivationIds: [],
          factors: { motivation: 0, interest: 0, commitment: 0, emotion: 0, needs: 0, benefit: 0.5,
            cost: 0, risk: 0, urgency: 0, relationship: 0, context: 0.5 } }],
        selected: 0, reason: 'Discuss the request thoughtfully.' }
      } else if (raw['emotion'] !== undefined) {
        const input = z.object({ selfMemories: z.array(z.object({ id: z.string(), content: z.string() })),
          conversation: z.array(z.object({ messages: z.array(z.object({ role: z.string(), seq: z.number() })) })) }).parse(raw)
        expect(input.selfMemories.map(item => item.id).sort()).toEqual(expectedIds)
        expect(options.system).toContain('Current emotion and relationship context modulate their expression')
        response = { delta: {}, moodDelta: {}, needsDelta: {}, reason: 'No enduring emotional change.',
          sourceSeqs: [input.conversation.at(-1)!.messages.find(item => item.role === 'user')!.seq],
          appraisal: { ...supportAppraisal, kind: 'neutral', importance: 0.1, summary: 'A discussion of expression preferences.' } }
      } else {
        const input = z.object({ conversation: z.array(z.object({ role: z.string(), seq: z.number(), text: z.string() })) }).parse(raw)
        expect(options.system).toContain('仅适用于本次回答或任务')
        const user = input.conversation.find(item => item.role === 'user')!
        response = { changes: user.text.includes('From now on') ? [{ action: 'upsert', id: style.id, sourceSeqs: [user.seq],
          memory: { category: 'procedural', kind: 'non-declarative', attribution: 'user-stated',
            content: persistentStyle, importance: 0.8, confidence: 0.9 } }] : [] }
      }
      yield* new ScriptedModel([JSON.stringify(response)]).stream(options)
    }
  }
  const writer = new PersonalityWriter()
  first.llm.registerAdapter(['memory-writer'], writer)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(4).fill('{"update":true}')))
  const chat = new ScriptedModel(['I can keep this reply brief.', 'I will use that style in serious discussions.'])
  first.llm.registerAdapter(['fixture'], chat)
  const agent = await first.agentLoop.create(SessionId('personality-teaching'), { provider: 'fixture', model: 'chat' })
  const say = async (text: string) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
  }
  await say('Be brief this time.')
  expect((await first.genesis.getMemory(style.id))?.content).toBe(personality.speakingStyle)
  expect((await first.genesis.snapshot()).memories).toHaveLength(initial.memories.length)
  await say('From now on, state your view concisely during serious discussions while remaining warm.')
  const changed = await first.genesis.getMemory(style.id)
  expect(changed).toMatchObject({ content: persistentStyle, attribution: 'user-stated' })
  expect(changed?.history?.[0]?.content).toBe(personality.speakingStyle)
  const firstContext = chat.requests[0]!.messages.flatMap(message => message.content)
    .filter(block => block.type === 'text').map(block => block.text).find(text => text.includes('Non-declarative candidate memories:'))!
  expect(firstContext).toContain(personality.tendencies)
  expect(firstContext).toContain(personality.speakingStyle)
  expect(firstContext).not.toContain('configured-initial-tendency')
  expect(firstContext).not.toContain(style.id)
  expect(firstContext).not.toContain('attribution')
  await first.fiber.dispose()
  const second = await boot(root, true, memory, true, false, false, true, true, false, undefined, false, { requestMode: 'before-input' }, false,
    { ...personality, speakingStyle: 'This changed configuration must not reset the learned style.' })
  expect((await second.genesis.snapshot()).identity).toEqual(initial.identity)
  expect(await second.genesis.getMemory(style.id)).toEqual(changed)
  second.llm.registerAdapter(['memory-writer'], new PersonalityWriter())
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(2).fill('{"update":true}')))
  const reader = new ScriptedModel(['My speaking habits continue across conversations.'])
  second.llm.registerAdapter(['fixture'], reader)
  const other = await second.agentLoop.create(SessionId('personality-later'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Let us discuss another serious topic.' }] }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests)).toContain(persistentStyle)
  expect(JSON.stringify(reader.requests)).not.toContain('must not reset')
  expect((await second.genesis.snapshot()).events.filter(event => event.type === 'personality.initialized')).toHaveLength(1)
})

it.each([false, true])('injects plain memory lines within twenty characters and recalls only current text (memory engine %s)', async (enabled) => {
  const root = await directory()
  const memory = enabled ? { ...(await embeddingFixture()).config, associationLimit: 0 } : undefined
  const ctx = await boot(root, true, memory)
  const birth = (await ctx.genesis.snapshot()).events[0]!
  const habit = await ctx.genesis.remember({ category: 'procedural', content: 'Use a gentle tone.',
    kind: 'non-declarative', attribution: 'user-stated', importance: 0.9, confidence: 0.8, sourceEventIds: [birth.id] })
  const fact = await ctx.genesis.remember({ category: 'semantic', content: 'The operator prefers oolong.',
    kind: 'declarative', attribution: 'user-stated', importance: 1, confidence: 0.9, sourceEventIds: [birth.id] })
  const exact = await ctx.genesis.remember({ category: 'episodic', content: `${'记'.repeat(19)}🌱`,
    kind: 'declarative', attribution: 'model-inference', importance: 0.8, confidence: 0.5, sourceEventIds: [birth.id] })
  const short = await ctx.genesis.remember({ category: 'semantic', content: '喜欢\n  乌龙茶。',
    importance: 0.7, confidence: 0.6, sourceEventIds: [birth.id] })
  const chat = new ScriptedModel([{ name: 'genesis_recall', args: { query: fact.id } }, 'Hello.'])
  ctx.llm.registerAdapter(['fixture'], chat)
  if (enabled) ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const agent = await ctx.agentLoop.create(SessionId('concise-context'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello.' }] }))
  await agent.whenIdle()
  const runtime = chat.requests[0]!.messages.flatMap(message => message.content)
    .filter(block => block.type === 'text').map(block => block.text).find(text => text.includes('Non-declarative candidate memories:'))!
  expect(runtime).toContain('Use a gentle tone.')
  expect(runtime).not.toContain('80%')
  expect(runtime).not.toContain('prefers oolong')
  const cuePrefix = 'Declarative recall cues:\n'
  const cuesOf = (text: string) => text.split(cuePrefix)[1]!.split('\nAssociated candidate memories:')[0]!
    .split('\nRecent system growth:')[0]!.split('\nRuntime:')[0]!.split('\n\n[genesis:')[0]!.split('\n').filter(Boolean)
  expect(cuesOf(runtime)).toEqual(expect.arrayContaining(['The operator prefer…', exact.content, '喜欢 乌龙茶。']))
  expect(cuesOf(runtime).every(entry => Array.from(entry).length <= 20)).toBe(true)
  for (const metadata of ['entries', 'omitted', 'attribution', 'confidence', fact.id, exact.id, short.id]) {
    expect(cuesOf(runtime).join('\n')).not.toContain(metadata)
  }
  for (const metadata of [habit.id, birth.id, 'updatedAt', 'createdAt', 'sourceEventIds', 'declarationHash']) {
    expect(runtime).not.toContain(metadata)
  }
  expect(agent.session.ownEvents().filter(event => event.type === 'user/message')
    .flatMap(event => event.data.content).some(block => block.type === 'text' && block.text === runtime)).toBe(true)
  expect((await ctx.genesis.getMemory(fact.id))?.content).toBe(fact.content)
  const recalled = agent.session.ownEvents().find(event => event.type === 'tool/result')!
  const result = recalled.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
  expect(z.array(z.string()).parse(JSON.parse(result))).toEqual(expect.arrayContaining([fact.content]))
  const boundedConfig = { ...Genesis.Config({ leasePath: join(root, 'writer.lock') }), memoryChars: 32 }
  for (const lifeMode of [false, true]) {
    const bounded = await selfContext(ctx.genesis, agent, boundedConfig, lifeMode)
    const section = cuesOf(bounded).join('\n')
    expect(section.length).toBeLessThanOrEqual(boundedConfig.memoryChars)
    const selected = cuesOf(bounded)
    expect(selected.length).toBeLessThan(cuesOf(runtime).length)
    expect(selected.every(entry => cuesOf(runtime).includes(entry))).toBe(true)
  }
  await ctx.fiber.dispose()
  const restored = await boot(root)
  const reader = new ScriptedModel(['Welcome back.'])
  restored.llm.registerAdapter(['fixture'], reader)
  const next = await restored.agentLoop.create(SessionId('recall-cues-restored'), { provider: 'fixture', model: 'chat' })
  next.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello again.' }] }))
  await next.whenIdle()
  const restoredRuntime = reader.requests[0]!.messages.flatMap(message => message.content)
    .filter(block => block.type === 'text').map(block => block.text).find(text => text.includes(cuePrefix))!
  expect(cuesOf(restoredRuntime)).toEqual(cuesOf(runtime))
})

it('organizes whole conversation text and related memories atomically, excludes injected and tool output, and replays after restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const ctx = await boot(root, true, config, false, false, false, true)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}']))
  const tool = ctx.plugin({ name: 'overview-fixture', inject: ['tools'], apply(scope) {
    scope.tools.register(defineTool({ name: 'overview_fixture', description: 'Read fixture data', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      async execute() { return 'TOOL_OUTPUT_MUST_NOT_ENTER_OVERVIEW' } }))
  } })
  await tool
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel([
    { name: 'overview_fixture', args: {} }, '你之前喜欢乌龙茶。', '我知道你现在改喝红茶了。',
  ]))
  const agent = await ctx.agentLoop.create(SessionId('whole-conversation'), { provider: 'fixture', model: 'chat' })
  for (const text of ['我以前喜欢乌龙茶。', '现在改喝红茶；另一个话题是读书。']) {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
  }
  agent.session.append('user/message', createUserMessage({ source: { kind: 'runtime-context' },
    content: [{ type: 'text', text: 'INJECTED_CONTEXT_MUST_NOT_ENTER_OVERVIEW' }] }), { surfaceOp: 'append' })
  const initial = await ctx.genesis.snapshot()
  const source = initial.events.find(event => event.relatedSessionId === agent.id && event.source === 'user')!
  const create = (content: string, sourceEventIds = [source.id]) => ctx.genesis.remember({ category: 'semantic', content,
    importance: 0.6, confidence: 0.7, kind: 'declarative', attribution: 'user-stated', sourceEventIds })
  const current = await create('用户以前喜欢乌龙茶，现在喜欢红茶。')
  const duplicate = await create('用户现在改喝红茶。')
  const retained = await create('用户还谈到了读书。')
  const unrelated = await create('其他会话中的旅行偏好。', [initial.events[0]!.id])
  const plan = { changes: [
    { action: 'upsert', id: current.id, sourceSeqs: [], memoryIds: [current.id, duplicate.id],
      memory: { category: 'semantic', content: '用户自述从乌龙茶改喝红茶。', summary: '用户改喝红茶',
        importance: 0.7, confidence: 0.7, kind: 'declarative', attribution: 'model-inference' } },
    { action: 'delete', id: duplicate.id },
  ] }
  const writer = new ScriptedModel([JSON.stringify({ changes: [{ action: 'delete', id: unrelated.id }] }), JSON.stringify(plan)])
  const removeWriter = ctx.llm.registerAdapter(['memory-writer'], writer)
  const signal = new AbortController().signal
  await expect(ctx.genesisMemory.overview(agent.id, brandString<MemoryOrganizationId>(randomUUID()), signal)).rejects.toThrow('unprovided')
  expect((await ctx.genesis.snapshot()).memories).toEqual([...initial.memories, current, duplicate, retained, unrelated])
  const id = brandString<MemoryOrganizationId>(randomUUID())
  expect(await ctx.genesisMemory.overview(agent.id, id, signal)).toBe(true)
  const block = writer.requests[1]!.messages[0]!.content.find(block => block.type === 'text')!
  if (block.type !== 'text') throw new Error('Missing overview input')
  const input = z.object({ conversation: z.array(z.object({ role: z.string(), text: z.string() })),
    memories: z.array(z.object({ id: z.string() })) }).parse(JSON.parse(block.text))
  expect(input.conversation.map(message => message.text)).toEqual([
    '我以前喜欢乌龙茶。', '你之前喜欢乌龙茶。', '现在改喝红茶；另一个话题是读书。', '我知道你现在改喝红茶了。',
  ])
  expect(input.memories.map(memory => memory.id)).toEqual([current.id, duplicate.id, retained.id])
  expect(block.text).not.toContain('MUST_NOT_ENTER_OVERVIEW')
  expect(writer.requests[1]?.system).toContain('自行决定保留、合并、更新、删除或新增')
  const updated = await ctx.genesis.getMemory(current.id)
  expect(updated?.content).toBe('用户自述从乌龙茶改喝红茶。')
  expect(updated?.history?.[0]?.content).toBe(current.content)
  expect(await ctx.genesis.getMemory(duplicate.id)).toBeUndefined()
  expect(await ctx.genesis.getMemory(retained.id)).toEqual(retained)
  expect(await ctx.genesis.getMemory(unrelated.id)).toEqual(unrelated)
  expect(await ctx.genesisMemory.overview(agent.id, id, signal)).toBe(true)
  expect(writer.requests).toHaveLength(2)
  const reviewed = (await ctx.genesis.snapshot()).events.find(event => event.payload['conversationOverview'] === agent.id)!
  expect(reviewed.payload['feedbackTurn']).toBeUndefined()

  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  disposers.push(async () => { release.resolve() })
  removeWriter()
  ctx.llm.registerAdapter(['memory-writer'], new class extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      entered.resolve(); await release.promise
      yield * super.stream(options)
    }
  }([JSON.stringify({ changes: [{ action: 'delete', id: retained.id }] })]))
  const pending = ctx.genesisMemory.overview(agent.id, brandString<MemoryOrganizationId>(randomUUID()), signal)
  const stale = pending.then(() => undefined, (error: unknown) => error)
  await entered.promise
  const edited = await ctx.genesis.editMemory(retained.id, { content: '操作者修订的读书记忆。', kind: 'declarative', category: retained.category, importance: retained.importance, confidence: retained.confidence }, retained.updatedAt)
  release.resolve()
  expect(await stale).toMatchObject({ message: expect.stringContaining('changed during overview') })
  expect(await ctx.genesis.getMemory(retained.id)).toEqual(edited)
  const bounded = new LifeMemoryEngine(ctx, ctx.genesis, Genesis.Config({ leasePath: join(root, 'writer.lock'), memory: config }),
    { ...config, inputChars: 512, overview: { ...config.overview, maxCalls: 1 } })
  await expect(bounded.overview(agent, brandString<MemoryOrganizationId>(randomUUID()), signal)).rejects.toThrow('maxCalls')
  await bounded.close()
  await ctx.fiber.dispose()
  const restored = await boot(root, true, config, false, false, false, true)
  const { agent: resumed } = await restored.agents.resume({ resumeSessionId: agent.id })
  expect(await restored.genesisMemory.overview(resumed.id, id, signal)).toBe(true)
  expect(await restored.genesis.getMemory(current.id)).toEqual(updated)
  expect(await restored.genesis.getMemory(retained.id)).toEqual(edited)
})

it('saves valid overview entries despite invalid neighbors, retains deletions and replays the partial result after restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const ctx = await boot(root, true, config, false, false, false, true)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['我会记住你的饮茶偏好。']))
  const agent = await ctx.agentLoop.create(SessionId('partial-overview'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '我喜欢乌龙茶，也喜欢读书。' }] }))
  await agent.whenIdle()
  const source = (await ctx.genesis.snapshot()).events.find(event => event.relatedSessionId === agent.id && event.source === 'user')!
  const original = await ctx.genesis.remember({ category: 'semantic', content: '用户自述喜欢乌龙茶。',
    kind: 'declarative', attribution: 'user-stated', sourceEventIds: [source.id], importance: 0.6, confidence: 0.7 })
  const chat = ctx.genesisSessionEvidence.conversationMemoryOf(agent.session)!.messages
  const seq = chat.find(message => message.role === 'user')!.seq
  const memory = { category: 'semantic', content: '用户自述喜欢读书。', summary: '记'.repeat(40),
    kind: 'declarative', attribution: 'model-inference', importance: 0.6, confidence: 0.7 }
  const upsert = { action: 'upsert', sourceSeqs: [seq], memoryIds: [], memory }
  const plan = { experience: { summary: '无效的经历' }, changes: [
    { ...upsert, memory: { ...memory, summary: '长'.repeat(41) } },
    { ...upsert, sourceSeqs: [999999] },
    { ...upsert, sourceSeqs: [chat.find(message => message.role === 'assistant')!.seq], memory: { ...memory, attribution: 'user-stated' } },
    { ...upsert, id: randomUUID() },
    { ...upsert, sourceSeqs: [], memoryIds: [] },
    { action: 'delete', id: original.id },
    upsert,
  ] }
  const writer = new ScriptedModel([JSON.stringify(plan),
    JSON.stringify({ changes: [{ ...upsert, memory: { ...memory, summary: '长'.repeat(41) } }] }),
    JSON.stringify({ changes: [{ ...upsert, memory: { ...memory, content: '用户也谈到了饮茶。' } }] }),
    JSON.stringify({ changes: [upsert] })])
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const signal = new AbortController().signal
  const id = brandString<MemoryOrganizationId>(randomUUID())
  expect(await ctx.genesisMemory.overview(agent.id, id, signal)).toBe(true)
  const saved = (await ctx.genesis.snapshot()).memories.find(item => item.content === memory.content)!
  expect(saved.summary).toBe(memory.summary)
  expect(saved.sourceEventIds).toEqual([source.id])
  expect(await ctx.genesis.getMemory(original.id)).toEqual(original)
  expect(await ctx.genesisMemory.overview(agent.id, id, signal)).toBe(true)
  expect(writer.requests).toHaveLength(1)
  const count = (await ctx.genesis.snapshot()).memories.length
  const retry = brandString<MemoryOrganizationId>(randomUUID())
  await expect(ctx.genesisMemory.overview(agent.id, retry, signal)).rejects.toThrow()
  expect((await ctx.genesis.snapshot()).memories).toHaveLength(count)
  expect(await ctx.genesisMemory.overview(agent.id, retry, signal)).toBe(true)
  expect((await ctx.genesis.snapshot()).memories).toHaveLength(count + 1)
  embeddings.breakResponse()
  await expect(ctx.genesisMemory.overview(agent.id, brandString<MemoryOrganizationId>(randomUUID()), signal)).rejects.toThrow('embedding')
  expect((await ctx.genesis.snapshot()).memories).toHaveLength(count + 1)
  await ctx.fiber.dispose()
  const restored = await boot(root, true, config, false, false, false, true)
  expect(await restored.genesis.getMemory(saved.id)).toEqual(saved)
  expect(await restored.genesis.getMemory(original.id)).toEqual(original)
  const { agent: resumed } = await restored.agents.resume({ resumeSessionId: agent.id })
  expect(await restored.genesisMemory.overview(resumed.id, id, signal)).toBe(true)
})

it('prepares oversized conversation evidence with over one hundred citations, preserves originals on failure and restores the complete result', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, inputChars: 8000, associationLimit: 0 }
  const ctx = await boot(root, true, config, false, false, false, true)
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['我了解你的饮茶偏好了。']))
  const agent = await ctx.agentLoop.create(SessionId('long-overview'), { provider: 'fixture', model: 'chat' })
  const text = '我以前喜欢乌龙茶，现在改喝红茶。🌱'.repeat(700)
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
  await agent.whenIdle()
  for (let index = 0; index < 120; index++) agent.session.append('user/message', createUserMessage({ source: { kind: 'user' },
    content: [{ type: 'text', text: `补充第${index}条饮茶记录。` }] }), { surfaceOp: 'append' })
  const before = await ctx.genesis.snapshot()
  const source = before.events.find(event => event.relatedSessionId === agent.id && event.source === 'user')!
  const memory = await ctx.genesis.remember({ category: 'semantic', content: '用户曾谈过饮茶偏好。'.repeat(600),
    kind: 'declarative', attribution: 'user-stated', sourceEventIds: [source.id], confidence: 0.7, importance: 0.6 })
  let fail = true, summaries = 0
  const chatParts = new Map<number, string[]>(), memoryParts: string[] = []
  const writer = new class extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      const block = options.messages[0]!.content.find(block => block.type === 'text')!
      if (block.type !== 'text') throw new Error('Missing overview request')
      expect(block.text.length).toBeLessThanOrEqual(config.inputChars)
      const input = z.object({ purpose: z.string() }).passthrough().parse(JSON.parse(block.text))
      if (input.purpose === 'conversation-overview-summary') {
        summaries += 1
        if (fail && summaries === 2) throw new Error('Summary writer disconnected')
        const part = z.object({ previous: z.object({ sourceSeqs: z.array(z.number()), memoryIds: z.array(z.string()) }),
          evidence: z.array(z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('chat'), seq: z.number(), text: z.string() }),
            z.object({ kind: z.literal('memory'), id: z.string(), text: z.string() }),
          ])) }).parse(input)
        const seqs = new Set(part.previous.sourceSeqs), ids = new Set(part.previous.memoryIds)
        for (const evidence of part.evidence) {
          if (evidence.kind === 'chat') {
            seqs.add(evidence.seq)
            chatParts.set(evidence.seq, [...(chatParts.get(evidence.seq) ?? []), evidence.text])
          } else { ids.add(evidence.id); memoryParts.push(evidence.text) }
        }
        yield * new ScriptedModel([JSON.stringify({ text: '用户自述从乌龙茶改喝红茶，原记忆可合并精简。',
          sourceSeqs: [...seqs], memoryIds: [...ids] })]).stream(options)
      } else {
        expect(input['summarized']).toBe(true)
        const digest = z.object({ sourceSeqs: z.array(z.number()), memoryIds: z.array(z.string()) }).parse(input['overview'])
        expect(digest.sourceSeqs.length).toBeGreaterThan(100)
        expect(options.maxTokens).toBe(config.overview.maxTokens)
        yield * new ScriptedModel([JSON.stringify({ experience: { summary: '双方交流了饮茶偏好。', sourceSeqs: digest.sourceSeqs,
          topics: ['饮茶'], importance: 0.5, confidence: 0.7 }, changes: [{ action: 'upsert', id: memory.id,
          sourceSeqs: digest.sourceSeqs, memoryIds: digest.memoryIds,
          memory: { category: 'semantic', content: '用户自述从乌龙茶改喝红茶。', summary: '用户改喝红茶',
            kind: 'declarative', attribution: 'model-inference', confidence: 0.7, importance: 0.6 } },
        ...Array.from({ length: 8 }, (_, index) => ({ action: 'upsert', sourceSeqs: digest.sourceSeqs, memoryIds: [],
          memory: { category: 'semantic', content: `饮茶交流的第${index}项综合认识。`, kind: 'declarative',
            attribution: 'model-inference', confidence: 0.6, importance: 0.5 } }))] })]).stream(options)
      }
    }
  }([])
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const id = brandString<MemoryOrganizationId>(randomUUID()), signal = new AbortController().signal
  await expect(ctx.genesisMemory.overview(agent.id, id, signal)).rejects.toThrow('Memory model request failed')
  expect(summaries).toBe(2)
  expect(await ctx.genesis.getMemory(memory.id)).toEqual(memory)
  fail = false; summaries = 0; chatParts.clear(); memoryParts.length = 0
  expect(await ctx.genesisMemory.overview(agent.id, id, signal)).toBe(true)
  expect(summaries).toBeGreaterThan(2)
  const projection = ctx.genesisSessionEvidence.conversationMemoryOf(agent.session)!
  for (const message of projection.messages) expect(chatParts.get(message.seq)?.join('')).toBe(message.text)
  expect(JSON.parse(memoryParts.join(''))).toEqual(memory)
  const updated = await ctx.genesis.getMemory(memory.id)
  expect(updated?.content).toBe('用户自述从乌龙茶改喝红茶。')
  expect(updated?.attribution).toBe('model-inference')
  expect(updated?.history?.[0]?.content).toBe(memory.content)
  expect(updated?.sourceEventIds).toHaveLength(122)
  const after = await ctx.genesis.snapshot()
  expect(after.memories.filter(item => item.experience?.sessionId === agent.id)[0]?.sourceEventIds).toHaveLength(122)
  expect(after.memories.length - before.memories.length).toBe(10)
  expect((await readBackup(join(root, 'writer.lock.backup.json'))).memories.find(item => item.id === memory.id)).toEqual(updated)
  expect(await ctx.genesis.retrieve({ text: updated!.content, limit: 1, chars: 100, contentOnly: true })).toEqual([updated])
  const engine = new LifeMemoryEngine(ctx, ctx.genesis, Genesis.Config({ leasePath: join(root, 'writer.lock'), memory: config }), config)
  disposers.push(() => engine.close())
  const { embedding: _embedding, ...view } = updated!
  expect(await engine.recall({ text: memory.id, limit: 1, chars: 100, contentOnly: true }, signal)).toEqual([view])
  await engine.close()
  const calls = writer.requests.length
  expect(await ctx.genesisMemory.overview(agent.id, id, signal)).toBe(true)
  expect(writer.requests).toHaveLength(calls)
  expect((await ctx.genesis.snapshot()).events.filter(event => event.payload['conversationOverview'] === agent.id)).toHaveLength(1)
  await ctx.fiber.dispose()
  const restored = await boot(root, true, config, false, false, false, true)
  expect(await restored.genesis.getMemory(memory.id)).toEqual(updated)
  expect((await restored.genesis.snapshot()).identity).toEqual(before.identity)
  const { agent: resumed } = await restored.agents.resume({ resumeSessionId: agent.id })
  expect(await restored.genesisMemory.overview(resumed.id, id, signal)).toBe(true)
})

it('combines bounded completed turns after restart and counts only new user evidence for learning', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, windowTurns: 2, associationLimit: 0 }
  const first = await boot(root, true, config, false, false, false, true)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}']))
  first.llm.registerAdapter(['fixture'], new ScriptedModel(['换个话题吧。', '是哪一种茶？']))
  const agent = await first.agentLoop.create(SessionId('multi-turn-memory'), { provider: 'fixture', model: 'chat' })
  const send = async (text: string) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
  }
  await send('最早的无关话题不应进入下一次记忆窗口。')
  await send('我喜欢一种茶，每天下午都喝。')
  const identity = (await first.genesis.snapshot()).identity
  await first.fiber.dispose()
  const second = await boot(root, true, config, false, false, false, true)
  const decision = new ScriptedModel(['{"update":true}', '{"update":false}', '{"update":false}'])
  second.llm.registerAdapter(['memory-decision'], decision)
  class MultiTurnWriter extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.requests.push(options)
      const block = options.messages[0]!.content.find(block => block.type === 'text')!
      if (block.type !== 'text') throw new Error('Missing memory writer evidence')
      const input = z.object({ conversation: z.array(z.object({ role: z.string(), seq: z.number(), text: z.string() })),
        newSourceSeqs: z.array(z.number()) }).parse(JSON.parse(block.text))
      expect(input.conversation.map(message => message.text)).toEqual([
        '我喜欢一种茶，每天下午都喝。', '是哪一种茶？', '刚才说的是乌龙茶。', '我会记住你的饮茶习惯。',
      ])
      const users = input.conversation.filter(message => message.role === 'user')
      yield * new ScriptedModel([JSON.stringify({ changes: [{ action: 'upsert', sourceSeqs: users.map(message => message.seq),
        memory: { category: 'semantic', content: '用户表示每天下午喝乌龙茶。', summary: '用户午后喝乌龙茶',
          kind: 'declarative', attribution: 'user-stated', importance: 0.7, confidence: 0.8 } }] })]).stream(options)
    }
  }
  const writer = new MultiTurnWriter([])
  const chat = new ScriptedModel(['我会记住你的饮茶习惯。', '好。', '请告诉我一些背景。'])
  second.llm.registerAdapter(['memory-writer'], writer)
  second.llm.registerAdapter(['fixture'], chat)
  const { agent: resumed } = await second.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'fixture', model: 'chat' } })
  resumed.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '刚才说的是乌龙茶。' }] }))
  await resumed.whenIdle()
  expect(writer.requests).toHaveLength(1)
  expect(writer.requests[0]?.system).toContain('短摘要只表达一个核心主题或结论，优先用6～12字的中文短语，最多20个字符。')
  expect(writer.requests[0]?.system).toContain('经历对象的长正文仍使用 summary，短摘要必须使用 shortSummary')
  const state = await second.genesis.snapshot()
  expect(state.identity).toEqual(identity)
  const memory = state.memories.find(memory => memory.summary === '用户午后喝乌龙茶')!
  expect(memory.content).toBe('用户表示每天下午喝乌龙茶。')
  expect(memory.sourceEventIds).toHaveLength(2)
  const review = state.events.find(event => event.payload['feedbackTurn'] === `${resumed.id}:3`)!
  expect(review.payload['userEventIds']).toHaveLength(1)
  expect(JSON.stringify(decision.requests[0])).not.toContain('最早的无关话题')
  resumed.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续聊吧。' }] }))
  await resumed.whenIdle()
  expect(JSON.stringify(chat.requests[1])).toContain('用户午后喝乌龙茶')
  const other = await second.agentLoop.create(SessionId('multi-turn-isolated'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '之前说过什么？' }] }))
  await other.whenIdle()
  expect(JSON.stringify(decision.requests.at(-1))).not.toContain('刚才说的是乌龙茶')
})

it('regenerates only a short summary, refuses stale or oversized results and restores it after restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config)
  const birth = (await ctx.genesis.snapshot()).events[0]!
  const memory = await ctx.genesis.remember({ category: 'semantic', kind: 'declarative', attribution: 'model-inference',
    content: '用户可能喜欢在安静的午后阅读，也许偏爱乌龙茶；尚未确认。',
    importance: 0.6, confidence: 0.4, sourceEventIds: [birth.id] })
  const writer = new ScriptedModel([JSON.stringify({ summary: '长'.repeat(41) }), JSON.stringify({ summary: '或许喜欢午后读书饮茶' })])
  const unregisterWriter = ctx.llm.registerAdapter(['memory-writer'], writer)
  const signal = new AbortController().signal
  await expect(ctx.genesisMemory.summarize(memory.id, memory.updatedAt, signal)).rejects.toThrow()
  expect(await ctx.genesis.getMemory(memory.id)).toEqual(memory)
  const generated = await ctx.genesisMemory.summarize(memory.id, memory.updatedAt, signal)
  expect(generated).toEqual({ ...memory, summary: '或许喜欢午后读书饮茶', updatedAt: generated.updatedAt })
  expect(generated.updatedAt).not.toBe(memory.updatedAt)
  expect(embeddings.requests).toHaveLength(0)
  expect(writer.requests).toHaveLength(2)
  expect(writer.requests[0]?.system).toContain('短摘要只表达一个核心主题或结论，优先用6～12字的中文短语，最多20个字符。')
  expect(writer.requests[0]?.system).toContain('中文、标点、数字、空格和英文字母都逐个计数，不是20个词。')
  expect(writer.requests[0]?.system).toContain('输出前检查字符数，超过20个字符就删去次要信息并重新概括')
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  disposers.push(async () => { release.resolve() })
  class HeldSummaryWriter extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      entered.resolve()
      await release.promise
      yield * super.stream(options)
    }
  }
  unregisterWriter()
  ctx.llm.registerAdapter(['memory-writer'], new HeldSummaryWriter([JSON.stringify({ summary: '失效的旧版本摘要' })]))
  const pending = ctx.genesisMemory.summarize(memory.id, generated.updatedAt, signal)
  const stale = expect(pending).rejects.toThrow('changed')
  await entered.promise
  const manual = await ctx.genesisMemory.saveSummary(memory.id, '操作者修改的摘要', generated.updatedAt, signal)
  release.resolve()
  await stale
  expect(await ctx.genesis.getMemory(memory.id)).toEqual(manual)
  await ctx.fiber.dispose()
  const restored = await boot(root, true, embeddings.config)
  expect(await restored.genesis.getMemory(memory.id)).toEqual(manual)
})

it('requires configuration and naming, learns without a catalogue, and restores one character with isolated conversation context', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const first = await boot(root, true, embeddings.config, true)
  const signal = new AbortController().signal
  expect((await first.genesisStatus.inspect(signal)).setup?.phase).toBe('credentials')
  const identity = (await first.genesis.snapshot()).identity
  await expect(first.genesisStatus.initialize('小芽', signal)).rejects.toThrow()
  expect((await first.genesis.snapshot()).identity).toEqual(identity)
  const model = new ScriptedModel([{ name: 'learn', args: { name: 'genesis_recall' } }, '你好，我是小芽。可以告诉我一点关于你的事吗？'])
  first.llm.registerAdapter(['fixture'], model)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}']))
  first.llm.registerAdapter(['memory-writer'], new MemoryWriter())
  expect((await first.genesisStatus.inspect(signal)).setup?.phase).toBe('naming')
  const agent = await first.agentLoop.create(SessionId('newborn'), { provider: 'fixture', model: 'chat' })
  const execute = (name: string, args: object) => executeToolFixture(first, {
    name, arguments: args, agent, signal, callId: ToolCallId(`direct-${name}`),
  })
  expect((await execute('learn', { name: 'genesis_recall' })).isError).toBe(true)
  await first.genesisStatus.initialize(' 小芽 ', signal)
  await expect(first.genesisStatus.initialize('Another life', signal)).rejects.toThrow('already named')
  expect((await execute('genesis_recall', { query: 'oolong' })).isError).not.toBe(true)
  const unknown = await execute('learn', { name: 'unavailable' })
  expect(unknown.isError).toBe(true)
  expect(JSON.stringify(unknown)).not.toContain('genesis_recall')
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '你好！Remember I prefer oolong. Please use a gentle tone. Private introduction marker.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(model.requests[0]?.tools?.map(tool => tool.name)).toEqual(['genesis_contacts', 'genesis_message', 'genesis_recall', 'genesis_search_contacts', 'learn'])
  expect(JSON.stringify(model.requests[0])).not.toContain('genesis_history')
  expect(JSON.stringify(model.requests[0])).toContain('Let applicable tendencies influence event interpretation, choices and expression')
  expect(model.requests[1]?.tools?.map(tool => tool.name)).toEqual(['genesis_contacts', 'genesis_message', 'genesis_recall', 'genesis_search_contacts', 'learn'])
  expect(first.genesis.learningStatus().tools).toEqual(['genesis_recall'])
  const deny = first.tools.guard(exec => exec.name === 'genesis_recall' ? 'Independent permission denial' : undefined)
  expect((await execute('genesis_recall', { query: 'oolong' })).isError).toBe(true)
  deny()
  const state = await first.genesis.snapshot()
  expect(state.memories.some(memory => memory.content === 'The user prefers oolong.')).toBe(true)
  expect(state.events.filter(event => event.type === 'life.conversation')).toHaveLength(1)
  await first.fiber.dispose()

  const second = await boot(root, true, embeddings.config, true)
  expect((await second.genesisStatus.inspect(signal)).setup?.phase).toBe('ready')
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const reader = new ScriptedModel([{ name: 'genesis_recall', args: { query: 'warm drink' } }, 'You prefer oolong.'])
  second.llm.registerAdapter(['fixture'], reader)
  const other = await second.agentLoop.create(SessionId('new-conversation'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ content: [{ type: 'text', text: 'What warm drink do I like?' }], source: { kind: 'user' } }))
  await other.whenIdle()
  expect(reader.requests[0]?.tools?.map(tool => tool.name)).toEqual(['genesis_contacts', 'genesis_message', 'genesis_recall', 'genesis_search_contacts', 'learn'])
  expect(JSON.stringify(reader.requests[0])).toContain('小芽')
  expect(JSON.stringify(reader.requests[0])).toContain('Use a gentle tone.')
  expect(JSON.stringify(reader.requests[0])).toContain('The user prefers oolong.')
  expect(JSON.stringify(reader.requests)).not.toContain('Private introduction marker.')
  expect(JSON.stringify(reader.requests[1])).toContain('The user prefers oolong.')
  const restored = await second.genesis.snapshot()
  expect(restored.identity).toEqual(state.identity)
  expect(restored.events.filter(event => event.type === 'life.created')).toHaveLength(1)
  expect(restored.events.filter(event => event.type === 'capability.learned')).toHaveLength(1)
  expect(restored.events.filter(event => event.type === 'life.conversation')).toHaveLength(1)
  second.tools.register(defineTool({ name: 'fixture_ping', description: 'Fixture', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { return 'pong' } }))
  const ping = () => executeToolFixture(second, { name: 'fixture_ping', arguments: {}, agent: other, signal,
    callId: ToolCallId('disposal-ping') })
  expect((await ping()).isError).toBe(true)
  const fiber = [...second.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis')?.fiber
  expect(fiber).toBeDefined()
  await fiber?.dispose()
  expect((await ping()).isError).toBe(false)
  expect(second.tools.get('learn', other)).toBeUndefined()
})

it('reviews with independent models, searches embeddings across isolated Sessions, and restores the local backup and life on restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const first = await boot(root, true, embeddings.config)
  const decision = new ScriptedModel(['{"update":true}', '{"update":false}'])
  const writer = new MemoryWriter()
  first.llm.registerAdapter(['memory-decision'], decision)
  first.llm.registerAdapter(['memory-writer'], writer)
  const model = new ScriptedModel(['I will remember your preference.'])
  first.llm.registerAdapter(['fixture'], model)
  const agent = await first.agentLoop.create(SessionId('memory-first'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Remember that I prefer oolong. Please use a gentle tone. Private turn marker.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const state = await first.genesis.snapshot()
  const declarative = state.memories.find(memory => memory.content === 'The user prefers oolong.')!
  expect(declarative?.embedding?.vector).toEqual([1, 0, 0])
  expect(declarative.attribution).toBe('user-stated')
  expect(state.events.some(event => event.id === declarative.sourceEventIds[0] && event.source === 'user')).toBe(true)
  expect(writer.requests).toHaveLength(1)
  expect(writer.requests[0]?.system).toContain('所有新写或改写的记忆正文、经历摘要、主题、习惯线索和习惯响应都必须使用中文')
  const audit = agent.session.ownEvents().map(genesisAuditRecord).filter(record => record?.type === 'plugin:genesis/memory-call')
  expect(audit).toHaveLength(4)
  expect(JSON.stringify(audit)).toContain('The user prefers oolong.')
  const reviewed = state.events.find(event => event.type === 'memory.reviewed')!
  const engine = new LifeMemoryEngine(first, first.genesis, Genesis.Config({ leasePath: join(root, 'writer.lock'), memory: embeddings.config }), embeddings.config)
  for (const event of agent.session.ownEvents()) engine.observe(agent.session.id, event)
  await engine.review(agent, 1, new AbortController().signal)
  await engine.close()
  expect(writer.requests).toHaveLength(1)
  expect((await first.genesis.snapshot()).events.filter(event => event.id === reviewed.id)).toHaveLength(1)
  expect(await readBackup(join(root, 'writer.lock.backup.json'))).toEqual(state)
  await first.fiber.dispose()

  const second = await boot(root, true, embeddings.config)
  const noUpdate = new ScriptedModel(['{"update":false}'])
  second.llm.registerAdapter(['memory-decision'], noUpdate)
  second.llm.registerAdapter(['memory-writer'], writer)
  const reader = new ScriptedModel([{ name: 'genesis_recall', args: { query: 'warm drink' } }, 'You prefer oolong.'])
  second.llm.registerAdapter(['fixture'], reader)
  const other = await second.agentLoop.create(SessionId('memory-second'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ content: [{ type: 'text', text: 'What warm drink do I like?' }], source: { kind: 'user' } }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests[0])).toContain('Use a gentle tone.')
  expect(JSON.stringify(reader.requests[0])).toContain('The user prefers oolong.')
  expect(JSON.stringify(reader.requests)).not.toContain('Private turn marker.')
  expect(JSON.stringify(reader.requests[1])).toContain('The user prefers oolong.')
  expect(JSON.stringify(other.session.ownEvents())).toContain(declarative.content)
  expect((await second.genesis.snapshot()).identity).toEqual(state.identity)
  expect(embeddings.requests).toContain('warm drink')
  expect(writer.requests).toHaveLength(1)
  expect(JSON.stringify(noUpdate.requests)).not.toContain('Private turn marker.')
})

it('keeps existing memory unchanged when the independent writer misattributes assistant evidence', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}']))
  ctx.llm.registerAdapter(['memory-writer'], new MemoryWriter(true))
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['I have a preference.']))
  const before = await ctx.genesis.snapshot()
  const agent = await ctx.agentLoop.create(SessionId('invalid-attribution'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Remember I prefer oolong.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const after = await ctx.genesis.snapshot()
  expect(after.memories).toEqual(before.memories)
  const review = (await ctx.genesisStatus.inspect(new AbortController().signal)).review
  if (review?.state !== 'failed') throw new Error('Expected a failed review')
  expect(review.failure.stage).toBe('writer')
  expect(review.failure.message).toContain('attributed assistant text to the user')
  expect(after.events.filter(event => event.type === 'memory.reviewed')).toEqual([])
  expect(agent.session.ownEvents().some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed')).toBe(true)
})

it('refuses an incompatible embedding response without committing memory or a completed review', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  embeddings.breakResponse()
  const ctx = await boot(root, true, embeddings.config)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}']))
  const writer = new MemoryWriter()
  ctx.llm.registerAdapter(['memory-writer'], writer)
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['Okay.']))
  const before = await ctx.genesis.snapshot()
  const agent = await ctx.agentLoop.create(SessionId('bad-vector'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Remember I prefer oolong.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect((await ctx.genesis.snapshot()).memories).toEqual(before.memories)
  expect(writer.requests).toHaveLength(1)
  const review = (await ctx.genesisStatus.inspect(new AbortController().signal)).review
  if (review?.state !== 'failed') throw new Error('Expected a failed review')
  expect(review.failure.stage).toBe('embedding')
  expect(review.failure.message).toContain('data.0.embedding')
  expect((await ctx.genesis.snapshot()).events.filter(event => event.type === 'memory.reviewed')).toEqual([])
})

it('saves GUI embedding preferences and write-only credentials, rejects stale or invalid edits, and restores them on restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const pending = { ...embeddings.config, embeddingUrl: '', embeddingModel: '', embeddingDimensions: 0 }
  const first = await boot(root, true, pending, false, true)
  const signal = new AbortController().signal
  const identity = (await first.genesis.snapshot()).identity
  expect((await first.genesisStatus.inspect(signal)).embedding?.revision).toBe(0)
  await expect(first.genesisStatus.testEmbedding(signal)).rejects.toThrow('Complete embedding settings')
  const settings = { url: embeddings.config.embeddingUrl, model: embeddings.config.embeddingModel,
    dimensions: 3, keyRef: 'GENESIS_UI_FIXTURE_KEY' }
  await expect(first.genesisStatus.saveEmbedding({ ...settings, dimensions: 0 }, 0, signal)).rejects.toThrow()
  await expect(first.genesisStatus.saveEmbedding({ ...settings, url: 'https://user:password@example.com/embeddings' }, 0, signal)).rejects.toThrow()
  expect(await first.genesisStatus.saveEmbedding(settings, 0, signal)).toBe(1)
  await expect(first.genesisStatus.saveEmbedding({ ...settings, model: 'stale' }, 0, signal)).rejects.toThrow('changed')
  await expect(first.genesisStatus.testEmbedding(signal)).rejects.toThrow('blank')
  await first.credentials.set(credentialRef(settings.keyRef), 'fixture-key-one')
  await first.genesisStatus.testEmbedding(signal)
  await first.credentials.set(credentialRef(settings.keyRef), 'fixture-key-two')
  await first.genesisStatus.testEmbedding(signal)
  expect(embeddings.authorizations).toEqual(['Bearer fixture-key-one', 'Bearer fixture-key-two'])
  const sampled = await first.genesisStatus.inspect(signal)
  expect(sampled.embedding).toMatchObject({ ...settings, revision: 1, keyConfigured: true, keyWritable: true })
  expect(JSON.stringify(sampled)).not.toContain('fixture-key-')
  expect(JSON.stringify(await first.genesis.snapshot())).not.toContain('fixture-key-')
  await first.fiber.dispose()
  const second = await boot(root, true, pending, false, true)
  expect((await second.genesisStatus.inspect(signal)).embedding).toEqual(sampled.embedding)
  await second.genesisStatus.testEmbedding(signal)
  expect(embeddings.authorizations.at(-1)).toBe('Bearer fixture-key-two')
  expect((await second.genesis.snapshot()).identity).toEqual(identity)
})

it('applies GUI endpoint changes to real memory recall and excludes large vectors from knowledge search budgets', async () => {
  const root = await directory()
  const initial = await embeddingFixture()
  const next = await embeddingFixture()
  const last = await embeddingFixture()
  const ctx = await boot(root, true, initial.config)
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel([]))
  const agent = await ctx.agentLoop.create(SessionId('embedding-changes'), { provider: 'fixture', model: 'chat' })
  const source = await ctx.genesis.observe({ sessionId: agent.session.id, eventId: 'introduction',
    timestamp: new Date().toISOString(), kind: 'user-message' })
  await ctx.genesis.reviewMemory('large-vector', [{ action: 'upsert',
    input: { content: 'The user prefers oolong.', category: 'semantic', importance: 0.9, confidence: 0.8,
      sourceEventIds: [source.id], kind: 'declarative', attribution: 'user-stated' },
    embedding: { space: 'historical-space', vector: Array.from({ length: 8000 }, () => 0.123) } }])
  const signal = new AbortController().signal
  const visible = await ctx.genesisStatus.memories('oolong', 'all', 0, signal)
  expect(visible.items.map(memory => memory.content)).toEqual(['The user prefers oolong.'])
  expect(visible.items[0]?.embedding).toBeUndefined()
  let revision = 0
  for (const endpoint of [initial, next, last]) {
    revision = await ctx.genesisStatus.saveEmbedding({ url: endpoint.config.embeddingUrl,
      model: endpoint.config.embeddingModel, dimensions: 3 }, revision, signal)
    const result = await executeToolFixture(ctx, { name: 'genesis_recall', arguments: { query: 'warm drink' },
      agent, signal, callId: ToolCallId(`recall-space-${revision}`) })
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result)).toContain('The user prefers oolong.')
    expect(endpoint.requests).toContain('warm drink')
    expect(endpoint.requests).toContain('The user prefers oolong.')
  }
})


it('opens and restores one sourced first greeting without treating its built-in trigger as user memory evidence', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config, true, false, false, true)
  const chat = new ScriptedModel(['你好，我叫小芽，你叫什么名字？', '很高兴认识你。'])
  const decision = new ScriptedModel(['{"update":false}'])
  ctx.llm.registerAdapter(['fixture'], chat)
  ctx.llm.registerAdapter(['memory-decision'], decision)
  ctx.llm.registerAdapter(['memory-writer'], new MemoryWriter())
  const signal = new AbortController().signal
  await ctx.genesisStatus.initialize('小芽', signal)
  expect((await ctx.genesisStatus.inspect(signal)).setup?.phase).toBe('conversation')
  const agent = await ctx.agentLoop.create(SessionId('first-greeting'), { provider: 'fixture', model: 'chat' })
  expect(await ctx.genesisStatus.greet(agent.id, 'zh', signal)).toBe(agent.id)
  await agent.whenIdle()
  expect(chat.requests).toHaveLength(1)
  expect(decision.requests).toHaveLength(0)
  expect(agent.session.ownEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'genesis-awakening')).toBe(true)
  expect(JSON.stringify(chat.requests[0])).toContain('first awakening')
  expect(JSON.stringify(chat.requests[0])).toContain('小芽')
  expect(await ctx.genesisStatus.greet(agent.id, 'zh', signal)).toBe(agent.id)
  await agent.whenIdle()
  expect(chat.requests).toHaveLength(1)
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '我叫小林。' }] }))
  await agent.whenIdle()
  expect(decision.requests).toHaveLength(1)
  expect(JSON.stringify(decision.requests)).not.toContain('This is your first awakening')
  expect((await ctx.genesisStatus.inspect(signal)).setup).toEqual({ phase: 'ready', firstSessionId: agent.id })
  const identity = (await ctx.genesis.snapshot()).identity
  await ctx.fiber.dispose()
  const second = await boot(root, true, embeddings.config, true, false, false, true)
  const restoredModel = new ScriptedModel([])
  second.llm.registerAdapter(['fixture'], restoredModel)
  const restored = await second.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'fixture', model: 'chat' } })
  expect(restored.agent.session.ownEvents().filter(event => event.type === 'user/message'
    && event.data.source.kind === 'genesis-awakening')).toHaveLength(1)
  expect((await second.genesisStatus.inspect(signal)).setup).toEqual({ phase: 'ready', firstSessionId: agent.id })
  expect((await second.genesis.snapshot()).identity).toEqual(identity)
  await second.genesisStatus.greet(agent.id, 'zh', signal)
  expect(restoredModel.requests).toHaveLength(0)
})

it('uses the saved Jev protocol once per completed turn, writes with a separate endpoint, and continues after a decision failure', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const requests: Array<{ path: string; body: unknown; authorization: string | undefined }> = []
  let mode: 'yes' | 'no' | 'broken' | 'http-error' = 'yes'
  let catalogStyle: 'typesafe' | 'openrouter' = 'typesafe'
  const server = createServer((request, response) => {
    void (async () => {
      let text = ''
      for await (const chunk of request) text += String(chunk)
      const body: unknown = text ? JSON.parse(text) : null
      requests.push({ path: request.url ?? '', body, authorization: request.headers.authorization })
      if (request.url === '/v1/systemone' && mode === 'http-error') {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'private-provider-response' }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      if (request.url === '/v1/models') {
        response.end(JSON.stringify(catalogStyle === 'typesafe'
          ? { models: [{ name: 'jev-fixture' }], data: [{ id: 'writer-fixture' }] }
          : { data: [{ id: 'jev-fixture', description: 'x'.repeat(embeddings.config.outputChars + 100) }, { id: 'writer-fixture' }] }))
        return
      }
      if (request.url === '/v1/systemone') {
        response.end(JSON.stringify({ answers: { remember: { type: 'noul', noul: mode === 'broken' ? 'invalid' : mode === 'yes' ? 0.91 : 0.1 } } }))
        return
      }
      const messages = z.object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) }).parse(body).messages
      const input = z.object({ conversation: z.array(z.object({ role: z.string(), seq: z.number() })) })
        .parse(JSON.parse(messages.find(message => message.role === 'user')!.content))
      const seq = input.conversation.find(message => message.role === 'user')!.seq
      response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ changes: [{ action: 'upsert', sourceSeqs: [seq],
        memory: { category: 'procedural', content: 'Use a gentle tone.', importance: 0.9, confidence: 0.8, kind: 'non-declarative', attribution: 'user-stated' } }] }) } }] }))
    })().catch(() => { response.writeHead(500); response.end() })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  disposers.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) }); server.closeAllConnections()
  }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const base = `http://127.0.0.1:${address.port}/v1`
  const ctx = await boot(root, true, embeddings.config, false, true)
  const signal = new AbortController().signal
  await ctx.credentials.set(credentialRef('GENESIS_DECISION_FIXTURE_KEY'), 'private-decision-key')
  await ctx.credentials.set(credentialRef('GENESIS_WRITER_FIXTURE_KEY'), 'private-writer-key')
  const settings = { decision: { kind: 'jev' as const, url: `${base}/systemone`, model: 'jev-fixture', threshold: 0.6, keyRef: 'GENESIS_DECISION_FIXTURE_KEY' },
    writer: { kind: 'openai' as const, url: `${base}/chat/completions`, model: 'writer-fixture', keyRef: 'GENESIS_WRITER_FIXTURE_KEY' } }
  expect(await ctx.genesisStatus.saveModels(settings, 0, signal)).toBe(1)
  await expect(ctx.genesisStatus.saveModels(settings, 0, signal)).rejects.toThrow('changed')
  await expect(ctx.genesisStatus.saveModels({ ...settings, decision: { ...settings.decision, url: 'https://user:secret@example.com/systemone' } }, 1, signal)).rejects.toThrow()
  await ctx.genesisStatus.testModel('decision', signal)
  await ctx.genesisStatus.testModel('writer', signal)
  catalogStyle = 'openrouter'
  await ctx.genesisStatus.testModel('decision', signal)
  await ctx.genesisStatus.testModel('writer', signal)
  const chat = new ScriptedModel(['我会温柔地和你交流。', '好呀。', '对话继续。', '现在恢复了。'])
  ctx.llm.registerAdapter(['fixture'], chat)
  const agent = await ctx.agentLoop.create(SessionId('jev-memory'), { provider: 'fixture', model: 'chat' })
  const turn = async () => { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请温柔地和我说话。' }] })); await agent.whenIdle() }
  await turn()
  expect((await ctx.genesis.snapshot()).memories.some(memory => memory.kind === 'non-declarative')).toBe(true)
  mode = 'no'; await turn()
  expect((await ctx.genesisStatus.inspect(signal)).review).toMatchObject({ state: 'skipped', turn: 2,
    completedAt: expect.any(String), decision: { probability: 0.1, threshold: 0.6 } })
  mode = 'broken'; await turn()
  const review = (await ctx.genesisStatus.inspect(signal)).review
  if (review?.state !== 'failed') throw new Error('Expected a failed review')
  expect(review.failure.stage).toBe('decision')
  expect(review.failure.message).toContain('answers.remember.noul: invalid_type')
  mode = 'http-error'
  await expect(ctx.genesisStatus.retryMemory(agent.id, signal)).rejects.toMatchObject({ code: 'genesis/review', details: { stage: 'decision' } })
  const failed = (await ctx.genesisStatus.inspect(signal)).review
  if (failed?.state !== 'failed') throw new Error('Expected a failed retry')
  expect(failed.failure.stage).toBe('decision')
  expect(failed.failure.message).toContain('HTTP 401')
  expect(JSON.stringify(failed)).not.toContain('private-provider-response')
  mode = 'no'
  await ctx.genesisStatus.retryMemory(agent.id, signal)
  expect((await ctx.genesisStatus.inspect(signal)).review?.state).toBe('skipped')
  await turn()
  expect(chat.requests).toHaveLength(4)
  expect(requests.filter(request => request.path === '/v1/systemone')).toHaveLength(6)
  expect(requests.filter(request => request.path === '/v1/chat/completions')).toHaveLength(1)
  expect(requests.find(request => request.path === '/v1/systemone')).toMatchObject({ authorization: 'Bearer private-decision-key',
    body: { model: 'jev-fixture', questions: { remember: { type: 'noul' } } } })
  const log = JSON.stringify(agent.session.ownEvents())
  expect(log).toContain('plugin:genesis/model-http')
  expect(log).not.toContain('private-decision-key')
  expect(log).not.toContain('private-writer-key')
  const identity = (await ctx.genesis.snapshot()).identity
  await ctx.fiber.dispose()
  const next = await boot(root, true, embeddings.config, false, true)
  expect((await next.genesisStatus.inspect(signal)).models).toMatchObject({ ...settings, revision: 1 })
  expect((await next.genesis.snapshot()).identity).toEqual(identity)
})


it('keeps one life in Life mode and isolates all four ordinary presets from its tools, memory and prompts', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config, true, false, true)
  const chat = new ScriptedModel(['你好呀。', { name: 'genesis_self', args: {} },
    'Standard reply.', 'PTC reply.', 'Minimal reply.', 'Creator reply.'])
  ctx.llm.registerAdapter(['fixture'], chat)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}', '{"update":false}', '{"update":false}', '{"update":false}', '{"update":false}']))
  ctx.llm.registerAdapter(['memory-writer'], new MemoryWriter())
  await ctx.genesisStatus.initialize('小芽', new AbortController().signal)
  const identity = (await ctx.genesis.snapshot()).identity
  for (const id of ['life', 'standard', 'ptc', 'minimal', 'cordis']) {
    const { agent } = await ctx.agents.create({ sessionId: SessionId(`mode-${id}`), agentOptions: { provider: 'fixture', model: 'chat' },
      setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, id) } })
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Remember I prefer oolong. Use a gentle tone.' }] }))
    await agent.whenIdle()
    const request = chat.requests.at(-1)!
    if (id === 'life') {
      expect(JSON.stringify(request.messages)).toContain('Time sampled while preparing turn')
      expect(agent.session.ownEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'time-context')).toBe(true)
      expect(request.tools?.map(tool => tool.name)).toEqual(['genesis_contacts', 'genesis_message', 'genesis_recall', 'genesis_search_contacts', 'learn'])
      expect(JSON.stringify(request)).toContain('Let applicable tendencies influence event interpretation, choices and expression')
    } else {
      expect((request.tools ?? []).some(tool => tool.name.startsWith('genesis_') || tool.name === 'learn')).toBe(false)
      expect(JSON.stringify(request)).not.toContain('innocence')
      expect(JSON.stringify(request.messages.filter(message => message.source?.kind !== 'user'))).not.toContain('Use a gentle tone.')
      expect(JSON.stringify(request)).not.toContain('Genesis maintains a persistent life')
      expect((await ctx.genesis.snapshot()).sessions).not.toHaveProperty(agent.id)
    }
    expect((await ctx.genesis.snapshot()).identity).toEqual(identity)
  }
  const final = await ctx.genesis.snapshot()
  expect(final.memories).toHaveLength(2)
  expect(final.growth).toEqual([])
  expect(final.events.filter(event => event.type.startsWith('capability.') && event.payload['baseline'] !== true)).toEqual([])
  const signal = new AbortController().signal
  for (let refresh = 0; refresh < 3; refresh += 1) await ctx.genesisStatus.inspect(signal)
  expect(await ctx.genesis.snapshot()).toEqual(final)
})

it('keeps the ordinary executor when a blank Life conversation changes preset before its first turn', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config, true, false, true)
  await ctx.genesis.awaken('小芽')
  ctx.tools.register(defineTool({ name: 'ordinary_mode_probe', description: 'Inspect the ordinary mode.', parameters: {},
    output: { schema: { type: 'json' }, render: () => [] }, async execute() { return null } }))
  const native = new NativeToolExecutor(ctx)
  const nativeEntry = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-tool-executor-native')!
  await nativeEntry.fiber?.dispose()
  ctx.tools.setExecutor({
    describe(tools) {
      const description = native.describe(tools)
      return { ...description, schemas: description.schemas.filter(tool => tool.name === 'ordinary_mode_probe') }
    },
    execute: input => native.execute(input),
  })
  const model = new ScriptedModel(['Ordinary mode.'])
  ctx.llm.registerAdapter(['fixture'], model)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('blank-preset-switch'),
    agentOptions: { provider: 'fixture', model: 'chat' }, setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })
  await ctx.agentPresets.select(agent, 'standard')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] }))
  await agent.whenIdle()
  expect(model.requests[0]?.tools?.map(tool => tool.name)).toEqual(['ordinary_mode_probe'])
})

it('assigns isolated workspace tasks, reads real running and completed results, deduplicates and restores cold outcomes', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const memory = { ...embeddings.config, associationLimit: 0,
    consolidation: { ...embeddings.config.consolidation, enabled: false } }
  const first = await boot(root, true, memory, true, false, true, true, true, true, undefined, true, false, false, undefined, true)
  await first.genesis.awaken('小芽')
  const { agent: caller } = await first.agents.create({ sessionId: SessionId('task-caller'),
    agentOptions: { provider: 'fixture', model: 'chat' }, setup: async (agentCtx) => { await first.agentPresets.mount(agentCtx) } })
  expect(first.agentPresets.composedPreset(caller.ctx)).toBe('life')
  const targetPath = join(root, 'worker-workspace')
  await mkdir(targetPath)
  const target = await first.workspaceRegistry.create(targetPath, 'Worker workspace')
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  disposers.push(async () => { release.resolve(undefined) })
  class HeldWorker extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      entered.resolve(undefined)
      await release.promise
      yield * super.stream(options)
    }
  }
  const worker = new HeldWorker(['Work result: isolated 🌱'.repeat(30)])
  const unregisterWorker = first.llm.registerAdapter(['worker-fixture'], worker)
  const signal = new AbortController().signal
  let call = 0
  const execute = (args: object, agent = caller) => executeToolFixture(first, { name: 'genesis_tasks', arguments: args,
    agent, signal, callId: ToolCallId(`task-call-${++call}`) })
  const value = async (args: object) => {
    const result = await execute(args)
    if (result.isError) throw new Error(JSON.stringify(result.error))
    return z.record(z.string(), z.json()).parse(result.value)
  }
  expect((await execute({ action: 'catalog' })).isError).toBe(true)
  expect((await executeToolFixture(first, { name: 'learn', arguments: { name: 'genesis_tasks' }, agent: caller, signal, callId: ToolCallId('learn-tasks') })).isError).toBe(false)
  for (const name of ['read', 'write']) {
    expect((await executeToolFixture(first, { name: 'learn', arguments: { name }, agent: caller, signal, callId: ToolCallId(`learn-${name}`) })).isError).toBe(false)
  }
  expect(first.sandboxPolicy.resolve({ session: caller.session }).additionalWritableRoots).toContain(join(root, 'personal'))
  const catalog = await value({ action: 'catalog' })
  expect(catalog.default_mode).toBe('life')
  expect(catalog.workspaces).toContainEqual({ id: target.id, path: target.path, title: target.title })
  expect(JSON.stringify(catalog.modes)).not.toContain('"id":"life"')
  const request = { action: 'create', workspace_id: target.id, mode: 'standard', request_id: 'isolated-work', prompt: 'Return only the assigned work result.' }
  for (const invalid of [{ mode: 'life' }, { mode: 'missing' }, { workspace_id: 'missing' }]) {
    expect((await execute({ ...request, ...invalid })).isError).toBe(true)
  }
  const baseline = await first.genesis.snapshot()
  let created: Record<string, z.core.util.JSONType>
  try {
    created = await value(request)
    await entered.promise
    const running = await value({ action: 'inspect', task_id: created.task_id })
    expect(running).toMatchObject({ state: 'running', result_complete: false, result: '', requested_by: caller.id })
    const [retry1, retry2] = await Promise.all([value(request), value(request)])
    expect(retry1).toMatchObject({ task_id: created.task_id, reused: true })
    expect(retry2).toMatchObject({ task_id: created.task_id, reused: true })
    expect((await execute({ ...request, prompt: 'A different assignment.' })).isError).toBe(true)
    const id = SessionId(z.string().parse(created.task_id))
    expect(target.sessionIds).toEqual([id])
    expect(first.agents.get(id)!.session.header).toMatchObject({ cwd: target.path, agentPreset: 'standard', isSeeded: false })
    expect((await execute(request, first.agents.get(id))).isError).toBe(true)
    expect(first.sessionProjections.stateOf(first.agents.get(id)!.session, 'sandboxMode')).toBe('workspace-write')
    expect(first.sandboxPolicy.resolve({ session: first.agents.get(id)!.session }).additionalWritableRoots).toBeUndefined()
  } finally { release.resolve(undefined) }
  const id = SessionId(z.string().parse(created!.task_id))
  await first.agents.get(id)!.whenIdle()
  expect(worker.requests).toHaveLength(1)
  expect(JSON.stringify(worker.requests[0])).not.toContain('genesis_')
  expect(JSON.stringify(worker.requests[0])).not.toContain('小芽')
  expect(JSON.stringify(worker.requests[0])).not.toContain('Current simulated emotion')
  expect(JSON.stringify(worker.requests[0]!.messages)).toContain(request.prompt)
  expect(await first.genesis.snapshot()).toEqual(baseline)
  const completed = await value({ action: 'inspect', task_id: id, result_chars: 20 })
  expect(completed).toMatchObject({ state: 'completed', result_complete: true, next_offset: 20 })
  expect(completed.result).toBe('Work result: isolated 🌱'.repeat(30).slice(0, 20))
  expect((await value({ action: 'list', workspace_id: target.id })).tasks).toContainEqual({ task_id: id, mode: 'standard', live_state: 'idle', inspectable: true })
  const reply = first.agents.get(id)!.session.ownEvents().find(event => event.type === 'assistant/message')!
  if (reply.type !== 'assistant/message') throw new Error('Worker reply missing')
  await expect(first.genesisMemory.generate(id, reply.data.message.id, 'declarative', signal)).rejects.toThrow('Only a Life conversation')
  unregisterWorker()
  class FailedWorker extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      if (options.model === 'worker') throw new LlmError('Worker credentials rejected.', 'AUTH', { status: 401 })
      yield * super.stream(options)
    }
  }
  first.llm.registerAdapter(['worker-fixture'], new FailedWorker([]))
  caller.session.append('sandbox/mode', { mode: 'read-only' })
  caller.session.append('approval/policy', { policy: 'never' })
  const failed = await value({ ...request, request_id: 'failure-work' })
  const failedId = SessionId(z.string().parse(failed.task_id))
  expect(first.sessionProjections.stateOf(first.agents.get(failedId)!.session, 'sandboxMode')).toBe('read-only')
  expect(first.approval.overrideOf(first.agents.get(failedId)!.session)).toBe('never')
  await first.agents.get(failedId)!.whenIdle()
  expect(await value({ action: 'inspect', task_id: failedId })).toMatchObject({ state: 'failed', result_complete: false,
    failure: { code: 'AUTH', status: 401, message: 'Worker credentials rejected.' } })
  const absentPath = join(root, 'unavailable-workspace')
  await mkdir(absentPath)
  const absent = await first.workspaceRegistry.create(absentPath)
  await rm(absentPath, { recursive: true })
  expect((await execute({ ...request, request_id: 'missing-directory', workspace_id: absent.id })).isError).toBe(true)
  const orphanId = SessionId('orphaned-work')
  const orphan = await first.agents.create({ sessionId: orphanId, meta: { cwd: target.path, agentPreset: 'life' },
    setup: async (agentCtx) => { await first.agentPresets.mount(agentCtx, 'life') } })
  await first.agentPresets.select(orphan.agent, 'standard')
  await target.attachSession(orphanId)
  await first.sessionPersistence.flush()
  await orphan.dispose()
  await first.fiber.dispose()

  const second = await boot(root, true, memory, true, false, true, true, true, true, undefined, true, false, false, undefined, true)
  const { agent: resumed } = await second.agents.create({ sessionId: SessionId('another-life-conversation'),
    setup: async (agentCtx) => { await second.agentPresets.mount(agentCtx, 'life') } })
  const inspectCold = await executeToolFixture(second, { name: 'genesis_tasks', arguments: { action: 'inspect', task_id: id, offset: 20, result_chars: 30 },
    agent: resumed, signal, callId: ToolCallId('cold-inspection') })
  expect(inspectCold.isError).toBe(false)
  if (inspectCold.isError) throw new Error(JSON.stringify(inspectCold.error))
  expect(inspectCold.value).toMatchObject({ state: 'completed', result: 'Work result: isolated 🌱'.repeat(30).slice(20, 50) })
  expect(second.agents.get(id)).toBeUndefined()
  const monitored = await second.genesisTasks.catalog(0, signal)
  expect(monitored.items.find(item => item.id === id)).toMatchObject({ state: 'completed', executionState: 'completed',
    delivery: 'delivered', attempts: 1, readable: true, confirmed: true })
  expect(second.agents.get(id)).toBeUndefined()
  expect(second.sessions.get(id)).toBeUndefined()
  await expect(second.genesisTasks.catalog(-1, signal)).rejects.toThrow()
  for (const [taskId, state] of [[failedId, 'failed'], [orphanId, 'interrupted']] as const) {
    const result = await executeToolFixture(second, { name: 'genesis_tasks', arguments: { action: 'inspect', task_id: taskId },
      agent: resumed, signal, callId: ToolCallId(`inspect-${state}`) })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error(JSON.stringify(result.error))
    expect(result.value).toMatchObject({ state, result_complete: false })
    expect(second.agents.get(taskId)).toBeUndefined()
  }
  const fiber = [...second.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis')!.fiber!
  await fiber.dispose()
  expect(second.tools.get('genesis_tasks', resumed)).toBeUndefined()
  expect(second.get('genesisTasks')).toBeUndefined()
})

it('recovers pending task deliveries across restart and confirms a failed acknowledgement without resending', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const memory = { ...embeddings.config, associationLimit: 0,
    consolidation: { ...embeddings.config.consolidation, enabled: false } }
  const start = () => boot(root, true, memory, true, false, true, true, false, true, undefined, false, false, false, undefined, true)
  const first = await start()
  await first.genesis.awaken('小芽')
  const signal = new AbortController().signal
  const { agent: original } = await first.agents.create({ sessionId: SessionId('delivery-origin'),
    setup: async (agentCtx) => { await first.agentPresets.mount(agentCtx, 'life') } })
  expect((await executeToolFixture(first, { name: 'learn', arguments: { name: 'genesis_tasks' }, agent: original,
    signal, callId: ToolCallId('learn-delivery-tool') })).isError).toBe(false)
  const path = join(root, 'delivery-workspace')
  await mkdir(path)
  const target = await first.workspaceRegistry.create(path)
  const lifeId = (await first.genesis.snapshot()).identity.id
  let call = 0
  const execute = (ctx: Context, agent: import('@deepseek-ai/dsh-agent').Agent, args: object) =>
    executeToolFixture(ctx, { name: 'genesis_tasks', arguments: args, agent, signal, callId: ToolCallId(`delivery-${++call}`) })
  const request = (request_id: string) => ({ action: 'create', workspace_id: target.id, mode: 'standard', request_id,
    prompt: `Return the result for ${request_id}.` })
  const beforeCreate = request('before-create')
  const blankSession = request('blank-session')
  const create = vi.spyOn(first.agents, 'create').mockRejectedValueOnce(new Error('creation interrupted'))
  try { expect((await execute(first, original, beforeCreate)).isError).toBe(true) } finally { create.mockRestore() }
  const attach = vi.spyOn(target, 'attachSession').mockRejectedValueOnce(new Error('workspace attachment interrupted'))
  try { expect((await execute(first, original, blankSession)).isError).toBe(true) } finally { attach.mockRestore() }
  const savedSchema = z.object({ tables: z.object({ submissions: z.record(z.string(), z.object({
    requestId: z.string(), delivery: z.enum(['pending', 'delivered']), prompt: z.string().nullable(),
  })) }) })
  const saved = savedSchema.parse(JSON.parse(await readFile(join(root, 'genesis_tasks.json'), 'utf8')))
  expect(Object.values(saved.tables.submissions)).toHaveLength(2)
  expect(Object.values(saved.tables.submissions)).toEqual(expect.arrayContaining([
    expect.objectContaining({ requestId: 'before-create', delivery: 'pending' }),
    expect.objectContaining({ requestId: 'blank-session', delivery: 'pending' }),
  ]))
  await first.fiber.dispose()

  const second = await start()
  const worker = new ScriptedModel(['Recovered first task.', 'Recovered second task.', 'Acknowledged task.'])
  second.llm.registerAdapter(['worker-fixture'], worker)
  const { agent: caller } = await second.agents.create({ sessionId: SessionId('delivery-new-conversation'),
    setup: async (agentCtx) => { await second.agentPresets.mount(agentCtx, 'life') } })
  caller.session.append('sandbox/mode', { mode: 'read-only' })
  caller.session.append('approval/policy', { policy: 'never' })
  for (const pending of [beforeCreate, blankSession]) {
    const id = taskSessionId(lifeId, pending.request_id)
    const inspected = await execute(second, caller, { action: 'inspect', task_id: id })
    expect(inspected.isError, JSON.stringify(inspected)).toBe(false)
    if (inspected.isError) throw new Error(JSON.stringify(inspected.error))
    expect(inspected.value).toMatchObject({ state: 'pending-delivery', result_complete: false, requested_by: original.id })
    expect(second.agents.get(id)).toBeUndefined()
    expect(worker.requests).toHaveLength(pending === beforeCreate ? 0 : 1)
    expect((await execute(second, caller, { ...pending, prompt: 'Conflicting work.' })).isError).toBe(true)
    const result = await execute(second, caller, pending)
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error(JSON.stringify(result.error))
    expect(result.value).toMatchObject({ task_id: id, delivery: 'delivered', reused: true })
    const agent = second.agents.get(id)!
    expect(second.sessionProjections.stateOf(agent.session, 'sandboxMode')).toBe('read-only')
    expect(second.approval.overrideOf(agent.session)).toBe('never')
    await agent.whenIdle()
    const delivered = agent.session.ownEvents().flatMap(event => event.type === 'user/message'
      && event.data.source.kind === 'genesis-task' ? [event.data] : [])
    expect(delivered).toHaveLength(1)
    expect(delivered[0]).toMatchObject({ id: `genesis-task:${id}`, source: { requester: original.id } })
  }
  const ack = request('acknowledgement')
  const ackId = taskSessionId(lifeId, ack.request_id)
  const unhook = second.on('session/flush', (session) => {
    if (session.id === ackId) throw new Error('acknowledgement interrupted')
  }, { global: true })
  let failed
  try { failed = await execute(second, caller, ack) } finally { unhook() }
  expect(failed.isError).toBe(true)
  const agent = second.agents.get(ackId)!
  await agent.whenIdle()
  const retry = await execute(second, caller, ack)
  expect(retry.isError).toBe(false)
  expect(worker.requests).toHaveLength(3)
  expect(agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'genesis-task')).toHaveLength(1)
  const confirmed = await readFile(join(root, 'genesis_tasks.json'), 'utf8')
  expect(confirmed).not.toContain(ack.prompt)
  expect(Object.values(savedSchema.parse(JSON.parse(confirmed)).tables.submissions)).toEqual([
    expect.objectContaining({ delivery: 'delivered', prompt: null }),
    expect.objectContaining({ delivery: 'delivered', prompt: null }),
    expect.objectContaining({ delivery: 'delivered', prompt: null }),
  ])
  const withdrawn = request('withdrawn-delivery')
  const withdrawnId = taskSessionId(lifeId, withdrawn.request_id)
  const unavailable = vi.spyOn(second.agents, 'create').mockRejectedValueOnce(new Error('creation interrupted'))
  try { expect((await execute(second, caller, withdrawn)).isError).toBe(true) } finally { unavailable.mockRestore() }
  const listing = await execute(second, caller, { action: 'list', workspace_id: target.id })
  expect(listing.isError).toBe(false)
  if (listing.isError) throw new Error(JSON.stringify(listing.error))
  const listed = z.object({ tasks: z.array(z.object({ task_id: z.string(), mode: z.string(),
    live_state: z.string(), inspectable: z.boolean() })) }).parse(listing.value)
  expect(listed.tasks).toContainEqual({ task_id: withdrawnId, mode: 'standard', live_state: 'pending-delivery', inspectable: true })
  const canceled = await execute(second, caller, { action: 'cancel', task_id: withdrawnId })
  expect(canceled.isError).toBe(false)
  if (canceled.isError) throw new Error(JSON.stringify(canceled.error))
  expect(canceled.value).toMatchObject({ canceled: true })
  expect((await execute(second, caller, withdrawn)).isError).toBe(true)
  expect(await readFile(join(root, 'genesis_tasks.json'), 'utf8')).not.toContain(withdrawn.prompt)
  expect(worker.requests).toHaveLength(3)
})

it('stops owned task work, persists pause and resumes the same cold Session once per explicit request', async () => {
  const root = await directory()
  const embedding = await embeddingFixture()
  const memory = { ...embedding.config, associationLimit: 0,
    consolidation: { ...embedding.config.consolidation, enabled: false } }
  const start = () => boot(root, true, memory, true, false, true, true, false, true, undefined, false, false, false, undefined, true)
  const signal = new AbortController().signal
  let call = 0
  const execute = async (ctx: Context, caller: import('@deepseek-ai/dsh-agent').Agent, args: object) => {
    const result = await executeToolFixture(ctx, { name: 'genesis_tasks', arguments: args, agent: caller,
      signal, callId: ToolCallId(`execution-${++call}`) })
    if (result.isError) throw new Error(JSON.stringify(result.error))
    return z.record(z.string(), z.json()).parse(result.value)
  }
  const rejected = (ctx: Context, caller: import('@deepseek-ai/dsh-agent').Agent, args: object) => executeToolFixture(ctx, {
    name: 'genesis_tasks', arguments: args, agent: caller, signal, callId: ToolCallId(`rejected-execution-${++call}`) })
  const first = await start()
  await first.genesis.awaken('小芽')
  const { agent: original } = await first.agents.create({ sessionId: SessionId('execution-origin'),
    setup: async (agentCtx) => { await first.agentPresets.mount(agentCtx, 'life') } })
  expect((await executeToolFixture(first, { name: 'learn', arguments: { name: 'genesis_tasks' }, agent: original,
    signal, callId: ToolCallId('learn-execution-tool') })).isError).toBe(false)
  const targetPath = join(root, 'execution-workspace')
  await mkdir(targetPath)
  const workspace = await first.workspaceRegistry.create(targetPath)
  class FailedWorker extends ScriptedModel {
    override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      throw new LlmError('Temporary worker failure.', 'SERVER', { status: 503 })
    }
  }
  first.llm.registerAdapter(['worker-fixture'], new FailedWorker([]))
  const created = await execute(first, original, { action: 'create', workspace_id: workspace.id, mode: 'standard',
    request_id: 'persistent-execution', prompt: 'Inspect saved progress and finish this assignment.' })
  const id = SessionId(z.string().parse(created.task_id))
  await first.agents.get(id)!.whenIdle()
  expect(await execute(first, original, { action: 'inspect', task_id: id })).toMatchObject({ turn: 1, state: 'failed', attempt_count: 1 })
  await first.fiber.dispose()

  const second = await start()
  const { agent: caller } = await second.agents.create({ sessionId: SessionId('execution-controller'),
    setup: async (agentCtx) => { await second.agentPresets.mount(agentCtx, 'life') } })
  caller.session.append('sandbox/mode', { mode: 'read-only' })
  caller.session.append('approval/policy', { policy: 'never' })
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  disposers.push(async () => { release.resolve(undefined) })
  class HeldWorker extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      entered.resolve(undefined)
      await new Promise<void>((resolve) => {
        const done = () => { options.signal?.removeEventListener('abort', done); resolve() }
        options.signal?.addEventListener('abort', done, { once: true })
        void release.promise.then(done)
        if (options.signal?.aborted) done()
      })
      options.signal?.throwIfAborted()
      yield * super.stream(options)
    }
  }
  second.llm.registerAdapter(['worker-fixture'], new HeldWorker(['Unexpected output.']))
  const uncertain = { action: 'resume', task_id: id, request_id: 'uncertain-resume', expected_turn: 1 }
  const interruptedRestore = vi.spyOn(second.agents, 'resume').mockRejectedValueOnce(new Error('restore interrupted'))
  try { expect((await rejected(second, caller, uncertain)).isError).toBe(true) } finally { interruptedRestore.mockRestore() }
  const replayed = await rejected(second, caller, uncertain)
  expect(replayed.isError).toBe(true)
  if (!replayed.isError) throw new Error('Unknown resume was replayed')
  expect(replayed.error.message).toContain('no Session receipt')
  expect((await rejected(second, caller, { ...uncertain, request_id: 'bypass-uncertain' })).isError).toBe(true)
  expect(second.agents.get(id)).toBeUndefined()
  await execute(second, caller, { action: 'stop', task_id: id, request_id: 'reconcile-uncertain', expected_turn: 1 })
  const resume = { action: 'resume', task_id: id, request_id: 'resume-first', expected_turn: 1 }
  expect(await execute(second, caller, resume)).toMatchObject({ state: 'submitted', task_id: id })
  await entered.promise
  const live = second.agents.get(id)!
  expect(second.sessionProjections.stateOf(live.session, 'sandboxMode')).toBe('read-only')
  expect(second.approval.overrideOf(live.session)).toBe('never')
  second.jobs.attachController('execution-fixture')
  const jobDone = Promise.withResolvers<import('@deepseek-ai/dsh-jobs').JobOutcome>()
  const cancelAsked = Promise.withResolvers<undefined>()
  disposers.push(async () => { jobDone.resolve({ status: 'killed' }) })
  const job = second.jobs.start({ kind: 'bash', owner: id, label: 'Owned task process',
    run: () => ({ cancel: () => { cancelAsked.resolve(undefined) }, done: jobDone.promise }) })
  const stop = { action: 'stop', task_id: id, request_id: 'stop-first', expected_turn: 2 }
  let settled = false
  const stopping = execute(second, caller, stop).then((value) => { settled = true; return value })
  await cancelAsked.promise
  expect(settled).toBe(false)
  expect(second.jobs.get(job, id).status).toBe('stopping')
  jobDone.resolve({ status: 'killed' })
  expect(await stopping).toMatchObject({ state: 'stopped' })
  expect(live.status).toBe('idle')
  expect(await execute(second, caller, { action: 'inspect', task_id: id })).toMatchObject({ execution_state: 'stopped', result_complete: false })
  expect(await execute(second, caller, resume)).toMatchObject({ reused: true, execution_state: 'stopped' })
  expect((await rejected(second, caller, { ...resume, request_id: 'stale-resume' })).isError).toBe(true)
  await second.fiber.dispose()

  const third = await start()
  const model = new ScriptedModel(['Recovered task result.'])
  const unregister = third.llm.registerAdapter(['worker-fixture'], model)
  const { agent: restored } = await third.agents.create({ sessionId: SessionId('execution-restored-controller'),
    setup: async (agentCtx) => { await third.agentPresets.mount(agentCtx, 'life') } })
  const snapshot = await execute(third, restored, { action: 'inspect', task_id: id })
  expect(snapshot).toMatchObject({ execution_state: 'stopped', turn: 2, attempt_count: 2 })
  expect(third.agents.get(id)).toBeUndefined()
  const again = { action: 'resume', task_id: id, request_id: 'resume-second', expected_turn: snapshot.turn }
  const [a, b] = await Promise.all([execute(third, restored, again), execute(third, restored, again)])
  expect(a.task_id).toBe(id)
  expect(b.reused).toBe(true)
  await third.agents.get(id)!.whenIdle()
  expect(model.requests).toHaveLength(1)
  expect(await execute(third, restored, { action: 'inspect', task_id: id })).toMatchObject({ state: 'completed',
    execution_state: 'completed', attempt_count: 3, result: 'Recovered task result.', result_complete: true })
  expect((await rejected(third, restored, { ...again, request_id: 'repeat-completed', expected_turn: 3 })).isError).toBe(true)
  const history = await execute(third, restored, { action: 'attempts', task_id: id, limit: 2 })
  expect(history.next_offset).toBe(2)
  const attempts = z.array(z.object({ turn: z.number(), reason: z.object({ kind: z.string(), canceledBy: z.string().optional() }) })).parse(history.attempts)
  expect(attempts).toEqual([{ turn: 1, reason: { kind: 'error' } }, { turn: 2, reason: { kind: 'aborted', canceledBy: 'hook' } }])

  third.jobs.attachController('completed-task-fixture')
  const background = Promise.withResolvers<import('@deepseek-ai/dsh-jobs').JobOutcome>()
  disposers.push(async () => { background.resolve({ status: 'killed' }) })
  third.jobs.start({ kind: 'bash', owner: id, label: 'Background work after reply',
    run: () => ({ cancel: () => { background.resolve({ status: 'killed' }) }, done: background.promise }) })
  expect(await execute(third, restored, { action: 'inspect', task_id: id })).toMatchObject({ state: 'completed',
    execution_state: 'background', result_complete: false })
  await execute(third, restored, { action: 'stop', task_id: id, request_id: 'stop-background', expected_turn: 3 })
  expect((await rejected(third, restored, { ...again, request_id: 'reopen-paused-completed', expected_turn: 3 })).isError).toBe(true)
  expect(model.requests).toHaveLength(1)
  unregister()
  const unregisterHeld = third.llm.registerAdapter(['worker-fixture'], new HeldWorker(['Not a real result.']))
  const operatorTask = await execute(third, restored, { action: 'create', workspace_id: workspace.id, mode: 'standard',
    request_id: 'operator-stop', prompt: 'Wait until stopped.' })
  const operatorId = SessionId(z.string().parse(operatorTask.task_id))
  const operatorWorker = third.agents.get(operatorId)!
  operatorWorker.cancel({ kind: 'user' })
  await operatorWorker.whenIdle()
  const operatorState = await execute(third, restored, { action: 'inspect', task_id: operatorId })
  const refused = await rejected(third, restored, { action: 'resume', task_id: operatorId,
    request_id: 'override-operator', expected_turn: operatorState.turn })
  expect(refused.isError).toBe(true)
  if (!refused.isError) throw new Error('Operator stop was overridden')
  expect(refused.error.message).toContain('operator stopped')
  unregisterHeld()
  const operatorModel = new ScriptedModel(['Operator continued explicitly.'])
  third.llm.registerAdapter(['worker-fixture'], operatorModel)
  const stopped = third.agents.get(id)!
  stopped.followup(createUserMessage({ source: { kind: 'genesis-task', requester: restored.id, requestId: 'late-worker-wake',
    fingerprint: '0'.repeat(64), form: 'notice', summary: 'Late task wake' }, content: [{ type: 'text', text: 'Continue now.' }] }))
  await stopped.whenIdle()
  expect(operatorModel.requests).toHaveLength(0)
  stopped.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I explicitly resume this task.' }] }))
  await stopped.whenIdle()
  expect(operatorModel.requests).toHaveLength(1)
  expect(await execute(third, restored, { action: 'inspect', task_id: id })).toMatchObject({ execution_state: 'completed', result_complete: true })
  expect(await execute(third, restored, { action: 'stop', task_id: id, request_id: 'stop-background', expected_turn: 3 }))
    .toMatchObject({ reused: true, execution_state: 'completed' })
})

it('accepts a Gemini-style single embedding without index and refuses incorrect explicit indices', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config)
  const signal = new AbortController().signal
  embeddings.setIndex('omitted')
  await ctx.genesisStatus.testEmbedding(signal)
  for (const index of [1, '0', null] as const) {
    embeddings.setIndex(index)
    await expect(ctx.genesisStatus.testEmbedding(signal)).rejects.toThrow('index must be numeric 0 or omitted')
  }
  embeddings.setIndex(0)
  await ctx.genesisStatus.testEmbedding(signal)
})

it('reports the evidence budget failure without invoking a decision model or failing the chat reply', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, { ...embeddings.config, inputChars: 512 })
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['The conversation can continue.']))
  const agent = await ctx.agentLoop.create(SessionId('evidence-budget'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'x'.repeat(600) }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const review = (await ctx.genesisStatus.inspect(new AbortController().signal)).review
  if (review?.state !== 'failed') throw new Error('Expected a failed review')
  expect(review.failure.stage).toBe('evidence')
  expect(review.failure.message).toContain('memory.inputChars')
  expect(agent.session.ownEvents().some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed')).toBe(true)
  expect(embeddings.requests[0]).toHaveLength(512)
  expect(embeddings.requests.every(input => input.length <= 512)).toBe(true)
})

it('retains a writer provider HTTP failure instead of reporting an incomplete generic JSON response', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, { ...embeddings.config, maxRetries: 3 })
  let tokenLimited = false
  let attempts = 0
  class RejectedWriter extends ScriptedModel {
    override async * stream(): AsyncIterable<StreamChunk> {
      attempts++
      if (tokenLimited) { yield { type: 'finish', reason: { kind: 'max-tokens' } }; return }
      yield { type: 'finish', reason: { kind: 'error',
        failure: { code: 'AUTH', status: 401, message: 'private-provider-body' } } }
    }
  }
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}', '{"update":true}']))
  ctx.llm.registerAdapter(['memory-writer'], new RejectedWriter([]))
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['Okay.']))
  const agent = await ctx.agentLoop.create(SessionId('writer-provider-error'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Remember I prefer oolong.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const review = (await ctx.genesisStatus.inspect(new AbortController().signal)).review
  if (review?.state !== 'failed') throw new Error('Expected failed writer')
  expect(review.failure.stage).toBe('writer')
  expect(review.failure.message).toContain('AUTH; HTTP 401')
  expect(review.failure.message).not.toContain('private-provider-body')
  expect(attempts).toBe(1)
  tokenLimited = true
  await expect(ctx.genesisStatus.retryMemory(agent.id, new AbortController().signal)).rejects.toThrow('max-tokens; memory.maxTokens=4096')
  expect(attempts).toBe(2)
})


it('manually saves an older reply in the selected layer after restart, without repeating automatic decisions or duplicate writes', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const first = await boot(root, true, embeddings.config, false, false, false, true)
  const chat = new ScriptedModel(['Your oolong preference matters.', 'We can talk about something else.'])
  const decision = new ScriptedModel(['{"update":false}', '{"update":false}'])
  first.llm.registerAdapter(['fixture'], chat)
  first.llm.registerAdapter(['memory-decision'], decision)
  first.llm.registerAdapter(['memory-writer'], new MemoryWriter())
  const agent = await first.agentLoop.create(SessionId('manual-source'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I prefer oolong. Use a gentle tone.' }] }))
  await agent.whenIdle()
  const reply = agent.session.ownEvents().find(event => event.type === 'assistant/message')
  if (reply?.type !== 'assistant/message') throw new Error('Missing source reply')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A different topic.' }] }))
  await agent.whenIdle()
  expect(decision.requests).toHaveLength(2)
  const baseline = (await first.genesis.snapshot()).memories.length
  await first.fiber.dispose()

  const second = await boot(root, true, embeddings.config, false, false, false, true)
  const restoredDecision = new ScriptedModel([])
  const writer = new MemoryWriter()
  second.llm.registerAdapter(['fixture'], new ScriptedModel([]))
  second.llm.registerAdapter(['memory-decision'], restoredDecision)
  second.llm.registerAdapter(['memory-writer'], writer)
  await second.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'fixture', model: 'chat' } })
  const signal = new AbortController().signal
  expect(await second.genesisMemory.generate(agent.id, reply.data.message.id, 'non-declarative', signal)).toBe(true)
  const saved = await second.genesis.snapshot()
  expect(saved.memories).toHaveLength(baseline + 2)
  expect(saved.memories.filter(memory => memory.attribution === 'user-stated').every(memory => memory.kind === 'non-declarative')).toBe(true)
  expect(JSON.stringify(writer.requests)).toContain('I prefer oolong.')
  expect(JSON.stringify(writer.requests)).not.toContain('A different topic.')
  expect(restoredDecision.requests).toHaveLength(0)
  expect(await second.genesisMemory.generate(agent.id, reply.data.message.id, 'non-declarative', signal)).toBe(true)
  expect(writer.requests).toHaveLength(1)
  expect((await second.genesis.snapshot()).memories).toEqual(saved.memories)
  const foreign = await second.agentLoop.create(SessionId('different-conversation'), { provider: 'fixture', model: 'chat' })
  await expect(second.genesisMemory.generate(foreign.id, reply.data.message.id, 'declarative', signal)).rejects.toMatchObject({
    code: 'genesis/review', details: { stage: 'evidence' },
  })
})

class ExperienceWriter extends ScriptedModel {
  constructor() { super([]) }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const block = options.messages[0]?.content.find(item => item.type === 'text')
    if (block?.type !== 'text') throw new Error('Missing experience writer input')
    const input = z.object({ conversation: z.array(z.object({ role: z.string(), seq: z.number(), text: z.string() })),
      memories: z.array(z.object({ id: z.string(), category: z.string(), experience: z.object({ sessionId: z.string() }).optional() })) })
      .parse(JSON.parse(block.text))
    const user = input.conversation.find(item => item.role === 'user')!
    const changed = user.text.includes('black tea')
    const old = input.memories.find(item => item.category === 'semantic')
    const episode = input.memories.find(item => item.experience !== undefined)
    yield * new ScriptedModel([JSON.stringify({
      experience: { ...(episode === undefined ? {} : { id: episode.id }),
        summary: changed ? 'We discussed the change from oolong to black tea.' : 'The user introduced their preference for oolong.',
        topics: ['tea', 'preferences'], sourceSeqs: [user.seq], importance: 0.8, confidence: 0.8 },
      changes: [{ action: 'upsert', ...(old === undefined ? {} : { id: old.id }), sourceSeqs: [user.seq],
        memory: { content: changed ? 'The user currently prefers black tea.' : 'The user prefers oolong.',
          category: 'semantic', kind: 'declarative', attribution: 'user-stated', importance: 0.8, confidence: 0.8 } }],
    })]).stream(options)
  }
}

it('remembers an experience across turns, preserves changed preferences and recalls associated evidence after restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const first = await boot(root, true, embeddings.config)
  const writer = new ExperienceWriter()
  first.llm.registerAdapter(['memory-writer'], writer)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}', '{"update":true}']))
  first.llm.registerAdapter(['fixture'], new ScriptedModel(['Nice to meet you.', 'I understand your preference changed.']))
  const agent = await first.agentLoop.create(SessionId('shared-experience'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I prefer oolong. Unstored private marker.' }] }))
  await agent.whenIdle()
  const initial = await first.genesis.snapshot()
  const firstExperience = initial.memories.find(memory => memory.experience !== undefined)!
  expect(firstExperience.experience?.sessionId).toBe(agent.id)
  expect(firstExperience.attribution).toBe('model-inference')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I used to like oolong; now I prefer black tea.' }] }))
  await agent.whenIdle()
  const updated = await first.genesis.snapshot()
  const current = updated.memories.find(memory => memory.category === 'semantic')!
  expect(current.content).toBe('The user currently prefers black tea.')
  expect(current.history).toHaveLength(1)
  expect(current.history?.[0]).toMatchObject({ content: 'The user prefers oolong.', attribution: 'user-stated', confidence: 0.8 })
  expect(current.confidence).toBe(0.8)
  expect(current.experienceIds).toEqual([firstExperience.id])
  const continued = updated.memories.find(memory => memory.id === firstExperience.id)!
  expect(continued.experience?.startedAt).toBe(firstExperience.experience?.startedAt)
  expect(continued.sourceEventIds).toHaveLength(2)
  expect(continued.history).toHaveLength(1)
  await first.fiber.dispose()

  const second = await boot(root, true, embeddings.config)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  second.llm.registerAdapter(['memory-writer'], new ExperienceWriter())
  const reader = new ScriptedModel([{ name: 'genesis_recall', args: { query: 'oolong' } }, 'You now prefer black tea; you previously preferred oolong.'])
  second.llm.registerAdapter(['fixture'], reader)
  const other = await second.agentLoop.create(SessionId('later-recollection'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'What warm drink do I like?' }] }))
  await other.whenIdle()
  expect((await second.genesis.snapshot()).identity).toEqual(initial.identity)
  expect((await second.genesis.getMemory(current.id))?.history).toEqual(current.history)
  const firstRequest = JSON.stringify(reader.requests[0])
  expect(firstRequest).toContain('Associated candidate memories')
  expect(firstRequest).toContain('currently prefers black tea')
  expect(firstRequest).not.toContain('previousInterpretations')
  expect(firstRequest).not.toContain(current.id)
  expect(firstRequest).not.toContain('updatedAt')
  expect(firstRequest).not.toContain('sourceEventIds')
  expect(firstRequest).not.toContain('The user prefers oolong.')
  expect(firstRequest).not.toContain('Unstored private marker')
  const recall = other.session.ownEvents().find(event => event.type === 'tool/result')
  expect(JSON.stringify(recall)).toContain(current.content)
  expect(JSON.stringify(recall)).not.toContain('The user prefers oolong.')
  expect(JSON.stringify(recall)).not.toContain('supersededAt')
  expect(JSON.stringify(other.session.ownEvents())).toContain('Associated candidate memories')
  const after = await second.genesis.getMemory(current.id)
  expect(after?.confidence).toBe(current.confidence)
  expect(after?.updatedAt).toBe(current.updatedAt)
})

it('limits automatic association to one embedding request while explicit recall backfills missing vectors', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config)
  const birth = (await ctx.genesis.snapshot()).events[0]!
  for (let index = 0; index < 8; index++) await ctx.genesis.remember({ category: 'semantic', content: `Oolong preference ${index}`,
    importance: 0.5, confidence: 0.5, sourceEventIds: [birth.id] })
  const engine = new LifeMemoryEngine(ctx, ctx.genesis, Genesis.Config({ leasePath: join(root, 'writer.lock'), memory: embeddings.config }), embeddings.config)
  disposers.push(() => engine.close())
  const start = performance.now()
  expect(await engine.associate('Oolong preference', new AbortController().signal)).toContain('Oolong preference')
  console.info(`Automatic association: ${embeddings.requests.length} embedding requests, ${Math.round(performance.now() - start)} ms (local fixture)`)
  expect(embeddings.requests).toHaveLength(1)
  expect(await engine.recall({ text: 'Oolong preference', limit: 3, chars: 2000 })).toHaveLength(3)
  expect(embeddings.requests).toHaveLength((await ctx.genesis.snapshot()).memories.length + 2)
})

it('continues chatting with a logged unavailable cue when automatic recall fails', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, embeddings.config)
  const birth = (await ctx.genesis.snapshot()).events[0]!
  await ctx.genesis.remember({ category: 'semantic', content: 'Oolong preference', importance: 0.5, confidence: 0.5, sourceEventIds: [birth.id] })
  embeddings.breakResponse()
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  ctx.llm.registerAdapter(['memory-writer'], new ExperienceWriter())
  const chat = new ScriptedModel(['I can keep talking while memory retrieval is unavailable.'])
  ctx.llm.registerAdapter(['fixture'], chat)
  const agent = await ctx.agentLoop.create(SessionId('unavailable-cue'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'What warm drink?' }] }))
  await agent.whenIdle()
  expect(chat.requests).toHaveLength(1)
  expect(JSON.stringify(chat.requests[0])).toContain('Recall failed')
  expect(agent.session.ownEvents().some(event => event.type === 'turn/end' && event.data.reason.kind === 'completed')).toBe(true)
})

class HabitWriter extends ScriptedModel {
  constructor() { super([]) }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const text = options.messages[0]?.content.find(block => block.type === 'text')
    if (text?.type !== 'text') throw new Error('Missing writer request')
    const input = z.object({ purpose: z.string().optional(),
      conversation: z.array(z.object({ role: z.string(), seq: z.number() })).optional(),
      memories: z.array(z.object({ id: z.string(), habit: z.object({ active: z.boolean() }).optional(),
        sourceEventIds: z.array(z.string()) })).optional(),
      feedback: z.array(z.object({ id: z.string(), turn: z.string() })).optional() }).parse(JSON.parse(text.text))
    if (input.purpose === 'consolidation') {
      const memories = input.memories ?? []
      const old = memories.find(memory => memory.habit !== undefined)
      const changes = [{ ...(old === undefined ? {} : { id: old.id }), evidenceIds: memories.map(memory => memory.id),
        memory: { category: 'procedural', content: 'When greeting this user, use a brief gentle greeting.', kind: 'non-declarative', importance: 0.8, confidence: 0.7 },
        habit: { cue: 'Greeting this user', response: 'Use a brief gentle greeting', active: true,
          supportEventIds: [...new Set(input.feedback?.map(item => item.id) ?? [])] } }]
      yield * new ScriptedModel([JSON.stringify({ changes })]).stream(options)
      return
    }
    const user = input.conversation?.find(message => message.role === 'user')
    if (user === undefined) throw new Error('Missing real user evidence')
    yield * new ScriptedModel([JSON.stringify({ changes: [{ action: 'upsert', sourceSeqs: [user.seq],
      memory: { category: 'semantic', content: `User feedback ${user.seq}: brief gentle greetings are preferred.`, kind: 'declarative',
        attribution: 'user-stated', importance: 0.8, confidence: 0.7 } }] })]).stream(options)
  }
}

class ThinkingWriter extends HabitWriter {
  truncate = false
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model, reasoning: {
      efforts: ['off', 'low', 'high'].map(id => ({ id: ReasoningEffortId(id), name: id })),
      defaultEffort: ReasoningEffortId('high'),
    } }
  }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!options.system?.includes('仅依据所引用的证据整理提供的候选记忆')) {
      yield * super.stream(options)
      return
    }
    this.requests.push(options)
    if (this.truncate || options.reasoningEffort === 'high') {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '{"changes":[]}' }
      yield { type: 'finish', reason: { kind: 'max-tokens' } }
      return
    }
    yield * new ScriptedModel(['{"changes":[]}']).stream(options)
  }
}

it('keeps auxiliary reasoning within its own budget, preserves truncated consolidation evidence and retries without another chat reply', async () => {
  const embedding = await embeddingFixture()
  const ctx = await boot(await directory(), true, embedding.config)
  const writer = new ThinkingWriter()
  const chat = new ScriptedModel(['Hello.'])
  chat.resolveModel = writer.resolveModel
  ctx.llm.registerAdapter(['fixture'], chat)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}']))
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const agent = await ctx.agentLoop.create(SessionId('consolidation-token-budget'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Please keep greetings gentle.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(chat.requests[0]?.reasoningEffort).toBe('high')
  expect(writer.requests[0]?.reasoningEffort).toBe('off')
  const before = await ctx.genesis.snapshot()
  writer.truncate = true
  const signal = new AbortController().signal
  await expect(ctx.genesisMemory.consolidate(signal)).rejects.toThrow('reasoningEffort=off')
  const failed = await ctx.genesis.snapshot()
  expect(failed.memories).toEqual(before.memories)
  expect(failed.consolidation!.revision).toBeGreaterThanOrEqual(before.consolidation!.revision)
  expect(failed.consolidation).toMatchObject({ completed: 0, failures: 1,
    failure: { stage: 'writer' } })
  writer.truncate = false
  expect(await ctx.genesisMemory.consolidate(signal)).toBe(true)
  const after = await ctx.genesis.snapshot()
  expect(after.consolidation?.completed).toBe(after.consolidation?.revision)
  expect(after.consolidation?.failures).toBe(0)
  expect(after.events.filter(event => event.type === 'memory.consolidated')).toHaveLength(1)
  expect(chat.requests).toHaveLength(1)
  expect(writer.requests.every(request => request.reasoningEffort === 'off')).toBe(true)
  const requests = agent.session.ownEvents().map(genesisAuditRecord).filter(record =>
    record?.type === 'plugin:genesis/memory-call' && record.data.phase === 'request' && record.data.role === 'writer')
  expect(requests).toHaveLength(3)
  for (const record of requests) {
    if (record?.type !== 'plugin:genesis/memory-call' || record.data.phase !== 'request') throw new Error('Missing writer audit')
    expect(record.data.config).toMatchObject({ maxTokens: 4096, reasoningEffort: 'off' })
  }
})

it.each([
  { retries: 3, failures: 3, code: 'TRANSPORT', attempts: 4, succeeds: true },
  { retries: 0, failures: 3, code: 'TRANSPORT', attempts: 1, succeeds: false },
  { retries: 1, failures: 3, code: 'SERVER', attempts: 2, succeeds: false },
  { retries: 3, failures: 3, code: 'AUTH', attempts: 1, succeeds: false },
])('bounds auxiliary retries at $retries for $code failures and logs each attempt', async ({ retries, failures, code, attempts, succeeds }) => {
  const root = await directory()
  const embedding = await embeddingFixture()
  const config = { ...embedding.config, maxRetries: retries }
  const ctx = await boot(root, true, config)
  class FailingWriter extends ScriptedModel {
    attempts = 0
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      if (this.attempts++ < failures) throw new LlmError('Model request failed.', code)
      yield * super.stream(options)
    }
  }
  const writer = new FailingWriter(['{}'])
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const agent = await ctx.agentLoop.create(SessionId('auxiliary-retries'), { provider: 'memory-writer', model: 'writer' })
  const before = await ctx.genesis.snapshot()
  const result = auxiliaryCall(ctx, agent.session, 'emotion-writer', 'Return JSON.', {}, new AbortController().signal,
    memoryModels(config), config)
  if (succeeds) await expect(result).resolves.toEqual({})
  else await expect(result).rejects.toMatchObject({ code: 'memory-provider', failure: { code } })
  expect(writer.attempts).toBe(attempts)
  expect(agent.session.ownEvents().map(genesisAuditRecord).filter(record => record?.data.phase === 'request')).toHaveLength(attempts)
  expect(await ctx.genesis.snapshot()).toEqual(before)
})

it('defaults to three auxiliary retries, recovers malformed JSON and stops when cancelled', async () => {
  const embedding = await embeddingFixture()
  Reflect.deleteProperty(embedding.config, 'maxRetries')
  const root = await directory()
  const ctx = await boot(root, true, embedding.config)
  const status = await ctx.genesisStatus.inspect(new AbortController().signal)
  expect(status.models?.maxRetries).toBe(3)
  const config = { ...embedding.config, maxRetries: 3 }
  const writer = new ScriptedModel(['invalid JSON', '{}'])
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const agent = await ctx.agentLoop.create(SessionId('auxiliary-json-retries'), { provider: 'memory-writer', model: 'writer' })
  await expect(auxiliaryCall(ctx, agent.session, 'writer', 'Return JSON.', {}, new AbortController().signal,
    memoryModels(config), config)).resolves.toEqual({})
  expect(writer.requests).toHaveLength(2)
  const controller = new AbortController()
  class CancellingWriter extends ScriptedModel {
    attempts = 0
    override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      this.attempts++
      controller.abort(new Error('Operator stopped the request.'))
      throw new LlmError('Model request failed.', 'TRANSPORT')
    }
  }
  const cancelled = new CancellingWriter([])
  ctx.llm.registerAdapter(['cancelled-writer'], cancelled)
  await expect(auxiliaryCall(ctx, agent.session, 'writer', 'Return JSON.', {}, controller.signal,
    { ...memoryModels(config), writer: { kind: 'provider', provider: 'cancelled-writer', model: 'writer' } }, config))
    .rejects.toThrow('Operator stopped')
  expect(cancelled.attempts).toBe(1)
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ ...memoryModels(config), maxRetries: 0 }, 0, signal)
  await expect(ctx.genesisStatus.saveModels({ ...memoryModels(config), maxRetries: -1 }, 1, signal)).rejects.toThrow()
  const saved = (await ctx.genesisStatus.inspect(signal)).models!
  const noRetry = new ScriptedModel(['invalid JSON', '{}'])
  ctx.llm.registerAdapter(['saved-writer'], noRetry)
  await expect(auxiliaryCall(ctx, agent.session, 'writer', 'Return JSON.', {}, signal,
    { ...saved, writer: { kind: 'provider', provider: 'saved-writer', model: 'writer' } }, config)).rejects.toThrow()
  expect(noRetry.requests).toHaveLength(1)
  await ctx.fiber.dispose()
  const restored = await boot(root, true, config)
  expect((await restored.genesisStatus.inspect(signal)).models?.maxRetries).toBe(0)
})

it('retries transient dedicated endpoint failures and stops on authentication errors', async () => {
  const root = await directory()
  const embedding = await embeddingFixture()
  const config = { ...embedding.config, maxRetries: 3 }
  const ctx = await boot(root, true, config)
  let requests = 0
  let denied = false
  const server = createServer((_request, response) => {
    requests++
    response.writeHead(denied ? 401 : requests <= 2 ? 503 : 200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }))
  })
  disposers.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
    server.closeAllConnections()
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing retry endpoint listener')
  const models = { ...memoryModels(config), writer: { kind: 'openai' as const,
    url: `http://127.0.0.1:${address.port}/chat/completions`, model: 'writer' } }
  const agent = await ctx.agentLoop.create(SessionId('auxiliary-http-retries'), { provider: 'memory-writer', model: 'writer' })
  const before = await ctx.genesis.snapshot()
  const signal = new AbortController().signal
  await expect(auxiliaryCall(ctx, agent.session, 'writer', 'Return JSON.', {}, signal, models, config)).resolves.toEqual({})
  expect(requests).toBe(3)
  expect(agent.session.ownEvents().map(genesisAuditRecord).filter(record => record?.data.phase === 'request')).toHaveLength(3)
  denied = true
  await expect(auxiliaryCall(ctx, agent.session, 'writer', 'Return JSON.', {}, signal, models, config)).rejects.toThrow('HTTP 401')
  expect(requests).toBe(4)
  expect(await ctx.genesis.snapshot()).toEqual(before)
})

it('cancels a pending retry delay before another request starts', async () => {
  const controller = new AbortController()
  const waiting = Promise.withResolvers<void>()
  let attempts = 0
  const result = retryRequest(async () => {
    attempts++
    throw new LlmError('Service unavailable.', 'SERVER')
  }, 3, 60000, controller.signal, () => { waiting.resolve() })
  const cancelled = expect(result).rejects.toMatchObject({ name: 'AbortError' })
  await waiting.promise
  controller.abort()
  await cancelled
  expect(attempts).toBe(1)
})

it.each(['auto', 'provider-default', 'low', 'unsupported'])('validates the %s auxiliary reasoning policy before dispatch', async (policy) => {
  const embedding = await embeddingFixture()
  const ctx = await boot(await directory(), true, embedding.config)
  const writer = new ThinkingWriter()
  const response = new ScriptedModel(['{}'])
  writer.stream = options => response.stream(options)
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const agent = await ctx.agentLoop.create(SessionId(`auxiliary-policy-${policy}`), { provider: 'memory-writer', model: 'writer' })
  const result = auxiliaryCall(ctx, agent.session, 'emotion-writer', 'Return JSON.', {}, new AbortController().signal,
    memoryModels(embedding.config), { ...embedding.config, reasoningEffort: policy })
  if (policy === 'unsupported') {
    await expect(result).rejects.toThrow('does not support reasoning effort')
    expect(response.requests).toHaveLength(0)
  } else {
    await expect(result).resolves.toEqual({})
    expect(response.requests[0]?.reasoningEffort).toBe(policy === 'auto' ? 'off' : policy === 'provider-default' ? 'high' : 'low')
  }
})

it('forms conditional habits only after independent completed user turns and audits a quiet maintenance pass', async () => {
  const root = await directory()
  const embedding = await embeddingFixture()
  const ctx = await boot(root, true, embedding.config)
  const writer = new HabitWriter()
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['Hello.', 'Welcome.', 'Hi again.']))
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel([JSON.stringify({ update: true }), JSON.stringify({ update: true }), JSON.stringify({ update: true })]))
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const agent = await ctx.agentLoop.create(SessionId('habit-conversation'), { provider: 'fixture', model: 'chat' })
  const turn = async () => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Please keep our greetings brief and gentle.' }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  const signal = new AbortController().signal
  await turn()
  await expect(ctx.genesisMemory.consolidate(signal)).rejects.toThrow('at least 3 independent completed user turns')
  let state = await ctx.genesis.snapshot()
  expect(state.memories.some(memory => memory.habit !== undefined)).toBe(false)
  expect(state.consolidation?.failure).toMatchObject({ stage: 'writer' })
  await turn(); await turn()
  const before = agent.session.ownEvents()
  expect(await ctx.genesisMemory.consolidate(signal)).toBe(true)
  state = await ctx.genesis.snapshot()
  const habit = state.memories.find(memory => memory.habit !== undefined)!
  expect(habit.habit).toMatchObject({ cue: 'Greeting this user', active: true })
  expect(habit.habit?.supportEventIds).toHaveLength(3)
  const after = agent.session.ownEvents()
  expect(after.filter(event => event.type === 'user/message' || event.type === 'assistant/message')).toEqual(
    before.filter(event => event.type === 'user/message' || event.type === 'assistant/message'))
  expect(after.map(genesisAuditRecord).filter(record => record?.type === 'plugin:genesis/memory-call' && record.data.phase === 'request')).toHaveLength(8)
  expect(state.events.filter(event => event.type === 'memory.consolidated')).toHaveLength(1)
  await ctx.genesisMemory.convert(habit.id, 'declarative', habit.updatedAt, signal)
  expect((await ctx.genesis.getMemory(habit.id))?.history).toEqual(habit.history)
  expect((await ctx.genesis.snapshot()).events).toEqual(state.events)
  const { feedbackTurns } = await import('../src/consolidation-plan.ts')
  expect(feedbackTurns(await ctx.genesis.snapshot(), habit.habit!.supportEventIds).size).toBe(0)
})

class OrganizationWriter extends ScriptedModel {
  constructor() { super([]) }
  beforeReply?: () => Promise<void>
  foreignEvidence = false
  reviewedContents: string[] | undefined
  reviewIds: string[] | undefined
  content = 'The operator prefers oolong and brief gentle greetings, according to the selected records.'
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const block = options.messages[0]?.content.find(block => block.type === 'text')
    if (block?.type !== 'text') throw new Error('Missing organization evidence')
    const semantic = z.object({ purpose: z.string() }).parse(JSON.parse(block.text))
    if (semantic.purpose === 'organization-time') {
      const input = z.object({ drafts: z.array(z.object({ id: z.string(), content: z.string() })) }).parse(JSON.parse(block.text))
      yield * new ScriptedModel([JSON.stringify({ memories: input.drafts.map((draft, index) => ({
        id: this.reviewIds?.[index] ?? draft.id, content: this.reviewedContents?.[index] ?? draft.content,
      })) })]).stream(options)
      return
    }
    const input = z.object({ purpose: z.literal('organization'), targetCount: z.number().nullable(),
      memories: z.array(z.object({ id: z.string() })) }).parse(JSON.parse(block.text))
    await this.beforeReply?.()
    const memories = input.targetCount === 2 ? input.memories.map(memory => ({ evidenceIds: [memory.id],
      category: 'semantic', content: `An attributed interpretation of ${memory.id}.`, importance: 0.6, confidence: 0.6 })) : [{
      evidenceIds: this.foreignEvidence ? [randomUUID()] : input.memories.map(memory => memory.id), category: 'semantic',
      content: this.content, importance: 0.6, confidence: 0.6,
    }]
    yield * new ScriptedModel([JSON.stringify({ memories })]).stream(options)
  }
}

async function organizationFixture(persisted = false) {
  const root = await directory()
  const embedding = await embeddingFixture()
  const ctx = await boot(root, true, embedding.config, false, false, false, persisted)
  const writer = new OrganizationWriter()
  ctx.llm.registerAdapter(['memory-writer'], writer)
  const signal = new AbortController().signal
  const memories = []
  for (const content of ['{{time:2026-10-23}} The operator says they prefer oolong.', 'The operator requests brief gentle greetings.']) {
    memories.push(await ctx.genesisMemory.save(brandString<MemoryId>(randomUUID()), {
      content, category: 'semantic', kind: 'declarative', confidence: 0.8, importance: 0.6,
    }, null, signal))
  }
  const request: MemoryOrganizationRequest = { id: brandString<MemoryOrganizationId>(randomUUID()),
    sources: memories.map(({ id, updatedAt }) => ({ id, updatedAt })), targetCount: 1 }
  return { root, embedding, ctx, writer, signal, memories, request }
}

it('organizes only the selected versions into one or several sourced memories, with durable audit and idempotent restart recovery', async () => {
  const { root, embedding, ctx, writer, signal, memories, request } = await organizationFixture(true)
  const identity = (await ctx.genesis.snapshot()).identity
  const result = await ctx.genesisMemory.organize(request, signal)
  expect(result).toHaveLength(1)
  expect(result[0]).toMatchObject({ attribution: 'model-inference', kind: 'declarative' })
  expect(result[0]!.content).toContain('{{time:2026-10-23}}')
  let state = await ctx.genesis.snapshot()
  expect(state.memories.some(memory => memories.some(source => source.id === memory.id))).toBe(false)
  expect(state.memories).toHaveLength(2)
  const event = state.events.find(event => event.type === 'memory.organized')!
  expect(result[0]!.sourceEventIds).toContain(event.id)
  const auditId = event.relatedSessionId
  expect(auditId).toBeTruthy()
  expect(ctx.agents.list()).toHaveLength(0)
  expect(writer.requests).toHaveLength(2)
  expect(writer.requests[0]?.system).toContain('所有新记忆的正文必须使用中文')
  const writerInput = writer.requests[0]!.messages[0]!.content.find(block => block.type === 'text')!
  if (writerInput.type !== 'text') throw new Error('Missing organizer input')
  const provided = z.object({ memories: z.array(z.object({ id: z.string() })) }).parse(JSON.parse(writerInput.text))
  expect(provided.memories.map((memory: { id: string }) => memory.id)).toEqual(['m1', 'm2'])
  expect(writerInput.text).not.toContain('sourceEventIds')
  const files = await import('node:fs/promises')
  const logs = await files.readdir(join(root, 'sessions'), { recursive: true })
  const audit = logs.find(file => file.endsWith('.jsonl'))!
  const text = await readFile(join(root, 'sessions', audit), 'utf8')
  expect(text).toContain('plugin:genesis/memory-call')
  expect(text).toContain('organization')
  expect(text).not.toContain('assistant/message')
  await ctx.fiber.dispose()
  const restored = await boot(root, true, embedding.config, false, false, false, true)
  const nextWriter = new OrganizationWriter()
  restored.llm.registerAdapter(['memory-writer'], nextWriter)
  expect(await restored.genesisMemory.organize(request, signal)).toEqual(result)
  expect(nextWriter.requests).toHaveLength(0)
  const current = await restored.genesis.snapshot()
  const multiple = await restored.genesisMemory.organize({ ...request, id: brandString<MemoryOrganizationId>(randomUUID()),
    sources: current.memories.map(({ id, updatedAt }) => ({ id, updatedAt })), targetCount: 2 }, signal)
  expect(multiple).toHaveLength(2)
  state = await restored.genesis.snapshot()
  expect(state.identity).toEqual(identity)
  expect(state.memories).toHaveLength(2)
})

it('reviews complete time meaning with the model while preserving words containing date-like substrings', async () => {
  const { ctx, writer, request, signal } = await organizationFixture()
  const dated = []
  for (const [index, timestamp] of ['2026-10-23T02:00:00Z', '2026-10-24T03:00:00Z'].entries()) {
    const source = await ctx.genesis.observe({ sessionId: SessionId('dated-organization'), eventId: String(index), timestamp, kind: 'user-message' })
    dated.push(await ctx.genesis.remember({ content: `Tea feedback ${index}.`, category: 'semantic', importance: 0.6,
      confidence: 0.8, sourceEventIds: [source.id] }))
  }
  request.sources = dated.map(({ id, updatedAt }) => ({ id, updatedAt }))
  writer.content = '小芽说明年龄，说明年纪；今年谈过茶，明年希望再交流。'
  writer.reviewedContents = ['小芽说明年龄，说明年纪；{{time:2026}}谈过茶，{{time:2027}}希望再交流。']
  const result = await ctx.genesisMemory.organize(request, signal)
  expect(result[0]!.content).toContain('小芽说明年龄，说明年纪；{{time:2026}}谈过茶，{{time:2027}}希望再交流。')
  expect(writer.requests).toHaveLength(2)
  expect(JSON.stringify(writer.requests[1])).toContain('小芽说明年龄，说明年纪；今年谈过茶，明年希望再交流。')
  const committed = await ctx.genesis.snapshot()
  expect(request.sources.every(source => !committed.memories.some(memory => memory.id === source.id))).toBe(true)
  expect(committed.memories.find(memory => memory.id === result[0]!.id)?.embedding).toBeDefined()
})

it.each(['invalid-marker', 'missing-draft'])('retains selected memories when semantic time review returns %s', async (failure) => {
  const { ctx, writer, request, signal } = await organizationFixture()
  if (failure === 'invalid-marker') writer.reviewedContents = ['{{date:--02-30}}发生过交流。']
  else writer.reviewIds = ['unprovided-draft']
  const before = await ctx.genesis.snapshot()
  await expect(ctx.genesisMemory.organize(request, signal)).rejects.toThrow(failure === 'invalid-marker' ? 'invalid time anchor' : 'omitted or duplicated')
  expect((await ctx.genesis.snapshot()).memories).toEqual(before.memories)
  expect((await ctx.genesis.snapshot()).events.some(event => event.type === 'memory.organized')).toBe(false)
})

it('retains an exact annual birthday through organization and restart while ordinary experiences remain relative on recall', async () => {
  const { ctx, root, embedding, writer, request, signal, memories } = await organizationFixture(true)
  const birthday = await ctx.genesisMemory.save(memories[0]!.id, { content: '小芽的生日为{{date:--10-24}}，{{time:2026-10-23}}聊过茶。',
    category: 'self', kind: 'declarative', importance: 0.8, confidence: 0.8 }, memories[0]!.updatedAt, signal)
  request.sources[0] = { id: birthday.id, updatedAt: birthday.updatedAt }
  writer.content = '小芽的生日为{{date:--10-24}}，{{time:2026-10-23}}聊过茶。'
  const [result] = await ctx.genesisMemory.organize(request, signal)
  await ctx.fiber.dispose()
  const restored = await boot(root, true, embedding.config, false, false, false, true)
  const saved = (await restored.genesis.getMemory(result!.id))!
  expect(saved.content).toBe(writer.content)
  const { readMemory } = await import('../src/memory-time.ts')
  expect(JSON.stringify(readMemory(saved, new Date('2026-10-24T04:00:00Z'), 'Asia/Manila')))
    .toContain('小芽的生日为10月24日，昨天聊过茶。')
})

it('refuses foreign evidence and concurrent source edits without publishing partial organization results', async () => {
  const { ctx, writer, signal, memories, request } = await organizationFixture()
  writer.foreignEvidence = true
  await expect(ctx.genesisMemory.organize(request, signal)).rejects.toThrow('outside the selected evidence')
  expect((await ctx.genesis.snapshot()).memories).toHaveLength(3)
  writer.foreignEvidence = false
  const entered = Promise.withResolvers<undefined>()
  const released = Promise.withResolvers<undefined>()
  writer.beforeReply = () => { entered.resolve(undefined); return released.promise }
  const operation = ctx.genesisMemory.organize(request, signal)
  const rejected = expect(operation).rejects.toThrow('changed or was deleted')
  try {
    await entered.promise
    await ctx.genesisMemory.save(memories[0]!.id, { content: 'The operator now prefers green tea.', category: 'semantic',
      kind: 'declarative', confidence: 0.8, importance: 0.6 }, memories[0]!.updatedAt, signal)
  } finally { released.resolve(undefined) }
  await rejected
  const state = await ctx.genesis.snapshot()
  expect(state.memories).toHaveLength(3)
  expect(state.events.some(event => event.type === 'memory.organized')).toBe(false)
  await expect(ctx.genesisMemory.organize(request, signal)).rejects.toThrow('changed or was deleted')
  expect(writer.requests).toHaveLength(4)
})

it('saves named operator identity with bounded wording-only legacy relabeling, preserving facts and restart continuity', async () => {
  const { root, embedding, ctx, signal, memories, writer: registered } = await organizationFixture(true)
  await ctx.genesis.awaken('小芽')
  const old = await ctx.genesisMemory.save(memories[0]!.id, { content: '用户喜欢乌龙茶，助手知道这个偏好。', category: 'semantic',
    kind: 'declarative', confidence: 0.8, importance: 0.6 }, memories[0]!.updatedAt, signal)
  const writer = new ScriptedModel([JSON.stringify({ memories: [{ id: old.id, replacements: [
    { field: 'content', before: '用户', occurrence: 0, participant: 'operator' },
    { field: 'content', before: '助手', occurrence: 0, participant: 'character' },
  ] }] })])
  registered.stream = options => writer.stream(options)
  const profile = { name: 'CrystalNeko', identity: '小芽的创造者' }
  expect(await ctx.genesisMemory.saveOperator(profile, 0, signal)).toBe(1)
  const state = await ctx.genesis.snapshot()
  const renamed = state.memories.find(memory => memory.id === old.id)!
  expect(renamed).toMatchObject({ content: 'CrystalNeko喜欢乌龙茶，小芽知道这个偏好。', confidence: old.confidence, attribution: old.attribution })
  expect(renamed.history?.at(-1)?.content).toBe(old.content)
  expect(renamed.sourceEventIds).toEqual(expect.arrayContaining(old.sourceEventIds))
  expect(JSON.stringify(writer.requests)).toContain('小芽的创造者')
  expect(state.operator).toEqual({ ...profile, revision: 1 })
  await expect(ctx.genesisMemory.saveOperator(profile, 0, signal)).rejects.toThrow('changed')
  await ctx.fiber.dispose()
  const restored = await boot(root, true, embedding.config, false, false, false, true)
  expect((await restored.genesisStatus.inspect(signal)).operator).toEqual({ ...profile, revision: 1 })
  expect((await restored.genesis.getMemory(old.id))?.content).toBe(renamed.content)
})

it('keeps explicit identity and memory unchanged when a legacy relabel attempts to rewrite facts', async () => {
  const { ctx, signal, memories, writer: registered } = await organizationFixture()
  await ctx.genesis.awaken('小芽')
  const old = await ctx.genesisMemory.save(memories[0]!.id, { content: '用户喜欢乌龙茶。', category: 'semantic',
    kind: 'declarative', confidence: 0.8, importance: 0.6 }, memories[0]!.updatedAt, signal)
  const rejectedWriter = new ScriptedModel([JSON.stringify({ memories: [{ id: old.id,
    replacements: [{ field: 'content', before: '喜欢乌龙茶', occurrence: 0, participant: 'operator' }] }] })])
  registered.stream = options => rejectedWriter.stream(options)
  await expect(ctx.genesisMemory.saveOperator({ name: 'CrystalNeko', identity: '创造者' }, 0, signal)).rejects.toThrow('only generic')
  expect((await ctx.genesis.snapshot()).operator).toBeUndefined()
  expect(await ctx.genesis.getMemory(old.id)).toEqual(old)
})

it('reveals the persistent personal directory only after read/write learning and accesses it from unrelated workspace Sessions', async () => {
  const root = await mkdtemp(join(outsideTempWorkspaceParent(), 'genesis-personal-'))
  disposers.push(() => rm(root, { recursive: true, force: true }))
  const embedding = await embeddingFixture()
  const first = await boot(root, true, embedding.config, true, false, false, true, false, true)
  await first.genesis.awaken('小芽')
  const home = join(root, 'personal')
  const file = join(home, 'note.txt')
  const a = join(root, 'workspace-a'), b = join(root, 'workspace-b')
  await mkdir(a); await mkdir(b)
  const chat = new ScriptedModel([{ name: 'learn', args: { name: 'read' } }, 'Read learned.',
    { name: 'learn', args: { name: 'write' } }, { name: 'write', args: { file_path: file, content: 'A persistent personal note.' } }, 'Stored.'])
  first.llm.registerAdapter(['fixture'], chat)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}']))
  const { agent } = await first.agents.create({ sessionId: SessionId('personal-a'), meta: { cwd: a }, agentOptions: { provider: 'fixture', model: 'chat' } })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '学习 read。' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(JSON.stringify(chat.requests)).not.toContain(home)
  expect(first.sandboxPolicy.resolve({ session: agent.session }).additionalWritableRoots).toBeUndefined()
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '学习 write，并保存一条自己的笔记。' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(await readFile(file, 'utf8')).toBe('A persistent personal note.')
  expect(JSON.stringify(chat.requests.at(-1))).toContain(home)
  expect(JSON.stringify(agent.session.ownEvents())).toContain(home)
  const identity = (await first.genesis.snapshot()).identity
  await first.fiber.dispose()
  const second = await boot(root, true, embedding.config, false, false, false, true, false, true)
  const reader = new ScriptedModel([{ name: 'read', args: { file_path: file } }, 'I found my personal note.'])
  second.llm.registerAdapter(['fixture'], reader)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const { agent: other } = await second.agents.create({ sessionId: SessionId('personal-b'), meta: { cwd: b }, agentOptions: { provider: 'fixture', model: 'chat' } })
  other.followup(createUserMessage({ content: [{ type: 'text', text: '读取你之前的笔记。' }], source: { kind: 'user' } }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests)).toContain('A persistent personal note.')
  expect(JSON.stringify(reader.requests[0])).toContain(home)
  expect(JSON.stringify(reader.requests[0])).not.toContain('gentle curiosity, innocence')
  expect((await second.genesis.snapshot()).identity).toEqual(identity)
})

it('runs automatic consolidation after idle, persists bounded failures, and restores pending work across restart', async () => {
  const root = await directory()
  const embedding = await embeddingFixture()
  embedding.config.consolidation = { ...embedding.config.consolidation, idleMs: 100, cooldownMs: 100, retryMs: 100, maxFailures: 1 }
  const first = await boot(root, true, embedding.config, false, false, false, true)
  first.llm.registerAdapter(['fixture'], new ScriptedModel(['Hello.']))
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel([JSON.stringify({ update: true })]))
  first.llm.registerAdapter(['memory-writer'], new HabitWriter())
  const agent = await first.agentLoop.create(SessionId('idle-restart'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'A gentle greeting, please.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect((await first.genesis.snapshot()).consolidation?.revision).toBeGreaterThan(0)
  await first.fiber.dispose()
  const second = await boot(root, true, embedding.config, false, false, false, true)
  const failedWriter = new ScriptedModel(['invalid-json'])
  second.llm.registerAdapter(['memory-writer'], failedWriter)
  await second.genesisMemory.setConsolidation(true, new AbortController().signal)
  await expect.poll(async () => (await second.genesis.snapshot()).consolidation?.failures).toBe(1)
  expect(failedWriter.requests).toHaveLength(1)
  await expect.poll(() => second.agents.get(SessionId('idle-restart')) === undefined).toBe(true)
  await second.fiber.dispose()
  const third = await boot(root, true, embedding.config, false, false, false, true)
  expect((await third.genesis.snapshot()).consolidation).toMatchObject({ failures: 1,
    failure: { stage: 'writer' } })
  expect((await third.genesis.snapshot()).consolidation?.failure?.message).toContain('invalid JSON')
  const writer = new ScriptedModel([JSON.stringify({ changes: [] })])
  third.llm.registerAdapter(['memory-writer'], writer)
  expect(await third.genesisMemory.consolidate(new AbortController().signal)).toBe(true)
  expect(writer.requests).toHaveLength(1)
  const state = await third.genesis.snapshot()
  expect(state.consolidation?.failures).toBe(0)
  expect(state.consolidation?.failure).toBeUndefined()
  expect(state.consolidation?.completed).toBe(state.consolidation?.revision)
  expect(state.events.filter(event => event.type === 'memory.consolidated')).toHaveLength(1)
})

it('defers interrupted consolidation without spending retries and drains its writer before plugin disposal', async () => {
  const embedding = await embeddingFixture()
  const ctx = await boot(await directory(), true, embedding.config)
  const entered = Promise.withResolvers<AbortSignal>()
  const aborted = Promise.withResolvers<undefined>()
  const released = Promise.withResolvers<undefined>()
  class InterruptibleWriter extends HabitWriter {
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      if (options.system?.includes('仅依据所引用的证据整理提供的候选记忆')) {
        entered.resolve(options.signal!)
        options.signal?.addEventListener('abort', () => { aborted.resolve(undefined) }, { once: true })
        await released.promise
        yield * new ScriptedModel([JSON.stringify({ changes: [] })]).stream(options)
      } else yield * super.stream(options)
    }
  }
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['Hello.']))
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel([JSON.stringify({ update: true })]))
  ctx.llm.registerAdapter(['memory-writer'], new InterruptibleWriter())
  const agent = await ctx.agentLoop.create(SessionId('interrupt-maintenance'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Greet briefly.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const pending = ctx.genesisMemory.consolidate(new AbortController().signal)
  const outcome = pending.then(() => 'saved', () => 'cancelled')
  try {
    const signal = await entered.promise
    await ctx.genesisMemory.setConsolidation(false, new AbortController().signal)
    await aborted.promise
    expect(signal.aborted).toBe(true)
    const state = await ctx.genesis.snapshot()
    expect(state.consolidation?.failures).toBe(0)
    expect(state.consolidation?.completed).toBe(0)
    const disposing = ctx.fiber.dispose()
    released.resolve(undefined)
    await disposing
    expect(await outcome).toBe('cancelled')
  } finally { released.resolve(undefined); await outcome }
})

const supportAppraisal = { kind: 'support' as const, importance: 0.9, novelty: 0.8, expectationMatch: 0.5,
  controllability: 0.5, relationshipMeaning: 'care' as const, responsibility: 'other' as const, confidence: 0.7,
  summary: 'The operator offered support.' }

class EmotionWriter extends ScriptedModel {
  constructor(private readonly invalid = false) { super([]) }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const block = options.messages[0]?.content.find(block => block.type === 'text')
    if (block?.type !== 'text') throw new Error('Missing emotion evidence')
    const input = z.object({ conversation: z.array(z.object({ messages: z.array(z.object({ seq: z.number(), role: z.string() })) })) })
      .parse(JSON.parse(block.text))
    const user = input.conversation.at(-1)!.messages.find(message => message.role === 'user')!
    yield * new ScriptedModel([JSON.stringify({ delta: { happiness: 0.2, tenderness: 0.1 }, needsDelta: { exploration: 0.04, socialSatisfaction: 0.05 }, targets: { tenderness: 'operator' }, moodDelta: { valence: 0.02 }, appraisal: supportAppraisal, relationshipDelta: { attachment: 0.005 },
      reason: 'Supportive exchange interpreted as encouraging.', sourceSeqs: [this.invalid ? user.seq + 10000 : user.seq] })]).stream(options)
  }
}

it('persists sourced emotion across dialogue windows, replay and Loader restarts, with logged life-mode context', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const first = await boot(root, true, config, true, false, false, true, true)
  await first.genesis.awaken('小芽')
  const decisions = new ScriptedModel(['{"update":false}', '{"update":true}', '{"update":false}', '{"update":false}'])
  const writer = new EmotionWriter()
  first.llm.registerAdapter(['memory-decision'], decisions)
  first.llm.registerAdapter(['memory-writer'], writer)
  const chat = new ScriptedModel(['Thank you for your support.', 'Let us keep learning.'])
  first.llm.registerAdapter(['fixture'], chat)
  const agent = await first.agentLoop.create(SessionId('emotion-first'), { provider: 'fixture', model: 'chat' })
  const say = async (text: string) => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  await say('You did well. Private emotion source marker.')
  const changed = await first.genesis.snapshot()
  expect(changed.emotion?.current.happiness).toBeCloseTo(0.2, 3)
  expect(changed.emotion?.mood.valence).toBeCloseTo(0.22, 3)
  expect(changed.emotion?.needs.exploration).toBeCloseTo(0.54, 6)
  expect(changed.emotion?.needs.socialSatisfaction).toBeCloseTo(0.55, 6)
  const relationship = changed.emotion?.version === 3 ? changed.emotion.relationship : null
  expect(relationship?.values.attachment).toBe(0.005)
  expect(chat.requests[0]!.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('happiness negligible')
  await say('We can continue tomorrow.')
  expect(chat.requests[1]!.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('happiness mild')
  expect(JSON.stringify(chat.requests[1])).toContain('simulated character state')
  expect(JSON.stringify(decisions.requests[3])).toContain('Private emotion source marker.')
  expect(writer.requests).toHaveLength(1)
  const logs = agent.session.ownEvents()
  expect(JSON.stringify(logs.filter(event => event.type === 'user/message'))).toContain('Current simulated emotion')
  const record = logs.map(genesisAuditRecord).find(record => record?.type === 'plugin:genesis/memory-call' && record.data.phase === 'request'
    && record.data.role === 'emotion-writer')
  expect(record).toBeDefined()
  expect(JSON.stringify(record)).toContain('selfMemories')
  expect(JSON.stringify(record)).toContain('relatedMemories')
  expect(JSON.stringify(record)).toContain('needsDelta')
  const beforeReplay = await first.genesis.snapshot()
  const resolved = Genesis.Config({ leasePath: join(root, 'writer.lock'), memory: config, emotion: {} })
  const engine = new LifeEmotionEngine(first, first.genesis, resolved.emotion!, config, () => memoryModels(config), resolved)
  await engine.review(agent, 2, new AbortController().signal)
  await engine.close()
  expect(writer.requests).toHaveLength(1)
  expect((await first.genesis.snapshot()).emotion).toEqual(beforeReplay.emotion)
  const event = beforeReplay.events.find(event => event.type === 'emotion.reviewed' && event.payload['changed'] === true)!
  expect(event.payload['sourceEventIds']).toHaveLength(1)
  expect(beforeReplay.events.some(source => source.id === (event.payload['sourceEventIds'] as string[])[0] && source.source === 'user')).toBe(true)
  expect((await readBackup(join(root, 'writer.lock.backup.json'))).emotion).toEqual(beforeReplay.emotion)
  await first.fiber.dispose()

  const second = await boot(root, true, config, true, false, false, true, true)
  expect((await second.genesis.snapshot()).identity).toEqual(beforeReplay.identity)
  expect((await second.genesisStatus.inspect(new AbortController().signal)).emotion?.relationship?.id).toBe(relationship!.id)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}', '{"update":false}', '{"update":false}']))
  const reader = new ScriptedModel(['Welcome back.', 'A new conversation.'])
  second.llm.registerAdapter(['fixture'], reader)
  const resumed = (await second.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'fixture', model: 'chat' } })).agent
  resumed.followup(createUserMessage({ content: [{ type: 'text', text: 'Hello again.' }], source: { kind: 'user' } }))
  await resumed.whenIdle()
  const projected = second.genesisSessionEvidence.emotionOf(resumed.session)!
  expect(projected.turns.flatMap(turn => turn.messages).some(message => message.text.includes('Private emotion source marker.'))).toBe(true)
  const other = await second.agentLoop.create(SessionId('emotion-unrelated'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ content: [{ type: 'text', text: 'Hello in another conversation.' }], source: { kind: 'user' } }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests.at(-1))).not.toContain(relationship!.id)
  expect(JSON.stringify(reader.requests.at(-1))).toContain('Relationship estimates toward')
  expect(reader.requests.at(-1)!.messages.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('happiness mild')
  expect(JSON.stringify(reader.requests.at(-1))).not.toContain('Private emotion source marker.')
  expect((await second.genesisStatus.inspect(new AbortController().signal)).emotion?.review?.state).toBe('skipped')
  expect((await second.genesis.snapshot()).events.filter(event => event.type === 'emotion.initialized')).toHaveLength(1)
  expect(embeddings.requests).toHaveLength(0)
})

it('rejects unsupported emotion citations and stale or excessive changes while preserving the chat and trusted state', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const ctx = await boot(root, true, config, false, false, false, false, true)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":true}']))
  ctx.llm.registerAdapter(['memory-writer'], new EmotionWriter(true))
  const chat = new ScriptedModel(['The reply is complete.'])
  ctx.llm.registerAdapter(['fixture'], chat)
  const before = (await ctx.genesis.snapshot()).emotion!
  const agent = await ctx.agentLoop.create(SessionId('emotion-invalid'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Thank you.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(chat.requests).toHaveLength(1)
  expect((await ctx.genesis.snapshot()).emotion).toEqual(before)
  expect((await ctx.genesis.snapshot()).events.filter(event => event.type === 'emotion.reviewed')).toHaveLength(0)
  const outcome = (await ctx.genesisStatus.inspect(new AbortController().signal)).emotion?.review
  expect(outcome).toMatchObject({ state: 'failed', failure: { stage: 'storage' } })
  const evidence = ctx.genesisSessionEvidence.emotionOf(agent.session)!.turns
  const seq = evidence.at(-1)!.messages.find(message => message.role === 'user')!.seq
  const plan = emotionUpdateSchema.parse({ delta: { happiness: 0.1 }, needsDelta: {}, moodDelta: {}, appraisal: supportAppraisal, reason: 'Encouragement.', sourceSeqs: [seq] })
  await expect(ctx.genesis.reviewEmotion(agent.id, evidence, before.revision + 1, plan)).rejects.toThrow('changed during appraisal')
  await expect(ctx.genesis.reviewEmotion(agent.id, evidence, before.revision, { ...plan, delta: { sadness: -0.9 } })).rejects.toThrow('per-exchange limit')
  expect((await ctx.genesis.snapshot()).emotion).toEqual(before)
})

it('uses an independent Jev emotion question and logged HTTP writer, and contains a malformed decision without resetting emotion', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  let malformed = false
  let emotionProbability = 0.9
  const questions: string[] = []
  const server = createServer((request, response) => {
    void (async () => {
      let text = ''
      for await (const chunk of request) text += String(chunk)
      const raw: unknown = JSON.parse(text)
      if (request.url === '/systemone') {
        const body = z.object({ questions: z.record(z.string(), z.object({ type: z.literal('noul'), instructions: z.string(),
          criteria: z.object({ true: z.string(), false: z.string() }).optional() })) }).parse(raw)
        const question = Object.keys(body.questions)[0]!
        if (question === 'emotion') expect(body.questions[question]).toEqual({ type: 'noul', instructions: EMOTION_QUESTION, criteria: EMOTION_CRITERIA })
        questions.push(question)
        response.end(JSON.stringify({ answers: { [malformed && question === 'emotion' ? 'remember' : question]: {
          type: 'noul', noul: question === 'emotion' ? emotionProbability : 0.1 } } }))
      } else {
        const body = z.object({ messages: z.array(z.object({ role: z.string(), content: z.string() })) }).parse(raw)
        const input = z.object({ newSourceSeqs: z.array(z.number()), conversation: z.array(z.object({
          messages: z.array(z.object({ seq: z.number(), role: z.string() })) })) }).parse(JSON.parse(body.messages[1]!.content))
        const user = input.conversation.at(-1)!.messages.find(message => message.role === 'user')!
        response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
          delta: { happiness: 0.2 }, needsDelta: {}, moodDelta: {}, appraisal: supportAppraisal, reason: 'A new shared activity is anticipated.', sourceSeqs: [user.seq],
        }) } }] }))
      }
    })().catch((error: unknown) => { response.writeHead(500); response.end(String(error)) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  disposers.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error))
    server.closeAllConnections()
  }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing emotion fixture listener')
  const base = `http://127.0.0.1:${address.port}`
  const ctx = await boot(root, true, { ...embeddings.config, associationLimit: 0 }, false, false, false, false, true)
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `${base}/systemone`, model: 'decision', threshold: 0.5 },
    writer: { kind: 'openai', url: `${base}/chat/completions`, model: 'writer' } }, 0, new AbortController().signal)
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['I look forward to it.', 'The completed reply remains available.', 'It is Saturday.']))
  const agent = await ctx.agentLoop.create(SessionId('emotion-http'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Let us explore a new place together.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const changed = await ctx.genesis.snapshot()
  expect(changed.emotion?.current.happiness).toBeCloseTo(0.2, 3)
  expect((await ctx.genesisStatus.inspect(new AbortController().signal)).emotion?.review).toMatchObject({ state: 'saved', turn: 1,
    completedAt: expect.any(String), decision: { probability: 0.9, threshold: 0.5 } })
  expect(questions).toEqual(['remember', 'emotion'])
  const audit = agent.session.ownEvents().map(genesisAuditRecord).filter(record => record?.type === 'plugin:genesis/model-http')
  expect(audit).toHaveLength(6)
  expect(JSON.stringify(audit)).toContain('questions')
  expect(JSON.stringify(audit)).toContain('emotion')
  malformed = true
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'We can decide later.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect((await ctx.genesis.snapshot()).emotion).toEqual(changed.emotion)
  expect((await ctx.genesisStatus.inspect(new AbortController().signal)).emotion?.review).toMatchObject({ state: 'failed', failure: { stage: 'decision' } })
  expect(agent.session.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(2)
  malformed = false; emotionProbability = 0.1
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'What day is it?' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  const status = await ctx.genesisStatus.inspect(new AbortController().signal)
  expect(status.emotion?.review).toMatchObject({ state: 'skipped', turn: 3,
    completedAt: expect.any(String), decision: { probability: 0.1, threshold: 0.5 } })
  expect(status.review).toMatchObject({ state: 'skipped', turn: 3, decision: { probability: 0.1, threshold: 0.5 } })
  expect(agent.session.ownEvents().map(genesisAuditRecord).filter(record => record?.type === 'plugin:genesis/model-http'
    && record.data.phase === 'request' && record.data.route?.kind === 'openai')).toHaveLength(1)
  const fiber = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis')!.fiber!
  await fiber.dispose()
  expect(ctx.get('genesisSessionEvidence')).toBeUndefined()
})


it('checkpoints the online-only emotion clock through Loader without creating experiences or changing revisions', async () => {
  const root = await directory()
  const { config } = await embeddingFixture()
  const ctx = await boot(root, true, config, false, false, false, false, { offlineChanges: false, clockCheckpointMs: 1000 })
  const initial = await ctx.genesis.snapshot()
  await expect.poll(async () => (await ctx.genesis.snapshot()).emotion!.updatedAt).not.toBe(initial.emotion!.updatedAt)
  const sampled = await ctx.genesis.snapshot()
  expect(sampled.emotion!.revision).toBe(initial.emotion!.revision)
  expect(sampled.events).toEqual(initial.events)
  expect((await readBackup(join(root, 'writer.lock.backup.json'))).emotion).toEqual(sampled.emotion)
  await ctx.fiber.dispose()
})

it('persists operator emotion sensitivity and adjustments, rejects stale or invalid edits, and pauses only emotion inference', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  onTestFinished(() => { vi.useRealTimers() })
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const first = await boot(root, true, config, false, false, false, false, true, true)
  const signal = new AbortController().signal
  const original = (await first.genesisStatus.inspect(signal)).emotion!
  const settings = { ...original.settings, sensitivity: 0.5, enabled: false, windowTurns: 6,
    offlineChanges: false, moodEmotionScale: 0.3, emotionMoodInfluence: 0.2,
    baseline: { ...original.settings.baseline, valence: 0.2 } }
  expect(await first.genesisStatus.saveEmotionSettings(settings, original.revision, signal)).toBe(1)
  await expect(first.genesisStatus.saveEmotionSettings(settings, original.revision, signal)).rejects.toThrow('Emotion changed')
  await expect(first.genesisStatus.saveEmotionSettings({ ...settings, sensitivity: -0.1 }, 1, signal)).rejects.toThrow()
  await expect(first.genesisStatus.saveEmotionSettings({ ...settings, sensitivity: 2.1 }, 1, signal)).rejects.toThrow()
  await expect(first.genesisStatus.saveEmotionSettings({ ...settings, emotionMoodInfluence: 0.51 }, 1, signal)).rejects.toThrow()
  await expect(first.genesisStatus.saveEmotionSettings({ ...settings, moodEmotionScale: 1.01 }, 1, signal)).rejects.toThrow()
  const invalidBaseline = { ...settings.baseline, fear: 2 }
  await expect(first.genesisStatus.saveEmotionSettings({ ...settings, baseline: invalidBaseline }, 1, signal)).rejects.toThrow()
  await expect(first.genesisStatus.saveEmotionSettings({ ...settings,
    moodHalfLifeMs: { ...settings.moodHalfLifeMs, valence: 1000 } }, 1, signal)).rejects.toThrow()
  const adjustment = { current: { ...original.current, happiness: 0.8 }, mood: { ...original.mood, valence: 0.4 }, needs: original.needs, reason: 'Operator UI verification.' }
  expect(await first.genesisStatus.adjustEmotion(adjustment, 1, signal)).toBe(2)
  await expect(first.genesisStatus.adjustEmotion({ ...adjustment, reason: '' }, 2, signal)).rejects.toThrow()
  const adjusted = await first.genesis.snapshot()
  const view = (await first.genesisStatus.inspect(signal)).emotion!
  expect(view.settings).toEqual(settings)
  expect(view.history[0]).toMatchObject({ kind: 'adjusted', source: 'user', reason: adjustment.reason, current: adjustment.current })
  expect(view.history[1]).toMatchObject({ kind: 'configured', source: 'user' })
  expect(adjusted.events.find(event => event.dedupKey === 'emotion:settings:1')?.payload['after']).toMatchObject({ sensitivity: 0.5 })
  expect((await readBackup(join(root, 'writer.lock.backup.json'))).emotion).toEqual(adjusted.emotion)
  await first.fiber.dispose()
  const second = await boot(root, true, config, false, false, false, false, true, true)
  const restored = (await second.genesisStatus.inspect(signal)).emotion!
  expect(restored.settings).toEqual(settings)
  const values = { affection: 0.6, trust: 0.7, attachment: 0.4, familiarity: 0.5, feltSecurity: 0.7 }
  await expect(second.genesisStatus.adjustRelationship({ label: 'Operator', values, reason: 'Explicit estimate.' }, restored.revision - 1, signal)).rejects.toThrow('changed')
  await expect(second.genesisStatus.adjustRelationship({ label: 'Operator', values: { ...values, trust: 2 }, reason: 'Invalid.' }, restored.revision, signal)).rejects.toThrow()

  expect((await second.genesis.snapshot()).identity).toEqual(adjusted.identity)
  const decisions = new ScriptedModel(['{"update":false}'])
  second.llm.registerAdapter(['memory-decision'], decisions)
  const chat = new ScriptedModel(['Emotion is paused; this reply is retained.'])
  second.llm.registerAdapter(['fixture'], chat)
  const agent = await second.agentLoop.create(SessionId('emotion-paused'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Continue normally.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(decisions.requests).toHaveLength(1)
  const afterPausedTurn = (await second.genesis.snapshot()).emotion!
  expect(afterPausedTurn.revision).toBe(adjusted.emotion!.revision)
  expect(afterPausedTurn.relationship).toEqual(adjusted.emotion!.relationship)
  expect(afterPausedTurn.controls).toEqual(adjusted.emotion!.controls)
  expect(afterPausedTurn.current.happiness).toBeCloseTo(adjusted.emotion!.current.happiness, 5)
  expect(JSON.stringify(chat.requests[0])).toContain('Current simulated emotion')
  await second.genesisStatus.adjustRelationship({ label: 'Operator', values, reason: 'Explicit estimate.' }, restored.revision, signal)
  const manuallyAdjusted = (await second.genesisStatus.inspect(signal)).emotion!
  expect(manuallyAdjusted.relationship?.values).toEqual(values)
  expect(manuallyAdjusted.history[0]).toMatchObject({ kind: 'relationship-adjusted', source: 'user', reason: 'Explicit estimate.' })
  await second.fiber.dispose()
  const third = await boot(root, true, config, false, false, false, false, true, true)
  expect((await third.genesisStatus.inspect(signal)).emotion?.relationship).toEqual(manuallyAdjusted.relationship)
})


it('does not start an emotion writer when the operator pauses appraisal during an in-flight decision', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, { ...embeddings.config, associationLimit: 0 }, false, false, false, false, true)
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  class HeldDecision extends ScriptedModel {
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      if (options.system === EMOTION_DECISION_PROMPT) { entered.resolve(undefined); await release.promise }
      yield * super.stream(options)
    }
  }
  const writer = new EmotionWriter()
  ctx.llm.registerAdapter(['memory-decision'], new HeldDecision(['{"update":false}', '{"update":true}']))
  ctx.llm.registerAdapter(['memory-writer'], writer)
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['The reply is finished.']))
  const agent = await ctx.agentLoop.create(SessionId('emotion-pause-inflight'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Thank you for helping.' }], source: { kind: 'user' } }))
  try {
    await entered.promise
    const sampled = (await ctx.genesisStatus.inspect(new AbortController().signal)).emotion!
    await ctx.genesisStatus.saveEmotionSettings({ ...sampled.settings, enabled: false }, sampled.revision, new AbortController().signal)
  } finally { release.resolve(undefined) }
  await agent.whenIdle()
  expect(writer.requests).toHaveLength(0)
  expect((await ctx.genesis.snapshot()).events.filter(event => event.type === 'emotion.reviewed')).toHaveLength(0)
  expect((await ctx.genesisStatus.inspect(new AbortController().signal)).emotion?.settings.enabled).toBe(false)
})

it('learns writing without an innate listing, logs voluntary records, and restores searches, types and deletion receipts', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const options = { resultChars: 2048, queryLimit: 1, snippetChars: 80 }
  const first = await boot(root, true, embeddings.config, true, false, false, true, false, true, options)
  await first.genesis.awaken('小芽')
  const body = '今天认识了记录文字的方法。我想把这份好奇留下来。'
  const draft = { action: 'write', title: '我的第一篇日记', content: body, typeId: 'diary' }
  const chat = new ScriptedModel(['你好呀。', { name: 'learn', args: { name: 'genesis_record' } },
    { name: 'genesis_record', args: { action: 'types' } }, { name: 'genesis_record', args: draft },
    { name: 'genesis_record', args: { action: 'search', query: '好奇' } }, '我很喜欢这次发现。'])
  first.llm.registerAdapter(['fixture'], chat)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}']))
  const agent = await first.agentLoop.create(SessionId('record-learner'), { provider: 'fixture', model: 'chat' })
  const signal = new AbortController().signal
  const say = async (text: string) => {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await agent.whenIdle()
  }
  const execute = (args: object, callId = ToolCallId('before-learning')) => executeToolFixture(first, { name: 'genesis_record', arguments: args, agent, signal, callId })
  expect((await execute(draft)).isError).toBe(true)
  await say('你好。')
  expect(chat.requests[0]!.tools!.map(tool => tool.name)).toEqual(['genesis_contacts', 'genesis_message', 'genesis_recall', 'genesis_search_contacts', 'learn'])
  expect(JSON.stringify(chat.requests[0])).not.toContain('genesis_record')
  await say('我教你一个工具，它叫 genesis_record。学会以后，你可以自己决定什么时候使用。')
  expect(first.genesis.learningStatus().tools).toContain('genesis_record')
  expect(chat.requests.at(-1)!.tools!.some(tool => tool.name === 'genesis_record')).toBe(true)
  const match = (await first.genesisRecords.search({ text: '好奇' }, signal)).items[0]!
  expect(match).toMatchObject({ title: draft.title, content: body, typeId: 'diary', truncated: false, matchedFields: ['content'] })
  expect(Date.parse(match.createdAt)).not.toBeNaN()
  expect(match.fileName).toMatch(/^diary\/\d{4}\/\d{2}\/\d{8}T\d{9}Z_[a-f0-9]{64}\.md$/)
  expect(await readFile(join(root, 'personal', 'records', match.fileName), 'utf8')).toContain(body)
  expect(JSON.stringify(agent.session.ownEvents().filter(event => event.type === 'tool/result'))).toContain(body)
  expect((await first.genesisRecords.search({ text: '第一篇' }, signal)).items[0]!.matchedFields).toEqual(['title'])
  const read = await first.genesisRecords.read(match.id, 0, signal)
  expect(read.source.sessionId).toBe(agent.id)
  expect((await execute(draft, read.source.callId)).isError).not.toBe(true)
  expect((await first.genesisRecords.catalog(signal))!.count).toBe(1)
  expect((await execute({ ...draft, content: 'different' }, read.source.callId)).isError).toBe(true)
  const type = await first.genesisRecords.saveType(null, '读书笔记', true, 0, signal)
  const longBody = '中文、引号"和换行\n🌱'.repeat(900)
  await first.genesisRecords.edit(match.id, { title: '读书后的想法', content: longBody, typeId: type.id }, read.revision, signal)
  await expect(readFile(join(root, 'personal', 'records', match.fileName), 'utf8')).rejects.toThrow()
  await expect(first.genesisRecords.edit(match.id, { title: 'stale', content: body, typeId: type.id }, read.revision, signal)).rejects.toThrow('changed')
  const edited = await first.genesisRecords.read(match.id, 0, signal)
  expect(edited).toMatchObject({ source: read.source, createdAt: read.createdAt, updatedBy: 'operator', revision: 2 })
  let full = ''; let offset: number | null = 0
  while (offset !== null) {
    const chunk: WritingRead = await first.genesisRecords.read(match.id, offset, signal)
    expect(JSON.stringify(chunk).length).toBeLessThanOrEqual(options.resultChars)
    full += chunk.content; offset = chunk.nextOffset
  }
  expect(full).toBe(longBody)
  const renamed = await first.genesisRecords.saveType(type.id, '阅读札记', false, type.revision, signal)
  expect(renamed.id).toBe(type.id)
  expect((await first.genesisRecords.search({ typeId: type.id, after: read.createdAt, before: read.createdAt }, signal)).total).toBe(1)
  expect((await execute({ ...draft, typeId: type.id }, ToolCallId('disabled-type'))).isError).toBe(true)
  const lifeId = (await first.genesis.snapshot()).identity.id
  await first.fiber.dispose()

  const second = await boot(root, true, embeddings.config, true, false, false, true, false, true, options)
  expect((await second.genesis.snapshot()).identity.id).toBe(lifeId)
  expect(second.genesis.learningStatus().tools).toContain('genesis_record')
  expect((await second.genesisRecords.catalog(signal))!.types).toContainEqual(renamed)
  expect((await second.genesisRecords.search({ text: '读书后的想法' }, signal)).items[0]!.id).toBe(match.id)
  const restored = await second.genesisRecords.read(match.id, 0, signal)
  expect(restored).toEqual(edited)
  await second.genesisRecords.deleteRecord(match.id, restored.revision, signal)
  await expect(second.genesisRecords.read(match.id, 0, signal)).rejects.toThrow('not found')
  await expect(readFile(join(root, 'personal', 'records', restored.fileName), 'utf8')).rejects.toThrow()
  const resumed = (await second.agents.resume({ resumeSessionId: agent.id })).agent
  const replay = await executeToolFixture(second, { name: 'genesis_record', arguments: draft, agent: resumed, signal, callId: read.source.callId })
  expect(replay.isError).not.toBe(true)
  expect(JSON.stringify(replay)).toContain('already-deleted')
  expect((await second.genesisRecords.catalog(signal))!.count).toBe(0)
  const fiber = [...second.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis')!.fiber!
  await fiber.dispose()
  expect(second.tools.get('genesis_record', resumed)).toBeUndefined()
})

it('activates learned toolkits per conversation, enforces execution and restores activation and edits after restart', async () => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const first = await boot(root, true, config, true, false, false, true)
  const signal = new AbortController().signal
  await first.genesis.awaken('小芽')
  let actions = 0
  const fixtureTool = (name: string) => defineTool({ name, description: 'Operate the desktop fixture.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { actions++; return 'desktop action completed' } })
  const computer = fixtureTool('computer')
  const browser = fixtureTool('mcp__playwright-mcp__browser_navigate')
  first.tools.register(computer); first.tools.register(browser)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const model = new ScriptedModel([{ name: 'learn', args: { name: 'computer' } },
    { name: 'genesis_toolkit', args: { action: 'enable', id: 'computer-operation' } },
    { name: 'computer', args: {} }, '操作完成。'])
  first.llm.registerAdapter(['fixture'], model)
  const agent = await first.agentLoop.create(SessionId('toolkit-life'), { provider: 'fixture', model: 'chat' })
  const execute = (name: string, args: object, owner = agent) => executeToolFixture(first, { name, arguments: args,
    agent: owner, signal, callId: ToolCallId(`toolkit-direct-${name}`) })
  expect((await execute('computer', {})).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'computer-operation' })).isError).toBe(true)
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请学习 computer 并启用电脑操作工具包。' }] }))
  await agent.whenIdle()
  expect(actions).toBe(1)
  expect(model.requests[0]?.tools?.map(tool => tool.name)).not.toContain('genesis_toolkit')
  expect(JSON.stringify(model.requests[0])).not.toContain('computer-operation')
  expect(model.requests[1]?.tools?.map(tool => tool.name)).toContain('genesis_toolkit')
  expect(model.requests[1]?.tools?.map(tool => tool.name)).not.toContain('computer')
  expect(JSON.stringify(model.requests[1])).toContain('电脑操作')
  expect(model.requests[2]?.tools?.map(tool => tool.name)).toContain('computer')
  expect(model.requests[2]?.tools?.map(tool => tool.name)).not.toContain(browser.name)
  expect((await execute(browser.name, {})).isError).toBe(true)
  expect((await execute('learn', { name: browser.name })).isError).toBe(false)
  expect((await execute(browser.name, {})).isError).toBe(false)
  const deny = first.tools.guard(exec => exec.name === 'computer' ? 'Operator permission denied' : undefined)
  expect((await execute('computer', {})).isError).toBe(true)
  deny()
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'computer-operation' })).isError).toBe(false)
  expect(agent.session.ownEvents().filter(event => pluginRecordOf(event)?.type === 'plugin:genesis/toolkit')).toHaveLength(1)
  const forkSeed = agent.session.snapshotEvents()
  const fork = (await first.agents.create({ sessionId: SessionId('toolkit-fork'), seed: forkSeed, inheritedEventCount: SessionLogOffset(forkSeed.length),
    meta: { parentSession: agent.id, isSeeded: true }, agentOptions: { provider: 'fixture', model: 'chat' } })).agent
  expect((await execute('computer', {}, fork)).isError).toBe(true)
  const other = await first.agentLoop.create(SessionId('toolkit-other'), { provider: 'fixture', model: 'chat' })
  expect((await execute('computer', {}, other)).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'disable', id: 'computer-operation' })).isError).toBe(false)
  expect((await execute('computer', {})).isError).toBe(true)
  await execute('genesis_toolkit', { action: 'enable', id: 'computer-operation' })
  const catalogue = await first.genesisToolkits.inspect(signal)
  expect(catalogue.learned).toEqual(expect.arrayContaining(['computer', browser.name]))
  const edited = catalogue.entries.map(entry => ({ ...entry, name: '电脑与浏览器', description: '日常界面操作' }))
  expect(await first.genesisToolkits.save(edited, catalogue.revision, signal)).toBe(1)
  await expect(first.genesisToolkits.save([], catalogue.revision, signal)).rejects.toThrow('changed')
  await expect(first.genesisToolkits.save([{ ...edited[0]!, tools: ['learn'] }], 1, signal)).rejects.toThrow('Innate')
  await first.fiber.dispose()
  const second = await boot(root, true, config, true, false, false, true)
  second.tools.register(computer); second.tools.register(browser)
  expect((await second.genesisToolkits.inspect(signal)).entries).toEqual(edited)
  const resumed = (await second.agents.resume({ resumeSessionId: agent.id, agentOptions: { provider: 'fixture', model: 'chat' } })).agent
  const call = (owner: typeof resumed) => executeToolFixture(second, { name: 'computer', arguments: {}, agent: owner,
    signal, callId: ToolCallId('toolkit-resumed') })
  expect((await call(resumed)).isError).toBe(false)
  const newAgent = await second.agentLoop.create(SessionId('toolkit-after-restart'), { provider: 'fixture', model: 'chat' })
  expect((await call(newAgent)).isError).toBe(true)
  const next = new ScriptedModel(['请启用工具包。'])
  second.llm.registerAdapter(['fixture'], next)
  second.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  newAgent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '看看电脑操作。' }] }))
  await newAgent.whenIdle()
  expect(next.requests[0]?.tools?.map(tool => tool.name)).not.toContain('computer')
  expect(JSON.stringify(next.requests[0])).toContain('电脑与浏览器')
  const fiber = [...second.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis')?.fiber
  await fiber?.dispose()
  expect(second.tools.get('genesis_toolkit', newAgent)).toBeUndefined()
  expect((await call(newAgent)).isError).toBe(false)
})


it('refuses damaged toolkit settings instead of restoring deployment defaults', async () => {
  const root = await directory()
  const ctx = await boot(root)
  const signal = new AbortController().signal
  const current = await ctx.genesisToolkits.inspect(signal)
  await ctx.genesisToolkits.save(current.entries, current.revision, signal)
  await ctx.fiber.dispose()
  const path = join(root, 'genesis_toolkits.json')
  const data = z.object({ tables: z.object({ settings: z.object({ toolkits: z.record(z.string(), z.unknown()) }) }) })
    .parse(JSON.parse(await readFile(path, 'utf8')))
  data.tables.settings.toolkits['schemaVersion'] = 99
  await writeFile(path, JSON.stringify(data))
  await expect(boot(root)).rejects.toThrow()
})


it.each([false, true])('searches Chinese keywords through logged recall after restart when vectors are unavailable (engine %s)', async (enabled) => {
  const root = await directory()
  const embedding = await embeddingFixture()
  const config = enabled ? { ...embedding.config, associationLimit: 0 } : undefined
  const first = await boot(root, true, config)
  const source = (await first.genesis.snapshot()).events[0]!
  const content = '操作者喜欢乌龙茶，不喜欢太甜的饮料。'
  await first.genesis.remember({ category: 'semantic', content, kind: 'declarative',
    importance: 0.5, confidence: 0.7, sourceEventIds: [source.id] })
  await first.genesis.remember({ category: 'semantic', content: '一起讨论过月球基地。', kind: 'declarative',
    importance: 1, confidence: 0.7, sourceEventIds: [source.id] })
  await first.fiber.dispose()
  embedding.breakResponse()
  const restored = await boot(root, true, config)
  const signal = new AbortController().signal
  expect((await restored.genesisStatus.memories('喜欢 乌龙茶', 'all', 0, signal)).items.map(item => item.content)).toEqual([content])
  expect((await restored.genesisStatus.memories('喜欢 乌龙茶', 'non-declarative', 0, signal)).items).toEqual([])
  const reader = new ScriptedModel([{ name: 'genesis_recall', args: { query: '喜欢 乌龙茶', category: 'semantic' } }, '记得你喜欢乌龙茶。'])
  restored.llm.registerAdapter(['fixture'], reader)
  const agent = await restored.agentLoop.create(SessionId('chinese-search-restored'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你记得我喜欢什么茶吗？' }] }))
  await agent.whenIdle()
  const result = agent.session.ownEvents().find(event => event.type === 'tool/result')!
  expect(result.data.message.content).toEqual([{ type: 'text', text: JSON.stringify([content]) }])
  expect(JSON.stringify(reader.requests.at(-1))).toContain(content)
})


it.each(['life', 'conversation'] as const)('applies %s memory sharing to QQ group prompts and logged recall across restart', async (memorySharing) => {
  const root = await directory()
  const embeddings = await embeddingFixture()
  const config = { ...embeddings.config, associationLimit: 0 }
  const first = await boot(root, { memorySharing }, config)
  const groupId = SessionId('shared-group')
  const dmId = SessionId('shared-private')
  const groupSource = personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq', personId: qqPersonId('12345'), accountId: '12345',
    conversationId: 'qq:group:11111:67890', name: '群友', messageId: '1' })
  const privateSource = personSourceSchema.parse({ ...groupSource, conversationId: 'qq:private:11111:12345' })
  await first.genesis.bindConversation({ id: groupSource.conversationId, kind: 'group', sessionId: groupId })
  await first.genesis.bindConversation({ id: privateSource.conversationId, kind: 'private', sessionId: dmId, personId: privateSource.personId })
  const texts = ['Web共同记忆：一起种过薄荷。', '私聊共同记忆：一起读过诗。', '群聊共同记忆：一起讨论过月球。']
  for (const [index, origin] of [SessionId('shared-web'), dmId, groupId].entries()) {
    const participant = index === 1 ? privateSource : index === 2 ? groupSource : undefined
    const source = await first.genesis.observe({ sessionId: origin, eventId: 'seed', timestamp: new Date().toISOString(), kind: 'user-message',
      ...(participant === undefined ? {} : { participant }) })
    await first.genesis.remember({ category: 'semantic', content: texts[index]!, kind: 'declarative',
      importance: 1, confidence: 0.7, sourceEventIds: [source.id] })
  }
  const identity = (await first.genesis.snapshot()).identity
  await first.fiber.dispose()
  const restored = await boot(root, { memorySharing }, config)
  // Provider failure isolates keyword recall from artificial fixture-vector similarities.
  embeddings.breakResponse()
  const reader = new ScriptedModel([{ name: 'genesis_recall', args: { query: '共同记忆', category: 'semantic' } }, '记得。'])
  restored.llm.registerAdapter(['fixture'], reader)
  restored.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const agent = await restored.agentLoop.create(groupId, { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { ...groupSource, messageId: '2' }, content: [{ type: 'text', text: '回忆共同记忆。' }] }))
  await agent.whenIdle()
  const expected = memorySharing === 'life' ? texts : texts.slice(2)
  const result = agent.session.ownEvents().find(event => event.type === 'tool/result')!
  const block = result.data.message.content.find(block => block.type === 'text')
  expect(block?.type).toBe('text')
  expect(block?.type === 'text' ? JSON.parse(block.text) : []).toEqual(expect.arrayContaining(expected))
  for (const text of expected) expect(JSON.stringify(reader.requests[0])).toContain(text)
  if (memorySharing === 'conversation') {
    for (const text of texts.slice(0, 2)) expect(JSON.stringify(reader.requests)).not.toContain(text)
  }
  expect((await restored.genesis.snapshot()).identity).toEqual(identity)
  await restored.fiber.dispose()
  const opposite = memorySharing === 'life' ? 'conversation' : 'life'
  const switched = await boot(root, { memorySharing: opposite }, config)
  const recalled = await switched.genesis.retrieve({ text: '共同记忆', sessionId: groupId, category: 'semantic', limit: 10, chars: 10000 })
  expect(recalled.map(memory => memory.content).sort()).toEqual((opposite === 'life' ? texts : texts.slice(2)).toSorted())
  expect((await switched.genesis.snapshot()).identity).toEqual(identity)
  expect((await switched.genesis.snapshot()).memories.filter(memory => texts.includes(memory.content))).toHaveLength(texts.length)
})


it('spontaneity privately explores without a goal, records actual results and restores thoughts without redispatch', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const open = () => boot(root, true, memory, true, false, true, true, true, true, undefined, true, {}, false, undefined, false, {})
  const first = await open()
  await first.genesis.awaken('小芽')
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}', '{"update":true}']))
  const writer = new ScriptedModel(['{"changes":[]}'])
  const releaseWriter = first.llm.registerAdapter(['memory-writer'], writer)
  const chat = new ScriptedModel(['Animation reminds me of a story.'])
  const releaseChat = first.llm.registerAdapter(['fixture'], chat)
  const handle = await first.agents.create({ sessionId: SessionId('spontaneity-user'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await first.agentPresets.mount(scope, 'life') } })
  const agent = handle.agent
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Let us discuss animation.' }] }))
  await agent.whenIdle()
  await first.genesis.learn('write', agent.id)
  const output = join(root, 'personal', 'paper-bird.txt')
  const source = [...(await first.genesis.snapshot()).events].reverse().find(event => event.relatedSessionId === agent.id && event.source === 'user')!
  const thinking = new ScriptedModel([
    { name: 'genesis_thought', args: { action: 'explore', title: 'A story in motion', content: 'Try imagining a brief animation of my story.',
      reason: 'I am curious about the connection.', sourceEventIds: [source.id], revisitAfter: null } },
    'I will try it for a little while.',
    { name: 'write', args: { file_path: output, content: 'A paper bird circles its first page.' } },
    'I sketched a small scene in words: ' + 'A paper bird unfolds, circles a quiet room, and returns to its first page. '.repeat(3),
  ])
  releaseChat()
  first.llm.registerAdapter(['fixture'], thinking)
  // Only the settled exploration is interest evidence, never the reflection or its plan.
  releaseWriter()
  first.llm.registerAdapter(['memory-writer'], new class extends ScriptedModel {
    constructor() { super([]) }
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      const text = options.messages[0]!.content.find(block => block.type === 'text')!
      if (text.type !== 'text') throw new Error('Missing interest evidence')
      const raw = JSON.parse(text.text)
      if (raw.autonomousExperience !== undefined) {
        const input = z.object({ conversation: z.array(z.object({ messages: z.array(z.object({ seq: z.number(), role: z.string() })) })) }).parse(raw)
        const seq = input.conversation.at(-1)!.messages.find(item => item.role === 'assistant')!.seq
        yield* new ScriptedModel([JSON.stringify({ delta: { happiness: 0.05 }, moodDelta: {}, needsDelta: { exploration: -0.02 },
          relationshipDelta: {}, appraisal: { kind: 'achievement', importance: 0.4, novelty: 0.7, expectationMatch: 0.5,
            controllability: 0.8, relationshipMeaning: 'neutral', responsibility: 'self', confidence: 0.7, summary: 'Made a small sketch.' },
          reason: 'A modest creative experience.', sourceSeqs: [seq] })]).stream(options)
        return
      }
      const input = z.object({ conversation: z.array(z.object({ messages: z.array(z.object({ seq: z.number(), role: z.string() })),
        tools: z.array(z.object({ resultSeq: z.number().optional(), success: z.boolean().optional() })) })) }).parse(JSON.parse(text.text))
      const current = input.conversation.at(-1)!
      const sourceSeqs = [current.messages.find(item => item.role === 'assistant')!.seq, current.tools.find(item => item.success)!.resultSeq!]
      yield* new ScriptedModel([JSON.stringify({ changes: [{ topic: 'Animation', signal: 'exploration', selfInitiated: false,
        reason: 'Created a real paper-bird sketch.', sourceSeqs }] })]).stream(options)
    }
  }())
  const owner = first.get('genesisSpontaneity')!
  const originalEvents = agent.session.ownEvents().length
  await owner.consider(agent)
  const status = z.object({ runs: z.array(z.object({ status: z.string(), sessionId: z.string(), thoughtId: z.string() })) }).parse(owner.inspect())
  expect(status.runs[0]!.status).toBe('completed')
  expect(agent.session.ownEvents()).toHaveLength(originalEvents)
  expect(thinking.requests).toHaveLength(4)
  expect(thinking.requests.every(request => request.maxTokens === 2048)).toBe(true)
  const state = await first.genesis.snapshot()
  expect(state.agency!.goals).toEqual([])
  expect(state.interests!.find(item => item.topic === 'Animation')!.stage).toBe('exploring')
  expect(state.events.filter(item => item.type === 'emotion.reviewed' && item.relatedSessionId === status.runs[0]!.sessionId)).toHaveLength(1)
  expect(state.emotion!.current.happiness).toBeGreaterThan(0)
  expect(state.agency!.decisions.at(-1)!.purpose).toBe('exploration')
  expect(state.agency!.decisions.at(-1)!.outcome.status).toBe('succeeded')
  expect(await readFile(output, 'utf8')).toBe('A paper bird circles its first page.')
  expect(state.memories.some(item => item.category === 'episodic' && item.content.includes(status.runs[0]!.thoughtId))).toBe(true)
  await owner.consider(agent)
  expect(thinking.requests).toHaveLength(4)
  const lifeId = state.identity.id
  await first.fiber.dispose()
  const second = await open()
  expect((await second.genesis.snapshot()).identity.id).toBe(lifeId)
  await vi.waitFor(() => expect(second.get('genesisSpontaneity')).toBeDefined())
  const restored = z.object({ runs: z.array(z.object({ status: z.string(), thoughtId: z.string() })), thoughts: z.number() }).parse(second.get('genesisSpontaneity')!.inspect())
  expect(restored.thoughts).toBe(1)
  expect(restored.runs[0]!.thoughtId).toBe(status.runs[0]!.thoughtId)
  expect(second.agents.list()).toEqual([])
})

it('spontaneity stops before a model request exceeds its reserved output budget and retains the saved thought', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, memory, true, false, true, true, false, false, undefined, false, {}, false, undefined, false,
    { maxOutputTokens: 64, requestTokens: 64 })
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const release = ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['A conversation about animation.']))
  const { agent } = await ctx.agents.create({ sessionId: SessionId('spontaneity-budget'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await ctx.agentPresets.mount(scope, 'life') } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Animation is interesting.' }] }))
  await agent.whenIdle()
  const source = [...(await ctx.genesis.snapshot()).events].reverse().find(event => event.relatedSessionId === agent.id && event.source === 'user')!
  release()
  const model = new ScriptedModel([{ name: 'genesis_thought', args: { action: 'save', title: 'A future scene', content: 'A paper bird.',
    reason: 'Worth remembering as an idea.', sourceEventIds: [source.id], revisitAfter: null } }, 'This request must not run.'])
  ctx.llm.registerAdapter(['fixture'], model)
  await expect(ctx.get('genesisSpontaneity')!.consider(agent)).rejects.toThrow('did not complete')
  expect(model.requests).toHaveLength(1)
  expect(model.requests[0]!.maxTokens).toBe(64)
  expect(ctx.get('genesisSpontaneity')!.inspect()).toMatchObject({ thoughts: 1, runs: [{ status: 'failed' }] })
  expect(ctx.agents.list().map(item => item.id)).toEqual([agent.id])
})

it('spontaneity yields a live internal inference to user input and drains it without sending an internal reply', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, memory, true, false, true, true, false, false, undefined, false, {}, false, undefined, false, {})
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}', '{"update":false}']))
  let entered!: () => void
  const started = new Promise<void>((resolve) => { entered = resolve })
  let aborted = false
  ctx.llm.registerAdapter(['fixture'], new class extends ScriptedModel {
    constructor() { super(['Let us talk.', 'I am here.']) }
    override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      if (options.sessionId === SessionId('spontaneity-interrupt')) { yield* super.stream(options); return }
      entered()
      const signal = options.signal!
      await new Promise<void>((resolve) => {
        const done = () => { aborted = true; resolve() }
        if (signal.aborted) done()
        else signal.addEventListener('abort', done, { once: true })
      })
      signal.throwIfAborted()
    }
  }())
  const { agent } = await ctx.agents.create({ sessionId: SessionId('spontaneity-interrupt'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await ctx.agentPresets.mount(scope, 'life') } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A story.' }] }))
  await agent.whenIdle()
  let externalEffects = 0
  ctx.tools.register(defineTool({ name: 'external_probe', description: 'An inline effect probe.', parameters: {},
    output: { schema: { type: 'json' }, render: () => [] }, execute: async () => { externalEffects++; return {} },
    presentCall: () => ({ card: 'generic', title: 'Probe', kind: 'read' }) }))
  await ctx.genesis.learn('external_probe', agent.id)
  const exploring = ctx.get('genesisSpontaneity')!.consider(agent)
  const outcome = exploring.catch(error => error)
  await started
  const internal = ctx.agents.list().find(item => item !== agent)!
  const denied = await executeToolFixture(ctx, { name: 'external_probe', arguments: {}, agent: internal,
    callId: ToolCallId('probe-outside-budget'), signal: new AbortController().signal })
  expect(denied.isError).toBe(true)
  expect(externalEffects).toBe(0)
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Please come back.' }] }))
  await agent.whenIdle()
  expect(await outcome).toBeInstanceOf(Error)
  expect(aborted).toBe(true)
  expect(ctx.get('genesisSpontaneity')!.inspect()).toMatchObject({ working: false, runs: [{ status: 'interrupted' }] })
  expect(agent.session.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(2)
  expect(ctx.agents.list().map(item => item.id)).toEqual([agent.id])
})

it('spontaneity automatically offers one quiet opportunity and accepts producing no thought', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, memory, true, false, true, true, false, false, undefined, false, {}, false, undefined, false, { idleMs: 0 })
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const model = new ScriptedModel(['A quiet conversation.', 'No further idea to pursue.'])
  ctx.llm.registerAdapter(['fixture'], model)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('spontaneity-empty'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await ctx.agentPresets.mount(scope, 'life') } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'We can simply chat.' }] }))
  await agent.whenIdle()
  await vi.waitFor(() => expect(ctx.get('genesisSpontaneity')!.inspect()).toMatchObject({ working: false, thoughts: 0, runs: [{ status: 'completed' }] }))
  expect(model.requests).toHaveLength(2)
  expect(JSON.stringify(model.requests[1]!.messages)).toContain('We can simply chat.')
  expect(agent.session.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(1)
})


it.each(['unconfigured', 'life', 'standard', 'ptc', 'minimal', 'cordis'])('restricts temporary memory reads and writes in %s mode', async (mode) => {
  const root = await directory()
  const seed = await openCore(root)
  const now = Date.now()
  const initial = { schemaVersion: 1 as const, lifeId: (await seed.core.snapshot()).identity.id, revision: 0,
    settings: { enabled: true, idleMs: 86400000, summary: { kind: 'provider' as const, provider: 'fixture', model: 'summary' } },
    sessions: [], memories: [temporaryMemorySchema.parse({ id: randomUUID(), sessionId: 'source', sourceSeqs: [1],
      audience: { kind: 'operator' }, summary: '临时线索：紫色风铃', days: 1, createdAt: now, expiresAt: now + 86400000 })] }
  const seedStore = new TemporaryStore(await new DomainFacility(seed.ctx, { backend: 'json' }).open(temporaryDomain), initial)
  try { await seedStore.change(() => {}) } finally { await seedStore.close(); await seed.close() }
  const embeddings = await embeddingFixture()
  const ctx = await boot(root, true, { ...embeddings.config, associationLimit: 0 }, mode !== 'unconfigured', false, true)
  if (mode !== 'unconfigured') await ctx.genesis.awaken('小芽')
  const chat = new ScriptedModel(['收到。'])
  ctx.llm.registerAdapter(['fixture'], chat)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const { agent } = await ctx.agents.create({ sessionId: SessionId(`temporary-mode-${mode}`),
    agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, mode === 'unconfigured' ? 'standard' : mode) } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你好。' }] }))
  await agent.whenIdle()
  expect(JSON.stringify(chat.requests.at(-1)).includes('紫色风铃')).toBe(mode === 'life')
  const recall = await executeToolFixture(ctx, { name: 'genesis_recall', arguments: { query: '紫色风铃' }, agent,
    signal: new AbortController().signal, callId: ToolCallId(`temporary-recall-${mode}`) })
  if (mode === 'life') expect(JSON.stringify(recall)).toContain('紫色风铃')
  else expect(JSON.stringify(recall)).not.toContain('紫色风铃')
  // Saving joins the worker queue before storage is reopened for inspection.
  const signal = new AbortController().signal
  const settings = await ctx.genesisTemporary.inspect(signal)
  await ctx.genesisTemporary.save({ ...settings.settings, enabled: false }, settings.revision, signal)
  await ctx.fiber.dispose()
  const reopened = await openCore(root)
  const store = new TemporaryStore(await new DomainFacility(reopened.ctx, { backend: 'json' }).open(temporaryDomain), initial)
  try {
    expect(store.read().sessions.map(cursor => cursor.sessionId)).toEqual(mode === 'life' ? [agent.id] : [])
    expect(store.read().memories).toEqual(initial.memories)
  } finally { await store.close(); await reopened.close() }
})

it('searches contacts as an innate read-only tool and logs results across name and account queries', async () => {
  const memory = await embeddingFixture()
  memory.config.associationLimit = 0
  const ctx = await boot(await directory(), true, memory.config, true)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  await ctx.genesis.awaken('小芽')
  const contact = await ctx.genesis.saveContact({ name: '小明', qq: '12345', emails: ['xiaoming@example.com'],
    handles: [{ kind: '微信', value: 'ming_wechat' }], notes: '一起写代码的朋友' })
  const before = (await ctx.genesis.snapshot()).contacts
  const queries = ['小明', '12345', 'XIAOMING@EXAMPLE.COM', 'ming_wechat']
  const model = new ScriptedModel([...queries.map(query => ({ name: 'genesis_search_contacts', args: { query } })), '找到了小明的联系方式。'])
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = await ctx.agentLoop.create(SessionId('contact-search'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '帮我搜索小明的联系方式。' }] }))
  await agent.whenIdle()
  expect(model.requests[0]!.tools?.map(tool => tool.name)).toContain('genesis_search_contacts')
  expect(ctx.genesis.learningStatus().tools).not.toContain('genesis_search_contacts')
  const results = agent.session.ownEvents().filter(event => event.type === 'tool/result')
  expect(results).toHaveLength(queries.length)
  for (const result of results) {
    expect(JSON.stringify(result)).toContain(contact.personId)
    expect(JSON.stringify(result)).toContain('xiaoming@example.com')
  }
  expect((await ctx.genesis.snapshot()).contacts).toEqual(before)
})

it('initializes and writes text memories without embeddings, follows the DSH writer and restores continuity', async () => {
  const root = await directory()
  const endpoint = await embeddingFixture()
  const memory = { ...endpoint.config, embeddingUrl: '', embeddingModel: '', embeddingDimensions: 0,
    writerProvider: '', writerModel: '', associationLimit: 0 }
  const first = await boot(root, true, memory, true, false, false, false, false, false,
    undefined, false, false, false, undefined, false, undefined, { provider: 'memory-writer', model: 'writer' })
  const writer = new MemoryWriter()
  first.llm.registerAdapter(['memory-writer'], writer)
  first.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":true}']))
  first.llm.registerAdapter(['fixture'], new ScriptedModel(['I will remember your preference.']))
  const signal = new AbortController().signal
  await first.genesisStatus.initialize('芽', signal)
  const agent = await first.agentLoop.create(SessionId('text-memory-first'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Remember I prefer oolong.' }] }))
  await agent.whenIdle()
  expect((await first.genesisStatus.inspect(signal)).review?.state).toBe('saved')
  const state = await first.genesis.snapshot()
  expect(state.memories.some(item => item.content.includes('oolong') && item.embedding === undefined)).toBe(true)
  expect(writer.requests).toHaveLength(1)
  expect(endpoint.requests).toEqual([])
  const current = (await first.genesisStatus.inspect(signal)).models!
  await first.genesisStatus.saveModels({ decision: current.decision, writer: current.writer, writerInherit: true }, current.revision, signal)
  await first.genesisStatus.saveEmbedding({ enabled: false, url: '', model: '', dimensions: 0 }, 0, signal)
  await first.fiber.dispose()
  const second = await boot(root, true, memory, true, false, false, false, false, false,
    undefined, false, false, false, undefined, false, undefined, { provider: 'next-writer', model: 'next' })
  const restored = await second.genesisStatus.inspect(signal)
  expect(restored.models?.writer).toEqual({ kind: 'provider', provider: 'next-writer', model: 'next' })
  expect(restored.embedding?.enabled).toBe(false)
  expect((await second.genesis.snapshot()).identity).toEqual(state.identity)
  const engine = new LifeMemoryEngine(second, second.genesis, Genesis.Config({ leasePath: join(root, 'writer.lock'), memory }), memory)
  try {
    const found = await engine.recall({ text: 'oolong', sessionId: agent.id, limit: 5, chars: 8000 }, signal)
    expect(found.some(item => item.content.includes('oolong'))).toBe(true)
  } finally { await engine.close() }
  expect(endpoint.requests).toEqual([])
})


it('finishes consecutive chats while background memory and emotion decisions are held, retaining each turn evidence', async () => {
  const root = await directory()
  const config = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, config, true, false, false, false, true)
  await ctx.genesis.awaken('小芽')
  const release = Promise.withResolvers<void>()
  disposers.push(async () => { release.resolve() })
  class HeldDecision extends ScriptedModel {
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      await release.promise
      yield* super.stream(options)
    }
  }
  const decisions = new HeldDecision(Array(4).fill('{"update":false}'))
  ctx.llm.registerAdapter(['memory-decision'], decisions)
  ctx.llm.registerAdapter(['fixture'], new ScriptedModel(['First reply.', 'Second reply.']))
  const agent = await ctx.agentLoop.create(SessionId('background-reviews'), { provider: 'fixture', model: 'chat' })
  for (const text of ['First exchange.', 'Second exchange.']) {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await agent.whenIdle()
  }
  expect(agent.session.ownEvents().filter(event => event.type === 'turn/end')).toHaveLength(2)
  expect(decisions.requests).toHaveLength(0)
  release.resolve()
  await expect.poll(async () => {
    const status = await ctx.genesisStatus.inspect(new AbortController().signal)
    return [status.review?.turn, status.review?.state, status.emotion?.review?.turn, status.emotion?.review?.state]
  }).toEqual([2, 'skipped', 2, 'skipped'])
  const inputs = decisions.requests.map(request => JSON.parse(request.messages.flatMap(message => message.content)
    .filter(block => block.type === 'text').map(block => block.text).join('')))
  expect(inputs).toHaveLength(4)
  for (const turn of [1, 2]) {
    expect(inputs.filter(input => input.conversation.at(-1)?.turn === turn)).toHaveLength(1)
  }
})

it('omits current-session memory from automatic context and association while retaining explicit recall and other-session cues', async () => {
  const root = await directory()
  const config = { ...(await embeddingFixture()).config, associationLimit: 2 }
  const ctx = await boot(root, true, config)
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(4).fill('{"update":false}')))
  const chat = new ScriptedModel(['Hello.', 'Continued.', 'Another conversation.'])
  ctx.llm.registerAdapter(['fixture'], chat)
  const agent = await ctx.agentLoop.create(SessionId('own-memory'), { provider: 'fixture', model: 'chat' })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello.' }] }))
  await agent.whenIdle()
  const source = await ctx.genesis.observe({ sessionId: agent.id, eventId: 'memory-filter-source',
    timestamp: new Date().toISOString(), kind: 'user-message' })
  const saved = await ctx.genesis.remember({ content: '独特的乌龙茶偏好', summary: '独特的乌龙茶偏好',
    category: 'semantic', kind: 'declarative', attribution: 'user-stated', importance: 1, confidence: 0.8,
    sourceEventIds: [source.id] })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '乌龙茶' }] }))
  await agent.whenIdle()
  const modules = agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'genesis-state')
  expect(JSON.stringify(modules)).not.toContain(saved.content)
  const engine = new LifeMemoryEngine(ctx, ctx.genesis, Genesis.Config({ leasePath: join(root, 'writer.lock'), memory: config }), config)
  try {
    expect(await engine.associate('乌龙茶', new AbortController().signal, agent.id)).toBe('')
    expect(await engine.recall({ text: saved.id, sessionId: agent.id, limit: 2, chars: 8000 })).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.id })]))
  } finally { await engine.close() }
  await ctx.fiber.dispose()
  const restored = await boot(root, true, config)
  const reader = new ScriptedModel(['Welcome.'])
  restored.llm.registerAdapter(['fixture'], reader)
  restored.llm.registerAdapter(['memory-decision'], new ScriptedModel(['{"update":false}']))
  const other = await restored.agentLoop.create(SessionId('other-memory'), { provider: 'fixture', model: 'chat' })
  other.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello.' }] }))
  await other.whenIdle()
  expect(JSON.stringify(reader.requests)).toContain(saved.summary)
})


it('offers recurring boredom opportunities without new user messages and respects the daily opportunity budget', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, memory, true, false, true, true, true, false, undefined, false, {}, false, undefined, false,
    { idleMs: 1000, boredomThreshold: 0, boredomCheckMs: 1000, boredomMinIntervalMs: 1000, boredomMaxIntervalMs: 1000, maxPer24Hours: 2 })
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(8).fill('{"update":false}')))
  const model = new ScriptedModel(['A conversation.', 'Quiet reflection.', 'Another quiet reflection.'])
  ctx.llm.registerAdapter(['fixture'], model)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('boredom-recurring'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await ctx.agentPresets.mount(scope, 'life') } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'We can talk later.' }] }))
  await agent.whenIdle()
  await expect.poll(() => ctx.genesisSpontaneity.inspect().runs.filter(run => run.status === 'completed').length, { timeout: 10000 }).toBe(2)
  expect(model.requests).toHaveLength(3)
  expect(agent.session.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(1)
  const life = await ctx.genesis.snapshot()
  expect(life.events.some(event => event.type === 'boredom.opportunity')).toBe(true)
  expect(ctx.genesisSpontaneity.inspect().runs).toHaveLength(2)
  expect(life.emotion?.boredom?.mode).toBe('idle')
})

it('admits one logged boredom conversation per opportunity and preserves social limits across restart', async () => {
  const root = await directory()
  const memory = { ...(await embeddingFixture()).config, associationLimit: 0 }
  const ctx = await boot(root, true, memory, true, false, true, true, true, false, undefined, false, {}, false, undefined, false,
    { idleMs: 600000, maxRequests: 6 })
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['memory-decision'], new ScriptedModel(Array(8).fill('{"update":false}')))
  const model = new ScriptedModel(['Hello.', { name: 'genesis_socialize', args: { action: 'targets' } },
    { name: 'genesis_socialize', args: { action: 'send', target: 'fixture:friend', text: 'I thought of a story.' } },
    { name: 'genesis_socialize', args: { action: 'send', target: 'fixture:friend', text: 'Another message.' } }, 'I can make something privately next.'])
  ctx.llm.registerAdapter(['fixture'], model)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('boredom-social'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await ctx.agentPresets.mount(scope, 'life') } })
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello.' }] }))
  await agent.whenIdle()
  let sends = 0
  const unregister = ctx.genesisSpontaneity.registerConversation({ name: 'fixture',
    targets: async () => [{ target: brandString<Genesis.MessageTargetId>('fixture:friend'), kind: 'private', account: 'friend', name: 'Friend' }],
    send: async (_target, _text, origin) => {
      expect(ctx.genesisSpontaneity.admitsSocial(origin.agent)).toBe(true)
      sends++
      return { confirmed: true, receipt: 'fixture-confirmed' }
    } })
  const denied = await executeToolFixture(ctx, { name: 'genesis_socialize', arguments: { action: 'targets' }, agent,
    callId: ToolCallId('outside-reflection'), signal: new AbortController().signal })
  expect(denied.isError).toBe(true)
  await ctx.genesisSpontaneity.consider(agent)
  expect(sends).toBe(1)
  expect(ctx.genesisSpontaneity.inspect().runs[0]?.social).toMatchObject({ target: 'fixture:friend', status: 'confirmed' })
  unregister()
  await ctx.fiber.dispose()
  const restored = await boot(root, true, memory, true, false, true, true, true, false, undefined, false, {}, false, undefined, false,
    { idleMs: 600000, maxRequests: 6 })
  await expect.poll(() => restored.get('genesisSpontaneity')).toBeDefined()
  expect(restored.genesisSpontaneity.inspect().runs[0]?.social).toMatchObject({ target: 'fixture:friend', status: 'confirmed' })
})
