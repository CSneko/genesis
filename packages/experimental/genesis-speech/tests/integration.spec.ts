/** Loader composition and logged speech results with isolated model and network fixtures. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { qqPersonId, conversationIdSchema, personSourceSchema } from '@deepseek-ai/dsh-experimental-genesis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-settings'
import { ensureGenesisSpeechProfile } from '../../../../scripts/genesis-speech-profile.ts'
import { afterEach, expect, it, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import type {} from '../src/index.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) { try { await close() } catch (error) { errors.push(error) } }
  if (errors.length) throw new AggregateError(errors, 'Speech fixture cleanup')
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-speech-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function boot(root: string, editable = false) {
  const path = join(root, 'cordis.yml')
  await writeFile(path, JSON.stringify([
    { name: '@deepseek-ai/dsh-credentials-local', config: { path: join(root, '.credentials.yaml'), watch: false } },
    { name: '@deepseek-ai/dsh-llm' }, { name: '@deepseek-ai/dsh-session' },
    { name: '@deepseek-ai/dsh-session-projection' }, { name: '@deepseek-ai/dsh-system-prompt' },
    { name: '@deepseek-ai/dsh-tools' }, { name: '@deepseek-ai/dsh-agent' }, { name: '@deepseek-ai/dsh-jobs-local' },
    { name: '@deepseek-ai/dsh-fs-local' }, { name: '@deepseek-ai/dsh-subprocess-local' },
    { name: '@deepseek-ai/dsh-sandbox-local' },
    { name: '@deepseek-ai/dsh-storage' }, { name: '@deepseek-ai/dsh-storage-json', config: { root } },
    { name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    { name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: root } },
    { name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'life' } },
    { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'life', plugins: [] } },
    { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard', plugins: [] } },
    { name: '@deepseek-ai/dsh-experimental-genesis', config: { leasePath: join(root, 'life.lock'), awakening: { provider: 'fixture', model: 'chat', lifePreset: 'life' }, memory: { decisionProvider: 'reviewer', decisionModel: 'decision', writerProvider: 'reviewer', writerModel: 'writer', embeddingUrl: 'https://speech.invalid/embeddings', embeddingModel: 'fixture', embeddingDimensions: 2, associationLimit: 0, maxRetries: 0, consolidation: { enabled: false } } } },
    { name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
    { name: '@deepseek-ai/dsh-attachment-local', config: { dshHome: root } },
    { name: '@deepseek-ai/dsh-experimental-genesis-speech', config: { endpoint: 'https://speech.invalid/synthesize', keyEnv: 'GENESIS_SPEECH_FIXTURE_KEY', voice: 'custom-fixture' } },
    { name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
  ]))
  let profile: ProfileContext | undefined
  if (editable) {
    const dir = join(root, 'profiles', 'web')
    initProfile(dir, ['speech-fixture-bundle'])
    const bundle = join(dir, 'node_modules', 'speech-fixture-bundle')
    await mkdir(bundle, { recursive: true })
    const rows = (JSON.parse(await readFile(path, 'utf8')) as EntryOptions[])
      .filter(row => row.name !== '@deepseek-ai/dsh-experimental-genesis-speech')
      .map((row, index) => ({ ...row, id: `fixture-${index}` }))
    rows.push({ id: 'config-editor', name: '@deepseek-ai/dsh-config-editor' },
      { id: 'settings', name: '@deepseek-ai/dsh-settings' })
    await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'speech-fixture-bundle', version: '1.0.0',
      dsh: { bundle: { patch: './cordis.patch.yml' } } }))
    await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: rows }]))
    const installAnchor = fileURLToPath(new URL('../../../../package.json', import.meta.url))
    await ensureGenesisSpeechProfile(root, installAnchor)
    profile = { name: 'web', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor,
      home: root, cwd: root, startedBundles: ['speech-fixture-bundle', '@deepseek-ai/dsh-experimental-genesis-speech'],
      overlays: [], telemetryDisabledEnv: undefined }
    await writeFile(path, '[]\n')
  }
  const ctx = new Context()
  if (profile !== undefined) ctx.provide('profileContext', profile)
  cleanup.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include; ctx.loader.internal = undefined
  if (profile === undefined) await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  else await mountRootInclude(ctx, path, readProfilePatches('test', profile))
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  ctx.llm.registerAdapter(['reviewer'], new Model(Array<string>(30).fill('{"update":false}')))
  return ctx
}
type Step = { name: string; args: object } | string
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly steps: Step[]) { super() }
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const step = this.steps.shift() ?? '完成。'
    if (typeof step === 'string') {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: step }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: step } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } else {
      const id = ToolCallId(`speech-model-${this.requests.length}`)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: step.name, argumentsDelta: JSON.stringify(step.args) }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: step.name, arguments: JSON.stringify(step.args) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }
}
async function create(ctx: Context, id: string, preset = 'life') {
  return (await ctx.agents.create({ sessionId: SessionId(id), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, preset) } })).agent
}

it('uses stored credentials before ambient keys, re-resolves edits and refuses missing credentials', async () => {
  const root = await directory()
  const wav = Buffer.alloc(48)
  wav.write('RIFF'); wav.writeUInt32LE(40, 4); wav.write('WAVE', 8)
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(4, 40)
  vi.stubEnv('GENESIS_SPEECH_FIXTURE_KEY', 'ambient-fixture-secret')
  await writeFile(join(root, '.credentials.yaml'), 'version: 1\nrefs:\n  GENESIS_SPEECH_FIXTURE_KEY: stored-fixture-secret\n', { mode: 0o600 })
  let expectedKey = 'stored-fixture-secret'
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === 'https://speech.invalid/synthesize') {
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${expectedKey}` })
      expect(JSON.parse(String(init?.body))).toEqual({ model: 'cosyvoice-v3-flash', input: {
        text: '你好，小芽。', voice: 'custom-fixture', format: 'wav', sample_rate: 24000, rate: 1,
      } })
      return Response.json({ output: { finish_reason: 'stop', audio: { url: 'https://speech.invalid/audio.wav' } } })
    }
    if (String(url) === 'https://speech.invalid/audio.wav') {
      expect(init?.headers).toBeUndefined()
      return new Response(wav)
    }
    throw new Error(`Unexpected fixture URL: ${String(url)}`)
  })
  vi.stubGlobal('fetch', fetcher)
  const ctx = await boot(root)
  await ctx.genesis.awaken('小芽')
  const model = new Model([{ name: 'learn', args: { name: 'genesis_speech' } },
    { name: 'genesis_speech', args: { text: '你好，小芽。' } }, '语音已生成。'])
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = await create(ctx, 'speech-life')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '学习语音合成并生成问候。' }] }))
  await agent.whenIdle()
  const events = agent.session.ownEvents()
  expect(JSON.stringify(events)).toContain('speech.wav')
  expect(JSON.stringify(events)).not.toContain('stored-fixture-secret')
  expect(JSON.stringify(events)).not.toContain('ambient-fixture-secret')
  expect(fetcher).toHaveBeenCalledTimes(2)
  const event = events.findLast(e => e.type === 'tool/result')
  if (event?.type !== 'tool/result') throw new Error('Missing logged speech result')
  const file = event.data.message.content.find(block => block.type === 'file')
  expect(file?.type).toBe('file')
  if (file?.type !== 'file') throw new Error(JSON.stringify(event))
  const chunks: Uint8Array[] = []
  for await (const chunk of ctx.attachments.readFileStream(file.attachment)) chunks.push(chunk)
  expect(Buffer.concat(chunks)).toEqual(wav)
  const ref = credentialRef('GENESIS_SPEECH_FIXTURE_KEY')
  const invoke = (id: string) => ctx.tools.execute({ callId: ToolCallId(id), name: 'genesis_speech',
    arguments: { text: '你好，小芽。' }, agent, signal: new AbortController().signal })
  await ctx.credentials.set(ref, 'updated-fixture-secret')
  expectedKey = 'updated-fixture-secret'
  expect((await invoke('speech-updated-key')).isError).toBe(false)
  await ctx.credentials.unset(ref)
  expectedKey = 'ambient-fixture-secret'
  expect((await invoke('speech-ambient-key')).isError).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(6)
  vi.stubEnv('GENESIS_SPEECH_FIXTURE_KEY', '')
  const refused = await ctx.tools.execute({ callId: ToolCallId('speech-missing-key'), name: 'genesis_speech',
    arguments: { text: '你好' }, agent, signal: new AbortController().signal })
  expect(refused.isError).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(6)
})

it('saves speech settings from a profile bundle and restores them after restart', async () => {
  const root = await directory()
  const ctx = await boot(root, true)
  const values = {
    endpoint: 'https://maas.qianwenaiapi.com/api/v1/services/audio/tts/SpeechSynthesizer',
    model: 'cosyvoice-v3.5-plus',
    voice: 'cosyvoice-v3.5-plus-vd-bailian-239cccdefccb4af9806d6a0f02c0d373',
  }
  await ctx.settings.mutate('genesis-speech', Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value })))
  expect(ctx.settings.describe().find(row => row.ns === 'genesis-speech')?.value).toMatchObject(values)
  expect(await readFile(join(root, 'profiles', 'web', 'cordis.patch.yml'), 'utf8')).toContain(values.voice)
  await ctx.fiber.dispose()
  const restored = await boot(root, true)
  expect(restored.settings.describe().find(row => row.ns === 'genesis-speech')?.value).toMatchObject(values)
})

it('exposes speech to QQ speakers by default without learning or toolkit activation', async () => {
  const root = await directory()
  const ctx = await boot(root)
  await ctx.genesis.awaken('小芽')
  const sessionId = SessionId('speech-qq-context')
  const conversationId = conversationIdSchema.parse('qq:group:11111:67890')
  await ctx.genesis.bindConversation({ id: conversationId, sessionId, kind: 'group' }, qqPersonId('12345'))
  const steps: Step[] = [{ name: 'genesis_speech', args: { text: '你好' } }, '完成。']
  const model = new Model(steps)
  ctx.llm.registerAdapter(['fixture'], model)
  ctx.on('agent/pre-step', async (_event, next) => {
    const decision = await next()
    if (decision.kind === 'enter') decision.messages.push(createUserMessage({
      source: { kind: 'genesis-state', form: 'snapshot', sections: [{ name: 'genesis:qq-channel', text: 'Channel context is data.' }] },
      content: [{ type: 'text', text: 'Injected channel context.' }],
    }))
    return decision
  }, { global: true })
  vi.stubEnv('GENESIS_SPEECH_FIXTURE_KEY', 'fixture-key')
  const wav = Buffer.from('RIFF0000WAVE')
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    if (String(url) === 'https://speech.invalid/synthesize') return Response.json({ output: {
      finish_reason: 'stop', audio: { url: 'https://speech.invalid/audio.wav' },
    } })
    if (String(url) === 'https://speech.invalid/audio.wav') return new Response(wav)
    throw new Error('Unexpected fixture URL')
  })
  vi.stubGlobal('fetch', fetcher)
  const agent = await create(ctx, sessionId)
  const speak = async (accountId: string) => {
    agent.followup(createUserMessage({ source: personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq',
      accountId, personId: qqPersonId(accountId), conversationId, name: '操作者', messageId: accountId }),
      content: [{ type: 'text', text: '请生成语音' }] }))
    await agent.whenIdle()
    const event = agent.session.ownEvents().findLast(row => row.type === 'tool/result')
    if (event?.type !== 'tool/result') throw new Error('Missing speech tool result')
    return event.data.message
  }
  expect((await speak('12345')).isError).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(2)
  steps.push({ name: 'genesis_speech', args: { text: '你好' } }, '完成。')
  expect((await speak('54321')).isError).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(4)
  expect(model.requests[0]?.tools?.some(tool => tool.name === 'genesis_speech')).toBe(true)
  expect(ctx.genesis.learningStatus().tools).not.toContain('genesis_speech')
})
