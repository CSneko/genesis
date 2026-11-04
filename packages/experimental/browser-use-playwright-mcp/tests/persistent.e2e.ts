/** Real browser profile durability across complete Loader and MCP process restarts. */
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import BrowserUse from '@deepseek-ai/dsh-browser-use'
import Agents from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import Sessions, { SessionId } from '@deepseek-ai/dsh-session'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Llm, { ToolCallId } from '@deepseek-ai/dsh-llm'
import Projections from '@deepseek-ai/dsh-session-projection'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WorkingDirectory from '@deepseek-ai/dsh-working-directory'
import { expect, it } from 'vitest'
import * as Provider from '../src/index.ts'
import Typert from '@deepseek-ai/dsh-typert-registry'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import type { BrowserPreviewFrame } from '../src/preview-types.ts'
import Attachments from '@deepseek-ai/dsh-attachment-local'
import * as DeepSeek from '@deepseek-ai/dsh-llm-deepseek-api-key'

it.skipIf(process.env.DSH_BROWSER_EXECUTABLE === undefined)(
  'shares browser state between Sessions and restores cookies and local storage after a complete restart',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-persistent-browser-'))
    const contexts: Context[] = []
    const handles: AgentHandle[] = []
    const requests: { url: string | undefined; cookie: string | undefined }[] = []
    const server = createServer((request, response) => {
      requests.push({ url: request.url, cookie: request.headers.cookie })
      response.setHeader('Content-Type', 'text/html')
      if (request.url === '/seed') response.setHeader('Set-Cookie', 'genesis-login=fixture; Max-Age=86400; SameSite=Lax')
      response.end(`<title>Persistent browser</title><style>body{margin:0;min-height:3000px}input{position:absolute;left:20px;top:20px;width:200px;height:40px}</style>
        <input aria-label="Test input"><video muted autoplay style="position:absolute;left:20px;top:100px;width:200px;height:100px"></video>
        <script>const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;
        const paint=canvas.getContext('2d');paint.fillStyle='red';paint.fillRect(0,0,200,100);
        document.querySelector('video').srcObject=canvas.captureStream();
        ${request.url === '/seed' ? 'localStorage.setItem("genesis-test", "remembered")' : ''}</script>`)
    })
    try {
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('Fixture has no TCP listener')
      const origin = `http://127.0.0.1:${address.port}`

      async function load(label: string) {
        const ctx = new Context()
        contexts.push(ctx)
        ctx.baseUrl = pathToFileURL(root).href + '/'
        await ctx.plugin(Loader)
        const modules = {
          browserUse: BrowserUse, prompt: SystemPrompt, tools: Tools, llm: Llm,
          sessions: Sessions, agents: Agents, loop: AgentLoop, projections: Projections,
          typert: Typert, remoteAccess: RemoteAccess, gateway: Gateway,
          fs: LocalFileSystem, workingDirectory: WorkingDirectory, browser: Provider,
          attachments: Attachments, deepseek: DeepSeek,
        }
        Object.assign(ctx.loader.builtins, modules, { include: Include })
        const path = join(root, `${label}.yml`)
        await writeFile(path, JSON.stringify(Object.keys(modules).map(id => ({
          id, name: `cordis:${id}`, config: id === 'browser' ? {
            mode: 'persistent', userDataDir: join(root, 'profile'), preview: { intervalMs: 250 },
            executablePath: process.env.DSH_BROWSER_EXECUTABLE,
          } : id === 'loop' ? { agents: [] } : id === 'attachments' ? { dshHome: join(root, 'home') } : {},
        }))))
        await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
        await ctx.loader.await()
        const browser = [...ctx.loader.entries()].find(entry => entry.options.id === 'browser')?.fiber
        if (browser === undefined) throw new Error('Browser provider was not loaded')
        await browser.await()
        expect(ctx.tools.schemas().length).toBeGreaterThan(5)
        return ctx
      }
      async function agent(ctx: Context, id: string) {
        const handle = await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: root },
          agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' } })
        handles.push(handle)
        return handle.agent
      }
      async function call(ctx: Context, owner: Agent, name: string, args: Record<string, unknown>) {
        return ctx.tools.execute({ agent: owner, name: `mcp__playwright-mcp__${name}`,
          arguments: args, callId: ToolCallId(name), signal: new AbortController().signal })
      }
      const first = await load('first')
      const owner = await agent(first, 'first-conversation')
      const seeded = await call(first, owner, 'browser_navigate', { url: `${origin}/seed` })
      expect(seeded.isError, JSON.stringify(seeded.content)).toBe(false)
      const peer = new Peer(first, { principal: { kind: 'owner' } })
      const previewLifetime = new AbortController()
      const preview = (await first.typertGateway.stream({ peer, namespace: 'browserPreview', method: 'watch',
        args: {}, signal: previewLifetime.signal }))[Symbol.asyncIterator]()
      const image = (await preview.next()).value as BrowserPreviewFrame
      expect(image.error, JSON.stringify(image)).toBeUndefined()
      expect(image.url).toBe(`${origin}/seed`)
      expect(image.title).toBe('Persistent browser')
      expect(image.image).toMatch(/^data:image\/jpeg;base64,\/9j/u)
      expect(image.actions).toMatchObject([{ tool: 'browser_navigate', status: 'succeeded' }])
      expect(first.tools.schemas().some(tool => tool.name === 'mcp__playwright-mcp__browser_mouse_click_xy')).toBe(true)
      const tab = image.imageTabId!
      const input = (command: Record<string, unknown>) => first.typertGateway.invoke({ peer, namespace: 'browserPreview', method: 'input',
        args: { id: tab, input: command } })
      await call(first, owner, 'browser_resize', { width: 800, height: 600 })
      await input({ kind: 'click', x: 100 / 800, y: 40 / 600 })
      await input({ kind: 'text', text: '共同浏览' })
      await input({ kind: 'key', key: 'Enter' })
      expect(JSON.stringify((await call(first, owner, 'browser_evaluate', { function: '() => document.querySelector("input").value' })).content)).toContain('共同浏览')
      await input({ kind: 'scroll', x: 0.5, y: 0.5, deltaX: 0, deltaY: 400 })
      expect((await call(first, owner, 'browser_evaluate', { function: 'async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return scrollY > 0 }' })).content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('true') })]))
      const playback = await call(first, owner, 'browser_evaluate', { function: 'async () => { scrollTo(0,0); const video=document.querySelector("video"); await video.play(); return !video.paused && video.videoWidth === 200 }' })
      expect(playback.isError).toBe(false)
      expect(JSON.stringify(playback.content)).toContain('### Result\\ntrue')
      const screenshot = await call(first, owner, 'browser_take_screenshot', {})
      expect(screenshot.isError, JSON.stringify(screenshot.content)).toBe(false)
      const visual = screenshot.content.find(block => block.type === 'image')
      expect(visual?.type, JSON.stringify(screenshot.content)).toBe('image')
      if (visual?.type !== 'image') throw new Error('Screenshot was not admitted as a durable image')
      expect((await first.attachments.readImage(visual.attachment)).data.length).toBeGreaterThan(100)
      await expect(input({ kind: 'navigate', url: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'browser-preview/invalid-input' })
      await expect(input({ kind: 'click', x: -1, y: 0 })).rejects.toMatchObject({ code: 'browser-preview/invalid-input' })
      await expect(first.browserPreview.input(tab, { kind: 'click', x: 0.5, y: 0.5 }, previewLifetime.signal)).rejects.toMatchObject({ code: 'browser-preview/forbidden' })
      await input({ kind: 'navigate', url: `${origin}/operator` })
      expect(requests.some(request => request.url === '/operator')).toBe(true)
      await input({ kind: 'back' })
      expect(JSON.stringify((await call(first, owner, 'browser_evaluate', { function: '() => location.pathname' })).content)).toContain('/seed')
      await expect(first.browserPreview.watch(false, previewLifetime.signal)[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'browser-preview/forbidden' })
      expect((await call(first, owner, 'browser_tabs', { action: 'new' })).isError).toBe(false)
      expect((await call(first, owner, 'browser_navigate', { url: `${origin}/other-tab` })).isError).toBe(false)
      const otherImage = (await preview.next()).value as BrowserPreviewFrame
      expect(otherImage.url).toBe(`${origin}/other-tab`)
      expect(otherImage.tabs).toHaveLength(2)
      const otherTab = otherImage.tabs.find(tab => tab.url === `${origin}/other-tab`)!
      const firstTab = otherImage.tabs.find(tab => tab.url === `${origin}/seed`)!
      expect(otherTab.id).not.toBe(firstTab.id)
      const selectedTab = await call(first, owner, 'browser_tabs', { action: 'select', index: 0 })
      expect(selectedTab.isError).toBe(false)
      const selectedImage = (await preview.next()).value as BrowserPreviewFrame
      expect(selectedImage.error).toBeUndefined()
      expect(selectedImage.url).toBe(`${origin}/seed`)
      await first.typertGateway.invoke({ peer, namespace: 'browserPreview', method: 'selectTab',
        args: { id: otherTab.id } })
      const inspected = (await preview.next()).value as BrowserPreviewFrame
      expect(inspected.url).toBe(`${origin}/other-tab`)
      expect(inspected.following).toBe(false)
      expect(inspected.tabs.find(tab => tab.id === firstTab.id)?.active).toBe(true)
      expect(JSON.stringify((await call(first, owner, 'browser_evaluate', { function: '() => location.pathname' })).content)).toContain('/seed')
      const requestsBeforeReload = requests.filter(request => request.url === '/other-tab').length
      await first.typertGateway.invoke({ peer, namespace: 'browserPreview', method: 'controlTab',
        args: { id: otherTab.id, action: 'reload' } })
      expect(requests.filter(request => request.url === '/other-tab')).toHaveLength(requestsBeforeReload + 1)
      await first.typertGateway.invoke({ peer, namespace: 'browserPreview', method: 'controlTab',
        args: { id: otherTab.id, action: 'close' } })
      const remaining = (await preview.next()).value as BrowserPreviewFrame
      expect(remaining.tabs.map(tab => tab.id)).toEqual([firstTab.id])
      expect(remaining.url).toBe(`${origin}/seed`)
      expect(remaining.following).toBe(true)
      expect(remaining.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ tool: 'operator_reload', origin: 'operator', status: 'succeeded' }),
        expect.objectContaining({ tool: 'operator_close', origin: 'operator', status: 'succeeded' }),
      ]))
      await expect(first.typertGateway.invoke({ peer, namespace: 'browserPreview', method: 'controlTab',
        args: { id: otherTab.id, action: 'close' } })).rejects.toMatchObject({ code: 'browser-preview/tab-missing' })
      await expect(first.typertGateway.invoke({ peer, namespace: 'browserPreview', method: 'input',
        args: { id: otherTab.id, input: { kind: 'text', text: 'must not reach another tab' } } })).rejects.toMatchObject({ code: 'browser-preview/tab-missing' })
      await expect(first.browserPreview.controlTab(firstTab.id, 'close', previewLifetime.signal)).rejects.toMatchObject({ code: 'browser-preview/forbidden' })
      previewLifetime.abort()
      await preview.return?.()
      await peer.dispose()
      const second = await agent(first, 'unrelated-conversation')
      const state = await call(first, second, 'browser_evaluate', {
        function: '() => JSON.stringify({cookie: document.cookie, stored: localStorage.getItem("genesis-test")})',
      })
      expect(state.isError).toBe(false)
      expect(JSON.stringify(state.content)).toContain('genesis-login=fixture')
      expect(JSON.stringify(state.content)).toContain('remembered')

      const competing = await load('competing')
      const contender = await agent(competing, 'competing-conversation')
      expect((await call(competing, contender, 'browser_navigate', { url: `${origin}/must-not-open` })).isError).toBe(true)
      expect(requests.some(request => request.url === '/must-not-open')).toBe(false)
      await handles.pop()!.dispose()
      await competing.fiber.dispose()

      for (const handle of handles.splice(0)) await handle.dispose()
      expect(first.tools.schemas().some(tool => tool.name.startsWith('mcp__playwright-mcp__'))).toBe(true)
      const tools = first.tools
      const browserUse = first.browserUse
      await first.fiber.dispose()
      expect(tools.schemas()).toEqual([])
      expect(browserUse.providerName).toBeUndefined()

      const restarted = await load('restarted')
      const restored = await agent(restarted, 'after-process-restart')
      expect((await call(restarted, restored, 'browser_navigate', { url: `${origin}/check` })).isError).toBe(false)
      const retained = await call(restarted, restored, 'browser_evaluate', {
        function: '() => JSON.stringify({cookies:document.cookie, stored: localStorage.getItem("genesis-test")})',
      })
      expect(retained.isError).toBe(false)
      expect(JSON.stringify(retained.content)).toContain('remembered')
      expect(requests.find(request => request.url === '/check')?.cookie, JSON.stringify(retained.content)).toContain('genesis-login=fixture')
    } finally {
      for (const handle of handles) await handle.dispose()
      for (const ctx of contexts.reverse()) await ctx.fiber.dispose()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => {
        server.close(error => error === undefined ? resolve() : reject(error))
      })
      await rm(root, { recursive: true, force: true })
    }
  },
)
