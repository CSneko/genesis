/** Real Loader, AgentLoop, portal worker, and Session history; only the model is scripted. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { isJsonValue } from '@deepseek-ai/dsh-util-values'
import { expect } from 'vitest'
import type {} from '@deepseek-ai/dsh-agent-loop'
import type {} from '@deepseek-ai/dsh-computer-use'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-attachment-local'

class DesktopModel extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly actions: Array<string | Record<string, string | string[]>>) { super() }
  override async resolveModel(provider: string, model: string) {
    return { provider, id: model, name: model, inputModalities: ['text', 'image'] as const }
  }
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const action = this.actions[this.requests.length]
    this.requests.push(options)
    if (action !== undefined) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(`desktop-${this.requests.length}`),
        name: 'computer', arguments: JSON.stringify(typeof action === 'string' ? { action } : action) } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Desktop check completed.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

export async function check(interactive: boolean, signal: AbortSignal, python?: string, semantic?: 'allow' | 'deny' | 'missing' | 'automatic'): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-portal-'))
  const ctx = new Context()
  try {
    const config = join(root, 'cordis.yml')
    await writeFile(config, JSON.stringify([
      ...['llm', 'session', 'session-projection', 'system-prompt', 'tools', 'agent', 'subprocess-local', 'computer-use']
        .map(name => ({ name: `@deepseek-ai/dsh-${name}` })),
      { name: '@deepseek-ai/dsh-attachment-local', config: { dshHome: root } },
      { name: '@deepseek-ai/dsh-experimental-computer-use-portal', config: { consentTimeoutMs: 30000, callTimeoutMs: 5000, accessibilityTimeoutMs: 1000, requireApplicationConsent: semantic !== 'automatic', ...(python === undefined ? {} : { python }) } },
      ...(semantic !== undefined && semantic !== 'missing' && semantic !== 'automatic' ? [{ name: '@deepseek-ai/dsh-user-questions' }] : []),
      { name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } },
    ]))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = undefined
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    for (const entry of ctx.loader.entries()) await entry.fiber?.await()
    const computer = ctx.tools.get('computer')
    expect(computer).toBeDefined()
    expect(isJsonValue(computer?.parameters)).toBe(true)
    expect(JSON.stringify(computer?.parameters)).not.toContain('authorize_app')
    expect(ctx.tools.schemas().find(tool => tool.name === 'computer')?.parameters).toMatchObject({ type: 'object', required: ['action'] })
    let questions = 0
    if (semantic !== undefined && semantic !== 'missing' && semantic !== 'automatic') ctx.on('user-questions/request', async () => {
      questions++
      return { answers: [{ id: 'desktop-application-access', selected: [semantic === 'allow' ? 'Allow this application for this connection' : 'Deny'] }] }
    })
    const inspect = { action: 'inspect', appId: 'fixture-app' }
    const semanticActions: Array<string | Record<string, string | string[]>> = semantic === 'allow' || semantic === 'automatic'
      ? ['connect', 'apps', inspect, { action: 'set_text', snapshotId: 'fixture-snapshot', elementId: 'fixture-entry', text: '鲸鲸' }, inspect,
        { action: 'activate', snapshotId: 'fixture-snapshot', elementId: 'fixture-button', operation: 'click' }, 'disconnect']
      : ['connect', 'apps', inspect, inspect, 'disconnect']
    // Input stays fixture-only so the interactive operator check never types into existing applications.
    const fixtureInput: Array<Record<string, string | string[]>> = python === undefined ? [] : [{ action: 'type', text: '鲸鲸' }, { action: 'key', keys: ['Enter'] }]
    const model = new DesktopModel(semantic === undefined
      ? interactive ? ['status', 'connect', 'screenshot', 'status', 'screenshot', ...fixtureInput, 'disconnect'] : ['status', 'screenshot']
      : semanticActions)
    ctx.llm.registerAdapter(['portal-test'], model)
    const agent = await ctx.agentLoop.create(SessionId('portal-test'), { provider: 'portal-test', model: 'vision' })
    const idle: PromiseWithResolvers<void> = Promise.withResolvers()
    const stop = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') idle.resolve()
    })
    try {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Check the desktop integration.' }] }))
      signal.throwIfAborted()
      const cancelled: PromiseWithResolvers<void> = Promise.withResolvers()
      const abort = () => { cancelled.reject(signal.reason) }
      signal.addEventListener('abort', abort, { once: true })
      try { await Promise.race([idle.promise, cancelled.promise]) } finally { signal.removeEventListener('abort', abort) }
    } finally { stop() }
    expect(model.requests[0]?.tools?.find(tool => tool.name === 'computer')?.parameters).toMatchObject({ type: 'object', required: ['action'] })
    const results = agent.session.deriveMessages().filter(message => message.role === 'tool')
    expect(results).toHaveLength(semantic === undefined ? interactive ? 6 + fixtureInput.length : 2 : semanticActions.length)
    if (semantic !== undefined) {
      expect(questions).toBe(semantic === 'missing' || semantic === 'automatic' ? 0 : 1)
      if (semantic === 'allow' || semantic === 'automatic') {
        expect(JSON.stringify(results[2])).toContain('Fixture entry')
        expect(JSON.stringify(model.requests[3]?.messages)).toContain('Fixture entry')
        expect(JSON.stringify(results[3])).toContain('text-readback')
        expect(JSON.stringify(results[4])).toContain('鲸鲸')
        expect(JSON.stringify(results[5])).toContain('dispatched')
      } else {
        expect(JSON.stringify(results)).not.toContain('Fixture entry')
        expect(JSON.stringify(results[2])).toContain(semantic === 'deny' ? 'denied' : 'No operator answerer')
        expect(JSON.stringify(results[3])).toContain(semantic === 'deny' ? 'denied' : 'No operator answerer')
      }
    } else if (interactive) {
      expect(JSON.stringify(results[0])).toContain('not-granted')
      expect(JSON.stringify(results[1])).toContain('granted')
      const image = results[2]?.content.find(block => block.type === 'image')
      expect(image?.type, JSON.stringify(results[2])).toBe('image')
      if (image?.type !== 'image') throw new Error('Portal screenshot did not reach Session history')
      const stored = await ctx.attachments.readImage(image.attachment)
      expect(stored.data.byteLength).toBeGreaterThan(0)
      expect(JSON.stringify(model.requests[3]?.messages)).toContain(JSON.stringify(image.attachment))
      const status = results[3]?.content.find(block => block.type === 'text')
      if (status?.type !== 'text') throw new Error('Desktop status was not returned after capture')
      const state: unknown = JSON.parse(status.text)
      expect(state).toMatchObject({ connected: true, permission: 'granted' })
      const secondImage = results[4]?.content.find(block => block.type === 'image')
      expect(secondImage?.type, JSON.stringify(results[4])).toBe('image')
      for (const result of results.slice(5, -1)) {
        expect(result.isError).not.toBe(true)
        expect(JSON.stringify(result)).toContain('dispatched')
      }
      expect(JSON.stringify(results.at(-1))).toContain('not-granted')
    } else {
      expect(JSON.stringify(results[0])).toContain('not-granted')
      expect(JSON.stringify(results[1])).toContain('consent-required')
    }
    const provider = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-experimental-computer-use-portal')
    await provider?.fiber?.dispose()
    expect(ctx.computerUse.providerName).toBeUndefined()
    expect(ctx.tools.schemas().find(tool => tool.name === 'computer')).toBeUndefined()
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}
