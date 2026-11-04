/** Operator CDP observation and page controls of the persistent browser for the authenticated operator. @module */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { chromium, type Browser, type Page } from 'playwright-core'
import { z } from 'zod'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { BrowserAction, BrowserActionId, BrowserInput, BrowserPreviewFrame, BrowserTab, BrowserTabId } from './preview-types.ts'
import type {} from '@deepseek-ai/dsh-tools'
import type { BrowserQueue } from './persistent.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { browserPreview: BrowserPreview }
}

/** Operator preview resource limits. */
export interface PreviewConfig {
  /** Milliseconds per remote viewport sample; defaults to 500 (2 FPS). */
  intervalMs: number
  /** Milliseconds per local/LAN viewport sample; defaults to 1000/30 (30 FPS). */
  localIntervalMs: number
  /** Maximum duration of each CDP connection or screenshot operation. */
  timeoutMs: number
  /** JPEG screenshot quality from 1 to 100. */
  jpegQuality: number
  /** Maximum raw JPEG size; oversized captures retain the preceding image. */
  maxImageBytes: number
  /** Maximum number of open pages listed in each preview frame. */
  tabLimit: number
  /** Maximum characters in each displayed page title or address. */
  tabTextChars: number
  /** Maximum number of action records retained in process memory. */
  actionLimit: number
  /** Maximum characters in an operator text insertion or navigation address. */
  inputTextChars: number
}

/** Validate and resolve preview deployment limits. */
export const PreviewConfig: Schema<PreviewConfig> = Schema.object({
  intervalMs: Schema.number().min(1).default(500),
  localIntervalMs: Schema.number().min(1).default(1000 / 30),
  timeoutMs: Schema.number().min(1).step(1).default(5000),
  jpegQuality: Schema.number().min(1).max(100).step(1).default(60),
  maxImageBytes: Schema.number().min(1024).step(1).default(1048576),
  tabLimit: Schema.number().min(1).max(500).step(1).default(50),
  tabTextChars: Schema.number().min(64).step(1).default(2048),
  actionLimit: Schema.number().min(1).max(200).step(1).default(30),
  inputTextChars: Schema.number().min(1).step(1).default(4096),
})

const PREFIX = 'mcp__playwright-mcp__'

/** The shared profile is visible only to the authenticated owner, never scoped remote peers. */
export class BrowserPreview extends TypertRemoteService {
  static inject = ['tools']
  private browser: Browser | undefined
  private page: Page | undefined
  private readonly lifetime = new AbortController()
  private readonly actions = new Map<symbol, BrowserAction>()
  private frame: BrowserPreviewFrame = { started: false, actions: [], tabs: [], omittedTabs: 0, following: true }
  private sampleTask: Promise<BrowserPreviewFrame> | undefined
  private sequence = 0
  private started = false
  private targetUrl: string | undefined
  private observationRevision = 0
  private selectedPageIndex: number | undefined
  private readonly pages = new Map<BrowserTabId, Page>()
  private readonly pageIds = new WeakMap<Page, BrowserTabId>()
  private viewedTab: BrowserTabId | undefined
  private readonly operations = new Set<Promise<void>>()

  /**
   * @param ctx - Observer lifetime and browser tool pipeline.
   * @param options - Validated capture limits and the persistent Chromium profile directory.
   */
  constructor(ctx: Context, private readonly options: PreviewConfig & { userDataDir: string; queue: BrowserQueue }) {
    super(ctx, 'browserPreview')
    ctx.on('tools/execute', async (exec, next) => {
      if (!exec.name.startsWith(PREFIX)) return next()
      this.actions.set(exec.token, { id: String(++this.sequence) as BrowserActionId, tool: exec.name.slice(PREFIX.length), origin: 'ai',
        startedAt: new Date().toISOString(), status: 'running' })
      this.trimActions()
      return next()
    })
    ctx.on('tools/result', (exec, result) => {
      const action = this.actions.get(exec.token)
      if (action === undefined) return
      action.status = result.isError ? 'failed' : 'succeeded'
      if (!result.isError) {
        this.started = exec.name !== PREFIX + 'browser_close'
        this.observationRevision++
        if (!this.started) this.targetUrl = undefined
        this.observePage(result)
      }
    })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled(this.operations)
      await this.sampleTask
      await this.browser?.close()
      this.browser = undefined
      this.actions.clear()
      this.pages.clear()
      this.frame = { started: false, actions: [], tabs: [], omittedTabs: 0, following: true }
    }, 'browser-preview.observer')
  }

  /**
   * Stream viewport samples and bounded action metadata without invoking tools or a model.
   * The shared profile requires the owner principal; session-scoped peers are refused.
   * @param local - Viewer connects through a loopback or private IP address; affects cadence only.
   * @param signal - Viewer cancellation; closing the viewer stops its sampling loop.
   * @returns Transient snapshots; capture failures retain the preceding image with an explicit stale state.
   */
  @Remote({ mode: 'stream' })
  async *watch(local: boolean, signal: AbortSignal): AsyncIterable<BrowserPreviewFrame> {
    this.requireOwner()
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    const interval = local ? this.options.localIntervalMs : this.options.intervalMs
    while (!owned.aborted) {
      const startedAt = performance.now()
      this.sampleTask ??= this.capture().finally(() => { this.sampleTask = undefined })
      const frame = await this.sampleTask
      if (signal.aborted || this.lifetime.signal.aborted) return
      yield frame
      try { await setTimeout(Math.max(0, interval - (performance.now() - startedAt)), undefined, { signal: owned }) }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Cancellation can change either signal during the timer await.
      catch (error) { if (!signal.aborted && !this.lifetime.signal.aborted) throw error }
    }
  }

  /**
   * Select a page for observation without changing the AI's active page.
   * @param id - Observed page identity, or null to follow the AI again.
   * @param signal - Caller cancellation before changing preview selection.
   * @returns After selection changes; the observation stream supplies the next image.
   */
  @Remote
  // oxlint-disable-next-line typescript/require-await -- Remote validation failures must reject asynchronously.
  async selectTab(id: BrowserTabId | null, signal: AbortSignal): Promise<void> {
    this.requireOwner()
    signal.throwIfAborted()
    this.lifetime.signal.throwIfAborted()
    if (id !== null) this.livePage(id)
    this.viewedTab = id ?? undefined
    this.observationRevision++
    this.frame = { started: this.started, actions: [], tabs: this.frame.tabs,
      omittedTabs: this.frame.omittedTabs, following: id === null }
  }

  /**
   * Reload or close the exact observed page, serialized with AI browser calls.
   * A stale page identity fails without selecting another page; failures do not retry.
   * @param id - Stable page identity from the current browser inventory.
   * @param action - Reload the page or close it without accepting a before-unload dialog.
   * @param signal - Caller cancellation; admitted browser work drains before disposal.
   * @returns After the action settles; a failed reload may already have started navigation.
   */
  @Remote
  async controlTab(id: BrowserTabId, action: 'reload' | 'close', signal: AbortSignal): Promise<void> {
    this.requireOwner()
    await this.mutate(id, action, signal, async (page) => {
      if (action === 'reload') await page.reload({ waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs })
      else {
        await page.close({ runBeforeUnload: false })
        this.pages.delete(id)
        if (this.viewedTab === id) this.viewedTab = undefined
      }
    })
  }

  /**
   * Send bounded operator input to the exact page shown in a captured image.
   * Input shares the AI queue; navigation or typing already delivered cannot be undone by cancellation.
   * @param id - Captured page identity, never an inferred active tab.
   * @param input - Viewport-relative click or scroll, browser key, literal text, HTTP(S) navigation or back.
   * @param signal - Caller cancellation checked before admission; disposal drains admitted work.
   * @returns After input settles; failures have potentially partial effects and are not retried.
   */
  @Remote
  async input(id: BrowserTabId, input: BrowserInput, signal: AbortSignal): Promise<void> {
    this.requireOwner()
    const fraction = z.number().min(0).max(1)
    const parsed = z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('click'), x: fraction, y: fraction }),
      z.strictObject({ kind: z.literal('scroll'), x: fraction, y: fraction, deltaX: z.number(), deltaY: z.number() }),
      z.strictObject({ kind: z.literal('key'), key: z.string().regex(/^(?:(?:ControlOrMeta|Control|Meta|Alt|Shift)\+)*(?:[a-zA-Z0-9]|Enter|Tab|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown|Space)$/u) }),
      z.strictObject({ kind: z.literal('text'), text: z.string().min(1).max(this.options.inputTextChars) }),
      z.strictObject({ kind: z.literal('navigate'), url: z.url({ protocol: /^https?$/u }).max(this.options.inputTextChars) }),
      z.strictObject({ kind: z.literal('back') }),
    ]).safeParse(input)
    if (!parsed.success) throw new RemoteError('browser-preview/invalid-input', 'Use a valid browser input within the configured text limit and an HTTP(S) address', {})
    const command = parsed.data
    await this.mutate(id, command.kind, signal, async (page) => {
      switch (command.kind) {
        case 'click':
        case 'scroll': {
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
          const x = Math.min(viewport.width - 1, command.x * viewport.width)
          const y = Math.min(viewport.height - 1, command.y * viewport.height)
          if (command.kind === 'click') await page.mouse.click(x, y)
          else {
            await page.mouse.move(x, y)
            await page.mouse.wheel(command.deltaX, command.deltaY)
          }
          return
        }
        case 'key': await page.keyboard.press(command.key); return
        case 'text': await page.keyboard.insertText(command.text); return
        case 'navigate': await page.goto(command.url, { waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs }); return
        case 'back': await page.goBack({ waitUntil: 'domcontentloaded', timeout: this.options.timeoutMs }); return
        default: return assertNever(command, 'browser operator input')
      }
    })
  }

  private async mutate(id: BrowserTabId, action: 'reload' | 'close' | BrowserInput['kind'], signal: AbortSignal,
    operation: (page: Page) => Promise<void>): Promise<void> {
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    const task = this.options.queue.run(owned, async () => {
      const page = this.livePage(id)
      const record: BrowserAction = { id: randomUUID() as BrowserActionId, tool: `operator_${action}`,
        origin: 'operator', startedAt: new Date().toISOString(), status: 'running' }
      const token = Symbol()
      this.actions.set(token, record)
      this.trimActions()
      try {
        await operation(page)
        record.status = 'succeeded'
      } catch (error) {
        record.status = 'failed'
        throw new RemoteError('browser-preview/action-failed', 'Browser page action failed; inspect the page before retrying', { action }, { cause: error })
      } finally {
        this.observationRevision++
      }
    })
    this.operations.add(task)
    try { await task } finally { this.operations.delete(task) }
  }

  private requireOwner(): void {
    if (this.ctx.invocation?.peer.principal.kind !== 'owner') {
      throw new RemoteError('browser-preview/forbidden', 'Only the operator can control the shared browser', {})
    }
  }

  private trimActions(): void {
    for (const token of this.actions.keys()) {
      if (this.actions.size <= this.options.actionLimit) break
      this.actions.delete(token)
    }
  }

  private livePage(id: BrowserTabId): Page {
    const page = this.pages.get(id)
    if (page === undefined || page.isClosed()) throw new RemoteError('browser-preview/tab-missing', 'This browser tab is no longer open; refresh the tab list', {})
    return page
  }

  private pageId(page: Page): BrowserTabId {
    let id = this.pageIds.get(page)
    if (id === undefined) {
      id = randomUUID() as BrowserTabId
      this.pageIds.set(page, id)
    }
    this.pages.set(id, page)
    return id
  }

  private observePage(result: Readonly<ToolExecutionResult>): void {
    const value = result.value
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.content)) return
    for (const block of value.content) {
      if (block === null || typeof block !== 'object' || Array.isArray(block) || typeof block.text !== 'string') continue
      const current = /^- (\d+): \(current\) \[.*\]\((.*)\)$/mu.exec(block.text)
      if (current !== null) this.selectedPageIndex = Number(current[1])
      const url = /^- Page URL: (.+)$/mu.exec(block.text)?.[1] ?? current?.[2]
      if (url !== undefined) this.targetUrl = url
    }
  }

  private async capture(): Promise<BrowserPreviewFrame> {
    const revision = this.observationRevision
    try {
      if (!this.started) {
        await this.browser?.close()
        this.browser = undefined
        this.page = undefined
        this.pages.clear()
        this.viewedTab = undefined
        this.selectedPageIndex = undefined
        if (revision === this.observationRevision) this.frame = { started: false, actions: [], tabs: [], omittedTabs: 0, following: true }
      } else {
        if (this.browser?.isConnected() !== true) {
          const endpoint = (await readFile(join(this.options.userDataDir, 'DevToolsActivePort'), 'utf8')).split('\n')
          const port = Number(endpoint[0])
          if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/u.test(endpoint[1] ?? '')) {
            throw new Error('Invalid local browser endpoint')
          }
          this.browser = await chromium.connectOverCDP(`ws://127.0.0.1:${port}${endpoint[1]}`, {
            timeout: this.options.timeoutMs, noDefaults: true,
          })
        }
        const pages = this.browser.contexts().flatMap(context => context.pages())
        const selected = this.selectedPageIndex === undefined ? undefined : pages[this.selectedPageIndex]
        const activePage = (selected?.url() === this.targetUrl ? selected : pages.find(item => item.url() === this.targetUrl))
          ?? (this.page?.isClosed() === false && this.targetUrl === this.page.url() ? this.page : undefined)
        for (const [id, page] of this.pages) if (page.isClosed() || !pages.includes(page)) this.pages.delete(id)
        if (this.viewedTab !== undefined && !this.pages.has(this.viewedTab)) this.viewedTab = undefined
        const page = this.viewedTab === undefined ? activePage ?? pages[0] : this.pages.get(this.viewedTab)
        const displayed = pages.slice(0, this.options.tabLimit)
        if (page !== undefined && !displayed.includes(page)) displayed.splice(-1, 1, page)
        const tabs: BrowserTab[] = await Promise.all(displayed.map(async item => ({
          id: this.pageId(item), title: (await item.title()).slice(0, this.options.tabTextChars),
          url: item.url().slice(0, this.options.tabTextChars), active: item === activePage, selected: item === page,
        })))
        if (revision !== this.observationRevision) return this.snapshot()
        this.frame = { ...this.frame, tabs, omittedTabs: pages.length - tabs.length, following: this.viewedTab === undefined }
        if (page === undefined) {
          this.frame = { started: true, actions: [], tabs, omittedTabs: 0, following: true }
          return this.snapshot()
        }
        if (this.viewedTab === undefined) this.page = page
        const bytes = await page.screenshot({ type: 'jpeg', quality: this.options.jpegQuality, timeout: this.options.timeoutMs,
          fullPage: false, caret: 'initial' })
        const title = await page.title()
        // A completed tool can select or close a page while capture is awaiting CDP.
        if (revision !== this.observationRevision) return this.snapshot()
        if (bytes.length > this.options.maxImageBytes) {
          this.frame.error = 'image-too-large'
        } else {
          if (this.viewedTab === undefined) this.targetUrl = page.url()
          this.frame = { ...this.frame, started: true, url: page.url().slice(0, this.options.tabTextChars),
            title: title.slice(0, this.options.tabTextChars),
            image: `data:image/jpeg;base64,${bytes.toString('base64')}`, imageTabId: this.pageId(page), capturedAt: new Date().toISOString(), actions: [] }
        }
      }
    } catch (_error) {
      // The owner sees an explicit stale state; raw CDP errors can contain private URLs.
      if (revision === this.observationRevision) this.frame.error = 'capture-failed'
    }
    return this.snapshot()
  }

  private snapshot(): BrowserPreviewFrame {
    return { ...this.frame, started: this.started, actions: [...this.actions.values()].reverse().map(item => ({ ...item })) }
  }
}
