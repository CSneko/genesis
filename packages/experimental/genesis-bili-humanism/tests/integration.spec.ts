/** Real Loader, upstream tools, SQLite ledger and durable Genesis; only network and model are substituted. */
import { Context } from '@deepseek-ai/cordis'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-session-persistence-jsonl'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '../src/index.ts'
import type {} from '@deepseek-ai/dsh-subprocess'
import { defineTool } from '@deepseek-ai/dsh-tools'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const failures: unknown[] = []
  for (const close of cleanup.splice(0).reverse()) {
    try { await close() } catch (error) { failures.push(error) }
  }
  vi.restoreAllMocks()
  if (failures.length) throw new AggregateError(failures, 'Bilibili fixture teardown')
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-bili-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function boot(root: string, localAsr = false) {
  const path = join(root, 'cordis.yml')
  await writeFile(path, [
    "- name: '@deepseek-ai/dsh-llm'", "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-projection'", "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'", "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-storage'", "- name: '@deepseek-ai/dsh-storage-json'", `  config: { root: ${JSON.stringify(root)} }`,
    "- name: '@deepseek-ai/dsh-storage-domain'", '  config: { backend: json }',
    "- name: '@deepseek-ai/dsh-sandbox-policy'", `  config: { mode: read-only, workspaceRoot: ${JSON.stringify(root)} }`,
    "- name: '@deepseek-ai/dsh-agent-preset-registry'", '  config: { default: life }',
    "- name: '@deepseek-ai/dsh-agent-preset'", '  config: { id: life, plugins: [] }',
    "- name: '@deepseek-ai/dsh-agent-preset'", '  config: { id: standard, plugins: [] }',
    ...(localAsr ? ["- name: '@deepseek-ai/dsh-subprocess-local'"] : []),
    "- name: '@deepseek-ai/dsh-experimental-genesis'", '  config:',
    `    leasePath: ${JSON.stringify(join(root, 'life.lock'))}`,
    '    awakening: { provider: fixture, model: chat, lifePreset: life }',
    `    personalDirectory: ${JSON.stringify(join(root, 'personal'))}`, '    records: {}',
    '    memory: { decisionProvider: reviewer, decisionModel: decision, writerProvider: reviewer, writerModel: writer, embeddingUrl: https://genesis-bili.invalid/embeddings, embeddingModel: fixture, embeddingDimensions: 2, associationLimit: 0, maxRetries: 0, consolidation: { enabled: false } }',
    "- name: '@deepseek-ai/dsh-session-persistence-jsonl'", '  config:',
    `    root: ${JSON.stringify(join(root, 'sessions'))}`, '    compression: none',
    "- name: '@deepseek-ai/dsh-experimental-genesis-bili-humanism'", '  config:',
    `    dataDir: ${JSON.stringify(join(root, 'bili'))}`,
    ...(localAsr ? ['    localAsr: {}'] : []),
    "- name: '@deepseek-ai/dsh-agent-loop'", '  config: { agents: [] }',
  ].join('\n') + '\n')
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = undefined
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  ctx.llm.registerAdapter(['reviewer'], new Model(Array<string>(10).fill('{"update":false}')))
  return ctx
}

async function create(ctx: Context, id: string, preset = 'life') {
  const handle = await ctx.agents.create({ sessionId: SessionId(id), agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, preset) } })
  return handle.agent
}

const bv = 'BV1xx411c7mD'
const note = { encounter: '通过字幕接触一位作者修复旧物的经历。', facts: '作者谈到修复旧物。',
  author_view: '作者认为物品承载回忆。', inference: '我暂时理解修复也可能是在保留关系，尚未核实。',
  previous_judgment: '', revision: '修复的价值可能不限于实用。', missing: '只读取文字，未观看全片或取得画面。',
  next_response: '讨论修复时先了解物品的来历。', evidence: [{ at: 1, claim: '作者谈到旧物的来历。' }] }

function network(empty = false) {
  const requests: string[] = []
  const original = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    if (url.href === 'https://genesis-bili.invalid/embeddings') return Response.json({ data: [{ index: 0, embedding: [1, 0] }] })
    if (!['api.bilibili.com', 'aisubtitle.hdslb.com'].includes(url.hostname)) return original(input, init)
    requests.push(url.href)
    expect(init?.method ?? 'GET').toBe('GET')
    if (url.pathname === '/x/web-interface/view') return Response.json({ code: 0, data: {
      title: '旧物修复', owner: { name: '示例作者', mid: 123 }, duration: 10, pages: [{ page: 1, cid: 42, duration: 10 }],
    } })
    if (url.pathname === '/x/player/v2') return Response.json({ code: 0, data: { subtitle: {
      subtitles: empty ? [] : [{ lan: 'zh-CN', subtitle_url: 'https://aisubtitle.hdslb.com/fixture.json' }],
    } } })
    if (url.pathname === '/fixture.json') return Response.json({ body: [{ from: 0, to: 8, content: '这件旧物让我想起家人，我想把它修好。' }] })
    throw new Error(`Unexpected fixture request: ${url.pathname}`)
  })
  return requests
}

type Step = string | { name: string; args: object } | ((options: GenerateOptions) => { name: string; args: object })
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly steps: Step[]) { super() }
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const step = this.steps.shift()
    if (step === undefined) throw new Error('Bilibili scripted model exhausted')
    if (typeof step === 'string') {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: step }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: step } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    } else {
      const call = typeof step === 'function' ? step(options) : step
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: ToolCallId(`bili-${this.requests.length}`), name: call.name, argumentsDelta: JSON.stringify(call.args) }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(`bili-${this.requests.length}`),
        name: call.name, arguments: JSON.stringify(call.args) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }
}
function recordCall() {
  return { name: 'genesis_record', args: { action: 'write', title: '修复旧物之后', typeId: 'viewing-notes',
    content: `${note.encounter}\n${note.inference}\n来源：https://www.bilibili.com/video/${bv}/ · 1s\n${note.missing}` } }
}
const learn = (name: string) => ({ name: 'learn', args: { name } })
const prompt = () => createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text',
  text: '读取视频，值得记录时用 genesis_record 写观影札记，保留来源与覆盖范围。' }] })

it('uses one writing tool across restart without creating upstream journals or life memories', async () => {
  const requests = network()
  const root = await directory()
  const ctx = await boot(root)
  expect(requests).toEqual([])
  await ctx.genesis.awaken('小芽')
  const model = new Model([learn('bili_humanism_read'), learn('bili_humanism_guide'), learn('genesis_record'),
    { name: 'bili_humanism_guide', args: {} }, { name: 'bili_humanism_read', args: { video: bv } },
    { name: 'genesis_record', args: { action: 'types' } }, recordCall(), '记录已保存，仍保留没有完整观看的限度。'])
  ctx.llm.registerAdapter(['fixture'], model)
  const agent = await create(ctx, 'bili-first')
  agent.followup(prompt())
  await agent.whenIdle()
  const state = await ctx.genesis.snapshot()
  expect(requests).toHaveLength(3)
  expect(state.memories).toHaveLength(0)
  const found = await ctx.genesisRecords.search({}, new AbortController().signal)
  expect(found.total).toBe(1)
  const record = found.items[0]!
  expect(record).toMatchObject({ title: '修复旧物之后', typeId: 'viewing-notes' })
  expect(await readFile(join(root, 'personal', 'records', record.fileName), 'utf8')).toContain('未观看全片')
  const visible = JSON.stringify(model.requests.at(-1)?.messages)
  expect(visible).toContain('写下文字不会自动成为长期记忆')
  expect(visible).not.toContain('人格积累默认开启')
  const tools = ctx.tools.schemas(agent).map(tool => tool.name)
  for (const name of ['bili_humanism_memory', 'bili_humanism_journal', 'bili_humanism_personality', 'bili_humanism_question', 'bili_humanism_like']) {
    expect(tools).not.toContain(name)
  }
  expect(await ctx.tools.execute({ callId: ToolCallId('blocked-journal'), name: 'bili_humanism_journal',
    arguments: { readingId: randomUUID(), json: JSON.stringify(note) }, agent,
    signal: new AbortController().signal })).toMatchObject({ isError: true })
  const db = new DatabaseSync(join(root, 'bili', 'ledger.sqlite'), { readOnly: true })
  try { expect(db.prepare('SELECT count(*) AS total FROM notes').get()?.['total']).toBe(0) } finally { db.close() }
  await ctx.fiber.dispose()
  const second = await boot(root)
  expect((await second.genesis.snapshot()).identity).toEqual(state.identity)
  second.llm.registerAdapter(['fixture'], new Model([learn('genesis_record'), { name: 'genesis_record', args: { action: 'search', query: '旧物' } }, '找到了以前的札记。']))
  const other = await create(second, 'bili-unrelated')
  other.followup(prompt())
  await other.whenIdle()
  expect((await second.genesisRecords.search({}, new AbortController().signal)).total).toBe(1)
  expect((await second.genesis.snapshot()).memories).toHaveLength(0)
  expect(requests).toHaveLength(3)
})

it('turns upstream JSON faults into tool errors and denies unlearned or ordinary-mode calls', async () => {
  const requests = network(true)
  const ctx = await boot(await directory())
  await ctx.genesis.awaken('小芽')
  ctx.llm.registerAdapter(['fixture'], new Model([{ name: 'bili_humanism_read', args: { video: 'invalid' } }, '读取失败。']))
  const agent = await create(ctx, 'bili-errors')
  const invoke = (name: string, args: object) => ctx.tools.execute({ callId: ToolCallId('bili-failure'), name,
    arguments: args, agent, signal: new AbortController().signal })
  expect(await invoke('bili_humanism_read', { video: bv })).toMatchObject({ isError: true })
  expect(requests).toEqual([])
  await invoke('learn', { name: 'bili_humanism_read' })
  const oversized = await invoke('bili_humanism_read', { video: 'x'.repeat(100001) })
  expect(oversized.isError && oversized.error.message).toContain('sourceChars')
  expect(await invoke('bili_humanism_read', { video: 'invalid' })).toMatchObject({ isError: true })
  expect(requests).toEqual([])
  expect((await ctx.genesis.snapshot()).memories).toEqual([])
  agent.followup(prompt())
  await agent.whenIdle()
  expect((await ctx.genesis.snapshot()).sessions[agent.session.id]?.find(tool => tool.id === 'bili_humanism_read')?.verification).toBe('failed')
  const unconfirmed = await invoke('bili_humanism_read', { video: bv })
  expect(unconfirmed.isError && unconfirmed.error.message).toContain('unconfirmed')
  const sourceText = unconfirmed.content[0]
  expect(sourceText?.type).toBe('text')
  const retained = z.object({ result: z.object({ id: z.uuid() }), visual: z.object({ error: z.string() }) })
    .parse(JSON.parse(sourceText?.type === 'text' ? sourceText.text : '{}'))
  expect(retained.visual.error).toBe('VISUAL_ATTACHMENT_REQUIRED')
  expect(requests).toHaveLength(2)
  const ordinary = await create(ctx, 'bili-ordinary', 'standard')
  expect(await ctx.tools.execute({ callId: ToolCallId('bili-mode-denial'), name: 'bili_humanism_read',
    arguments: { video: bv }, agent: ordinary, signal: new AbortController().signal })).toMatchObject({ isError: true })
  const entry = [...ctx.loader.entries()].find(item => item.options.name === '@deepseek-ai/dsh-experimental-genesis-bili-humanism')!
  await entry.fiber!.dispose()
  expect(ctx.tools.get('bili_humanism_read')).toBeUndefined()
})

it('keeps successful frame delivery when subtitles are unconfirmed and exposes bounded local ASR behind learning', async () => {
  const root = await directory()
  const ctx = await boot(root, true)
  await ctx.genesis.awaken('小芽')
  const id = '00000000-0000-4000-8000-000000000001'
  ctx.llm.registerAdapter(['fixture'], new Model([{ name: 'bili_humanism_transcribe', args: { readingId: id } }, '转写已生成，接下来读取正文。']))
  const agent = await create(ctx, 'bili-asr')
  const invoke = (name: string, args: object) => ctx.tools.execute({ callId: ToolCallId('bili-asr-check'), name,
    arguments: args, agent, signal: new AbortController().signal })
  expect(await invoke('bili_humanism_transcribe', { readingId: id })).toMatchObject({ isError: true })
  await invoke('learn', { name: 'bili_humanism_transcribe' })
  const missing = await invoke('bili_humanism_transcribe', { readingId: id })
  expect(missing.isError && missing.error.message).toContain('READING_NOT_FOUND')
  const audio = join(root, 'bili', 'assets', 'fixture.m4s')
  await mkdir(join(root, 'bili', 'assets'), { recursive: true })
  await writeFile(audio, 'synthetic audio boundary fixture', { mode: 0o600 })
  const spawn = ctx.subprocess.spawn.bind(ctx.subprocess)
  const commands: string[] = []
  const bridge = vi.spyOn(ctx.subprocess, 'spawn').mockImplementation((spec) => {
    const command = spec.argv[2]
    commands.push(String(command))
    expect(spec.argv[3]).toBe(id)
    expect(spec.env?.['BILI_HUMANISM_CONFIG_FILE']).toContain('asr-operation-')
    const reply = command === 'audio' ? { result: { path: audio } }
      : { result: { id, bvid: bv, page: 1, title: '合成来源', author: '示例作者', url: `https://www.bilibili.com/video/${bv}/`,
        route: 'A3', duration: 1, coverage: { state: 'asr_partial' }, segments: [{ start: 0, end: 1, text: '合成转写。', source: 'A3' }] } }
    // Only the expensive upstream media command is substituted; process management and tool logging remain real.
    return spawn({ ...spec, argv: [process.execPath, '-e', `process.stdout.write(${JSON.stringify(JSON.stringify(reply))})`] })
  })
  try {
    agent.followup(prompt())
    await agent.whenIdle()
    expect(commands).toEqual(['audio', 'local-asr'])
    const result = agent.session.snapshotEvents().find(event => event.type === 'tool/result' && !event.data.message.isError
      && event.data.message.content.some(block => block.type === 'text' && block.text.includes('localEvidence')))
    expect(result).toBeDefined()
  } finally { bridge.mockRestore() }
  const spawned = Promise.withResolvers<undefined>()
  const handles: ReturnType<typeof ctx.subprocess.spawn>[] = []
  const slow = vi.spyOn(ctx.subprocess, 'spawn').mockImplementation((spec) => {
    const child = spawn({ ...spec, argv: [process.execPath, '-e', 'setInterval(() => {}, 1000)'] })
    handles.push(child)
    spawned.resolve(undefined)
    return child
  })
  try {
    const cancel = new AbortController()
    const pending = ctx.tools.execute({ callId: ToolCallId('bili-asr-cancel'), name: 'bili_humanism_transcribe',
      arguments: { readingId: id }, agent, signal: cancel.signal })
    await spawned.promise
    cancel.abort()
    expect(await pending).toMatchObject({ isError: true })
    for (const handle of handles) await handle.waitForExit()
    expect((await readdir(join(root, 'bili'))).filter(path => path.startsWith('asr-operation-'))).toEqual([])
  } finally { slow.mockRestore() }
  const names = ctx.tools.schemas(agent).map(tool => tool.name)
  expect(names).toContain('bili_humanism_transcribe')
  const body = JSON.stringify({ result: { id, coverage: { state: 'read_failed' } },
    visual: { status: 'frames_ready', frameCount: 4 } })
  const release = agent.ctx.tools.register(defineTool({ name: 'bili_humanism_read', description: 'Synthetic partial reading.',
    parameters: {}, output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => body }))
  try {
    await invoke('learn', { name: 'bili_humanism_read' })
    expect(await invoke('bili_humanism_read', {})).toMatchObject({ isError: false,
      content: [{ type: 'text', text: body }] })
  } finally { release() }
})
