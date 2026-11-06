/** Real Loader, durable Sessions and authenticated OneBot sockets; only model output is scripted. */
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Group from '@deepseek-ai/cordis-plugin-group'
import { LlmAdapter, type GenerateOptions, type StreamChunk, ToolCallId, createUserMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { createServer as httpServer } from 'node:http'
import { Config as QqConfig } from '../src/config.ts'
import { QqMedia, attachmentIn } from '../src/media.ts'
import { sendMedia } from '../src/media-tools.ts'
import { quoteContext } from '../src/quotes.ts'
import { WebSocket } from 'ws'
import { afterEach, expect, it, vi } from 'vitest'
import * as Genesis from '../../genesis/src/index.ts'
import * as GenesisQq from '../src/index.ts'
import type { RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import { SessionId } from '@deepseek-ai/dsh-session'
import { qqPersonId } from '@deepseek-ai/dsh-experimental-genesis'
import { z } from 'zod'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { brandString } from '@deepseek-ai/dsh-brand'
import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { groupRecords, historyMessages, historyPage } from '../src/history.ts'
import { temporaryStateSchema } from '../../genesis/src/temporary-model.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const errors: unknown[] = []
  for (const dispose of cleanup.splice(0).reverse()) {
    try { await dispose() } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'QQ integration teardown')
})
const token = 'fixture-onebot-access-token'
class Model extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  temporaryGate: (() => Promise<void>) | undefined
  temporaryMaxTokens = false
  groupReply = false
  groupProbability: number | undefined
  groupDecisionFailure = false
  chatReply = '你好，我记得这次交流。'
  nextMediaMessageId: string | undefined
  communication: Array<Record<string, string>> = []
  communicationCalls = 0
  chatInputTokens: number | undefined
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model, defaultMaxTokens: 256000, inputModalities: ['text', 'image'] as Array<'text' | 'image'>, context: { contextWindow: 1000000 } } }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (options.model === 'chat' && this.communication.length) {
      const args = this.communication.shift()!
      if (args['id'] === '$last') {
        const result = options.messages.toReversed().find(message => message.role === 'tool')
        const block = result?.content.find(block => block.type === 'text')
        args['id'] = z.object({ id: z.string() }).parse(JSON.parse(block?.type === 'text' ? block.text : '{}')).id
      }
      const block = { type: 'tool-call' as const, id: ToolCallId(`qq-communicate-${++this.communicationCalls}`),
        name: 'genesis_message', arguments: JSON.stringify(args) }
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (options.model === 'chat' && this.nextMediaMessageId !== undefined) {
      const block = { type: 'tool-call' as const, id: ToolCallId(`read-earlier-qq-image-${this.nextMediaMessageId}`), name: 'genesis_qq_read_media', arguments: JSON.stringify({ messageId: this.nextMediaMessageId }) }
      this.nextMediaMessageId = undefined
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (typeof options.system === 'string' && options.system.startsWith('将提供的按顺序对话')) await this.temporaryGate?.()
    const groupDecision = typeof options.system === 'string' && options.system.startsWith('Should the character reply')
    if (groupDecision && this.groupDecisionFailure) throw new Error('fixture decision unavailable')
    const text = groupDecision ? JSON.stringify({ update: this.groupReply, ...(this.groupProbability === undefined ? {} : { decision: { probability: this.groupProbability, threshold: 0.5 } }) }) : typeof options.system === 'string' && options.system.startsWith('将提供的按顺序对话')
      ? '{"summary":"这是一条有来源的临时交流摘要，模型的解释尚未核实。"}'
      : typeof options.system === 'string' && options.system.includes('只评估一次') ? '{"importance":0.8}'
        : options.model === 'chat' ? this.chatReply : '{"update":false}'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    if (options.model === 'chat' && this.chatInputTokens !== undefined) yield { type: 'usage', usage: { inputTokens: this.chatInputTokens, outputTokens: 10 } }
    yield { type: 'finish', reason: { kind: typeof options.system === 'string' && options.system.startsWith('将提供的按顺序对话') && this.temporaryMaxTokens ? 'max-tokens' : 'stop' } }
  }
}
async function boot(root: string, settingsOnly = false, temporary = false, writings = false, messaging = false) {
  const path = join(root, 'cordis.yml')
  await writeFile(path, [
    "- name: '@deepseek-ai/dsh-credentials-local'", `  config: { path: ${JSON.stringify(join(root, '.credentials.yaml'))}, watch: false }`,
    "- name: '@deepseek-ai/dsh-attachment-local'", `  config: { dshHome: ${JSON.stringify(root)} }`,
    "- name: '@deepseek-ai/dsh-llm'", "- name: '@deepseek-ai/dsh-session'",
    "- name: '@deepseek-ai/dsh-session-title'", '  config: { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 }',
    "- name: '@deepseek-ai/dsh-workspace'",
    "- name: '@deepseek-ai/dsh-token-meter'", "- name: '@deepseek-ai/dsh-compaction-basic'", '  disabled: true',
    "- name: '@deepseek-ai/dsh-session-projection'", "- name: '@deepseek-ai/dsh-system-prompt'",
    "- name: '@deepseek-ai/dsh-tools'", "- name: '@deepseek-ai/dsh-agent'",
    "- name: '@deepseek-ai/dsh-storage'", "- name: '@deepseek-ai/dsh-storage-json'", `  config: { root: ${JSON.stringify(root)} }`,
    "- name: '@deepseek-ai/dsh-storage-domain'", '  config: { backend: json }',
    "- name: '@deepseek-ai/dsh-sandbox-policy'", `  config: { mode: read-only, workspaceRoot: ${JSON.stringify(root)} }`,
    "- name: '@deepseek-ai/dsh-agent-preset-registry'", '  config: { default: life }',
    "- name: '@deepseek-ai/dsh-agent-preset'", '  config:', '    id: life', '    plugins:',
    '      - id: compaction', '        name: cordis:group', '        group: true', '        isolate: { compaction: true }',
    '        config:', "          - name: '@deepseek-ai/dsh-compaction-basic'",
    "- name: '@deepseek-ai/dsh-agent-default-model'", '  config: { provider: fixture, model: chat }',
    "- name: '@deepseek-ai/dsh-session-persistence-jsonl'", `  config: { root: ${JSON.stringify(join(root, 'sessions'))}, compression: none }`,
    "- name: '@deepseek-ai/dsh-agent-loop'", '  config: { agents: [] }',
    "- name: '@deepseek-ai/dsh-experimental-genesis'", '  config:', `    leasePath: ${JSON.stringify(join(root, 'life.lock'))}`,
    '    awakening: { provider: fixture, model: chat, lifePreset: life }',
    '    memory: { decisionProvider: fixture, decisionModel: decision, writerProvider: fixture, writerModel: writer, associationLimit: 0 }',
    ...(writings ? [`    personalDirectory: ${JSON.stringify(join(root, 'personal'))}`, '    records: {}'] : []),
    ...(temporary ? ['    temporaryMemory: { enabled: true, idleMs: 600000, pollMs: 100 }'] : []),
    "- name: '@deepseek-ai/dsh-experimental-genesis-qq'", '  config:',
    ...(settingsOnly ? [] : [`    accessToken: ${token}`, "    botQq: '11111'", "    operatorQq: '55555'"]), '    port: 0', '    groupAutoReply: false',
    ...(messaging ? ["    outboundGroups: ['67890']", "    outboundUsers: ['99999']"] : []),
    "    allowGroups: ['67890']", `    allowUsers: ['12345', '99999'${messaging ? ", '55555'" : ''}]`, `    cwd: ${JSON.stringify(root)}`,
  ].join('\n') + '\n')
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.group = Group
  ctx.loader.builtins['@deepseek-ai/dsh-experimental-genesis'] = Genesis
  ctx.loader.builtins['@deepseek-ai/dsh-experimental-genesis-qq'] = GenesisQq
  ctx.loader.internal = undefined
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  const model = new Model()
  ctx.llm.registerAdapter(['fixture'], model)
  if (!ctx.genesis.learningStatus().ready) await ctx.genesis.awaken('小芽')
  if (settingsOnly) {
    const signal = new AbortController().signal
    const initial = await ctx.genesisQqSettings.inspect(signal)
    if (initial.connectionRevision === 0) {
      expect(initial.mode).toBe('paused')
      expect(ctx.genesisQq.address()).toBeNull()
      expect(initial.tokenConfigured).toBe(false)
      await ctx.genesisQqSettings.setToken(token, signal)
      await ctx.genesisQqSettings.saveConnection({ ...initial.connection, enabled: true, botQq: '11111', operatorQq: '55555' }, 0, signal)
    }
  }
  const address = ctx.genesisQq.address()
  if (typeof address !== 'object' || address === null) throw new Error('Missing QQ listener address')
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`, { headers: { Authorization: `Bearer ${token}` } })
  cleanup.push(async () => {
    if (socket.readyState === WebSocket.CLOSED) return
    const closed = once(socket, 'close')
    socket.terminate()
    await closed
  })
  const sent: string[] = []
  const sentSegments: Array<Array<{ type: string; data: { text?: string; qq?: string } }>> = []
  const actions: Array<{ action: string; params: unknown }> = []
  const metadata = { groupName: '测试群', fail: false, uncertainNext: false, messages: new Map<string, unknown>() }
  socket.on('message', (data) => {
    const frame = JSON.parse(String(data)) as { action: string; echo: string; params: { message: Array<{ type: string; data: { text: string } }> } }
    actions.push({ action: frame.action, params: frame.params })
    if (frame.action === 'get_group_list' || frame.action === 'get_friend_list') {
      socket.send(JSON.stringify({ status: 'ok', retcode: 0, echo: frame.echo, data: frame.action === 'get_group_list'
        ? [{ group_id: 67890, group_name: metadata.groupName }]
        : [{ user_id: 99999, nickname: '小红', remark: '' }] }))
      return
    }
    if (frame.action === 'get_group_info') {
      socket.send(JSON.stringify({ status: metadata.fail ? 'failed' : 'ok', retcode: metadata.fail ? 1 : 0,
        echo: frame.echo, data: { group_name: metadata.groupName } }))
      return
    }
    if (frame.action === 'get_msg') {
      const params = z.object({ message_id: z.union([z.string(), z.number()]).transform(String) }).parse(frame.params)
      socket.send(JSON.stringify({ status: 'ok', retcode: 0, echo: frame.echo, data: metadata.messages.get(params.message_id) ?? null }))
      return
    }
    if (frame.action.startsWith('upload_')) { socket.send(JSON.stringify({ status: 'ok', retcode: 0, echo: frame.echo, data: null })); return }
    if (!frame.action.startsWith('send_')) throw new Error('Unexpected QQ write action')
    sentSegments.push(frame.params.message)
    sent.push(frame.params.message.filter(part => part.type === 'text').map(part => part.data.text).join(''))
    const receipt = metadata.uncertainNext ? {} : { message_id: String(sent.length) }
    metadata.uncertainNext = false
    socket.send(JSON.stringify({ status: 'ok', retcode: 0, echo: frame.echo, data: receipt }))
  })
  await once(socket, 'open')
  return { ctx, model, socket, sent, sentSegments, metadata, actions }
}
function incoming(type: 'group' | 'private', id: number, user = 12345, name = '小明', group = 67890) {
  return JSON.stringify({ post_type: 'message', message_type: type, self_id: 11111, user_id: user,
    group_id: type === 'group' ? group : undefined, message_id: id, sender: { nickname: name },
    message: [...(type === 'group' ? [{ type: 'at', data: { qq: '11111' } }] : []), { type: 'text', data: { text: '你好，我们又见面了。' } }] })
}
async function receipt(ctx: Context, count: number) {
  await expect.poll(async () => (await ctx.genesis.snapshot()).events.filter(event => event.type === 'qq.receipt'
    && event.payload['status'] === 'confirmed').length).toBe(count)
}
function modelText(request: GenerateOptions): string {
  return JSON.stringify({ system: request.system, messages: request.messages.map(message => ({ role: message.role, content: message.content })) })
}

it('loads group and private Life conversations, filters private recall, acknowledges replies and resumes the same life and Session', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-loader-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  first.socket.send(incoming('group', 1))
  await receipt(first.ctx, 1)
  first.socket.send(incoming('private', 2))
  await receipt(first.ctx, 2)
  const state = await first.ctx.genesis.snapshot()
  const dm = state.people!.conversations.find(item => item.kind === 'private')!
  const group = state.people!.conversations.find(item => item.kind === 'group')!
  const author = state.events.find(event => event.type === 'interaction.observed' && event.relatedSessionId === dm.sessionId
    && event.payload['kind'] === 'user-message')!
  const secret = await first.ctx.genesis.remember({ content: '小明私下的秘密是蓝色风筝。', category: 'semantic', importance: 1,
    confidence: 0.9, sourceEventIds: [author.id] })
  const agent = first.ctx.agents.get(SessionId(group.sessionId))!
  expect(first.ctx.agentPresets.composedPreset(agent.ctx)).toBe('life')
  expect(first.ctx.get('compaction')).toBeUndefined()
  expect(first.ctx.agentPresets.serviceFor(agent, 'compaction')).toBeDefined()
  const recalled = await first.ctx.tools.execute({ agent, name: 'genesis_recall', callId: ToolCallId('group-secret'),
    arguments: { query: secret.id }, signal: new AbortController().signal })
  expect(JSON.stringify(recalled)).not.toContain(secret.content)
  const forbidden = await first.ctx.tools.execute({ agent, name: 'genesis_self', callId: ToolCallId('group-private-state'),
    arguments: {}, signal: new AbortController().signal })
  expect(forbidden.isError).toBe(true)
  first.socket.send(incoming('group', 3, 12345, '改名的小明'))
  await receipt(first.ctx, 3)
  expect(JSON.stringify(first.model.requests.filter(request => request.model === 'chat').at(-1))).not.toContain(secret.content)
  expect(JSON.stringify(first.model.requests.filter(request => request.model === 'chat').at(-1))).toContain('改名的小明')
  const logged = agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'genesis-person')
  expect(logged).toHaveLength(2)
  const pendingClose = once(first.socket, 'close')
  await first.ctx.fiber.dispose()
  await pendingClose
  const second = await boot(root)
  expect((await second.ctx.genesis.snapshot()).identity).toEqual(state.identity)
  second.socket.send(incoming('private', 4))
  await receipt(second.ctx, 4)
  const restored = await second.ctx.genesis.snapshot()
  expect(restored.people!.conversations.find(item => item.kind === 'private')!.sessionId).toBe(dm.sessionId)
  expect(second.ctx.agents.get(SessionId(dm.sessionId))).toBeDefined()
  expect(JSON.stringify(second.model.requests.find(request => request.model === 'chat'))).toContain(secret.content)
  const requests = second.model.requests.length
  second.socket.send(incoming('private', 4))
  // A later distinct message is a barrier: the prior duplicate must be settled before it.
  second.socket.send(incoming('private', 5))
  await receipt(second.ctx, 5)
  expect(second.model.requests.filter(request => request.model === 'chat')).toHaveLength(2)
  expect(second.model.requests.length).toBeGreaterThan(requests)
})

it('persists operator access rules, pauses admission and refuses stale revisions without returning the token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-policy-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const signal = new AbortController().signal
  const initial = await first.ctx.genesisQqSettings.inspect(signal)
  expect(initial.mode).toBe('connected')
  const guest = first.ctx.extend({ invocation: { peer: { principal: { kind: 'guest' } } } as RemoteInvocation })
  await expect(guest.genesisQqSettings.inspect(signal)).rejects.toThrow('operator access')
  expect(JSON.stringify(initial)).not.toContain(token)
  const paused = { ...initial.settings, enabled: false }
  expect(await first.ctx.genesisQqSettings.save(paused, initial.revision, signal)).toBe(1)
  first.socket.send(incoming('private', 1))
  const pong = once(first.socket, 'pong'); first.socket.ping(); await pong
  expect((await first.ctx.genesis.snapshot()).people).toBeUndefined()
  await expect(first.ctx.genesisQqSettings.save(initial.settings, 0, signal)).rejects.toThrow()
  const closing = once(first.socket, 'close')
  await first.ctx.fiber.dispose(); await closing
  const second = await boot(root)
  expect((await second.ctx.genesisQqSettings.inspect(signal)).settings.enabled).toBe(false)
  await second.ctx.genesisQqSettings.save({ ...paused, enabled: true, allowGroups: [], allowUsers: ['99999'] }, 1, signal)
  second.socket.send(incoming('private', 2))
  second.socket.send(incoming('private', 3, 99999))
  await receipt(second.ctx, 1)
  expect(second.model.requests.filter(request => request.model === 'chat')).toHaveLength(1)
  expect((await second.ctx.genesisQqSettings.inspect(signal)).deliveries[0]).toMatchObject({ status: 'confirmed', acknowledged: 1 })
})

it('configures QQ through settings without launch credentials, applies changes and restores them after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-settings-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root, true)
  const signal = new AbortController().signal
  const initial = await first.ctx.genesisQqSettings.inspect(signal)
  expect(initial.connectionRevision).toBe(1)
  expect(initial.connection).toMatchObject({ enabled: true, botQq: '11111', operatorQq: '55555', port: 0 })
  expect(JSON.stringify(initial)).not.toContain(token)
  first.socket.send(incoming('private', 1))
  await receipt(first.ctx, 1)
  const guest = first.ctx.extend({ invocation: { peer: { principal: { kind: 'guest' } } } as RemoteInvocation })
  await expect(guest.genesisQqSettings.setToken('another-long-test-token', signal)).rejects.toThrow('operator access')
  await expect(guest.genesisQqSettings.saveConnection(initial.connection, 1, signal)).rejects.toThrow('operator access')
  await expect(first.ctx.genesisQqSettings.saveConnection(initial.connection, 0, signal)).rejects.toThrow()
  await expect(first.ctx.genesisQqSettings.saveConnection({ ...initial.connection, wsUrl: 'ws://example.com' }, 1, signal)).rejects.toThrow('QQ settings operation failed')
  expect((await first.ctx.genesisQqSettings.inspect(signal)).mode).toBe('connected')
  const closed = once(first.socket, 'close')
  await first.ctx.genesisQqSettings.saveConnection({ ...initial.connection, enabled: false }, 1, signal)
  await closed
  expect((await first.ctx.genesisQqSettings.inspect(signal)).mode).toBe('paused')
  expect(first.ctx.genesisQq.address()).toBeNull()
  expect((await first.ctx.genesisQqSettings.inspect(signal)).deliveries).toHaveLength(1)
  const occupied = createServer()
  cleanup.push(() => new Promise<void>((resolve, reject) => occupied.close(error => error ? reject(error) : resolve())))
  occupied.listen(0, '127.0.0.1')
  await once(occupied, 'listening')
  const address = occupied.address()
  if (address === null || typeof address === 'string') throw new Error('Missing occupied listener address')
  await first.ctx.genesisQqSettings.saveConnection({ ...initial.connection, port: address.port }, 2, signal)
  expect(await first.ctx.genesisQqSettings.inspect(signal)).toMatchObject({ mode: 'failed', failure: 'transport', connectionRevision: 3 })
  expect(first.ctx.genesisQq.address()).toBeNull()
  await first.ctx.genesisQqSettings.saveConnection(initial.connection, 3, signal)
  const life = (await first.ctx.genesis.snapshot()).identity
  await first.ctx.fiber.dispose()
  const second = await boot(root, true)
  expect((await second.ctx.genesis.snapshot()).identity).toEqual(life)
  expect((await second.ctx.genesisQqSettings.inspect(signal)).connectionRevision).toBe(4)
  second.socket.send(incoming('private', 2))
  await receipt(second.ctx, 2)
  const disconnected = once(second.socket, 'close')
  await second.ctx.genesisQqSettings.setToken(undefined, signal)
  await disconnected
  expect(await second.ctx.genesisQqSettings.inspect(signal)).toMatchObject({ mode: 'unconfigured', tokenConfigured: false })
})

it('links the configured operator name to the authenticated person in logged model context across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-operator-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const state = await first.ctx.genesis.snapshot()
  await first.ctx.genesis.saveOperator({ name: '妈妈', identity: '小芽的妈妈' }, 0,
    state.memories.map(memory => ({ id: memory.id, updatedAt: memory.updatedAt })), [])
  const signal = new AbortController().signal
  const policy = await first.ctx.genesisQqSettings.inspect(signal)
  await first.ctx.genesisQqSettings.save({ ...policy.settings, allowUsers: ['55555', '12345'] }, policy.revision, signal)
  first.socket.send(incoming('private', 1, 55555, 'QQ 小号'))
  await receipt(first.ctx, 1)
  const personId = qqPersonId('55555')
  const route = (await first.ctx.genesis.snapshot()).people!.conversations.find(item => item.personId === personId)!
  const agent = first.ctx.agents.get(route.sessionId)!
  const section = agent.session.ownEvents().flatMap(event => event.type === 'user/message' && event.data.source.kind === 'genesis-state'
    ? event.data.source.sections : []).find(item => item.name === 'genesis:participants')!
  expect(section.text).toContain('"qq":"55555"')
  expect(section.text).not.toContain(personId)
  expect(section.text).toContain('"name":"妈妈"')
  expect(section.text).toContain('"identity":"小芽的妈妈"')
  expect(JSON.stringify(first.model.requests.find(request => request.model === 'chat'))).toContain(JSON.stringify(section.text).slice(1, -1))
  first.socket.send(incoming('private', 2, 12345, '妈妈'))
  await receipt(first.ctx, 2)
  const stranger = JSON.stringify(first.model.requests.filter(request => request.model === 'chat').at(-1))
  expect(stranger).not.toContain('小芽的妈妈')
  expect(stranger).not.toContain(personId)
  const closed = once(first.socket, 'close')
  await first.ctx.fiber.dispose(); await closed
  const second = await boot(root)
  second.socket.send(incoming('private', 3, 55555, '新的 QQ 昵称'))
  await receipt(second.ctx, 3)
  const request = JSON.stringify(second.model.requests.find(request => request.model === 'chat'))
  expect(request).toContain('妈妈')
  expect(request).toContain('小芽的妈妈')
  expect(modelText(second.model.requests.find(request => request.model === 'chat')!)).not.toContain(personId)
  expect((await second.ctx.genesis.snapshot()).people!.conversations.find(item => item.personId === personId)!.sessionId).toBe(route.sessionId)
})

it('reuses a group Agent resumed by Web and preserves that Agent when QQ disconnects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-shared-group-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  first.socket.send(incoming('group', 1))
  await receipt(first.ctx, 1)
  const group = (await first.ctx.genesis.snapshot()).people!.conversations.find(item => item.kind === 'group')!
  const closed = once(first.socket, 'close')
  await first.ctx.fiber.dispose(); await closed
  const second = await boot(root)
  const shared = await second.ctx.agents.resume({ resumeSessionId: group.sessionId, agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (scope) => { await second.ctx.agentPresets.mount(scope, 'life') } })
  cleanup.push(() => shared.dispose())
  second.socket.send(incoming('group', 2))
  await receipt(second.ctx, 2)
  expect(second.ctx.agents.get(group.sessionId)).toBe(shared.agent)
  const status = await second.ctx.genesisQqSettings.inspect(new AbortController().signal)
  const disconnected = once(second.socket, 'close')
  await second.ctx.genesisQqSettings.saveConnection({ ...status.connection, enabled: false }, status.connectionRevision, new AbortController().signal)
  await disconnected
  expect(second.ctx.agents.get(group.sessionId)).toBe(shared.agent)
})

it('recognizes operator and ordinary accounts on their first message in another group without sharing private identity text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-accounts-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, socket, model } = await boot(root)
  const state = await ctx.genesis.snapshot()
  await ctx.genesis.saveOperator({ name: '妈妈', identity: '仅限私聊的身份描述' }, 0,
    state.memories.map(memory => ({ id: memory.id, updatedAt: memory.updatedAt })), [])
  const signal = new AbortController().signal
  const policy = await ctx.genesisQqSettings.inspect(signal)
  await ctx.genesisQqSettings.save({ ...policy.settings, allowGroups: ['67890', '77777'] }, policy.revision, signal)
  socket.send(incoming('group', 701, 55555, '甲群名片'))
  await receipt(ctx, 1)
  socket.send(incoming('group', 702, 55555, '乙群名片', 77777))
  await receipt(ctx, 2)
  const current = () => model.requests.filter(request => request.model === 'chat').at(-1)!
  const roster = () => {
    const message = current().messages.filter(message => message.role === 'user' && message.source.kind === 'genesis-state')
      .flatMap(message => message.content).filter(block => block.type === 'text')
      .map(block => block.text).findLast(text => text.includes('[genesis:participants]'))!
    const text = message.split('[genesis:participants]\n')[1]!.split('\n\n[')[0]!
    return z.looseObject({ operator: z.looseObject({ identity: z.string() }), people: z.array(z.looseObject({
      qq: z.string(), nickname: z.string(), name: z.string().nullable(), seenBefore: z.boolean(), isOperator: z.boolean(),
    })) }).parse(JSON.parse(text.replace(/^Participants: /u, '')))
  }
  expect(roster().people.find(person => person.qq === '55555')).toMatchObject({ nickname: '乙群名片', name: '妈妈', seenBefore: true, isOperator: true })
  expect(roster().operator.identity).toBe('')
  expect(modelText(current())).not.toMatch(/仅限私聊的身份描述|person:[a-f0-9]{64}/u)
  socket.send(incoming('group', 703, 12345, '原来的名字'))
  await receipt(ctx, 3)
  socket.send(incoming('group', 704, 12345, '换群后的名字', 77777))
  await receipt(ctx, 4)
  expect(roster().people.find(person => person.qq === '12345')).toMatchObject({ nickname: '换群后的名字', name: '原来的名字', seenBefore: true, isOperator: false })
  socket.send(incoming('group', 705, 99999, '妈妈', 77777))
  await receipt(ctx, 5)
  expect(roster().people.find(person => person.qq === '99999')).toMatchObject({ nickname: '妈妈', name: null, seenBefore: false, isOperator: false })
  expect(modelText(current())).not.toMatch(/person:[a-f0-9]{64}/u)
})

it('preserves incoming mention targets, sends real group mentions and accepts legacy reserved-message hashes without replay', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-mentions-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, socket, model, sentSegments } = await boot(root)
  model.chatReply = '@12345 你好， @99999 请看看'
  const frame = z.looseObject({ message_id: z.number(), message: z.array(z.unknown()) }).parse(JSON.parse(incoming('group', 901)))
  frame.message.splice(1, 0, { type: 'at', data: { qq: '99999' } })
  socket.send(JSON.stringify(frame))
  await receipt(ctx, 1)
  expect(modelText(model.requests.find(request => request.model === 'chat')!)).toContain('@11111 @99999')
  expect(sentSegments[0]!.filter(part => part.type === 'at').map(part => part.data.qq)).toEqual(['12345', '99999'])
  frame.message_id = 902
  frame.message = [{ type: 'at', data: { qq: '11111' } }]
  socket.send(JSON.stringify(frame))
  await receipt(ctx, 2)
  socket.send(JSON.stringify({ ...frame, message_id: 903, message: '[CQ:at,qq=11111][CQ:at,qq=99999]你好' }))
  await receipt(ctx, 3)
  socket.send(incoming('private', 904))
  await receipt(ctx, 4)
  expect(sentSegments[3]).toEqual([{ type: 'text', data: { text: model.chatReply } }])
  const state = await ctx.genesis.snapshot()
  const group = state.people!.conversations.find(item => item.kind === 'group')!
  const source = Genesis.personSourceSchema.parse({ kind: 'genesis-person', platform: 'qq', personId: qqPersonId('12345'),
    accountId: '12345', conversationId: group.id, name: '小明', messageId: '905' })
  const legacy = [{ type: 'text', text: `发言者 ${JSON.stringify({ personId: source.personId, name: source.name })}\n你好，我们又见面了。` }]
  await ctx.genesis.reservePersonMessage(group.sessionId, source, createHash('sha256').update(JSON.stringify(legacy)).digest('hex'))
  const before = model.requests.filter(request => request.model === 'chat').length
  socket.send(incoming('group', 905))
  socket.send(incoming('group', 906))
  await receipt(ctx, 5)
  expect(model.requests.filter(request => request.model === 'chat')).toHaveLength(before + 1)
  expect((await ctx.genesisQqSettings.inspect(new AbortController().signal)).failure).toBeNull()
})

it('keeps QQ workspace and account-linked titles, logs prompt edits and restores channel windows after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-conversation-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const signal = new AbortController().signal
  const initial = await first.ctx.genesisQqSettings.inspect(signal)
  expect(initial.settings).toMatchObject({ extraPrompt: '', privateContextTokens: 200000, groupContextTokens: 400000, operatorContextTokens: 500000 })
  const policy = { ...initial.settings, extraPrompt: '回复简短自然，通常用一到三句话。', allowUsers: ['12345', '55555'] }
  await first.ctx.genesisQqSettings.save(policy, initial.revision, signal)
  first.socket.send(incoming('group', 100))
  await receipt(first.ctx, 1)
  first.socket.send(incoming('private', 101))
  await receipt(first.ctx, 2)
  first.socket.send(incoming('private', 102, 55555, '操作者的QQ昵称'))
  await receipt(first.ctx, 3)
  const conversations = (await first.ctx.genesis.snapshot()).people!.conversations
  const group = conversations.find(item => item.kind === 'group')!
  const dm = conversations.find(item => item.kind === 'private' && item.personId === qqPersonId('12345'))!
  const operator = conversations.find(item => item.kind === 'private' && item.personId === qqPersonId('55555'))!
  const getAgent = (id: string) => first.ctx.agents.get(SessionId(id))!
  const window = (id: string, capacity = 1000000) => first.ctx.agentPresets.serviceFor(getAgent(id), 'compaction')!.ctx.waterfall('compaction/context-window',
    { session: getAgent(id).session, modelWindow: capacity }, () => capacity)
  expect(window(dm.sessionId)).toBe(200000)
  expect(window(group.sessionId)).toBe(400000)
  expect(window(operator.sessionId)).toBe(500000)
  expect(window(operator.sessionId, 128000)).toBe(128000)
  const workspace = first.ctx.workspaceRegistry.list().find(item => item.title === 'QQ')!
  expect(workspace.sessionIds).toEqual(expect.arrayContaining(conversations.map(item => SessionId(item.sessionId))))
  expect(first.ctx.sessionTitle.get(getAgent(group.sessionId).session)?.title).toBe('测试群')
  expect(first.ctx.sessionTitle.get(getAgent(dm.sessionId).session)?.title).toBe('小明')
  const groupAgent = getAgent(group.sessionId)
  expect(groupAgent.session.ownEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'genesis-state'
    && JSON.stringify(event.data).includes(policy.extraPrompt))).toBe(true)
  expect(JSON.stringify(first.model.requests.filter(request => request.model === 'chat').at(-1))).toContain(policy.extraPrompt)
  first.metadata.groupName = '改名后的群'
  first.socket.send(incoming('group', 103, 55555))
  await receipt(first.ctx, 4)
  expect(window(group.sessionId)).toBe(400000)
  expect(first.ctx.sessionTitle.get(groupAgent.session)?.title).toBe('改名后的群')
  first.metadata.fail = true
  first.socket.send(incoming('group', 104))
  await receipt(first.ctx, 5)
  expect(first.ctx.sessionTitle.get(groupAgent.session)?.title).toBe('改名后的群')
  const saved = await first.ctx.genesisQqSettings.inspect(signal)
  await first.ctx.genesisQqSettings.save({ ...saved.settings, extraPrompt: '', privateContextTokens: 210000 }, saved.revision, signal)
  first.socket.send(incoming('private', 105, 12345, '改名的小明'))
  await receipt(first.ctx, 6)
  expect(first.ctx.sessionTitle.get(getAgent(dm.sessionId).session)?.title).toBe('改名的小明')
  expect(getAgent(dm.sessionId).session.ownEvents().some(event => event.type === 'user/message'
    && event.data.source.kind === 'genesis-state' && event.data.source.form === 'snapshot'
    && event.data.source.sections.some(section => section.name === 'genesis:qq-preferences' && section.text === ''))).toBe(true)
  await first.ctx.fiber.dispose()
  const second = await boot(root)
  expect((await second.ctx.genesisQqSettings.inspect(signal)).settings).toMatchObject({ extraPrompt: '', privateContextTokens: 210000 })
  second.socket.send(incoming('private', 106, 12345, '再改名的小明'))
  await receipt(second.ctx, 7)
  const resumed = second.ctx.agents.get(SessionId(dm.sessionId))!
  expect(second.ctx.sessionTitle.get(resumed.session)?.title).toBe('再改名的小明')
  expect(second.ctx.workspaceRegistry.list().find(item => item.title === 'QQ')?.id).toBe(workspace.id)
  expect(second.ctx.agentPresets.serviceFor(resumed, 'compaction')!.ctx.waterfall('compaction/context-window', { session: resumed.session, modelWindow: 1000000 }, () => 1000000)).toBe(210000)
})

it('reads version-one admission settings with explicit conversation defaults and saves version three', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-legacy-policy-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const settings = { enabled: true, allowGroups: ['67890'], allowUsers: ['12345'],
    acceptPrivateFromAnyone: false, replyOnlyWhenMentioned: true }
  const path = join(root, 'genesis_qq.json')
  await writeFile(path, JSON.stringify({ unit: { name: 'genesis_qq', version: 1 }, global: null,
    tables: { settings: { qq: { schemaVersion: 1, revision: 5, settings } } } }) + '\n')
  const { ctx } = await boot(root)
  const signal = new AbortController().signal
  const sample = await ctx.genesisQqSettings.inspect(signal)
  expect(sample).toMatchObject({ revision: 5, settings: { ...settings, extraPrompt: '',
    privateContextTokens: 200000, groupContextTokens: 400000, operatorContextTokens: 500000 } })
  await expect(ctx.genesisQqSettings.save({ ...sample.settings, privateContextTokens: 0 }, 5, signal)).rejects.toThrow()
  await expect(ctx.genesisQqSettings.save({ ...sample.settings, extraPrompt: 'x'.repeat(8001) }, 5, signal)).rejects.toThrow()
  expect((await ctx.genesisQqSettings.inspect(signal)).revision).toBe(5)
  await ctx.genesisQqSettings.save({ ...sample.settings, extraPrompt: '简短聊天' }, 5, signal)
  expect(await readFile(path, 'utf8')).toContain('"schemaVersion": 3')
})

it('reports archived group and private routes, leaves their input unreserved and resumes only after operator restoration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-archived-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, socket, model } = await boot(root)
  const signal = new AbortController().signal
  socket.send(incoming('group', 801))
  await receipt(ctx, 1)
  socket.send(incoming('private', 802))
  await receipt(ctx, 2)
  const conversations = (await ctx.genesis.snapshot()).people!.conversations
  const group = conversations.find(item => item.kind === 'group')!
  const privateChat = conversations.find(item => item.kind === 'private')!
  const agents = [group, privateChat].map(item => ctx.agents.get(item.sessionId)!)
  await Promise.all(agents.map(agent => agent.whenIdle()))
  await ctx.workspaceRegistry.archiveSession(group.sessionId)
  await ctx.workspaceRegistry.archiveSession(privateChat.sessionId)
  expect((await ctx.genesisQqSettings.inspect(signal)).failure).toBe('archived')
  const requests = model.requests.length
  socket.send(incoming('group', 803))
  socket.send(incoming('private', 804))
  // A third allowed peer verifies fresh private Session creation while the other routes stay archived.
  socket.send(incoming('private', 805, 99999))
  await receipt(ctx, 3)
  await Promise.all(ctx.agents.list().map(agent => agent.whenIdle()))
  await expect.poll(async () => (await ctx.genesisQqSettings.inspect(signal)).pending).toBe(0)
  expect(model.requests.slice(requests).filter(request => request.model === 'chat')).toHaveLength(1)
  for (const agent of agents) {
    expect(agent.session.ownEvents().filter(event => event.type === 'user/message'
      && event.data.source.kind === 'genesis-person')).toHaveLength(1)
  }
  await ctx.workspaceRegistry.unarchiveSession(privateChat.sessionId)
  expect((await ctx.genesisQqSettings.inspect(signal)).failure).toBe('archived')
  socket.send(incoming('private', 804))
  await receipt(ctx, 4)
  await ctx.workspaceRegistry.unarchiveSession(group.sessionId)
  expect((await ctx.genesisQqSettings.inspect(signal)).failure).toBeNull()
  socket.send(incoming('group', 803))
  await receipt(ctx, 5)
  for (const agent of agents) {
    expect(agent.session.ownEvents().filter(event => event.type === 'user/message'
      && event.data.source.kind === 'genesis-person')).toHaveLength(2)
  }
})

it('summarizes ordinary conversation switches, leaves short QQ tails to inactivity and restores independent progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-temporary-loader-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root, false, true)
  const signal = new AbortController().signal
  const web = async (id: string, text: string) => {
    const handle = await first.ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: root, agentPreset: 'life' },
      agentOptions: { provider: 'fixture', model: 'chat' }, setup: async (ctx) => { await first.ctx.agentPresets.mount(ctx, 'life') } })
    cleanup.push(() => handle.dispose())
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }))
    await handle.agent.whenIdle()
    return handle.agent
  }
  const a = await web('temporary-web-a', '第一条消息' + '猫'.repeat(1100))
  const b = await web('temporary-web-b', '第二个普通对话')
  await expect.poll(async () => (await first.ctx.genesisTemporary.inspect(signal)).count, { timeout: 5000 }).toBe(2)
  let sample = await first.ctx.genesisTemporary.inspect(signal)
  expect(sample.memories.every(memory => memory.sessionId === a.id && memory.days === 3)).toBe(true)
  expect(first.model.requests.filter(request => typeof request.system === 'string' && request.system.includes('只评估一次'))).toHaveLength(2)
  b.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续第二个对话' }] }))
  await b.whenIdle()
  expect(b.session.ownEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'genesis-state'
    && event.data.source.form === 'snapshot' && event.data.source.sections.some(section => section.name.startsWith('genesis:temporary:')))).toBe(true)
  const through = sample.memories.map(memory => memory.sourceSeqs)
  first.socket.send(incoming('private', 301))
  await receipt(first.ctx, 1)
  await expect.poll(async () => (await first.ctx.genesisTemporary.inspect(signal)).count, { timeout: 5000 }).toBe(3)
  first.socket.send(incoming('group', 302))
  await receipt(first.ctx, 2)
  sample = await first.ctx.genesisTemporary.inspect(signal)
  expect(sample.memories.some(memory => memory.audience.kind !== 'operator')).toBe(false)
  const summariesBefore = first.model.requests.filter(request => typeof request.system === 'string' && request.system.startsWith('将提供的按顺序对话')).length
  await first.ctx.genesisTemporary.save({ ...sample.settings, idleMs: 1000 }, sample.revision, signal)
  await expect.poll(async () => (await first.ctx.genesisTemporary.inspect(signal)).count, { timeout: 5000 }).toBe(5)
  sample = await first.ctx.genesisTemporary.inspect(signal)
  expect(sample.memories.filter(memory => memory.sessionId === a.id).map(memory => memory.sourceSeqs)).toEqual(through)
  expect(first.model.requests.filter(request => typeof request.system === 'string' && request.system.startsWith('将提供的按顺序对话'))).toHaveLength(summariesBefore + 2)
  const count = sample.count
  await first.ctx.fiber.dispose()
  // Restore the durable point after the importance audit and before atomic memory/progress publication.
  const recovered = sample.memories.find(memory => memory.sessionId === a.id)!
  const statePath = join(root, 'genesis_temporary_memory.json')
  const saved = z.looseObject({ tables: z.looseObject({ state: z.looseObject({ current: temporaryStateSchema }) }) })
    .parse(JSON.parse(await readFile(statePath, 'utf8')))
  const cursor = saved.tables.state.current.sessions.find(item => item.sessionId === a.id)!
  cursor.through = recovered.sourceSeqs[0]! - 1
  cursor.due = true
  cursor.pending = { id: recovered.id, sourceSeqs: recovered.sourceSeqs, through: recovered.sourceSeqs.at(-1)!,
    audience: recovered.audience, summary: recovered.summary, assessment: 'requested' }
  saved.tables.state.current.memories = saved.tables.state.current.memories.filter(memory => memory.id !== recovered.id)
  await writeFile(statePath, JSON.stringify(saved) + '\n')
  const second = await boot(root, false, true)
  await expect.poll(async () => (await second.ctx.genesisTemporary.inspect(signal)).count, { timeout: 5000 }).toBe(count)
  const restored = await second.ctx.genesisTemporary.inspect(signal)
  expect(restored.count).toBe(count)
  const source = restored.memories.find(memory => memory.sessionId === a.id)!
  await second.ctx.genesisTemporary.retry(a.id, signal)
  expect((await second.ctx.genesisTemporary.inspect(signal)).count).toBe(count)
  expect(second.model.requests.filter(request => typeof request.system === 'string' && request.system.includes('只评估一次'))).toHaveLength(0)
  expect(second.model.requests.filter(request => typeof request.system === 'string' && request.system.startsWith('将提供的按顺序对话'))).toHaveLength(0)
  await second.ctx.genesisTemporary.forget(source.id, signal)
  expect((await second.ctx.genesisTemporary.inspect(signal)).count).toBe(count - 1)
})

it('summarizes a completed QQ batch while the conversation stays active', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-temporary-batch-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, socket } = await boot(root, false, true)
  const signal = new AbortController().signal
  const raw = z.looseObject({ message: z.array(z.unknown()) }).parse(JSON.parse(incoming('private', 1301)))
  raw.message = [{ type: 'text', data: { text: '鲸鲸，今天发生了一件事：' + '猫'.repeat(1100) } }]
  socket.send(JSON.stringify(raw))
  await receipt(ctx, 1)
  // The inactivity interval is ten minutes; only the completed batch may trigger these two whole-message summaries.
  await expect.poll(async () => (await ctx.genesisTemporary.inspect(signal)).count, { timeout: 5000 }).toBe(2)
})

it('finishes a Web follow-up queued while a privately resumed temporary-memory Agent is summarizing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-temporary-followup-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, model } = await boot(root, false, true)
  const create = async (id: string) => ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: root, agentPreset: 'life' },
    agentOptions: { provider: 'fixture', model: 'chat' }, setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'life') } })
  const first = await create('temporary-followup-a')
  first.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '需要总结的原对话' }] }))
  await first.agent.whenIdle()
  await first.dispose()
  const gate = Promise.withResolvers<void>()
  model.temporaryGate = () => gate.promise
  const second = await create('temporary-followup-b')
  second.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '切换到另一会话' }] }))
  cleanup.push(async () => { gate.resolve() })
  await expect.poll(() => model.requests.some(request => typeof request.system === 'string'
    && request.system.startsWith('将提供的按顺序对话')), { timeout: 3000 }).toBe(true)
  const resumed = ctx.agents.get(SessionId('temporary-followup-a'))!
  resumed.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '总结期间发送的新消息' }] }))
  model.temporaryGate = undefined
  gate.resolve()
  await resumed.whenIdle()
  expect(resumed.session.ownEvents().filter(event => event.type === 'assistant/message')).toHaveLength(2)
  expect(resumed.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'user')).toHaveLength(2)
})


it('selects group replies from five recent messages, keeps skipped history isolated and resumes deduplication after restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-group-choice-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const signal = new AbortController().signal
  const initial = await first.ctx.genesisQqSettings.inspect(signal)
  await first.ctx.genesisQqSettings.save({ ...initial.settings, groupAutoReply: true, allowGroups: ['67890', '77777'] }, initial.revision, signal)
  const frame = (id: number, text: string, mention = false, group = 67890) => {
    const raw = z.looseObject({ message: z.array(z.unknown()) }).parse(JSON.parse(incoming('group', id, 12345, '小明', group)))
    raw.message = [...(mention ? [{ type: 'at', data: { qq: '11111' } }] : []), { type: 'text', data: { text } }]
    return JSON.stringify(raw)
  }
  for (let id = 1; id <= 5; id++) first.socket.send(frame(id, `围观消息${id}`, id === 1))
  const groupAgent = async () => {
    const binding = (await first.ctx.genesis.snapshot()).people!.conversations.find(item => item.kind === 'group')!
    return first.ctx.agents.get(binding.sessionId)!
  }
  await expect.poll(async () => groupRecords((await groupAgent()).session).filter(row => row.kind === 'decision').length).toBe(5)
  expect(first.sent).toHaveLength(0)
  expect(first.model.requests.filter(request => request.model === 'chat')).toHaveLength(0)
  const decisions = () => first.model.requests.filter(request => typeof request.system === 'string' && request.system.startsWith('Should the character reply'))
  expect(decisions()).toHaveLength(5)
  const last = decisions().at(-1)!
  const evidence = z.looseObject({ recentMessages: z.looseObject({ messages: z.array(z.looseObject({ text: z.string() })) }) })
    .parse(JSON.parse(last.messages[0]!.content.filter(block => block.type === 'text').map(block => block.text).join('')))
  expect(evidence.recentMessages.messages).toHaveLength(5)
  expect(evidence.recentMessages.messages.map(row => row.text)).toEqual(['@11111 围观消息1', '围观消息2', '围观消息3', '围观消息4', '围观消息5'])
  expect(JSON.stringify(evidence)).not.toMatch(/"(?:seq|messageId|nextBeforeSeq|confidence)":/u)
  const agent = await groupAgent()
  expect(agent.session.ownEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'genesis-person')).toHaveLength(0)
  first.model.groupReply = true
  first.socket.send(frame(6, '感兴趣的话题，无需提及机器人'))
  await receipt(first.ctx, 1)
  const chat = first.model.requests.filter(request => request.model === 'chat').at(-1)!
  expect(chat.tools?.some(tool => tool.name === 'genesis_qq_history')).toBe(true)
  expect(modelText(chat)).toContain('围观消息2')
  expect(modelText(chat)).not.toContain('围观消息1')
  expect(modelText(chat)).not.toMatch(/person:[a-f0-9]{64}/u)
  const recentContext = agent.session.ownEvents().flatMap(event => event.type === 'user/message' && event.data.source.kind === 'genesis-state'
    ? event.data.source.sections : []).findLast(section => section.name === 'genesis:qq-recent')!
  expect(recentContext.text).not.toMatch(/"(?:seq|messageId|nextBeforeSeq|confidence)":/u)
  const peopleContext = agent.session.ownEvents().flatMap(event => event.type === 'user/message' && event.data.source.kind === 'genesis-state'
    ? event.data.source.sections : []).findLast(section => section.name === 'genesis:participants')!
  expect(peopleContext.text).not.toContain('"confidence":')
  const history = await first.ctx.tools.execute({ agent, name: 'genesis_qq_history', callId: ToolCallId('group-history'), arguments: { limit: 20 }, signal })
  expect(history.isError).toBe(false)
  expect(JSON.stringify(history)).toContain('围观消息1')
  const denied = await first.ctx.tools.execute({ agent, name: 'genesis_qq_history', callId: ToolCallId('other-group-history'), arguments: { group: '77777' }, signal })
  expect(denied.isError).toBe(true)
  first.model.groupReply = false
  first.socket.send(frame(7, '另一个群的消息', false, 77777))
  first.socket.send(incoming('private', 8))
  await receipt(first.ctx, 2)
  const privateBinding = (await first.ctx.genesis.snapshot()).people!.conversations.find(item => item.kind === 'private')!
  const privateAgent = first.ctx.agents.get(privateBinding.sessionId)!
  expect(JSON.stringify(await first.ctx.tools.execute({ agent: privateAgent, name: 'genesis_qq_history',
    callId: ToolCallId('private-history'), arguments: {}, signal }))).not.toContain('围观消息')
  const web = await first.ctx.agents.create({ sessionId: SessionId('history-web'), agentOptions: { provider: 'fixture', model: 'chat' } })
  cleanup.push(() => web.dispose())
  expect(first.ctx.tools.schemas(web.agent).some(tool => tool.name === 'genesis_qq_history')).toBe(false)
  expect((await first.ctx.tools.execute({ agent: web.agent, name: 'genesis_qq_history', callId: ToolCallId('web-denial'), arguments: {}, signal })).isError).toBe(true)
  await expect.poll(async () => (await first.ctx.genesisQqSettings.inspect(signal)).pending).toBe(0)
  expect(decisions()).toHaveLength(7)
  first.model.groupDecisionFailure = true
  first.socket.send(frame(9, '本条决策服务失败'))
  await expect.poll(async () => (await first.ctx.genesisQqSettings.inspect(signal)).failure).toBe('decision')
  expect(first.sent).toHaveLength(2)
  first.socket.send(incoming('private', 10))
  await receipt(first.ctx, 3)
  // Tiny output pages preserve Unicode and flag truncation instead of overflowing wrappers.
  const page = historyPage(historyMessages(agent.session, '11111'), 5, 1000)
  expect(JSON.stringify(page).length).toBeLessThanOrEqual(1000)
  const oversized = historyPage([{ seq: 0, time: 0, role: 'user', qq: '1', nickname: '甲', text: '猫😀'.repeat(3000) }], 1, 1000)
  expect(oversized.messages[0]!.truncated).toBe(true)
  expect(JSON.stringify(oversized).length).toBeLessThanOrEqual(1000)
  const sessionId = agent.id
  await first.ctx.fiber.dispose()
  const second = await boot(root)
  expect((await second.ctx.genesisQqSettings.inspect(signal)).settings.groupAutoReply).toBe(true)
  second.socket.send(frame(5, '围观消息5'))
  second.socket.send(frame(11, '恢复后的新消息'))
  await expect.poll(() => second.model.requests.filter(request => typeof request.system === 'string' && request.system.startsWith('Should the character reply')).length).toBe(1)
  await expect.poll(async () => (await second.ctx.genesisQqSettings.inspect(signal)).pending).toBe(0)
  const restored = second.ctx.agents.get(sessionId)!
  expect(historyMessages(restored.session, '11111').filter(row => row.text === '围观消息5')).toHaveLength(1)
  expect(groupRecords(restored.session).filter(row => row.kind === 'message' && row.messageId === '9')).toHaveLength(1)
  const current = await second.ctx.genesisQqSettings.inspect(signal)
  await second.ctx.genesisQqSettings.save({ ...current.settings, enabled: false }, current.revision, signal)
  expect((await second.ctx.tools.execute({ agent: restored, name: 'genesis_qq_history', callId: ToolCallId('paused-history'), arguments: {}, signal })).isError).toBe(true)
  await second.ctx.genesisQq.close()
  expect(second.ctx.tools.schemas(restored).some(tool => tool.name === 'genesis_qq_history')).toBe(false)
})


it('exposes QQ search and limited browsing while enforcing toolkit audiences and policy changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-toolkit-policy-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const signal = new AbortController().signal
  const navigate = 'mcp__playwright-mcp__browser_navigate'
  const screenshot = 'mcp__playwright-mcp__browser_take_screenshot'
  const evaluate = 'mcp__playwright-mcp__browser_evaluate'
  const names = ['web_search', 'fixture_public', 'fixture_operator', 'fixture_disabled', navigate, screenshot, evaluate]
  const register = (ctx: Context) => names.forEach(name => ctx.tools.register(defineTool({ name, description: 'Test-only read fixture.',
    parameters: { url: { type: 'string' }, filename: { type: 'string' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { return 'fixture tool completed' } })))
  register(first.ctx)
  for (const name of names.slice(1)) await first.ctx.genesis.learn(name, SessionId('operator-setup'))
  const entries = [
    { id: brandString<'GenesisToolkitId'>('public'), name: '公共工具', description: '可供任何人启用', tools: ['fixture_public', 'mcp__playwright-mcp__*'], qqAccess: 'anyone' as const },
    { id: brandString<'GenesisToolkitId'>('operator'), name: '操作者工具', description: '仅操作者启用与执行', tools: ['fixture_operator'], qqAccess: 'operator' as const },
    { id: brandString<'GenesisToolkitId'>('disabled'), name: '本机工具', description: 'QQ 不开放', tools: ['fixture_disabled'], qqAccess: 'disabled' as const },
    ...(await first.ctx.genesisToolkits.inspect(signal)).entries.filter(entry => entry.id === 'browser-reading'),
  ]
  expect(entries[3]?.qqAccess).toBe('anyone')
  await first.ctx.genesisToolkits.save(entries, 0, signal)
  first.socket.send(incoming('group', 1101))
  await receipt(first.ctx, 1)
  const binding = (await first.ctx.genesis.snapshot()).people!.conversations.find(item => item.kind === 'group')!
  const agent = first.ctx.agents.get(binding.sessionId)!
  const execute = (name: string, args = {}) => first.ctx.tools.execute({ agent, name, arguments: args, callId: ToolCallId(`qq-policy-${name}`), signal })
  const chat = first.model.requests.filter(request => request.model === 'chat').at(-1)!
  expect(chat.tools?.some(tool => tool.name === 'web_search')).toBe(true)
  expect(first.ctx.genesis.learningStatus().tools).not.toContain('web_search')
  expect((await execute('web_search')).isError).toBe(false)
  expect((await execute(navigate, { url: 'https://example.com' })).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'browser-reading' })).isError).toBe(false)
  expect((await execute(navigate, { url: 'https://example.com' })).isError).toBe(false)
  expect((await execute(screenshot)).isError).toBe(false)
  expect((await execute(screenshot, { filename: 'private.png' })).isError).toBe(true)
  expect((await execute(navigate, { url: 'file:///etc/passwd' })).isError).toBe(true)
  expect((await execute(navigate, { url: 'javascript:alert(1)' })).isError).toBe(true)
  expect((await execute(navigate, { url: 'https://user:password@example.com' })).isError).toBe(true)
  expect((await execute(evaluate)).isError).toBe(true)
  expect((await execute('fixture_public')).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'public' })).isError).toBe(false)
  expect((await execute('fixture_public')).isError).toBe(false)
  expect((await execute(evaluate)).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'operator' })).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'disabled' })).isError).toBe(true)
  first.socket.send(incoming('group', 1102, 99999, '妈妈'))
  await receipt(first.ctx, 2)
  const guestTools = first.model.requests.filter(request => request.model === 'chat').at(-1)!.tools?.map(tool => tool.name)
  expect(guestTools).toContain(navigate)
  expect(guestTools).not.toContain(evaluate)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'operator' })).isError).toBe(true)
  first.socket.send(incoming('group', 1103, 55555, '操作者'))
  await receipt(first.ctx, 3)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'operator' })).isError).toBe(false)
  expect((await execute('fixture_operator')).isError).toBe(false)
  const guest = agent.session.ownEvents().find(event => event.type === 'user/message'
    && event.data.source.kind === 'genesis-person' && event.data.source.accountId === '12345')!
  appendPluginRecord(agent.session, 'plugin:genesis/toolkit', { version: 2, sessionId: agent.id, id: entries[1]!.id, enabled: true,
    grant: { actor: qqPersonId('55555'), sourceSeq: guest.seq } })
  expect((await execute('fixture_operator')).isError).toBe(true)
  expect((await execute('genesis_toolkit', { action: 'enable', id: 'operator' })).isError).toBe(false)
  first.socket.send(incoming('group', 1104, 12345))
  await receipt(first.ctx, 4)
  expect(first.model.requests.filter(request => request.model === 'chat').at(-1)!.tools?.map(tool => tool.name)).toContain('fixture_operator')
  expect((await execute('fixture_operator')).isError).toBe(true)
  expect((await execute('fixture_public')).isError).toBe(false)
  await first.ctx.fiber.dispose()
  const second = await boot(root)
  register(second.ctx)
  second.socket.send(incoming('group', 1105, 12345))
  await receipt(second.ctx, 5)
  const restored = second.ctx.agents.get(binding.sessionId)!
  expect(second.model.requests.filter(request => request.model === 'chat').at(-1)!.tools?.map(tool => tool.name)).toContain('fixture_operator')
  const run = (name: string, args = {}) => second.ctx.tools.execute({ agent: restored, name, arguments: args, callId: ToolCallId(`qq-policy-restored-${name}`), signal })
  expect((await run('fixture_public')).isError).toBe(false)
  expect((await run(navigate, { url: 'https://example.com' })).isError).toBe(false)
  expect((await run(evaluate)).isError).toBe(true)
  expect((await run('fixture_operator')).isError).toBe(true)
  await second.ctx.genesisToolkits.save(entries.map(entry => ({ ...entry, qqAccess: 'disabled' })), 1, signal)
  expect((await run('fixture_public')).isError).toBe(true)
  expect((await run('genesis_toolkit', { action: 'enable', id: 'public' })).isError).toBe(true)
  second.socket.send(incoming('group', 1106))
  await receipt(second.ctx, 6)
  const advertised = () => second.model.requests.filter(request => request.model === 'chat').at(-1)!.tools?.map(tool => tool.name)
  expect(advertised()).toContain('fixture_public')
  restored.session.append('compaction/end', { compactionId: CompactionId('qq-idle-tools'), turn: null })
  second.socket.send(incoming('group', 1107))
  await receipt(second.ctx, 7)
  expect(advertised()).not.toContain('fixture_public')
  const policy = await second.ctx.genesisQqSettings.inspect(signal)
  await second.ctx.genesisQqSettings.save({ ...policy.settings, allowUsers: ['55555', '12345', '99999'] }, policy.revision, signal)
  second.socket.send(incoming('private', 1108, 55555, '操作者'))
  await receipt(second.ctx, 8)
  const operatorBinding = (await second.ctx.genesis.snapshot()).people!.conversations.find(item => item.kind === 'private')!
  const operatorAgent = second.ctx.agents.get(operatorBinding.sessionId)!
  const operatorRun = (name: string, args = {}) => second.ctx.tools.execute({ agent: operatorAgent, name, arguments: args,
    callId: ToolCallId(`qq-private-${name}`), signal })
  expect((await operatorRun('genesis_toolkit', { action: 'enable', id: 'disabled' })).isError).toBe(false)
  expect((await operatorRun('fixture_disabled')).isError).toBe(false)
  expect((await operatorRun('genesis_toolkit', { action: 'enable', id: 'public' })).isError).toBe(false)
  expect((await operatorRun(evaluate)).isError).toBe(false)
  second.socket.send(incoming('private', 1109, 55555, '操作者'))
  await receipt(second.ctx, 9)
  expect(advertised()).toContain(evaluate)
  expect(advertised()).toContain('fixture_disabled')
  expect((await operatorRun('genesis_toolkit', { action: 'disable', id: 'public' })).isError).toBe(false)
  second.socket.send(incoming('private', 1110, 55555, '操作者'))
  await receipt(second.ctx, 10)
  expect(advertised()).not.toContain(evaluate)
})

it('offers learned writings on QQ but executes them only for the authenticated operator', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-writings-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, model, socket } = await boot(root, false, false, true)
  const signal = new AbortController().signal
  await ctx.genesis.learn('genesis_record', SessionId('writings-setup'))
  const advertised = () => model.requests.filter(request => request.model === 'chat').at(-1)!.tools?.some(tool => tool.name === 'genesis_record')
  socket.send(incoming('group', 1201, 55555, '操作者'))
  await receipt(ctx, 1)
  const binding = (await ctx.genesis.snapshot()).people!.conversations.find(item => item.kind === 'group')!
  const agent = ctx.agents.get(binding.sessionId)!
  const read = () => ctx.tools.execute({ agent, name: 'genesis_record', arguments: { action: 'types' }, callId: ToolCallId('qq-writings'), signal })
  expect(advertised()).toBe(true)
  expect((await read()).isError).toBe(false)
  socket.send(incoming('group', 1202))
  await receipt(ctx, 2)
  expect((await read()).isError).toBe(true)
})

it('keeps the actual temporary-summary failure, records its stage and resumes without losing committed progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-temporary-diagnostic-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const { ctx, model } = await boot(root, false, true)
  const signal = new AbortController().signal
  const a = await ctx.agents.create({ sessionId: SessionId('temporary-diagnostic-a'), meta: { cwd: root, agentPreset: 'life' },
    agentOptions: { provider: 'fixture', model: 'chat' }, setup: async (scoped) => { await ctx.agentPresets.mount(scoped, 'life') } })
  cleanup.push(() => a.dispose())
  a.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '需要总结的交流' }] }))
  await a.agent.whenIdle()
  model.temporaryMaxTokens = true
  await expect(ctx.genesisTemporary.retry(a.agent.id, signal)).rejects.toThrow(/finish: max-tokens; temporaryMemory.maxTokens=2048/u)
  const failed = await ctx.genesisTemporary.inspect(signal)
  expect(failed.failures[0]?.message).toContain('max-tokens')
  expect(failed.count).toBe(0)
  expect(a.agent.session.ownEvents().map(pluginRecordOf).find(record => record?.type === 'plugin:genesis/temporary-failure')?.data)
    .toMatchObject({ version: 1, stage: 'summary', code: 'memory-provider' })
  model.temporaryMaxTokens = false
  await ctx.genesisTemporary.retry(a.agent.id, signal)
  const saved = await ctx.genesisTemporary.inspect(signal)
  expect(saved.count).toBe(1)
  expect(saved.failures).toEqual([])
  await ctx.genesisTemporary.retry(a.agent.id, signal)
  expect((await ctx.genesisTemporary.inspect(signal)).count).toBe(1)
})


it('admits image-only and file messages, keeps scoped quotes and sends logged media without repeating reservations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-media-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC', 'base64')
  const frame = JSON.parse(incoming('private', 810)) as { message: unknown[] }
  frame.message = [{ type: 'image', data: { file: `base64://${png.toString('base64')}` } }]
  first.socket.send(JSON.stringify(frame))
  await receipt(first.ctx, 1)
  const state = await first.ctx.genesis.snapshot()
  const sessionId = SessionId(state.people!.conversations.find(row => row.kind === 'private')!.sessionId)
  const agent = first.ctx.agents.get(sessionId)!
  const original = agent.session.ownEvents().flatMap((event) => {
    const record = pluginRecordOf(event)
    return record?.type === 'plugin:genesis-qq/media' ? [record.data] : []
  })[0]!

  expect(JSON.stringify(agent.session.ownEvents())).not.toContain('base64://')
  const signal = new AbortController().signal
  const config = QqConfig({ cwd: root, botQq: '11111' })
  const media = new QqMedia(first.ctx, config)
  expect(await media.read(agent, { kind: 'file', attachment: original.file }, signal)).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image' })]))
  expect(first.model.requests.filter(request => request.model === 'chat').some(request => request.messages.some(message => message.content.some(block => block.type === 'image')))).toBe(true)
  expect(() => attachmentIn(agent.session, 'a'.repeat(64))).toThrow(/current QQ conversation/u)
  const extracted = await media.incoming(agent, '811', [{ type: 'file', data: { file: `base64://${Buffer.from('UTF-8 document fixture').toString('base64')}`, name: 'note.txt' } }], async () => { throw new Error('No lookup expected') }, signal)
  expect(JSON.stringify(extracted)).toContain('UTF-8 document fixture')
  const lookedUp = await media.incoming(agent, 'file-lookup', [{ type: 'file', data: { file_id: 'a'.repeat(32) } }], async (action, params) => {
    expect(action).toBe('get_file'); expect(params).toEqual({ file_id: 'a'.repeat(32) })
    return { base64: Buffer.from('looked-up document fixture').toString('base64'), file_name: 'lookup.txt' }
  }, signal)
  expect(JSON.stringify(lookedUp)).toContain('looked-up document fixture')
  const refused = await media.incoming(agent, '812', [{ type: 'file', data: { file: '/etc/passwd' } }], async () => { throw new Error('Local path must not be looked up') }, signal)
  expect(JSON.stringify(refused)).toContain('could not be read')
  const quoted = await quoteContext(agent.session, '813', [{ type: 'reply', data: { id: 810 } }], 'private', '12345', '11111', 2000, async () => { throw new Error('Cached quote requires no transport') })
  expect(quoted).toContain('"qq":"12345"')
  const cross = await quoteContext(agent.session, '814', '[CQ:reply,id=999]', 'private', '12345', '11111', 2000,
    async () => ({ message_type: 'group', group_id: 67890, sender: { user_id: 99999 }, message: 'cross-route-secret' }))
  expect(cross).not.toContain('cross-route-secret')
  const queuedCall = ToolCallId('queued-media-face')
  agent.session.append('tool/call', { turn: 1, step: 1, callId: queuedCall, name: 'genesis_qq_send', arguments: '{"kind":"face","faceId":"14"}' })
  const queued = await first.ctx.tools.execute({ agent, name: 'genesis_qq_send', callId: queuedCall,
    arguments: { kind: 'face', faceId: '14' }, signal })
  expect(queued.isError).not.toBe(true)
  expect(first.sentSegments[1]).toEqual([{ type: 'face', data: { id: '14' } }])
  const calls: Array<{ action: string; payload: unknown }> = []
  const action = async (action: string, payload: unknown) => { calls.push({ action, payload }); return action === 'file' ? null : { message_id: 9000 + calls.length } }
  for (const [index, request] of [
    { kind: 'image' as const, attachmentId: original.file.attachmentId },
    { kind: 'sticker' as const, attachmentId: original.file.attachmentId },
    { kind: 'face' as const, faceId: '14' },
    { kind: 'reply' as const, messageId: '810', text: 'quoted response @12345' },
    { kind: 'file' as const, attachmentId: original.file.attachmentId },
  ].entries()) {
    const callId = ToolCallId(`media-${index}`)
    agent.session.append('tool/call', { turn: 1, step: index + 1, callId, name: 'genesis_qq_send', arguments: JSON.stringify(request) })
    const result = await sendMedia(first.ctx, agent, media, config, 'private', request, callId, signal, action)
    expect(result.status).toBe(request.kind === 'file' ? 'accepted-unconfirmed-do-not-retry' : 'confirmed')
    expect((await sendMedia(first.ctx, agent, media, config, 'private', request, callId, signal, action)).status).toBe('already-reserved-do-not-retry')
  }
  expect(calls).toHaveLength(5)
  expect(JSON.stringify(calls[1])).toContain('"sub_type":1')
  expect(JSON.stringify(calls[3])).toContain('"type":"reply"')
  expect(JSON.stringify(agent.session.ownEvents())).not.toContain(png.toString('base64'))
  const wav = Buffer.from('RIFF0000WAVE')
  const voice = await first.ctx.attachments.saveFile({ data: wav, name: 'speech.wav' })
  const generated = ToolCallId('qq-generated-speech')
  agent.session.append('tool/call', { turn: 1, step: 20, callId: generated, name: 'genesis_speech', arguments: '{"text":"你好"}' })
  agent.session.append('tool/result', { turn: 1, step: 20, message: createToolResultMessage({ callId: generated,
    content: [{ type: 'file', attachment: voice }], isError: false }) }, { surfaceOp: 'append' })
  const voiceCall = ToolCallId('qq-send-voice')
  const voiceRequest = { kind: 'file', asVoice: true, attachmentId: voice.attachmentId }
  agent.session.append('tool/call', { turn: 1, step: 21, callId: voiceCall, name: 'genesis_qq_send', arguments: JSON.stringify(voiceRequest) })
  const sentVoice = await first.ctx.tools.execute({ agent, name: 'genesis_qq_send', callId: voiceCall, arguments: voiceRequest, signal })
  expect(sentVoice.isError).not.toBe(true)
  expect(first.sentSegments.at(-1)).toEqual([{ type: 'record', data: { file: `base64://${wav.toString('base64')}` } }])
  expect(JSON.stringify(agent.session.ownEvents())).not.toContain(`base64://${wav.toString('base64')}`)
  const badVoice = ToolCallId('qq-send-image-as-voice')
  agent.session.append('tool/call', { turn: 1, step: 22, callId: badVoice, name: 'genesis_qq_send', arguments: '{}' })
  await expect(sendMedia(first.ctx, agent, media, config, 'private', { kind: 'file', asVoice: true,
    attachmentId: original.file.attachmentId }, badVoice, signal, action)).rejects.toThrow(/WAV/u)
})

it('persists an independent QQ decision route and shows real endpoint probability without changing memory settings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-probability-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const signal = new AbortController().signal
  const initial = await first.ctx.genesisQqSettings.inspect(signal)
  const shared = (await first.ctx.genesisStatus.inspect(signal)).models
  await first.ctx.genesisQqSettings.setDecisionKey('fixture-independent-decision-key', signal)
  const endpoint = httpServer((request, response) => {
    expect(request.headers.authorization).toBe('Bearer fixture-independent-decision-key')
    request.resume()
    request.on('end', () => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ answers: { remember: { type: 'noul', noul: 0.73 } } })) })
  })
  cleanup.push(async () => { endpoint.closeAllConnections(); await new Promise<void>((resolve, reject) => endpoint.close(error => error ? reject(error) : resolve())) })
  endpoint.listen(0, '127.0.0.1'); await once(endpoint, 'listening')
  const address = endpoint.address()
  if (!address || typeof address === 'string') throw new Error('Missing endpoint')
  const route = { kind: 'jev' as const, url: `http://127.0.0.1:${address.port}`, model: 'fixture-judge', threshold: 0.6, useKey: true }
  await first.ctx.genesisQqSettings.saveDecision(route, initial.decision!.revision, signal)
  await expect(first.ctx.genesisQqSettings.saveDecision(route, initial.decision!.revision, signal)).rejects.toThrow()
  await first.ctx.genesisQqSettings.save({ ...initial.settings, groupAutoReply: true }, initial.revision, signal)
  first.socket.send(incoming('group', 820))
  await expect.poll(async () => (await first.ctx.genesisQqSettings.inspect(signal)).decision!.recent.length).toBe(1)
  const sample = await first.ctx.genesisQqSettings.inspect(signal)
  expect(sample.decision!.recent[0]).toMatchObject({ outcome: 'reply', decision: { probability: 0.73, threshold: 0.6 }, messageId: '820' })
  await receipt(first.ctx, 1)
  expect((await first.ctx.genesisStatus.inspect(signal)).models).toEqual(shared)
  await first.ctx.genesisQqSettings.saveDecision({ kind: 'provider', provider: 'fixture', model: 'decision' }, sample.decision!.revision, signal)
  first.model.groupProbability = 0.99
  first.socket.send(incoming('group', 821))
  await expect.poll(async () => (await first.ctx.genesisQqSettings.inspect(signal)).decision!.recent.length).toBe(2)
  expect((await first.ctx.genesisQqSettings.inspect(signal)).decision!.recent[1]).toMatchObject({ outcome: 'skip', decision: null })
  await first.ctx.fiber.dispose()
  const restored = await boot(root)
  const after = (await restored.ctx.genesisQqSettings.inspect(signal)).decision!
  expect(after.settings).toEqual({ kind: 'provider', provider: 'fixture', model: 'decision' })
  expect(after.recent).toHaveLength(2)
  expect(after.keyConfigured).toBe(true)
  expect(JSON.stringify(after)).not.toContain('fixture-independent-decision-key')
})

it('upgrades legacy HTTP media only to an allowed HTTPS origin and reports safe rejection details', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-media-url-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC', 'base64')
  const downloaded = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(Uint8Array.from(png)))
  try {
    const frame = JSON.parse(incoming('private', 860)) as { message: unknown[] }
    frame.message = [{ type: 'image', data: { url: 'http://gchat.qpic.cn/fixture.png?token=fixture-secret' } }]
    first.socket.send(JSON.stringify(frame))
    await receipt(first.ctx, 1)
    expect(String(downloaded.mock.calls[0]![0])).toBe('https://gchat.qpic.cn/fixture.png?token=fixture-secret')
    const cdnFrame = JSON.parse(incoming('private', 862)) as { message: unknown[] }
    cdnFrame.message = [{ type: 'image', data: { url: 'https://multimedia.nt.qq.com.cn/fixture.png?token=fixture-secret' } }]
    first.socket.send(JSON.stringify(cdnFrame))
    await receipt(first.ctx, 2)
    expect(String(downloaded.mock.calls[1]![0])).toBe('https://multimedia.nt.qq.com.cn/fixture.png?token=fixture-secret')
    const wildcardFrame = JSON.parse(incoming('private', 863)) as { message: unknown[] }
    wildcardFrame.message = [{ type: 'image', data: { url: 'http://nested.image.qq.com/fixture.png' } }]
    first.socket.send(JSON.stringify(wildcardFrame))
    await receipt(first.ctx, 3)
    expect(String(downloaded.mock.calls[2]![0])).toBe('https://nested.image.qq.com/fixture.png')
    const state = await first.ctx.genesis.snapshot()
    const agent = first.ctx.agents.get(SessionId(state.people!.conversations[0]!.sessionId))!
    const media = new QqMedia(first.ctx, QqConfig({ cwd: root, botQq: '11111' }))
    try {
      const rejected = await media.incoming(agent, '861', [{ type: 'image', data: { url: 'https://untrusted.invalid/private?token=fixture-secret' } }],
        async () => { throw new Error('Unexpected client lookup') }, new AbortController().signal)
      expect(JSON.stringify(rejected)).toContain('https://untrusted.invalid')
      expect(JSON.stringify(rejected)).not.toContain('fixture-secret')
      expect(JSON.stringify(rejected)).not.toContain('/private')
      for (const url of ['https://qq.com.attacker.invalid/image', 'https://notqq.com/image', 'https://image.qq.com:8443/image', 'https://qq.com/image']) {
        const refused = await media.incoming(agent, 'spoof', [{ type: 'image', data: { url } }], async () => { throw new Error('Unexpected lookup') }, new AbortController().signal)
        expect(JSON.stringify(refused)).toContain('is not allowed')
      }
      expect(downloaded).toHaveBeenCalledTimes(3)
      expect(first.model.requests.some(request => request.messages.some(message => message.content.some(block => block.type === 'image')))).toBe(true)
    } finally { await media.close() }
  } finally { downloaded.mockRestore() }
})

it('reads earlier and remotely quoted images on later text turns without crossing conversations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-earlier-media-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC'
  const frame = JSON.parse(incoming('private', 900)) as { message: unknown[] }
  frame.message = [{ type: 'image', data: { file: `base64://${png}` } }]
  first.socket.send(JSON.stringify(frame))
  await receipt(first.ctx, 1)
  const conversation = (await first.ctx.genesis.snapshot()).people!.conversations.find(row => row.kind === 'private')!
  const agent = first.ctx.agents.get(SessionId(conversation.sessionId))!
  const rows = historyMessages(agent.session, '11111')
  const imageMessage = rows.find(row => row.messageId === '900')!
  expect(imageMessage.attachments).toHaveLength(1)
  const page = historyPage([{ ...imageMessage, text: 'x'.repeat(10000) }], 1, 1000)
  expect(page.messages[0]!.attachments).toEqual(imageMessage.attachments)
  expect(page.messages[0]!.truncated).toBe(true)

  first.model.nextMediaMessageId = '900'
  const before = first.model.requests.length
  first.socket.send(incoming('private', 901))
  await receipt(first.ctx, 2)
  const later = first.model.requests.slice(before).filter(request => request.model === 'chat')
  expect(later.some(request => request.messages.some(message => message.role === 'tool'
    && message.content.some(block => block.type === 'image')))).toBe(true)
  expect(agent.session.ownEvents().some(event => event.type === 'tool/result' && !event.data.message.isError
    && event.data.message.content.some(block => block.type === 'image'))).toBe(true)

  first.metadata.messages.set('902', { message_type: 'private', sender: { user_id: 12345, nickname: '小明' },
    message: [{ type: 'image', data: { file: `base64://${png}` } }] })
  first.model.nextMediaMessageId = '902'
  const quoteFrame = JSON.parse(incoming('private', 903)) as { message: unknown[] }
  quoteFrame.message.unshift({ type: 'reply', data: { id: 902 } })
  first.socket.send(JSON.stringify(quoteFrame))
  await receipt(first.ctx, 3)
  expect(agent.session.ownEvents().some(event => event.type === 'user/message'
    && JSON.stringify(event.data).includes('Quoted attachments'))).toBe(true)
  expect(agent.session.ownEvents().flatMap((event) => {
    const row = pluginRecordOf(event)
    return row?.type === 'plugin:genesis-qq/media' && row.data.messageId === '902' ? [row] : []
  })).toHaveLength(1)
  const capture = vi.fn(async () => 'must not be captured')
  await quoteContext(agent.session, '904', '[CQ:reply,id=905]', 'private', '12345', '11111', 1000,
    async () => ({ message_type: 'group', group_id: 67890, sender: { user_id: 12345 }, message: [{ type: 'image', data: { file: `base64://${png}` } }] }), capture)
  expect(capture).not.toHaveBeenCalled()
  const denied = await first.ctx.tools.execute({ agent, name: 'genesis_qq_read_media', callId: ToolCallId('missing-qq-media'),
    arguments: { messageId: '905' }, signal: new AbortController().signal })
  expect(denied.isError).toBe(true)
})

it('keeps a 400k QQ group below compaction pressure at 200k despite a 256k adapter output default', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-output-budget-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root)
  first.model.chatInputTokens = 200000
  first.socket.send(incoming('group', 910))
  await receipt(first.ctx, 1)
  const group = (await first.ctx.genesis.snapshot()).people!.conversations.find(row => row.kind === 'group')!
  const agent = first.ctx.agents.get(SessionId(group.sessionId))!
  expect(agent.session.requestHeader()?.config.maxTokens).toBe(16384)
  const compact = first.ctx.agentPresets.serviceFor(agent, 'compaction')!
  expect(first.ctx.tokenMeter.measure(agent.session).totalTokens).toBeGreaterThanOrEqual(200000)
  expect(await compact.compactIfNeeded(agent, 'pressure', new AbortController().signal)).toBeNull()
  first.socket.send(incoming('group', 911))
  await receipt(first.ctx, 2)
  expect(agent.session.ownEvents().some(event => event.type === 'compaction/start')).toBe(false)
  const ordinary = await first.ctx.agents.create({ sessionId: SessionId('non-qq-output-budget'),
    meta: { cwd: root, agentPreset: 'life' }, agentOptions: { provider: 'fixture', model: 'chat' },
    setup: async (ctx) => { await first.ctx.agentPresets.mount(ctx, 'life') } })
  cleanup.push(() => ordinary.dispose())
  ordinary.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'fixture' }] }))
  await ordinary.agent.whenIdle()
  expect(ordinary.agent.session.requestHeader()?.config.maxTokens).toBe(256000)
})


it('routes operator text to a cold group, deduplicates tool retries, forwards original text and restores receipts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-messages-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const first = await boot(root, false, false, false, true)
  first.model.communication = [{ action: 'targets', query: '测试群' },
    { action: 'send', target: 'qq:group:11111:67890', text: '今晚八点开会。' },
    { action: 'send', target: 'qq:group:11111:67890', text: '今晚八点开会。' }, { action: 'status', id: '$last' }]
  first.socket.send(incoming('private', 8001, 55555, '操作者'))
  await receipt(first.ctx, 1)
  expect(first.sent.filter(text => text === '今晚八点开会。')).toHaveLength(1)
  expect(first.actions.filter(row => row.action === 'send_group_msg')).toHaveLength(1)
  const state = await first.ctx.genesis.snapshot()
  const source = state.people!.conversations.find(row => row.kind === 'private')!
  const target = state.people!.conversations.find(row => row.kind === 'group')!
  const agent = first.ctx.agents.get(source.sessionId)!
  const targetAgent = first.ctx.agents.get(target.sessionId)!
  expect(JSON.stringify(targetAgent.session.ownEvents())).toContain('Confirmed outgoing QQ text delivery.')
  expect(first.model.requests.filter(row => row.model === 'chat').at(-1)?.tools?.some(tool => tool.name === 'genesis_message')).toBe(true)
  const results = agent.session.ownEvents().flatMap(event => event.type === 'tool/result' ? event.data.message.content : [])
    .filter(block => block.type === 'text').map(block => JSON.parse(block.text))
  expect(results[0]).toMatchObject({ total: 1, items: [{ name: '测试群', target: 'qq:group:11111:67890' }] })
  const delivery = z.object({ id: z.string(), status: z.literal('confirmed'), acknowledged: z.literal(1) }).parse(results.at(-1))
  const originalCall = agent.session.ownEvents().find(event => event.type === 'tool/call')!
  const tampered = await first.ctx.tools.execute({ name: 'genesis_message',
    arguments: { action: 'send', target: 'qq:group:11111:67890', text: '替换了原始调用。' },
    agent, signal: new AbortController().signal, callId: originalCall.data.callId })
  expect(tampered.isError).toBe(true)
  expect(first.actions.filter(row => row.action === 'send_group_msg')).toHaveLength(1)
  const original = '  保留原文、换行\n和 @12345，不要改写。  '
  const input = JSON.parse(incoming('private', 8002, 55555, '操作者'))
  input.message = [{ type: 'text', data: { text: original } }]
  first.socket.send(JSON.stringify(input))
  await receipt(first.ctx, 2)
  first.model.communication = [{ action: 'forward', target: 'qq:private:11111:99999', messageId: '8002' }]
  first.socket.send(incoming('private', 8003, 55555, '操作者'))
  await receipt(first.ctx, 3)
  const forwarded = first.sent.find(text => text.startsWith('转发自 '))!
  expect(forwarded.slice(forwarded.indexOf('：\n') + 2)).toBe(original)
  expect(first.sentSegments.some(parts => parts.some(part => part.type === 'at'))).toBe(false)
  await first.ctx.fiber.dispose()
  const restored = await boot(root, false, false, false, true)
  restored.model.communication = [{ action: 'status', id: delivery.id }]
  restored.socket.send(incoming('private', 8004, 55555, '操作者'))
  await receipt(restored.ctx, 4)
  const resumed = restored.ctx.agents.get(source.sessionId)!
  const restoredResult = resumed.session.ownEvents().findLast(event => event.type === 'tool/result')!
  expect(JSON.stringify(restoredResult)).toContain(delivery.id)
  expect(JSON.stringify(restoredResult)).toContain('confirmed')
  expect(restored.actions.filter(row => row.action === 'send_group_msg')).toHaveLength(0)
  expect((await restored.ctx.genesis.snapshot()).identity).toEqual(state.identity)
})

it('denies unbound speakers and unapproved targets and never retries an uncertain send', async () => {
  const root = await mkdtemp(join(tmpdir(), 'genesis-qq-message-denial-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const f = await boot(root, false, false, false, true)
  f.model.communication = [{ action: 'send', target: 'qq:group:11111:67890', text: '不允许发送。' }]
  f.socket.send(incoming('private', 8101, 12345))
  await receipt(f.ctx, 1)
  expect(f.actions.filter(row => row.action === 'send_group_msg')).toEqual([])
  expect(f.model.requests.filter(row => row.model === 'chat').every(row => !row.tools?.some(tool => tool.name === 'genesis_message'))).toBe(true)
  f.model.communication = [{ action: 'send', target: 'qq:group:11111:77777', text: '不允许发送。' }]
  f.socket.send(incoming('private', 8102, 55555, '操作者'))
  await receipt(f.ctx, 2)
  expect(f.actions.filter(row => row.action === 'send_group_msg')).toEqual([])
  f.model.communication = [{ action: 'send', target: 'qq:group:11111:67890', text: '结果未知的投递。' },
    { action: 'send', target: 'qq:group:11111:67890', text: '结果未知的投递。' }, { action: 'status', id: '$last' }]
  f.metadata.uncertainNext = true
  f.socket.send(incoming('private', 8103, 55555, '操作者'))
  await receipt(f.ctx, 3)
  expect(f.actions.filter(row => row.action === 'send_group_msg')).toHaveLength(1)
  const state = await f.ctx.genesis.snapshot()
  const source = state.people!.conversations.find(row => row.kind === 'private' && row.personId === qqPersonId('55555'))!
  const agent = f.ctx.agents.get(source.sessionId)!
  const latest = agent.session.ownEvents().findLast(event => event.type === 'tool/result')!
  expect(JSON.stringify(latest)).toContain('uncertain')
  expect(JSON.stringify(latest)).not.toContain('confirmed')
  const block = latest.data.message.content.find(block => block.type === 'text')!
  const delivery = z.object({ id: z.string() }).parse(JSON.parse(block.type === 'text' ? block.text : '{}'))
  await f.ctx.fiber.dispose()
  const restored = await boot(root, false, false, false, true)
  restored.socket.send(incoming('private', 8103, 55555, '操作者'))
  restored.model.communication = [{ action: 'status', id: delivery.id }]
  restored.socket.send(incoming('private', 8104, 55555, '操作者'))
  await receipt(restored.ctx, 4)
  expect(restored.actions.filter(row => row.action === 'send_group_msg')).toEqual([])
  const resumed = restored.ctx.agents.get(source.sessionId)!
  expect(JSON.stringify(resumed.session.ownEvents().findLast(event => event.type === 'tool/result'))).toContain('uncertain')
})
