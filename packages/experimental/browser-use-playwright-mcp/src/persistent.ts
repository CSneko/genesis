/** Shared Playwright MCP lifetime for managed profiles and external browsers. @module */
import { lstatSync, mkdirSync } from 'node:fs'
import { isAbsolute, parse, resolve } from 'node:path'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import { BrowserUseProviderName } from '@deepseek-ai/dsh-browser-use/brand'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type {} from '@deepseek-ai/dsh-browser-use'

interface SharedOptions {
  args: string[]
  env: Record<string, string>
  toolCallTimeoutMs?: number
  shutdownTool?: string
}
interface PersistentOptions extends Omit<SharedOptions, 'shutdownTool'> { userDataDir: string }

/** Shared admission for AI tools and operator browser mutations. */
export interface BrowserQueue {
  /**
   * Serialize one browser operation with model tool calls until it settles.
   * @param signal - Cancellation checked before the operation starts.
   * @param operation - Owned browser work; must settle after its effects finish.
   * @returns The operation's result, or rejection when cancelled or stopping.
   */
  run<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T>
}

/**
 * Share one serialized browser connection across Sessions until provider unload.
 * Chromium owns the profile lock; lock failures do not select another directory.
 * @param ctx - context providing the browser reservation and tool registry.
 * @param options - explicit profile directory and pinned server launch arguments.
 * @returns Shared operation admission after MCP discovery; disposal drains admitted work and closes the server before releasing browser registration.
 */
export async function mountPersistentBrowser(ctx: Context, options: PersistentOptions): Promise<BrowserQueue> {
  const absoluteDirectory = resolve(options.userDataDir)
  if (!isAbsolute(options.userDataDir) || parse(absoluteDirectory).root === absoluteDirectory) {
    throw new Error('Playwright userDataDir must be an absolute, non-root browser profile directory')
  }
  mkdirSync(options.userDataDir, { recursive: true, mode: 0o700 })
  const directory = lstatSync(options.userDataDir)
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    throw new Error('Playwright userDataDir must be a directory, not a symbolic link')
  }
  return mountSharedBrowser(ctx, { ...options, shutdownTool: 'browser_close' })
}

/**
 * Publish one serialized MCP browser to all Sessions until provider disposal.
 * Omitting shutdownTool disconnects without closing an externally owned browser.
 * @param ctx - Provider scope owning tool registration and operation admission.
 * @param options - Pinned MCP arguments, environment, and explicit browser shutdown ownership.
 * @returns Shared admission after discovery; unload drains calls before removing the provider.
 */
export async function mountSharedBrowser(ctx: Context, options: SharedOptions): Promise<BrowserQueue> {
  let tail = Promise.resolve()
  let stopping = false
  let child!: Fiber
  const queue: BrowserQueue = {
    run<T>(signal: AbortSignal, execute: () => Promise<T>): Promise<T> {
      const operation = tail.then(() => {
        signal.throwIfAborted()
        if (stopping) throw new Error('Playwright browser is stopping; retry after restarting the provider')
        return execute()
      })
      tail = operation.then(() => {}, () => {})
      return operation
    },
  }
  ctx.effect(function* () {
    yield ctx.browserUse.register(BrowserUseProviderName('playwright-mcp'))
    yield ctx.on('tools/execute', async (exec, next) => {
      if (!exec.name.startsWith('mcp__playwright-mcp__')) return next()
      return queue.run(exec.signal, next)
    })
    child = ctx.plugin(McpClient, McpClient.Config({
      transport: 'stdio', serverName: 'playwright-mcp', command: process.execPath,
      args: options.args, env: options.env, cwd: process.cwd(),
      ...options.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: options.toolCallTimeoutMs },
      failOnStartupError: true, reconnect: { enabled: false },
      ...options.shutdownTool === undefined ? {} : { shutdownTool: options.shutdownTool },
    }))
    yield child.dispose
    yield async () => {
      stopping = true
      try {
        await tail
      } finally {
        await child.dispose()
      }
    }
  }, 'playwright-mcp.persistent')
  await child.await()
  return queue
}
