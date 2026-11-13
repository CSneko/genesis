/** Real Loader and Agent Loop exercise independent weather switches and model-visible logging. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, createUserMessage, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '../src/index.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const text = 'Weather received.'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function boot(config: { enabled: boolean; toolEnabled: boolean; contextEnabled: boolean }) {
  const root = await mkdtemp(join(tmpdir(), 'genesis-weather-loader-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
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
      { name: '@deepseek-ai/dsh-genesis-weather', config: { ...config, location: 'Shanghai' } },
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
  await ctx.genesis.awaken('天气测试')
  const model = new Model()
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = (
    await ctx.agents.create({
      sessionId: SessionId('weather-operator'),
      agentOptions: { provider: 'fixture', model: 'chat' },
      setup: async (agentCtx) => {
        await ctx.agentPresets.mount(agentCtx, 'life')
      },
    })
  ).agent
  return { ctx, model, agent }
}
function network() {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname === 'geocoding-api.open-meteo.com')
      return Response.json({ results: [{ name: 'Shanghai', latitude: 31.2, longitude: 121.5 }] })
    if (url.hostname === 'api.open-meteo.com')
      return Response.json({
        current: {
          time: '2026-11-13T08:00',
          temperature_2m: 20,
          apparent_temperature: 19,
          relative_humidity_2m: 60,
          weather_code: 61,
          wind_speed_10m: 5,
        },
        daily: {
          time: Array.from({ length: 7 }, (_, i) => `2026-11-${13 + i}`),
          temperature_2m_max: Array<number>(7).fill(22),
          temperature_2m_min: Array<number>(7).fill(10),
          weather_code: Array<number>(7).fill(61),
        },
      })
    throw new Error('Unexpected network request')
  })
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
async function exchange(agent: Awaited<ReturnType<typeof boot>>['agent']) {
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] }))
  await agent.whenIdle()
}
it('injects context with the tool off, logs it before the model request and does not repeat unchanged weather', async () => {
  const fetcher = network()
  const { ctx, agent, model } = await boot({ enabled: true, toolEnabled: false, contextEnabled: true })
  await exchange(agent)
  expect(model.requests).toHaveLength(1)
  expect(JSON.stringify(model.requests[0])).toContain('Open-Meteo weather: rain')
  expect(
    agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'genesis-weather'),
  ).toHaveLength(1)
  await exchange(agent)
  expect(
    agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'genesis-weather'),
  ).toHaveLength(1)
  const result = await executeToolFixture(ctx, {
    callId: ToolCallId('weather-disabled'),
    name: 'get_weather',
    arguments: {},
    agent,
    signal: new AbortController().signal,
  })
  expect(result.isError).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('allows the tool with context off and makes no context lookup', async () => {
  const fetcher = network()
  const { ctx, agent, model } = await boot({ enabled: true, toolEnabled: true, contextEnabled: false })
  await exchange(agent)
  expect(fetcher).not.toHaveBeenCalled()
  expect(JSON.stringify(model.requests[0])).not.toContain('Open-Meteo weather:')
  await ctx.genesis.learn('get_weather', agent.id)
  const toolSet = await ctx.tools.resolve({
    agent,
    modelSelection: { provider: 'fixture', model: 'chat' },
    signal: new AbortController().signal,
  })
  cleanup.push(async () => {
    toolSet.dispose()
  })
  const result = await executeToolFixture(ctx, {
    callId: ToolCallId('weather-tool'),
    name: 'get_weather',
    arguments: { days: 3 },
    agent,
    toolSet,
    signal: new AbortController().signal,
  })
  expect(result.isError, JSON.stringify(result)).toBe(false)
  expect(JSON.stringify(result)).toContain('Shanghai')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('makes no requests with the master switch off, even with both subordinate switches on', async () => {
  const fetcher = network()
  const { ctx, agent } = await boot({ enabled: false, toolEnabled: true, contextEnabled: true })
  await exchange(agent)
  const result = await executeToolFixture(ctx, {
    callId: ToolCallId('weather-master-disabled'),
    name: 'get_weather',
    arguments: {},
    agent,
    signal: new AbortController().signal,
  })
  expect(result.isError).toBe(true)
  expect(fetcher).not.toHaveBeenCalled()
})
