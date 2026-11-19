/** Loader/Agent Loop verification of logged screen observations and durable learning. @module */
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, createUserMessage, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand'
import { ScreenCaptureError, type ScreenCaptureSource } from '@deepseek-ai/dsh-computer-use'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '../src/index.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try { await close() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Vision fixture cleanup failed')
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-vision-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  imageInput = true
  observe = false
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model, inputModalities: this.imageInput ? ['text' as const, 'image' as const] : ['text' as const] }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.observe) {
      this.observe = false
      const id = ToolCallId('observe-screen')
      const args = JSON.stringify({ seconds: 0 })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'see_now', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'see_now', arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = 'Screen observation received.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function boot(root: string) {
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
      { name: '@deepseek-ai/dsh-computer-use' },
      { name: '@deepseek-ai/dsh-attachment-local', config: { dshHome: root } },
      { name: '@deepseek-ai/dsh-genesis-see-now', config: { seconds: 0 } },
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
  if ((await ctx.genesis.snapshot()).identity.name === null) await ctx.genesis.awaken('视觉测试')
  const model = new Model()
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = (
    await ctx.agents.create({
      sessionId: SessionId('vision-operator'),
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
  await runtime.ctx.genesis.learn('see_now', runtime.agent.id)
  const result = await invoke(runtime, 'genesis_toolkit', { action: 'enable', id: 'vision' })
  expect(result.isError, JSON.stringify(result)).toBe(false)
}
async function png() {
  return sharp({ create: { width: 320, height: 180, channels: 3, background: '#2468ac' } }).png().toBuffer()
}
it('logs a screen image through the real loop and restores identity, learning and growth without capturing on restart', async () => {
  const root = await directory()
  const runtime = await boot(root)
  const { ctx, agent, model } = runtime
  const bytes = await png()
  let samples = 0
  const disposeSource = ctx.computerUse.registerCapture({ name: ComputerUseProviderName('host-desktop'),
    async capture(owner) { expect(owner).toBe(agent.id); samples++; return { png: bytes, capturedAt: '2026-11-15T08:00:00.000Z' } } })
  await teach(runtime)
  model.observe = true
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '看看自己的屏幕' }] }))
  await agent.whenIdle()
  expect(samples).toBe(1)
  const result = agent.session.ownEvents().find(event => event.type === 'tool/result')
  expect(JSON.stringify(result)).toContain('host-desktop')
  expect(JSON.stringify(result)).toContain('attachmentId')
  expect(JSON.stringify(model.requests.filter(request => request.model === 'chat').at(-1))).toContain('attachmentId')
  expect(JSON.stringify(model.requests.filter(request => request.model === 'chat').at(-1))).toContain('untrusted-screen-observation')
  const saved = await ctx.genesis.snapshot()
  expect(saved.growth.some(record => JSON.stringify(record).includes('genesis-see-now:host-desktop'))).toBe(true)
  await disposeSource()
  const lost = await invoke(runtime, 'see_now', { seconds: 0 })
  expect(lost.isError).toBe(true)
  expect(JSON.stringify(lost)).toContain('unavailable')
  await ctx.fiber.dispose()
  const restarted = await boot(root)
  expect((await restarted.ctx.genesis.snapshot()).identity).toEqual(saved.identity)
  expect(restarted.ctx.genesis.learningStatus().tools).toContain('see_now')
  expect(samples).toBe(1)
  expect(restarted.ctx.computerUse.captureSources()).toEqual([])
  expect((await restarted.ctx.genesis.snapshot()).growth.some(record => JSON.stringify(record).includes('disconnected'))).toBe(true)
})
it('enforces source grants and model support without silently substituting a source', async () => {
  const runtime = await boot(await directory())
  await teach(runtime)
  let calls = 0
  const custom: ScreenCaptureSource = {
    name: ComputerUseProviderName('future-pet-screen'),
    async capture(owner) {
      expect(owner).toBe(runtime.agent.id)
      calls++
      throw new ScreenCaptureError('capture-failed', 'Sharing was revoked. Reconnect the selected source.')
    },
  }
  runtime.ctx.computerUse.registerCapture(custom)
  const status = await invoke(runtime, 'see_now', { action: 'status' })
  expect(JSON.stringify(status)).toContain('future-pet-screen')
  expect(calls).toBe(0)
  const missing = await invoke(runtime, 'see_now', { seconds: 0 })
  expect(missing.isError).toBe(true)
  expect(calls).toBe(0)
  const denied = await invoke(runtime, 'see_now', { source: 'future-pet-screen', seconds: 0 })
  expect(denied.isError).toBe(true)
  expect(calls).toBe(1)
  runtime.model.imageInput = false
  const noVision = await invoke(runtime, 'see_now', { source: 'future-pet-screen', seconds: 0 })
  expect(noVision.isError).toBe(true)
  expect(JSON.stringify(noVision)).toContain('image input')
  expect(calls).toBe(1)
})
it('joins cancellation for the owning conversation and refuses non-Life callers', async () => {
  const runtime = await boot(await directory())
  await teach(runtime)
  const entered = Promise.withResolvers<undefined>()
  const exited = Promise.withResolvers<undefined>()
  runtime.ctx.computerUse.registerCapture({ name: ComputerUseProviderName('host-desktop'),
    async capture(_owner, signal) {
      entered.resolve(undefined)
      try {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          signal.throwIfAborted()
        })
        throw new Error('Capture unexpectedly resumed')
      } finally { exited.resolve(undefined) }
    } })
  const pending = invoke(runtime, 'see_now', { seconds: 0 })
  await entered.promise
  const other = (await runtime.ctx.agents.create({ sessionId: SessionId('other-life'),
    agentOptions: { provider: 'fixture', model: 'chat' }, setup: async (ctx) => { await runtime.ctx.agentPresets.mount(ctx, 'life') } })).agent
  await runtime.ctx.genesis.learn('see_now', other.id)
  await invoke(runtime, 'genesis_toolkit', { action: 'enable', id: 'vision' }, other)
  const otherStop = await invoke(runtime, 'see_now', { action: 'stop' }, other)
  expect(otherStop.isError).toBe(false)
  expect(JSON.stringify(await invoke(runtime, 'see_now', { action: 'status' }))).toContain('"observing":true')
  const stopped = await invoke(runtime, 'see_now', { action: 'stop' })
  expect(stopped.isError).toBe(false)
  await exited.promise
  expect((await pending).isError).toBe(true)
  const outsider = (await runtime.ctx.agents.create({ sessionId: SessionId('outside'), agentOptions: { provider: 'fixture', model: 'chat' } })).agent
  const rejected = await invoke(runtime, 'see_now', { seconds: 0 }, outsider)
  expect(rejected.isError).toBe(true)
})
