/** Real Loader and logged tool flow against a private loopback webhook. @module */
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, createUserMessage, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { personSourceSchema, qqPersonId } from '@deepseek-ai/dsh-experimental-genesis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '../src/index.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Punishment fixture cleanup failed')
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-punishment-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function webhook() {
  const requests: Array<{ body: string; authorization: string | undefined; method: string | undefined }> = []
  let status = 204
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    requests.push({ body: Buffer.concat(chunks).toString(), authorization: req.headers.authorization, method: req.method })
    res.writeHead(status, { Location: '/must-not-follow', 'Content-Type': 'text/plain' })
    res.end('private receiver details')
  })
  cleanup.push(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeAllConnections()
  }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing webhook listener')
  return { url: `http://127.0.0.1:${address.port}/private-token`, requests, status: (value: number) => { status = value } }
}
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  punish = false
  enableToolkit = false
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.punish || this.enableToolkit) {
      const name = this.enableToolkit ? 'genesis_toolkit' : 'genesis_punish'
      const args = JSON.stringify(this.enableToolkit ? { action: 'enable', id: 'punishment' } : { level: 2.5 })
      if (this.enableToolkit) this.enableToolkit = false
      else this.punish = false
      const id = ToolCallId(`punishment-model-${this.requests.length}`)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = 'Webhook result received.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function boot(root: string, webhookUrl: string, enabled = true) {
  const path = join(root, 'cordis.yml')
  await writeFile(
    path,
    JSON.stringify([
      { name: '@deepseek-ai/dsh-llm' },
      { name: '@deepseek-ai/dsh-session' },
      { name: '@deepseek-ai/dsh-session-projection' },
      { name: '@deepseek-ai/dsh-system-prompt' },
      { name: '@deepseek-ai/dsh-tools' },
      { name: '@deepseek-ai/dsh-tool-executor-native' },
      { name: '@deepseek-ai/dsh-agent' },
      { name: '@deepseek-ai/dsh-storage' },
      { name: '@deepseek-ai/dsh-storage-json', config: { root } },
      { name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
      { name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: root } },
      { name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'life' } },
      { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'life', plugins: [] } },
      {
        name: '@deepseek-ai/dsh-experimental-genesis',
        config: {
          leasePath: join(root, 'life.lock'),
          awakening: { provider: 'fixture', model: 'chat', lifePreset: 'life' },
          memory: {
            decisionProvider: 'fixture',
            decisionModel: 'decision',
            writerProvider: 'fixture',
            writerModel: 'writer',
            associationLimit: 0,
            maxRetries: 0,
            consolidation: { enabled: false },
          },
        },
      },
      { name: '@deepseek-ai/dsh-genesis-punishment', config: { enabled, webhookUrl, description: 'Custom punishment scale: any finite level.', levelDescription: 'Custom scale', webhookHeaders: { Authorization: 'Bearer fixture-secret' } } },
      { name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
    ]),
  )
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = undefined
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  if ((await ctx.genesis.snapshot()).identity.name === null) await ctx.genesis.awaken('Webhook test')
  const model = new Model()
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = (
    await ctx.agents.create({
      sessionId: SessionId('punishment-operator'),
      agentOptions: { provider: 'fixture', model: 'chat' },
      setup: async (agentCtx) => {
        await ctx.agentPresets.mount(agentCtx, 'life')
      },
    })
  ).agent
  return { ctx, model, agent }
}
async function invoke(runtime: Awaited<ReturnType<typeof boot>>, name: string, args: object, agent = runtime.agent) {
  const signal = new AbortController().signal
  const toolSet = await runtime.ctx.tools.resolve({ agent, modelSelection: { provider: 'fixture', model: 'chat' }, signal })
  try {
    return await executeToolFixture(runtime.ctx, {
      callId: ToolCallId(randomUUID()), name, arguments: args, agent, toolSet, signal,
    })
  } finally { toolSet.dispose() }
}
async function teach(runtime: Awaited<ReturnType<typeof boot>>) {
  await runtime.ctx.genesis.learn('genesis_punish', runtime.agent.id)
  const result = await invoke(runtime, 'genesis_toolkit', { action: 'enable', id: 'punishment' })
  expect(result.isError, JSON.stringify(result)).toBe(false)
}

it('delivers arbitrary finite levels through the logged model loop and enforces operator access', async () => {
  const receiver = await webhook()
  const runtime = await boot(await directory(), receiver.url)
  const { ctx, agent, model } = runtime
  expect(receiver.requests).toEqual([])
  await teach(runtime)
  model.punish = true
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Send the agreed level.' }] }))
  await agent.whenIdle()
  expect(receiver.requests).toEqual([{ body: '{"level":2.5}', authorization: 'Bearer fixture-secret', method: 'POST' }])
  const events = JSON.stringify(agent.session.ownEvents())
  const result = agent.session.ownEvents().find(event => event.type === 'tool/result')
  expect(result?.type === 'tool/result' && result.data.message.content).toEqual([{ type: 'text', text: '{"accepted":true,"level":2.5,"status":204}' }])
  expect(events).toContain('Custom punishment scale')
  expect(JSON.stringify(model.requests)).toContain('Custom punishment scale')
  expect(events).not.toContain('private-token')
  expect(events).not.toContain('fixture-secret')
  expect((await invoke(runtime, 'genesis_punish', { level: -3 })).isError).toBe(false)
  expect(receiver.requests.at(-1)?.body).toBe('{"level":-3}')
  const outsider = (await ctx.agents.create({ sessionId: SessionId('outsider'), agentOptions: { provider: 'fixture', model: 'chat' } })).agent
  expect((await invoke(runtime, 'genesis_punish', { level: 0.5 }, outsider)).isError).toBe(true)
  expect(receiver.requests).toHaveLength(2)
  const entry = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-genesis-punishment')
  expect(entry?.fiber).toBeDefined()
  await entry?.fiber?.dispose()
  expect(ctx.tools.schemas().some(tool => tool.name === 'genesis_punish')).toBe(false)
})
it('reports rejection and redirects without exposing secrets or repeating delivery', async () => {
  const receiver = await webhook()
  const runtime = await boot(await directory(), receiver.url)
  await teach(runtime)
  for (const status of [500, 302]) {
    receiver.status(status)
    const result = await invoke(runtime, 'genesis_punish', { level: 0.25 })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain(`HTTP ${status}`)
    expect(JSON.stringify(result)).not.toContain('private receiver details')
    expect(JSON.stringify(result)).not.toContain('private-token')
  }
  expect(receiver.requests).toHaveLength(2)
})

it('loads disabled without a destination and applies UI-style live edits without dispatch at save', async () => {
  const receiver = await webhook()
  const runtime = await boot(await directory(), '', false)
  const { ctx, agent } = runtime
  const entry = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-genesis-punishment')
  if (!entry) throw new Error('Missing punishment entry')
  const fiber = entry.fiber
  const update = async (patch: object) => {
    await entry.update({ config: { ...entry.options.config, ...patch } })
    await ctx.loader.await()
  }
  expect((await invoke(runtime, 'genesis_punish', { level: 0.5 })).isError).toBe(true)
  await update({ webhookUrl: receiver.url, enabled: true, description: 'Live operator rules', levelDescription: 'Live level scale' })
  expect(entry.fiber).toBe(fiber)
  expect(receiver.requests).toEqual([])
  await teach(runtime)
  const schema = ctx.tools.schemas().find(tool => tool.name === 'genesis_punish')
  expect(schema?.description).toBe('Live operator rules')
  expect(JSON.stringify(schema)).toContain('Live level scale')
  expect((await invoke(runtime, 'genesis_punish', { level: 4 })).isError).toBe(false)
  await update({ enabled: false })
  expect((await executeToolFixture(ctx, { callId: ToolCallId('disabled-direct'), name: 'genesis_punish',
    arguments: { level: 1 }, agent, signal: new AbortController().signal })).isError).toBe(true)
  expect(receiver.requests).toHaveLength(1)
})

it('admits learned tools in authenticated groups only while group access is enabled', async () => {
  const receiver = await webhook()
  const runtime = await boot(await directory(), receiver.url)
  const { ctx, model } = runtime
  await teach(runtime)
  const source = personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq',
    personId: qqPersonId('12345'), accountId: '12345', name: 'Group member',
    conversationId: 'qq:group:11111:67890', messageId: 'group-1' })
  const sessionId = SessionId('punishment-group')
  await ctx.genesis.bindConversation({ id: source.conversationId, kind: 'group', sessionId })
  const group = (await ctx.agents.create({ sessionId, agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'life') } })).agent
  const send = async (messageId: string) => {
    group.followup(createUserMessage({ source: { ...source, messageId }, content: [{ type: 'text', text: 'Use the agreed punishment rule.' }] }))
    await group.whenIdle()
  }
  model.punish = true
  await send('group-1')
  expect(receiver.requests).toHaveLength(0)
  const entry = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-genesis-punishment')
  if (!entry) throw new Error('Missing punishment entry')
  await entry.update({ config: { ...entry.options.config, allowGroupChats: true } })
  await ctx.loader.await()
  expect(receiver.requests).toHaveLength(0)
  model.enableToolkit = true
  model.punish = true
  await send('group-2')
  const results = group.session.ownEvents().filter(event => event.type === 'tool/result')
  expect(receiver.requests, JSON.stringify(results)).toHaveLength(1)
  expect(receiver.requests[0]?.body).toBe('{"level":2.5}')
  await entry.update({ config: { ...entry.options.config, allowGroupChats: false } })
  await ctx.loader.await()
  model.punish = true
  await send('group-3')
  expect(receiver.requests).toHaveLength(1)
})
