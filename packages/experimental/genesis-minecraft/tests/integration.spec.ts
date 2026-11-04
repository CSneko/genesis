/** Real Loader and Agent Loop; only game transport and model endpoints are substituted. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import mineflayer, { type Bot } from 'mineflayer'
import navigation from 'mineflayer-pathfinder'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Vec3 } from 'vec3'
import { z } from 'zod'
import { afterEach, it, expect, vi } from 'vitest'
import { SessionId, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { settingsSchema } from '../src/settings.ts'
import { MinecraftRuntime } from '../src/runtime.ts'
import type { Config } from '../src/index.ts'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-experimental-genesis'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) { try { await close() } catch (error) { errors.push(error) } }
  vi.restoreAllMocks()
  if (errors.length) throw new AggregateError(errors, 'Minecraft fixture cleanup')
})
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'I noticed the change.' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'I noticed the change.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
class PlayingModel extends Model {
  blocked: Promise<void> | undefined
  private readonly handled = new Set<string>()
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.blocked !== undefined) await this.blocked
    const text = options.messages.toReversed().filter(message => message.role === 'user')
      .map(message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'))
      .find(value => value.startsWith('Minecraft player speech.')) ?? ''
    if (text.startsWith('Minecraft player speech.')) {
      const input = z.object({ observationId: z.string(), messages: z.array(z.object({
        message: z.string(), channel: z.string(), playerId: z.string().optional(),
      })) }).parse(JSON.parse(text.slice(text.lastIndexOf('\n') + 1)))
      if (!this.handled.has(input.observationId)) {
        this.handled.add(input.observationId)
        const speech = input.messages.at(-1)!
        const leave = speech.message === 'leave now'
        const follow = speech.message === 'follow me'
        const name = leave ? 'minecraft_stop' : 'minecraft_act'
        const args = leave ? { disconnect: true } : follow ? { action: 'follow', observationId: input.observationId, playerId: speech.playerId }
          : { action: 'chat', observationId: input.observationId, message: 'Hello from Minecraft!',
            ...(speech.channel === 'whisper' ? { playerId: speech.playerId } : {}) }
        const id = ToolCallId(`game-${this.handled.size}`)
        yield { type: 'block-start', index: 0, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: JSON.stringify(args) }
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: JSON.stringify(args) } }
        yield { type: 'finish', reason: { kind: 'tool-calls' } }
        return
      }
    }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function boot(root: string, minecraft: Partial<Config> = {}, scripts = false) {
  const path = join(root, 'cordis.yml')
  const entries = [
    { name: '@deepseek-ai/dsh-llm' }, { name: '@deepseek-ai/dsh-session' },
    { name: '@deepseek-ai/dsh-session-projection' }, { name: '@deepseek-ai/dsh-system-prompt' },
    { name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: scripts ? 'danger-full-access' : 'read-only', workspaceRoot: root } },
    ...(scripts ? [
      { name: '@deepseek-ai/dsh-fs-local' }, { name: '@deepseek-ai/dsh-subprocess-local' },
      { name: '@deepseek-ai/dsh-sandbox-local' },
      { name: '@deepseek-ai/dsh-ptc-runtime-node', config: { maxOutputBytes: 8192, maxOldGenerationSizeMb: 64, maxPendingCalls: 8 } },
      { name: '@deepseek-ai/dsh-working-directory', config: { defaultDirectory: root } },
    ] : []),
    { name: '@deepseek-ai/dsh-tools' }, { name: '@deepseek-ai/dsh-agent' },
    { name: '@deepseek-ai/dsh-storage' }, { name: '@deepseek-ai/dsh-storage-json', config: { root } },
    { name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    { name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
    { name: '@deepseek-ai/dsh-workspace' },
    { name: '@deepseek-ai/dsh-agent-default-model', config: { provider: 'fixture', model: 'chat' } },
    { name: '@deepseek-ai/dsh-attachment-local', config: { dshHome: root } },
    { name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'life' } },
    { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'life', plugins: [] } },
    { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard', plugins: [] } },
    { name: '@deepseek-ai/dsh-experimental-genesis', config: { leasePath: join(root, 'life.lock') } },
    { name: '@deepseek-ai/dsh-experimental-genesis-minecraft', config: { workingDirectory: root, visualReviewMs: 1000, ...minecraft } },
    { name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
  ]
  await writeFile(path, JSON.stringify(entries))
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include; ctx.loader.internal = undefined
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return ctx
}
function installBot() {
  const emitter = new EventEmitter()
  const controls = vi.fn()
  const bot: Bot = Object.assign(emitter as Bot, {
    username: 'Genesis', version: '1.21.4', health: 20, food: 20,
    entity: { position: new Vec3(0, 64, 0), yaw: 0, pitch: 0, height: 1.8, eyeHeight: 1.62 }, game: { dimension: 'overworld' },
    entities: {}, players: { Companion: { username: 'Companion', uuid: 'companion-uuid', entity: { position: new Vec3(4, 64, 0) } } }, inventory: Object.assign(new EventEmitter(), { items: () => [] }),
    findBlocks: vi.fn(() => []), blockAtCursor: vi.fn(() => null), world: { raycast: vi.fn() },
    chat: vi.fn(), whisper: vi.fn(), loadPlugin: vi.fn(), clearControlStates: controls, stopDigging: vi.fn(), deactivateItem: vi.fn(),
    pathfinder: { setGoal: vi.fn(), setMovements: vi.fn() },
    _client: { socket: { destroy: () => { queueMicrotask(() => { emitter.emit('end', 'closed') }) } } },
  })
  vi.spyOn(mineflayer, 'createBot').mockImplementation(() => {
    queueMicrotask(() => { emitter.emit('spawn') }); return bot
  })
  vi.spyOn(navigation, 'Movements').mockImplementation(function () { return {} as navigation.Movements })
  return { emitter, bot, controls }
}
it('delivers logged Jev changes, reuses knowledge routing with a different model, and restores settings without reconnecting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-loader-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const requests: Array<{ model: string }> = []
  let urgent = false
  let invalid = false
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    requests.push(JSON.parse(Buffer.concat(chunks).toString()))
    res.setHeader('Content-Type', 'application/json')
    if (invalid) { res.end('invalid-json'); return }
    res.end(JSON.stringify({ answers: { urgent: { type: 'noul', noul: urgent ? 0.99 : 0.01 }, attention: { type: 'noul', noul: 0.01 } } }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const { controls } = installBot()
  const ctx = await boot(root)
  const model = new Model(); ctx.llm.registerAdapter(['fixture'], model)
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `http://127.0.0.1:${address.port}/v1/systemone`, model: 'knowledge-model', threshold: 0.5 },
    writer: { kind: 'provider', provider: 'fixture', model: 'chat' } }, 0, signal)
  const settings = settingsSchema.parse({ enabled: true, vision: false, jevEnabled: true,
    jevModel: 'minecraft-model', intervalMs: 250, notificationIntervalMs: 1000 })
  expect(await ctx.genesisMinecraft.save(settings, 0, signal)).toBe(1)
  const audits: string[] = []
  ctx.on('session/event', (_session, event) => { const record = pluginRecordOf(event); if (record !== undefined) audits.push(record.type) })
  await ctx.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('connect'), arguments: { host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, agent, signal }).then((result) => { expect(result.isError).toBe(false) })
  await vi.waitFor(() => { expect(model.requests.length).toBeGreaterThan(0) })
  expect(requests[0]?.model).toBe('minecraft-model')
  expect(JSON.stringify(model.requests[0])).toContain('Minecraft observation')
  const look = await ctx.tools.execute({ name: 'minecraft_observe', callId: ToolCallId('observe'), arguments: {}, agent, signal })
  const observation = z.object({ observation: z.object({ id: z.string() }) }).parse(look.value)
  expect(look.isError).toBe(false)
  expect(await ctx.tools.execute({ name: 'minecraft_act', callId: ToolCallId('follow'), arguments: {
    action: 'follow', observationId: observation.observation.id, playerId: 'companion-uuid' }, agent, signal })).toMatchObject({ isError: false })
  const requestCount = model.requests.length
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Keep following while we chat.' }] }))
  await vi.waitFor(() => { expect(model.requests.length).toBeGreaterThan(requestCount) })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).observation?.action).toBe('follow') })
  const before = controls.mock.calls.length
  urgent = true
  await vi.waitFor(() => { expect(controls.mock.calls.length).toBeGreaterThan(before) })
  expect(audits).toContain('plugin:genesis-minecraft/jev')
  invalid = true
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).monitor).toBe('failed') })
  await ctx.genesisMinecraft.disconnect(signal)
  const count = requests.length
  await ctx.fiber.dispose()
  const second = await boot(root)
  expect(await second.genesisMinecraft.inspect(signal)).toMatchObject({ revision: 1, connection: 'disconnected', settings })
  expect(requests).toHaveLength(count)
  await expect(second.genesisMinecraft.save(settings, 0, signal)).rejects.toMatchObject({ details: { reason: 'conflict' } })
  const outsider = (await second.agents.create({ sessionId: SessionId('minecraft-outsider'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await second.agentPresets.mount(child, 'standard') } })).agent
  expect(await second.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('denied'), arguments: {}, agent: outsider, signal }))
    .toMatchObject({ isError: true })
})

it('plays without app messages, receives repeated speech and whispers during Jev, and drains its own exit tool', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-playing-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  let releaseJev!: () => void
  let waiting = true
  let arrived = false
  const jevGate = new Promise<void>((resolve) => { releaseJev = resolve })
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* Drain the test request before holding its response. */ }
    arrived = true
    if (waiting) await jevGate
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ answers: { urgent: { type: 'noul', noul: 0 }, attention: { type: 'noul', noul: 0 } } }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const { emitter, bot, controls } = installBot()
  const ctx = await boot(root)
  const model = new PlayingModel()
  ctx.llm.registerAdapter(['fixture'], model)
  let releaseModel = () => {}
  cleanup.push(async () => { releaseJev(); releaseModel() })
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `http://127.0.0.1:${address.port}/v1/systemone`, model: 'knowledge-model', threshold: 0.5 },
    writer: { kind: 'provider', provider: 'fixture', model: 'chat' } }, 0, signal)
  const settings = settingsSchema.parse({ enabled: true, vision: false, jevEnabled: true, intervalMs: 250, notificationIntervalMs: 1000 })
  await ctx.genesisMinecraft.save(settings, 0, signal)
  expect(ctx.agents.list()).toHaveLength(0)
  await ctx.genesisMinecraft.connect({ host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, signal)
  const status = await ctx.genesisMinecraft.inspect(signal)
  expect(status.connection).toBe('connected')
  expect(status.sessionId).toMatch(/^minecraft-/u)
  const agent = ctx.agents.get(status.sessionId!)!
  expect(ctx.workspaceRegistry.list().some(workspace => workspace.sessionIds.includes(agent.id))).toBe(true)
  await vi.waitFor(() => { expect(arrived).toBe(true) })

  emitter.emit('chat', 'Companion', 'hello')
  await vi.waitFor(() => { expect(bot.chat).toHaveBeenCalledTimes(1) })
  await agent.whenIdle()
  expect(waiting).toBe(true)
  emitter.emit('chat', 'Companion', 'hello')
  await vi.waitFor(() => { expect(bot.chat).toHaveBeenCalledTimes(2) })
  await agent.whenIdle()
  emitter.emit('chat', 'Companion', 'follow me')
  await vi.waitFor(() => { expect(bot.pathfinder.setGoal).toHaveBeenCalledWith(expect.any(navigation.goals.GoalFollow), true) })
  await agent.whenIdle()
  const stopsBeforeWhisper = controls.mock.calls.length
  emitter.emit('whisper', 'Companion', 'a private hello')
  await vi.waitFor(() => { expect(bot.whisper).toHaveBeenCalledWith('Companion', 'Hello from Minecraft!') })
  await agent.whenIdle()
  expect(bot.chat).toHaveBeenCalledTimes(2)
  expect(controls).toHaveBeenCalledTimes(stopsBeforeWhisper)
  expect(JSON.stringify(agent.session.ownEvents())).toContain('a private hello')

  model.blocked = new Promise<void>((resolve) => { releaseModel = resolve })
  const before = model.requests.length
  emitter.emit('chat', 'Companion', 'hold this response')
  await vi.waitFor(() => { expect(model.requests.length).toBeGreaterThan(before) })
  for (let i = 0; i < 12; i++) emitter.emit('chat', 'Companion', `burst-${i}`)
  const pending = agent.inbox.nextStep.filter(message => message.source.kind === 'genesis-minecraft')
  expect(pending).toHaveLength(1)
  expect(JSON.stringify(pending)).toContain('burst-11')
  expect(pending.flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')).toContain('"omitted":4')
  model.blocked = undefined; releaseModel()
  await agent.whenIdle()
  waiting = false; releaseJev()
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).observation).not.toBeNull() })
  const count = model.requests.length
  await vi.waitFor(() => { expect(model.requests.length).toBeGreaterThan(count) }, { timeout: 5000 })
  await agent.whenIdle()
  expect(JSON.stringify(model.requests)).toContain('playing Minecraft continuously while connected')
  await expect(ctx.workspaceRegistry.archiveSession(agent.id)).rejects.toMatchObject({ name: 'WorkspaceActiveSessionError' })

  emitter.emit('chat', 'Companion', 'leave now')
  await vi.waitFor(async () => { expect(await ctx.genesisMinecraft.inspect(signal)).toMatchObject({ connection: 'disconnected', sessionId: null }) })
  await vi.waitFor(() => { expect(ctx.agents.get(agent.id)).toBeUndefined() })
  const requests = model.requests.length
  emitter.emit('chat', 'Companion', 'late speech')
  expect(model.requests).toHaveLength(requests)
  expect(ctx.workspaceRegistry.list().some(workspace => workspace.sessionIds.includes(agent.id))).toBe(true)
})

it('releases a connection-owned conversation when joining the server fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-join-failed-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  vi.spyOn(mineflayer, 'createBot').mockImplementation(() => { throw new Error('fixture join failed') })
  const ctx = await boot(root)
  const signal = new AbortController().signal
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false }), 0, signal)
  await expect(ctx.genesisMinecraft.connect({ host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, signal)).rejects.toMatchObject({ details: { reason: 'operation-failed' } })
  await vi.waitFor(() => { expect(ctx.agents.list()).toHaveLength(0) })
  expect(await ctx.genesisMinecraft.inspect(signal)).toMatchObject({ connection: 'disconnected', sessionId: null })
})

it('stops the game and its owned conversation when the integration unloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-unload-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { emitter } = installBot()
  const ctx = await boot(root)
  const model = new Model()
  ctx.llm.registerAdapter(['fixture'], model)
  const signal = new AbortController().signal
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, intervalMs: 250 }), 0, signal)
  await ctx.genesisMinecraft.connect({ host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, signal)
  await vi.waitFor(() => { expect(model.requests.length).toBeGreaterThan(0) })
  const sessionId = (await ctx.genesisMinecraft.inspect(signal)).sessionId!
  const agents = ctx.agents
  await ctx.fiber.dispose()
  expect(agents.get(sessionId)).toBeUndefined()
  const count = model.requests.length
  emitter.emit('chat', 'Companion', 'after unloading')
  expect(model.requests).toHaveLength(count)
})

it('waits for skills without blocking other commands and approaches matched blocks before confirmed digging', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-skills-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { bot } = installBot()
  bot.entity.height = 1.8
  let finishPath = () => {}
  let pathPending = false
  let rejectPath = (_error: Error) => {}
  const goto = vi.fn((goal: navigation.goals.Goal) => new Promise<void>((resolve, reject) => {
    pathPending = true; rejectPath = reject
    finishPath = () => {
      pathPending = false
      if (goal instanceof navigation.goals.GoalLookAtBlock) bot.entity.position = goal.pos.offset(-2, 0, 0)
      else if (goal instanceof navigation.goals.GoalNear) bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
      resolve()
    }
  }))
  Object.assign(bot.pathfinder, { goto })
  vi.mocked(bot.pathfinder.setGoal).mockImplementation((goal) => {
    if (goal === null && pathPending) { pathPending = false; rejectPath(new Error('navigation interrupted')) }
  })
  type Block = NonNullable<ReturnType<Bot['blockAt']>>
  const oak: Block = Object.assign({} as Block, { name: 'oak_log', position: new Vec3(10, 64, 0), stateId: 1, diggable: true, shapes: [[0, 0, 0, 1, 1, 1]], getProperties: () => ({ axis: 'y' }) })
  const birch: Block = Object.assign({} as Block, { name: 'birch_log', position: new Vec3(2, 64, 0), stateId: 2, diggable: true, shapes: [[0, 0, 0, 1, 1, 1]], getProperties: () => ({ axis: 'x' }) })
  const blocks = new Map<string, Block>([['10,64,0', oak], ['2,64,0', birch]])
  const key = (position: Vec3) => position.toArray().join(',')
  bot.blockAt = vi.fn<Bot['blockAt']>(position => blocks.get(key(position)) ?? null)
  bot.findBlocks = vi.fn<Bot['findBlocks']>(options => [...blocks.values()].filter(block => typeof options.matching === 'function' && options.matching(block))
    .slice(0, options.count).map(block => block.position))
  bot.canDigBlock = vi.fn(block => block.position.distanceTo(bot.entity.position) < 4)
  bot.canSeeBlock = vi.fn(() => true)
  bot.blockAtCursor = vi.fn(() => blocks.get('10,64,0') ?? null)
  bot.world.raycast = vi.fn(() => ({ x: oak.position.x, y: oak.position.y, z: oak.position.z, intersect: oak.position.offset(0.5, 0.5, 0.5), face: 1 }))
  bot.lookAt = vi.fn().mockResolvedValue(undefined)
  bot.dig = vi.fn(async (block: Block) => { blocks.set(key(block.position), Object.assign({} as Block, block, { name: 'air', stateId: 0, diggable: false })) })
  const ctx = await boot(root)
  const model = new Model(); ctx.llm.registerAdapter(['fixture'], model)
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-skill-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, skillTimeoutMs: 1000 }), 0, signal)
  await ctx.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('connect'), arguments: { host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, agent, signal }).then((result) => { expect(result.isError).toBe(false) })
  let sequence = 0
  const observation = async () => {
    const result = await ctx.tools.execute({ name: 'minecraft_observe', callId: ToolCallId(`observe-${++sequence}`), arguments: {}, agent, signal })
    return z.object({ observation: z.object({ id: z.string() }) }).parse(result.value).observation.id
  }
  const act = (args: object, callSignal = signal) => ctx.tools.execute({ name: 'minecraft_act', callId: ToolCallId(`act-${++sequence}`), arguments: args, agent, signal: callSignal })
  let settled = false
  const walking = act({ action: 'goto', observationId: await observation(), x: 6, y: 64, z: 0, waitForCompletion: true })
    .then((result) => { settled = true; return result })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(1) })
  expect(settled).toBe(false)
  expect(await act({ action: 'chat', observationId: await observation(), message: 'Still walking.' })).toMatchObject({ isError: false })
  expect(settled).toBe(false)
  finishPath()
  expect(await walking).toMatchObject({ isError: false, value: { started: 'goto', outcome: 'completed', failure: null } })

  const mining = act({ action: 'dig', observationId: await observation(), blockName: 'minecraft:oak_log', blockProperties: { axis: 'y' }, waitForCompletion: true })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(2) })
  expect(goto.mock.calls[1]![0]).toBeInstanceOf(navigation.goals.GoalLookAtBlock)
  expect(bot.dig).not.toHaveBeenCalled()
  finishPath()
  expect(await mining).toMatchObject({ isError: false, value: { started: 'dig', outcome: 'completed',
    target: { name: 'oak_log', position: { x: 10, y: 64, z: 0 } } } })
  expect(bot.dig).toHaveBeenCalledWith(oak, true, 'raycast')
  expect(blocks.get('2,64,0')?.name).toBe('birch_log')

  blocks.set('10,64,0', oak); bot.entity.position = new Vec3(0, 64, 0)
  const changed = act({ action: 'dig', observationId: await observation(), blockName: 'oak_log', waitForCompletion: true })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(3) })
  blocks.set('10,64,0', Object.assign({} as Block, oak, { name: 'stone', stateId: 4 }))
  finishPath()
  expect(await changed).toMatchObject({ isError: false, value: { outcome: 'failed', failure: 'block-unreachable' } })
  expect(bot.dig).toHaveBeenCalledTimes(1)

  const abort = new AbortController()
  const cancelled = act({ action: 'goto', observationId: await observation(), x: 9, y: 64, z: 0, waitForCompletion: true }, abort.signal)
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(4) })
  abort.abort()
  await cancelled
  expect(pathPending).toBe(false)
  const timed = act({ action: 'goto', observationId: await observation(), x: 9, y: 64, z: 0, waitForCompletion: true })
  expect(await timed).toMatchObject({ isError: false, value: { outcome: 'timed-out', failure: 'skill-timeout' } })
  expect(await act({ action: 'follow', observationId: await observation(), playerId: 'companion-uuid', waitForCompletion: true }))
    .toMatchObject({ isError: true })
  const asynchronous = await act({ action: 'goto', observationId: await observation(), x: 6, y: 64, z: 0 })
  expect(asynchronous).toMatchObject({ isError: false, value: { started: 'goto' } })
  expect(pathPending).toBe(true)
  const leaving = act({ action: 'goto', observationId: await observation(), x: 8, y: 64, z: 0, waitForCompletion: true })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(7) })
  await ctx.genesisMinecraft.disconnect(signal)
  expect(await leaving).toMatchObject({ isError: false, value: { outcome: 'interrupted' } })
})

it('dispatches a new task immediately after monitoring failed, and stops it visibly if the next request fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-retry-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  let status = 503
  let requests = 0
  const inputs: unknown[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    inputs.push(JSON.parse(Buffer.concat(chunks).toString()))
    requests++
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ answers: { urgent: { type: 'noul', noul: 0 }, attention: { type: 'noul', noul: 1 } } }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const { bot } = installBot()
  bot.lookAt = vi.fn().mockResolvedValue(undefined)
  // A solid gray JPEG replaces only the renderer; attachment storage and HTTP remain real.
  const image = Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYGBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAQABADASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AAA//2Q==', 'base64')
  vi.spyOn(MinecraftRuntime.prototype, 'capture').mockResolvedValue(image)
  const ctx = await boot(root)
  ctx.llm.registerAdapter(['fixture'], new Model())
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-retry-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `http://127.0.0.1:${address.port}/v1/systemone`, model: 'knowledge', threshold: 0.5 },
    writer: { kind: 'provider', provider: 'fixture', model: 'chat' } }, 0, signal)
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, jevEnabled: true, intervalMs: 60000 }), 0, signal)
  await ctx.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('connect'), arguments: { host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, agent, signal }).then((result) => { expect(result.isError).toBe(false) })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).monitor).toBe('failed') })
  expect(requests).toBe(1)
  status = 200
  const task = (id: string) => ctx.tools.execute({ name: 'minecraft_task', callId: ToolCallId(id), agent, signal,
    arguments: { action: 'start', goal: 'Look toward the nearby tree', timeoutMs: 10000, steps: [{ action: 'look', x: 1, y: 65, z: 0 }] } })
  expect(await task('retry-task')).toMatchObject({ isError: false, value: { phase: 'running' } })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ phase: 'completed', completedActions: 1 }) })
  expect(requests).toBe(2)
  const payload = z.object({ state: z.tuple([z.string(), z.string()]), assets: z.record(z.string(), z.object({
    type: z.literal('image'), format: z.literal('jpg'), data_base64: z.string(),
  })) }).parse(inputs[1])
  expect(payload.assets[payload.state[1]]?.data_base64).toBe(image.toString('base64'))
  expect(JSON.parse(payload.state[0])).toMatchObject({ task: { goal: 'Look toward the nearby tree' } })
  expect(bot.lookAt).toHaveBeenCalledTimes(1)
  expect((await ctx.genesisMinecraft.inspect(signal)).failure).toBeNull()
  status = 400
  expect(await task('failed-retry-task')).toMatchObject({ isError: false, value: { phase: 'running' } })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ phase: 'cancelled', reason: 'jev-http-400' }) })
  expect((await ctx.genesisMinecraft.inspect(signal))).toMatchObject({ monitor: 'failed', failure: 'jev-http-400' })
  expect(requests).toBe(3)
  expect(bot.lookAt).toHaveBeenCalledTimes(1)
  expect(agent.session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis-minecraft/jev') return []
    const data = z.object({ phase: z.string(), reason: z.string().optional() }).parse(record.data)
    return data.phase === 'failed' ? [data.reason] : []
  })).toEqual(['jev-http-503', 'jev-http-400'])
})

it('executes a bounded Jev tree plan while chatting, supports directional motion, and contains cancellation, timeouts and denied steps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-task-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  let urgent = false
  let admit = true
  const decisions: unknown[] = []
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    decisions.push(JSON.parse(Buffer.concat(chunks).toString()))
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ answers: { urgent: { type: 'noul', noul: urgent ? 1 : 0 }, attention: { type: 'noul', noul: admit ? 1 : 0 } } }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const { bot, emitter } = installBot()
  bot.entity.height = 1.8
  let completePath = () => {}
  let pathPending = false
  let rejectPath = (_error: Error) => {}
  const goto = vi.fn((goal: navigation.goals.Goal) => new Promise<void>((resolve, reject) => {
    rejectPath = reject; pathPending = true
    completePath = () => {
      if (goal instanceof navigation.goals.GoalBlock) bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
      pathPending = false; resolve()
    }
  }))
  Object.assign(bot.pathfinder, { goto })
  vi.mocked(bot.pathfinder.setGoal).mockImplementation((goal) => {
    if (goal === null && pathPending) { pathPending = false; rejectPath(new Error('path stopped')) }
  })
  bot.inventory.items = vi.fn(() => [{ name: 'iron_axe', count: 1 }] as ReturnType<Bot['inventory']['items']>)
  bot.equip = vi.fn().mockResolvedValue(undefined)
  bot.lookAt = vi.fn().mockResolvedValue(undefined)
  type Block = NonNullable<ReturnType<Bot['blockAt']>>
  const wood: Block[] = [64, 65].map(y => Object.assign({} as Block, { name: 'oak_log', position: new Vec3(1, y, -2), stateId: y,
    diggable: true, shapes: [[0, 0, 0, 1, 1, 1]], getProperties: () => ({ axis: 'y' }) }))
  const remaining = [...wood]
  bot.findBlocks = vi.fn<Bot['findBlocks']>(options => remaining.filter(block => typeof options.matching === 'function' && options.matching(block)).map(block => block.position))
  bot.blockAt = vi.fn<Bot['blockAt']>(position => remaining.find(block => block.position.equals(position))
    ?? { name: 'air', stateId: 0, diggable: false, position } as Block)
  bot.canDigBlock = vi.fn(() => true); bot.canSeeBlock = vi.fn(() => true)
  bot.blockAtCursor = vi.fn(() => remaining[0] ?? null)
  bot.world.raycast = vi.fn(() => remaining[0] === undefined ? null : ({ x: remaining[0].position.x, y: remaining[0].position.y, z: remaining[0].position.z, intersect: remaining[0].position.offset(0.5, 0.5, 0.5), face: 1 }))
  bot.dig = vi.fn(async (block: Block) => { remaining.splice(remaining.indexOf(block), 1) })
  const ctx = await boot(root)
  const model = new Model(); ctx.llm.registerAdapter(['fixture'], model)
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-task-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `http://127.0.0.1:${address.port}/v1/systemone`, model: 'knowledge', threshold: 0.5 },
    writer: { kind: 'provider', provider: 'fixture', model: 'chat' } }, 0, signal)
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, jevEnabled: false,
    intervalMs: 250, notificationIntervalMs: 1000 }), 0, signal)
  await ctx.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('connect'), arguments: { host: '127.0.0.1', port: 25565, username: 'Genesis', version: '' }, agent, signal }).then((result) => { expect(result.isError).toBe(false) })
  let count = 0
  const task = (args: object) => ctx.tools.execute({ name: 'minecraft_task', callId: ToolCallId(`task-${++count}`), arguments: args, agent, signal })
  const observe = async () => z.object({ observation: z.object({ id: z.string() }) }).parse((await ctx.tools.execute({
    name: 'minecraft_observe', callId: ToolCallId(`observe-${++count}`), arguments: {}, agent, signal })).value).observation.id
  const speechObservation = await observe()
  const firstTask = await task({ action: 'start', goal: 'Harvest this small tree', timeoutMs: 10000,
    steps: [{ action: 'move', direction: 'north', distance: 3 }, { action: 'equip', item: 'iron_axe' },
      { action: 'dig', blockName: 'oak_log', x: 1, y: 64, z: -2, matchRadius: 3, repeatUntilMissing: true, maxRepeats: 4 }] })
  expect(firstTask).toMatchObject({ isError: false, value: { phase: 'running' } })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(1) })
  expect(goto.mock.calls[0]![0]).toMatchObject({ x: 0, y: 64, z: -3 })
  const requestCount = model.requests.length
  emitter.emit('chat', 'Companion', 'Keep going while we talk.')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Are you still cutting the tree?' }] }))
  await vi.waitFor(() => { expect(model.requests.length).toBeGreaterThan(requestCount) })
  expect(await ctx.tools.execute({ name: 'minecraft_act', callId: ToolCallId('chat-while-task'), agent, signal,
    arguments: { action: 'chat', observationId: speechObservation, message: 'Yes, still working.' } })).toMatchObject({ isError: false })
  expect((await ctx.genesisMinecraft.inspect(signal)).task?.phase).toBe('running')
  expect(pathPending).toBe(true)
  completePath()
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ phase: 'completed', completedActions: 4 }) }, { timeout: 10000 })
  expect(bot.equip).toHaveBeenCalledWith(expect.objectContaining({ name: 'iron_axe' }), 'hand')
  expect(bot.dig).toHaveBeenCalledTimes(2)
  expect(remaining).toHaveLength(0)
  expect(JSON.stringify(decisions)).toContain('Harvest this small tree')
  expect(JSON.stringify(agent.session.ownEvents())).toContain('plugin:genesis-minecraft/task')

  await task({ action: 'start', goal: 'Move east', timeoutMs: 10000, steps: [{ action: 'move', direction: 'east', distance: 2 }] })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(2) })
  expect(await task({ action: 'cancel' })).toMatchObject({ isError: false, value: { phase: 'cancelled' } })
  await vi.waitFor(() => { expect(pathPending).toBe(false) })

  await task({ action: 'start', goal: 'Move west', timeoutMs: 10000, steps: [{ action: 'move', direction: 'west', distance: 2 }] })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(3) })
  expect(await ctx.tools.execute({ name: 'minecraft_act', callId: ToolCallId('main-interrupt'), agent, signal,
    arguments: { action: 'look', observationId: await observe(), x: 1, y: 65, z: 0, waitForCompletion: true } })).toMatchObject({ isError: false })
  expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ phase: 'cancelled', reason: 'replaced-by-main-model' })

  await task({ action: 'start', goal: 'Danger interrupts movement', timeoutMs: 10000, steps: [{ action: 'move', direction: 'east', distance: 2 }] })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(4) })
  urgent = true
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ phase: 'blocked', reason: 'jev-interrupted' }) })
  expect(pathPending).toBe(false)
  urgent = false; admit = false
  await task({ action: 'start', goal: 'A bounded wait', timeoutMs: 500, steps: [{ action: 'move', direction: 'east', distance: 2 }] })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task?.phase).toBe('timed-out') })
  admit = true
  const removeDenial = ctx.tools.guard(exec => exec.name === 'minecraft_act' && exec.callId.startsWith('minecraft-task-') ? 'Denied subordinate skill' : undefined)
  await task({ action: 'start', goal: 'Denied action', timeoutMs: 10000, steps: [{ action: 'move', direction: 'east', distance: 2 }] })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ phase: 'failed', reason: 'task-step-rejected' }) })
  expect(goto).toHaveBeenCalledTimes(4)
  removeDenial()
  bot.entity.yaw = -Math.PI / 2
  const startX = bot.entity.position.x
  await task({ action: 'start', goal: 'Exit interrupts movement', timeoutMs: 10000, steps: [{ action: 'move', direction: 'forward', distance: 2 }] })
  await vi.waitFor(() => { expect(goto).toHaveBeenCalledTimes(5) })
  expect(goto.mock.calls[4]![0]).toMatchObject({ x: startX + 2, z: -3 })
  await ctx.genesisMinecraft.disconnect(signal)
  expect(pathPending).toBe(false)
  expect((await ctx.genesisMinecraft.inspect(signal)).task?.phase).toBe('cancelled')
})

it('verifies collection through inventory, reports partial pickup failure, and returns stalled plans for replanning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-collection-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  let admit = true
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* Drain the bounded fixture request. */ }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ answers: { urgent: { type: 'noul', noul: 0 }, attention: { type: 'noul', noul: admit ? 1 : 0 } } }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  const { bot } = installBot()
  type Block = NonNullable<ReturnType<Bot['blockAt']>>
  const wood: Block[] = [0, 1, 2, 3].map(x => Object.assign({} as Block, { name: 'oak_log', position: new Vec3(x + 1, 64, -1), stateId: x + 1,
    diggable: true, shapes: [[0, 0, 0, 1, 1, 1]], getProperties: () => ({ axis: 'y' }) }))
  const remaining = [...wood]
  let logs = 0
  let pickups = 0
  let pickupLimit = Infinity
  let cursorMatches = true
  bot.registry = Object.assign({} as Bot['registry'], { itemsByName: { oak_log: { id: 1 } } })
  bot.inventory.items = vi.fn(() => logs === 0 ? [] : [{ name: 'oak_log', count: logs }] as ReturnType<Bot['inventory']['items']>)
  bot.findBlocks = vi.fn<Bot['findBlocks']>(options => remaining.filter(block => typeof options.matching === 'function' && options.matching(block))
    .slice(0, options.count).map(block => block.position))
  bot.blockAt = vi.fn<Bot['blockAt']>(position => remaining.find(block => block.position.equals(position)) ?? { name: 'air', stateId: 0, position } as Block)
  bot.blockAtCursor = vi.fn(() => cursorMatches ? remaining[0] ?? null : null)
  bot.world.raycast = vi.fn(() => remaining[0] === undefined ? null : ({ x: remaining[0].position.x, y: remaining[0].position.y, z: remaining[0].position.z, intersect: remaining[0].position.offset(0.5, 0.5, 0.5), face: 1 }))
  bot.canDigBlock = vi.fn(() => true); bot.canSeeBlock = vi.fn(() => true)
  bot.lookAt = vi.fn().mockResolvedValue(undefined)
  bot.dig = vi.fn(async (block: Block) => {
    remaining.splice(remaining.indexOf(block), 1)
    const drop = Object.assign(new EventEmitter(), { id: 100 + remaining.length, position: block.position.clone(), getDroppedItem: () => ({ name: 'oak_log' }) }) as Bot['entity']
    bot.entities[drop.id] = drop
    bot.emit('itemDrop', drop)
  })
  bot.pathfinder.goto = vi.fn(async (goal) => {
    if (goal instanceof navigation.goals.GoalFollow && pickups < pickupLimit) {
      pickups++; logs++; bot.entities = {}; bot.inventory.emit('updateSlot', 0, null, null)
    }
  })
  const ctx = await boot(root, { collectPickupTimeoutMs: 100, taskAdmissionLimit: 2 })
  const model = new Model(); ctx.llm.registerAdapter(['fixture'], model)
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-collection-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `http://127.0.0.1:${address.port}/v1/systemone`, model: 'knowledge', threshold: 0.5 },
    writer: { kind: 'provider', provider: 'fixture', model: 'chat' } }, 0, signal)
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, intervalMs: 250 }), 0, signal)
  expect(await ctx.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('connect'), arguments: { host: '127.0.0.1', username: 'Genesis' }, agent, signal }))
    .toMatchObject({ isError: false })
  const connectedInventoryListeners = bot.inventory.listenerCount('updateSlot')
  let sequence = 0
  const execute = (name: string, args: object) => ctx.tools.execute({ name, callId: ToolCallId(`collection-${++sequence}`), arguments: args, agent, signal })
  const observe = async () => z.object({ observation: z.object({ id: z.string(), supportedActions: z.array(z.string()),
    blocks: z.array(z.object({ name: z.string(), position: z.object({ x: z.number() }), visible: z.boolean(), withinReach: z.boolean() })) }) })
    .parse((await execute('minecraft_observe', { blockName: 'oak_log' })).value).observation
  const observed = await observe()
  expect(observed.supportedActions).toContain('collect')
  expect(observed.blocks[0]).toMatchObject({ name: 'oak_log', position: { x: 1 }, visible: true, withinReach: true })
  cursorMatches = false
  expect(await execute('minecraft_act', { action: 'dig', observationId: observed.id, x: 1, y: 64, z: -1, waitForCompletion: true }))
    .toMatchObject({ isError: false, value: { outcome: 'failed', failure: 'dig-aim-mismatch' } })
  expect(bot.dig).not.toHaveBeenCalled()
  cursorMatches = true
  expect(await execute('minecraft_task', { action: 'start', goal: 'Obtain two logs', timeoutMs: 10000,
    inventoryGoal: { item: 'oak_log', count: 2 }, steps: [{ action: 'collect', blockName: 'oak_log', item: 'oak_log', count: 2 }] }))
    .toMatchObject({ isError: false })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({
    phase: 'completed', reason: 'inventory-goal-reached', inventoryGoal: { current: 2, required: 2 },
    lastResult: { value: { collection: { gained: 2, minedBlocks: 2 } } },
  }) })
  expect(logs).toBe(2); expect(pickups).toBe(2); expect(remaining).toHaveLength(2)
  pickupLimit = 3; bot.entity.position = new Vec3(1, 64, 0)
  expect(await execute('minecraft_act', { action: 'collect', observationId: (await observe()).id,
    blockName: 'oak_log', item: 'oak_log', count: 2, waitForCompletion: true }))
    .toMatchObject({ isError: false, value: { outcome: 'failed', failure: 'collection-pickup-timeout',
      collection: { before: 2, current: 3, gained: 1, requested: 2, minedBlocks: 2 } } })
  expect(logs).toBe(3)
  expect(bot.inventory.listenerCount('updateSlot')).toBe(connectedInventoryListeners)
  expect(bot.listenerCount('itemDrop')).toBe(0)
  bot.entities = {}
  expect(await execute('minecraft_task', { action: 'start', goal: 'Obtain five logs', timeoutMs: 10000,
    inventoryGoal: { item: 'oak_log', count: 5 }, steps: [{ action: 'look', x: 1, y: 65, z: 0 }] }))
    .toMatchObject({ isError: false })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({
    phase: 'blocked', reason: 'inventory-goal-unmet', inventoryGoal: { current: 3, required: 5 },
  }) })
  admit = false
  expect(await execute('minecraft_task', { action: 'start', goal: 'A plan needing more evidence', timeoutMs: 10000,
    steps: [{ action: 'look', x: 1, y: 65, z: 0 }] })).toMatchObject({ isError: false })
  await vi.waitFor(async () => { expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({
    phase: 'blocked', reason: 'task-not-admitted', waitingDecisions: 2,
  }) })
  await vi.waitFor(() => { expect(JSON.stringify(model.requests)).toContain('submit a corrected bounded plan') })
  expect(agent.session.ownEvents().some((event) => {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis-minecraft/task') return false
    const data = z.object({ phase: z.string(), status: z.object({ reason: z.string().nullable() }) }).parse(record.data)
    return data.phase === 'end' && data.status.reason === 'inventory-goal-unmet'
  })).toBe(true)
  await ctx.genesisMinecraft.disconnect(signal)
})

it('admits a 120-second collection request within deployment bounds and explains rejected budgets without replacing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-budgets-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const server = createServer(async (req, res) => {
    for await (const _chunk of req) { /* Drain the bounded fixture request. */ }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ answers: { urgent: { type: 'noul', noul: 0 }, attention: { type: 'noul', noul: 0 } } }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  cleanup.push(() => new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing fixture listener')
  installBot()
  const ctx = await boot(root, { taskStepLimit: 2, taskRepeatLimit: 2, inputChars: 8000 })
  ctx.llm.registerAdapter(['fixture'], new Model())
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-budget-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisStatus.saveModels({ decision: { kind: 'jev', url: `http://127.0.0.1:${address.port}/v1/systemone`, model: 'knowledge', threshold: 0.5 },
    writer: { kind: 'provider', provider: 'fixture', model: 'chat' } }, 0, signal)
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, intervalMs: 60000 }), 0, signal)
  expect(await ctx.tools.execute({ name: 'minecraft_connect', callId: ToolCallId('connect'), agent, signal,
    arguments: { host: '127.0.0.1', username: 'Genesis' } })).toMatchObject({ isError: false })
  let sequence = 0
  const task = (args: object) => ctx.tools.execute({ name: 'minecraft_task', callId: ToolCallId(`budget-${++sequence}`), agent, signal, arguments: args })
  const request = { action: 'start', goal: '再砍一棵金合欢树的木头收进背包',
    instructions: '找到附近最近的一棵金合欢树，先清掉挡路的叶子，再把树干砍下来，木头要真的进背包。',
    steps: [{ action: 'collect', blockName: 'acacia_log', count: 4, item: 'acacia_log' }], timeoutMs: 120000 }
  const admitted = await task(request)
  expect(admitted).toMatchObject({ isError: false, value: { phase: 'running', budget: {
    requestedTimeoutMs: 120000, timeoutMs: 60000, timeoutLimitMs: 60000, stepLimit: 2, repeatLimit: 2, planCharsLimit: 4000,
  } } })
  const active = (await ctx.genesisMinecraft.inspect(signal)).task
  const tooManySteps = await task({ ...request, steps: Array.from({ length: 3 }, () => ({ action: 'look', x: 0, y: 65, z: 0 })) })
  expect(tooManySteps.isError).toBe(true)
  expect(JSON.stringify(tooManySteps)).toContain('Task has 3 steps; the limit is 2. Submit fewer steps.')
  const tooManyRepeats = await task({ ...request, steps: [{ action: 'dig', blockName: 'acacia_log', repeatUntilMissing: true, maxRepeats: 3 }] })
  expect(tooManyRepeats.isError).toBe(true)
  expect(JSON.stringify(tooManyRepeats)).toContain('maxRepeats=3; the limit is 2. Reduce maxRepeats.')
  const tooLarge = await task({ ...request, instructions: '续'.repeat(2000), steps: Array.from({ length: 2 }, () => ({
    action: 'dig', blockName: 'acacia_log', blockProperties: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`property_${index}`, 'x'.repeat(100)])),
  })) })
  expect(tooLarge.isError).toBe(true)
  expect(JSON.stringify(tooLarge)).toContain('the limit is 4000. Shorten the goal, instructions or steps.')
  expect((await ctx.genesisMinecraft.inspect(signal)).task).toMatchObject({ id: active?.id, phase: 'running', deadline: active?.deadline })
  expect(await task({ action: 'inspect' })).toMatchObject({ isError: false, value: { budget: { requestedTimeoutMs: 120000, timeoutMs: 60000 } } })
  const starts = agent.session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis-minecraft/task') return []
    const data = z.object({ phase: z.string(), plan: z.object({ timeoutMs: z.number() }).optional(),
      status: z.object({ budget: z.object({ requestedTimeoutMs: z.number(), timeoutMs: z.number() }).optional() }) }).parse(record.data)
    return data.phase === 'start' ? [data] : []
  })
  expect(starts).toHaveLength(1)
  expect(starts[0]).toMatchObject({ plan: { timeoutMs: 60000 }, status: { budget: { requestedTimeoutMs: 120000, timeoutMs: 60000 } } })
  await task({ action: 'cancel' })
  await ctx.genesisMinecraft.disconnect(signal)
})

it('runs conditional multi-step scripts through the real Node runtime, guards each action and stops a CPU loop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-script-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { bot } = installBot()
  type Block = NonNullable<ReturnType<Bot['blockAt']>>
  const remaining: Block[] = [
    { name: 'acacia_leaves', position: new Vec3(1, 65, 0) },
    { name: 'acacia_log', position: new Vec3(2, 64, 0) },
    { name: 'acacia_log', position: new Vec3(2, 65, 0) },
    { name: 'oak_log', position: new Vec3(3, 64, 0) },
  ].map((block, index) => Object.assign({} as Block, { ...block, stateId: index + 1, diggable: true,
    shapes: [[0, 0, 0, 1, 1, 1]], getProperties: () => ({ axis: 'y' }) }))
  let aimed: Block | undefined
  let logs = 0
  bot.findBlocks = vi.fn<Bot['findBlocks']>(options => remaining.filter(block => typeof options.matching === 'function' && options.matching(block))
    .slice(0, options.count).map(block => block.position))
  bot.blockAt = vi.fn<Bot['blockAt']>(position => remaining.find(block => block.position.equals(position))
    ?? { name: 'air', stateId: 0, diggable: false, position } as Block)
  bot.world.raycast = vi.fn((eye, direction) => {
    aimed = remaining.find((block) => {
      const relative = block.position.offset(0.5, 0.5, 0.5).minus(eye)
      return relative.cross(direction).norm() < 0.6
    })
    return aimed === undefined ? null : { x: aimed.position.x, y: aimed.position.y, z: aimed.position.z,
      intersect: aimed.position.offset(0.5, 0.5, 0.5), face: 1 }
  })
  bot.blockAtCursor = vi.fn(() => aimed ?? null)
  bot.canDigBlock = vi.fn(() => true); bot.canSeeBlock = vi.fn(block => block.name !== 'oak_log')
  bot.lookAt = vi.fn().mockResolvedValue(undefined)
  bot.registry = Object.assign({} as Bot['registry'], { itemsByName: { acacia_log: { id: 1 } } })
  bot.inventory.items = vi.fn(() => logs === 0 ? [] : [{ name: 'acacia_log', count: logs }] as ReturnType<Bot['inventory']['items']>)
  bot.dig = vi.fn(async (block: Block) => {
    remaining.splice(remaining.indexOf(block), 1)
    if (block.name !== 'acacia_log') return
    const drop = Object.assign(new EventEmitter(), { id: 100 + remaining.length, position: block.position.clone(),
      getDroppedItem: () => ({ name: 'acacia_log' }) }) as Bot['entity']
    bot.entities[drop.id] = drop; bot.emit('itemDrop', drop)
  })
  bot.pathfinder.goto = vi.fn(async (goal) => {
    if (goal instanceof navigation.goals.GoalFollow) { logs++; bot.entities = {}; bot.inventory.emit('updateSlot', 0, null, null) }
  })
  const ctx = await boot(root, { scriptCallLimit: 16 }, true)
  ctx.llm.registerAdapter(['fixture'], new Model())
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-script-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, jevEnabled: false, intervalMs: 60000 }), 0, signal)
  let sequence = 0
  const execute = (name: string, args: object) => ctx.tools.execute({ name, callId: ToolCallId(`script-test-${++sequence}`), arguments: args, agent, signal })
  expect(await execute('minecraft_connect', { host: '127.0.0.1', username: 'Genesis' })).toMatchObject({ isError: false })
  expect(await execute('minecraft_find_blocks', { blockName: 'log', visible: true, withinReach: true, blockProperties: { axis: 'y' } }))
    .toMatchObject({ isError: false, value: { blocks: [{ name: 'acacia_log' }, { name: 'acacia_log' }] } })
  expect(await execute('minecraft_find_blocks', { x: 3, y: 64, z: 0 })).toMatchObject({ isError: false, value: { blocks: [{ name: 'oak_log' }] } })
  expect(await execute('minecraft_find_blocks', { x: 3 })).toMatchObject({ isError: true })
  const program = await execute('minecraft_script', { timeoutMs: 120000, code: `
    const sources = await mc.findBlocks({ blockName: 'acacia_log', blockProperties: { axis: 'y' }, visible: true, maxDistance: 8 });
    if (sources.blocks.length < 2) throw new Error('Not enough wood');
    const leaves = await mc.findBlocks({ blockName: 'acacia_leaves', withinReach: true });
    if (leaves.blocks.length) {
      const cleared = await mc.act({ action: 'dig', blockName: 'acacia_leaves', withinReach: true });
      if (cleared.outcome !== 'completed') throw new Error('Leaves still obstruct the tree');
    }
    for (let n = 0; n < 2; n++) {
      const result = await mc.act({ action: 'collect', blockName: 'acacia_log', item: 'acacia_log', count: 1 });
      if (result.outcome !== 'completed') return result;
    }
    const state = await mc.observe();
    return { logs: state.inventory.find(stack => stack.name === 'acacia_log').count };
  ` })
  expect(program).toMatchObject({ isError: false, value: { outcome: 'completed', budget: { requestedTimeoutMs: 120000, timeoutMs: 60000 }, result: { value: { logs: 2 } } } })
  expect(logs).toBe(2)
  expect(remaining.map(block => block.name)).toEqual(['oak_log'])
  expect(bot.dig).toHaveBeenCalledTimes(3)
  const records = agent.session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:genesis-minecraft/script' ? [record.data] : []
  })
  expect(records).toContainEqual(expect.objectContaining({ phase: 'start', data: expect.objectContaining({ code: expect.stringContaining('mc.findBlocks') }) }))
  expect(records).toContainEqual(expect.objectContaining({ phase: 'call', data: expect.objectContaining({ name: 'minecraft_act' }) }))
  expect(records).toContainEqual(expect.objectContaining({ phase: 'end', data: expect.objectContaining({ outcome: 'completed' }) }))

  const removeDenial = ctx.tools.guard(exec => exec.name === 'minecraft_act' && exec.callId.startsWith('minecraft-script-') ? 'Denied scripted game action' : undefined)
  const denied = await execute('minecraft_script', { code: 'await mc.act({ action: \'look\', x: 1, y: 65, z: 0 });' })
  expect(denied).toMatchObject({ isError: false, value: { outcome: 'failed', result: { error: { message: expect.stringContaining('Denied scripted game action') } } } })
  expect(bot.lookAt).toHaveBeenCalledTimes(3)
  removeDenial()
  expect(await execute('minecraft_script', { code: 'for (let i = 0; i < 20; i++) await mc.findBlocks({});' }))
    .toMatchObject({ isError: false, value: { outcome: 'failed', calls: 16, result: { error: { message: expect.stringContaining('script-call-limit') } } } })

  let entered = false
  const removeProbe = ctx.tools.guard((exec) => { if (exec.name === 'minecraft_find_blocks' && exec.callId.startsWith('minecraft-script-')) entered = true })
  const looping = execute('minecraft_script', { code: 'await mc.findBlocks({ blockName: "oak_log" }); while (true) {}' })
  await vi.waitFor(() => { expect(entered).toBe(true) }, { timeout: 10000 })
  expect(await execute('minecraft_stop', {})).toMatchObject({ isError: false })
  expect(await looping).toMatchObject({ isError: false, value: { outcome: 'interrupted' } })
  removeProbe()
  const timeout = await execute('minecraft_script', { timeoutMs: 2000, code: 'while (true) {}' })
  expect(timeout).toMatchObject({ isError: false, value: { outcome: 'timed-out' } })
  expect(await execute('minecraft_script', { code: 'return (await mc.findBlocks({ blockName: "oak_log" })).blocks.length;' }))
    .toMatchObject({ isError: false, value: { outcome: 'completed', result: { value: 1 } } })
}, 30000)

it('keeps event scripts idle without a lifetime deadline, retains state, uses items/blocks/entities and drains subscriptions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-minecraft-events-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { bot, emitter } = installBot()
  type Block = NonNullable<ReturnType<Bot['blockAt']>>
  const lever = Object.assign({} as Block, { name: 'lever', stateId: 7, diggable: true, position: new Vec3(2, 64, 0),
    getProperties: () => ({ powered: false }) })
  bot.findBlocks = vi.fn<Bot['findBlocks']>(options => typeof options.matching === 'function' && options.matching(lever) ? [lever.position] : [])
  bot.blockAt = vi.fn(() => lever); bot.canSeeBlock = vi.fn(() => true); bot.canDigBlock = vi.fn(() => true)
  bot.activateBlock = vi.fn().mockResolvedValue(undefined)
  bot.activateEntity = vi.fn().mockResolvedValue(undefined)
  bot.activateItem = vi.fn(); bot.lookAt = vi.fn().mockResolvedValue(undefined)
  const item = Object.assign({} as NonNullable<Bot['heldItem']>, { name: 'bow', count: 1 })
  Object.defineProperty(bot, 'heldItem', { configurable: true, value: item })
  bot.inventory.items = vi.fn(() => [item])
  bot.equip = vi.fn().mockResolvedValue(undefined)
  const cow = Object.assign(new EventEmitter(), { id: 8, name: 'cow', position: new Vec3(1, 64, 1) }) as Bot['entity']
  bot.entities[cow.id] = cow
  const inventoryListeners = bot.inventory.listenerCount('updateSlot')
  const blockListeners = bot.listenerCount('blockUpdate')
  const ctx = await boot(root, { scriptCallLimit: 4, scriptTickMs: 250, scriptEventQueueLimit: 2, useHoldMs: 10, useHoldLimitMs: 1000 }, true)
  ctx.llm.registerAdapter(['fixture'], new Model())
  const agent = (await ctx.agents.create({ sessionId: SessionId('minecraft-event-life'), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (child) => { await ctx.agentPresets.mount(child, 'life') } })).agent
  const signal = new AbortController().signal
  await ctx.genesisMinecraft.save(settingsSchema.parse({ enabled: true, vision: false, jevEnabled: false, intervalMs: 60000 }), 0, signal)
  let sequence = 0
  const execute = (name: string, args: object) => ctx.tools.execute({ name, callId: ToolCallId(`event-test-${++sequence}`), arguments: args, agent, signal })
  expect(await execute('minecraft_connect', { host: '127.0.0.1', username: 'Genesis' })).toMatchObject({ isError: false })
  const inspect = () => execute('minecraft_script', { action: 'inspect' })
  const idle = () => vi.waitFor(async () => { expect(await inspect()).toMatchObject({ value: { outcome: 'running', waitingForEvent: true } }) }, { timeout: 10000 })
  const start = await execute('minecraft_script', { mode: 'event', timeoutMs: 2000, code: `
    let seen = 0;
    mc.on('chat', async event => {
      if (event.message === 'exit') mc.exit({ seen });
      seen++;
      if (event.message === 'lever') {
        await mc.act({ action: 'use', blockName: 'lever', visible: true });
      } else {
        await mc.act({ action: 'chat', message: 'Seen ' + seen });
      }
    });
  ` })
  expect(start).toMatchObject({ isError: false, value: { outcome: 'running', mode: 'event', budget: { timeoutMs: null, handlerTimeoutMs: 2000 } } })
  await idle()
  // The resident remains idle beyond its active-handler deadline.
  const deadline = Date.now() + 2100
  await vi.waitFor(() => { expect(Date.now()).toBeGreaterThan(deadline) }, { timeout: 10000 })
  await idle()
  emitter.emit('chat', 'Companion', 'hello')
  await vi.waitFor(() => { expect(bot.chat).toHaveBeenCalledWith('Seen 1') })
  await idle()
  emitter.emit('whisper', 'Companion', 'lever')
  await vi.waitFor(() => { expect(bot.activateBlock).toHaveBeenCalledWith(lever, new Vec3(0, 1, 0)) })
  await idle()
  emitter.emit('chat', 'Companion', 'third')
  await vi.waitFor(() => { expect(bot.chat).toHaveBeenCalledWith('Seen 3') })
  await idle()
  // Three handlers exceed the per-handler four-call limit cumulatively without exhausting it.
  emitter.emit('chat', 'Companion', 'exit')
  await vi.waitFor(async () => { expect(await inspect()).toMatchObject({ isError: false, value: {
    outcome: 'completed', mode: 'event', calls: 6, events: 4, result: { value: { seen: 3 } },
  } }) })
  const events = agent.session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    if (record?.type !== 'plugin:genesis-minecraft/script') return []
    const parsed = z.object({ phase: z.string(), data: z.json() }).parse(record.data)
    return parsed.phase === 'event' ? [parsed.data] : []
  })
  expect(events).toContainEqual(expect.objectContaining({ type: 'chat', channel: 'whisper', message: 'lever' }))
  expect(bot.chat).not.toHaveBeenCalledWith('lever')

  const act = async (args: object) => {
    const observed = z.object({ observationId: z.string() }).parse((await execute('minecraft_find_blocks', { limit: 1 })).value)
    return execute('minecraft_act', { ...args, observationId: observed.observationId, waitForCompletion: true })
  }
  expect(await act({ action: 'use', useTarget: 'item', item: 'bow', durationMs: 10 })).toMatchObject({ value: { outcome: 'completed' } })
  expect(bot.equip).toHaveBeenCalledWith(item, 'hand')
  expect(bot.activateItem).toHaveBeenCalledTimes(1)
  expect(await act({ action: 'use', entityId: cow.id })).toMatchObject({ value: { outcome: 'completed' } })
  expect(bot.activateEntity).toHaveBeenCalledWith(cow)
  expect(await act({ action: 'use', useTarget: 'block', x: 2, y: 64, z: 0 })).toMatchObject({ value: { outcome: 'completed' } })
  const activated = vi.mocked(bot.activateItem).mock.calls.length
  expect(await act({ action: 'use', durationMs: 1001 })).toMatchObject({ value: { outcome: 'failed', failure: 'use-duration-limit' } })
  expect(bot.activateItem).toHaveBeenCalledTimes(activated)
  const holding = act({ action: 'use', durationMs: 1000 })
  await vi.waitFor(() => { expect(bot.activateItem).toHaveBeenCalledTimes(activated + 1) })
  expect(await execute('minecraft_stop', {})).toMatchObject({ isError: false })
  expect(await holding).toMatchObject({ value: { outcome: 'interrupted' } })
  expect(bot.deactivateItem).toHaveBeenCalled()

  expect(await execute('minecraft_script', { mode: 'event', timeoutMs: 1000, code: 'mc.on(\'tick\', () => { while (true) {} });' }))
    .toMatchObject({ value: { outcome: 'running' } })
  await vi.waitFor(async () => { expect(await inspect()).toMatchObject({ value: { outcome: 'timed-out' } }) }, { timeout: 10000 })
  let release = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  vi.mocked(bot.lookAt).mockImplementationOnce(() => gate)
  expect(await execute('minecraft_script', { mode: 'event', code: `
    let omitted = 0;
    mc.on('chat', async event => {
      omitted += event.omitted;
      if (event.message === 'hold') await mc.act({ action: 'look', x: 1, y: 65, z: 0 });
      if (event.message === 'end') mc.exit({ omitted });
    });
  ` })).toMatchObject({ value: { outcome: 'running' } })
  await idle()
  const previousLooks = vi.mocked(bot.lookAt).mock.calls.length
  emitter.emit('chat', 'Companion', 'hold')
  await vi.waitFor(() => { expect(bot.lookAt).toHaveBeenCalledTimes(previousLooks + 1) })
  emitter.emit('chat', 'Companion', 'discarded')
  emitter.emit('chat', 'Companion', 'retained')
  emitter.emit('chat', 'Companion', 'end')
  expect(await inspect()).toMatchObject({ value: { queuedEvents: 2 } })
  release()
  await vi.waitFor(async () => { expect(await inspect()).toMatchObject({ value: {
    outcome: 'completed', events: 3, result: { value: { omitted: 1 } },
  } }) })
  expect(await execute('minecraft_script', { mode: 'event', code: 'mc.on(\'blockUpdate\', () => {}); mc.on(\'inventory\', () => {});' }))
    .toMatchObject({ value: { outcome: 'running' } })
  await idle()
  bot.emit('blockUpdate', lever, lever)
  bot.inventory.emit('updateSlot', 0, null, null)
  await vi.waitFor(async () => { expect(await inspect()).toMatchObject({ value: { events: 2, waitingForEvent: true } }) })
  expect(await execute('minecraft_script', { action: 'stop' })).toMatchObject({ value: { outcome: 'interrupted' } })
  const before = vi.mocked(bot.chat).mock.calls.length
  emitter.emit('chat', 'Companion', 'after stop')
  expect(bot.chat).toHaveBeenCalledTimes(before)
  expect(await execute('minecraft_script', { mode: 'event', code: 'mc.on(\'chat\', () => {});' })).toMatchObject({ value: { outcome: 'running' } })
  await idle()
  await ctx.genesisMinecraft.disconnect(signal)
  expect(agent.session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:genesis-minecraft/script' ? [record.data] : []
  })).toContainEqual(expect.objectContaining({ phase: 'end', data: expect.objectContaining({ outcome: 'interrupted' }) }))
  expect(bot.inventory.listenerCount('updateSlot')).toBe(inventoryListeners)
  expect(bot.listenerCount('blockUpdate')).toBe(blockListeners)
  const toolRegistry = ctx.tools
  await ctx.fiber.dispose()
  expect(toolRegistry.get('minecraft_script')).toBeUndefined()
}, 30000)
