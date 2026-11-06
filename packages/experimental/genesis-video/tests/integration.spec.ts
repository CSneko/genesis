import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
/** Real Loader, logged model tool flow, real media and restart; only the model is substituted. @module */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import type {} from '../src/index.ts'
import { jobSchema } from '../src/model.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) { try { await close() } catch (error) { errors.push(error) } }
  if (errors.length) throw new AggregateError(errors, 'Video fixture cleanup')
})
const run = promisify(execFile)
const browser = process.env.GENESIS_VIDEO_CHROMIUM ?? resolve(dirname(fileURLToPath(import.meta.resolve('@remotion/cli/package.json'))), '../../.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell')
// Browser installation is an explicit setup step; no test or product tool downloads executables.
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-video-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function boot(root: string) {
  const path = join(root, 'cordis.yml')
  await writeFile(path, JSON.stringify([
    { name: '@deepseek-ai/dsh-llm' }, { name: '@deepseek-ai/dsh-session' },
    { name: '@deepseek-ai/dsh-session-projection' }, { name: '@deepseek-ai/dsh-system-prompt' },
    { name: '@deepseek-ai/dsh-tools' }, { name: '@deepseek-ai/dsh-tool-executor-native' }, { name: '@deepseek-ai/dsh-agent' }, { name: '@deepseek-ai/dsh-jobs-local' },
    { name: '@deepseek-ai/dsh-fs-local' }, { name: '@deepseek-ai/dsh-subprocess-local' },
    { name: '@deepseek-ai/dsh-sandbox-local' },
    { name: '@deepseek-ai/dsh-storage' }, { name: '@deepseek-ai/dsh-storage-json', config: { root } },
    { name: '@deepseek-ai/dsh-storage-domain', config: { backend: 'json' } },
    { name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'workspace-write', workspaceRoot: root } },
    { name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'life' } },
    { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'life', plugins: [] } },
    { name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard', plugins: [] } },
    { name: '@deepseek-ai/dsh-experimental-genesis', config: { leasePath: join(root, 'life.lock'), awakening: { provider: 'fixture', model: 'chat', lifePreset: 'life' }, memory: { decisionProvider: 'reviewer', decisionModel: 'decision', writerProvider: 'reviewer', writerModel: 'writer', embeddingUrl: 'https://video.invalid/embeddings', embeddingModel: 'fixture', embeddingDimensions: 2, associationLimit: 0, maxRetries: 0, consolidation: { enabled: false } } } },
    { name: '@deepseek-ai/dsh-session-persistence-jsonl', config: { root: join(root, 'sessions'), compression: 'none' } },
    { name: '@deepseek-ai/dsh-attachment-local', config: { dshHome: root } },
    { name: '@deepseek-ai/dsh-experimental-genesis-video', config: { dataDir: join(root, 'video'), browserExecutable: browser } },
    { name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
  ]))
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include; ctx.loader.internal = undefined
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
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
      const id = ToolCallId(`video-model-${this.requests.length}`)
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
const saved = z.object({ projectId: z.uuid(), revisionId: z.uuid() })
const jobResult = z.object({ projectId: z.uuid(), jobId: z.uuid(), state: z.string(),
  result: z.object({ message: z.string(), diagnostics: z.string() }).nullable() })
const base = { title: '三段素材', width: 320, height: 180, fps: 10, duration: 30 }

it.skipIf(!process.env.GENESIS_VIDEO_CHROMIUM)('edits clips and resumes after restart', async () => {
  const root = await directory()
  const ctx = await boot(root)
  await ctx.genesis.awaken('小芽')
  const steps: Step[] = [{ name: 'learn', args: { name: 'genesis_video' } },
    { name: 'genesis_toolkit', args: { action: 'enable', id: 'video' } },
    { name: 'genesis_video', args: { action: 'guide' } }, '可以开始制作。']
  const model = new Model(steps)
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = await create(ctx, 'video-life')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '学习视频制作并查看使用说明。' }] }))
  await agent.whenIdle()
  expect(JSON.stringify(model.requests.at(-1)?.messages) ?? JSON.stringify(agent.session.ownEvents())).toContain('Import local assets')
  let seq = 0
  const invoke = async (action: string, input: object = {}) => {
    const result = await executeToolFixture(ctx, { callId: ToolCallId(`video-test-${++seq}`), name: 'genesis_video', arguments: { action, input }, agent, signal: new AbortController().signal })
    if (result.isError) throw new Error(JSON.stringify(result.error))
    return result.value
  }
  const initial = saved.parse(await invoke('save', { ...base, timeline: { clips: [] } }))
  const assets: string[] = []
  for (const color of ['red', 'green', 'blue']) {
    const path = join(root, color + '.mp4')
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=10:d=10`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path], { timeout: 30000 })
    assets.push(z.object({ asset: z.string() }).parse(await invoke('import', { projectId: initial.projectId, path })).asset)
  }
  const audioPath = join(root, 'music.wav')
  await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=30', audioPath], { timeout: 30000 })
  const music = z.object({ asset: z.string() }).parse(await invoke('import', { projectId: initial.projectId, path: audioPath })).asset
  const timeline = { clips: assets.map((asset, i) => ({ kind: 'video', asset, from: i * 10, duration: 10, fade: 0.3 })),
    texts: [{ text: 'Genesis / first cut', from: 0, duration: 3, position: 'center', size: 24 },
      { text: '三段素材，保留原片。', from: 3, duration: 25, size: 18 }],
    audio: [{ asset: music, from: 0, duration: 30, volume: 0.15 }],
  }
  const revision = saved.parse(await invoke('save', { ...base, projectId: initial.projectId, parentRevision: initial.revisionId, timeline }))
  expect(await invoke('probe', { projectId: revision.projectId, asset: assets[0] })).toHaveProperty('metadata')
  steps.push({ name: 'genesis_video', args: { action: 'render', input: { ...revision, mode: 'preview', wait: true } } }, '样片已渲染。')
  agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '渲染刚才的三段素材工程。' }] }))
  await agent.whenIdle()
  const resultEvent = agent.session.ownEvents().toReversed().find(event => event.type === 'tool/result')
  if (resultEvent?.type !== 'tool/result') throw new Error('Expected a logged render result')
  const text = resultEvent.data.message.content.find(block => block.type === 'text')
  const render = jobResult.parse(JSON.parse(text?.type === 'text' ? text.text : '{}'))
  const interactive = z.object({ state: z.literal('completed'), previewPath: z.string() }).parse(await invoke('preview', revision))
  if (process.env.GENESIS_VIDEO_MEDIA_PREVIEW_ARTIFACT) {
    await writeFile(process.env.GENESIS_VIDEO_MEDIA_PREVIEW_ARTIFACT, await readFile(interactive.previewPath))
  }
  expect(render.state, JSON.stringify(render)).toBe('completed')
  const artifact = z.object({ attachment: z.object({ attachmentId: z.string(), bytes: z.number() }) }).parse(await invoke('status', { projectId: render.projectId, jobId: render.jobId, deliver: true }))
  expect(artifact.attachment.bytes).toBeGreaterThan(1000)
  const output = join(root, 'video', render.projectId, 'jobs', render.jobId, 'output.mp4')
  const info = z.object({ format: z.object({ duration: z.string() }),
    streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional() })) }).parse(
    JSON.parse((await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output])).stdout))
  expect(Number(info.format.duration)).toBeCloseTo(30, 0)
  expect(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')).toBe(true)
  expect(info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video')?.width).toBe(160)
  const identity = (await ctx.genesis.snapshot()).identity
  await ctx.fiber.dispose()
  const next = await boot(root)
  expect((await next.genesis.snapshot()).identity).toEqual(identity)
  const second = await create(next, 'video-unrelated')
  next.llm.registerAdapter(['fixture'], new Model([]))
  const call = async (action: string, input: object = {}) => {
    const result = await executeToolFixture(next, { callId: ToolCallId(`video-restart-${++seq}`), name: action === 'enable' ? 'genesis_toolkit' : 'genesis_video',
      arguments: action === 'enable' ? { action: 'enable', id: 'video' } : { action, input }, agent: second, signal: new AbortController().signal })
    if (result.isError) throw new Error(JSON.stringify(result.error))
    return result.value
  }
  await call('enable')
  expect(await call('status', { projectId: render.projectId, jobId: render.jobId })).toMatchObject({ state: 'completed' })
  const interruptedId = randomUUID()
  const admitted = jobSchema.parse(JSON.parse(await readFile(join(root, 'video', render.projectId, 'jobs', render.jobId, 'job.json'), 'utf8')))
  await mkdir(join(root, 'video', render.projectId, 'jobs', interruptedId))
  await writeFile(join(root, 'video', render.projectId, 'jobs', interruptedId, 'job.json'), JSON.stringify({ ...admitted, jobId: interruptedId }))
  expect(await call('status', { projectId: render.projectId, jobId: interruptedId })).toMatchObject({ state: 'interrupted' })
  await expect(call('status', { projectId: render.projectId, jobId: interruptedId, deliver: true })).rejects.toThrow('confirmed completed')
  expect(await call('read', revision)).toMatchObject({ projectId: revision.projectId, revisionId: revision.revisionId })
  timeline.texts[0]!.text = 'Genesis / revised cut'
  const updated = saved.parse(await call('save', { ...base, projectId: revision.projectId, parentRevision: revision.revisionId, timeline }))
  expect(updated.revisionId).not.toBe(revision.revisionId)
  const still = jobResult.parse(await call('render', { ...updated, mode: 'still', frame: 10, wait: true }))
  expect(still.state, JSON.stringify(still)).toBe('completed')
  expect(await call('status', { projectId: still.projectId, jobId: still.jobId, deliver: true })).toHaveProperty('image')
  expect(await readFile(join(root, 'video', revision.projectId, 'revisions', revision.revisionId + '.json'), 'utf8')).toContain('first cut')
  const custom = saved.parse(await call('save', { ...base, duration: 1, title: 'Custom scene', projectId: revision.projectId, parentRevision: updated.revisionId,
    source: 'import React from "react"; import {AbsoluteFill} from "remotion"; export default function Scene(){return <AbsoluteFill style={{backgroundColor:"purple",color:"white",fontSize:40}}>Custom scene</AbsoluteFill>}' }))
  const customStill = jobResult.parse(await call('render', { ...custom, mode: 'still', wait: true }))
  expect(customStill.state, JSON.stringify(customStill)).toBe('completed')
  const active = jobResult.parse(await call('render', { ...custom, mode: 'final' }))
  expect(active.state).toBe('running')
  const stopped = await call('cancel', { projectId: active.projectId, jobId: active.jobId })
  expect(stopped).toMatchObject({ state: 'cancelled' })
  const corrupted = join(root, 'video', revision.projectId, 'revisions', initial.revisionId + '.json')
  await writeFile(corrupted, '{broken')
  await expect(call('read', { projectId: revision.projectId, revisionId: initial.revisionId })).rejects.toThrow('unreadable JSON')
  expect(await readFile(corrupted, 'utf8')).toBe('{broken')
  const ordinary = await create(next, 'video-ordinary', 'standard')
  expect(await executeToolFixture(next, { callId: ToolCallId('video-denied'), name: 'genesis_video', arguments: { action: 'guide' }, agent: ordinary, signal: new AbortController().signal })).toMatchObject({ isError: true })
  setSandboxMode(second.session, 'read-only')
  expect(await executeToolFixture(next, { callId: ToolCallId('video-read-only'), name: 'genesis_video', arguments: { action: 'save', input: { ...base, timeline: { clips: [] } } }, agent: second, signal: new AbortController().signal })).toMatchObject({ isError: true })
  const plugin = [...next.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis-video')!
  await plugin.fiber!.dispose()
  expect(next.tools.get('genesis_video')).toBeUndefined()
  expect((await readdir(join(root, 'video'))).length).toBeGreaterThan(0)
}, 120000)

it('keeps revisions bounded and damaged artifacts visible without requiring a browser', async () => {
  const root = await directory()
  const ctx = await boot(root)
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['fixture'], new Model([]))
  const agent = await create(ctx, 'video-artifacts')
  let seq = 0
  const call = (name: string, args: object) => executeToolFixture(ctx, { callId: ToolCallId(`artifact-${++seq}`), name, arguments: args, agent, signal: new AbortController().signal })
  expect(await call('genesis_video', { action: 'guide' })).toMatchObject({ isError: true })
  expect(await call('learn', { name: 'genesis_video' })).toMatchObject({ isError: false })
  expect(await call('genesis_toolkit', { action: 'enable', id: 'video' })).toMatchObject({ isError: false })
  const invoke = async (action: string, input: object = {}) => {
    const result = await call('genesis_video', { action, input })
    if (result.isError) throw new Error(JSON.stringify(result.error))
    return result.value
  }
  const first = saved.parse(await invoke('save', { ...base, timeline: { clips: [] } }))
  const second = saved.parse(await invoke('save', { ...base, title: 'Second revision', projectId: first.projectId, parentRevision: first.revisionId, timeline: { clips: [] } }))
  expect(await invoke('list', { projectId: first.projectId, limit: 1 })).toMatchObject({ total: 2, nextOffset: 1 })
  expect(await invoke('read', { ...first, limit: 10 })).toMatchObject({ nextOffset: 10 })
  expect(await readFile(join(root, 'video', first.projectId, 'revisions', first.revisionId + '.json'), 'utf8')).toContain('三段素材')
  const interactive = saved.parse(await invoke('save', { ...base, title: 'Interactive scene', duration: 3,
    projectId: first.projectId, parentRevision: second.revisionId,
    source: 'import React from "react"; import {AbsoluteFill,useCurrentFrame} from "remotion"; export default function Scene(){const frame=useCurrentFrame();return <AbsoluteFill style={{backgroundColor:frame<15?"#162744":"#26635b",color:"white",fontSize:28,alignItems:"center",justifyContent:"center"}}><div>Genesis Remotion</div><div data-frame={frame}>Frame {frame}</div></AbsoluteFill>}' }))
  const preview = z.object({ state: z.literal('completed'), previewPath: z.string(), snapshotPath: z.string() }).parse(
    await invoke('preview', interactive))
  const html = await readFile(preview.previewPath, 'utf8')
  expect(html).toContain('data:application/javascript;base64,')
  expect(await readFile(preview.snapshotPath, 'utf8')).toBe(html)
  if (process.env.GENESIS_VIDEO_PREVIEW_ARTIFACT) await writeFile(process.env.GENESIS_VIDEO_PREVIEW_ARTIFACT, html)
  const rebuilt = z.object({ previewPath: z.string() }).parse(await invoke('preview', interactive))
  expect(rebuilt.previewPath).toBe(preview.previewPath)
  const bad = join(root, 'video', first.projectId, 'revisions', second.revisionId + '.json')
  await writeFile(bad, '{unreadable')
  await expect(invoke('read', second)).rejects.toThrow('unreadable JSON')
  expect(await readFile(bad, 'utf8')).toBe('{unreadable')
  if (process.platform !== 'win32') {
    // Windows directory symlinks require a host privilege that this fixture does not request.
    const assets = join(root, 'video', first.projectId, 'assets')
    const realAssets = join(root, 'video', first.projectId, 'real-assets')
    await mkdir(realAssets)
    await rm(assets, { recursive: true, force: true })
    await symlink(realAssets, assets)
    await expect(invoke('list', { projectId: first.projectId, kind: 'assets' })).rejects.toThrow('symbolic links')
    await rm(assets)
  }
  setSandboxMode(agent.session, 'read-only')
  await expect(invoke('save', { ...base, timeline: { clips: [] } })).rejects.toThrow('writable Session')
  setSandboxMode(agent.session, 'workspace-write')
  const plugin = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-genesis-video')!
  await plugin.fiber!.dispose()
  expect(ctx.tools.get('genesis_video')).toBeUndefined()
  const catalog = await ctx.genesisToolkits.inspect(new AbortController().signal)
  await ctx.genesisToolkits.save(catalog.entries.filter(entry => entry.id !== 'video'), catalog.revision, new AbortController().signal)
  await ctx.fiber.dispose()
  const next = await boot(root)
  expect((await next.genesisToolkits.inspect(new AbortController().signal)).entries.some(entry => entry.id === 'video')).toBe(false)
})
