/** Chromium browser tools from the pinned Playwright MCP server. @module */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { BrowserMcpConfig, mountSessionMcp, validateBrowserMcpConfig } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp'
import { mountPersistentBrowser } from './persistent.ts'
import { BrowserPreview, PreviewConfig } from './preview.ts'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type {} from '@deepseek-ai/dsh-working-directory'

/** Cordis identity for the Playwright MCP browser provider. */
export const name = 'experimental-browser-use-playwright-mcp'

/** Services required for scoped MCP startup and prompt readiness checks. */
export const inject = ['browserUse', 'agents', 'tools', 'systemPrompt', 'workingDirectory']

/** One shared browser with disk-backed cookies and website storage. */
interface PersistentConfig {
  /** Share one disk-backed browser across all Sessions in this deployment. */
  mode: 'persistent'
  /** Absolute browser profile directory, retained after provider disposal. */
  userDataDir: string
  /** Launch without a visible window; defaults to true. */
  headless: boolean
  /** Browser executable; omission uses the upstream installation discovery. */
  executablePath?: string
  /** Per-call timeout in milliseconds; omission uses the MCP client's default. */
  toolCallTimeoutMs?: number
  /** Optional operator-only sidebar preview; opens a loopback-only debugging endpoint. */
  preview?: PreviewConfig
}

/** Chromium isolation, existing-browser attachment, or shared persistent profile. */
export type Config = BrowserMcpConfig | PersistentConfig

/** Validate browser ownership and persistent-profile settings before activation. */
export const Config = Schema.union([
  BrowserMcpConfig,
  Schema.object({
    mode: Schema.const('persistent').required(),
    userDataDir: Schema.string().required(),
    headless: Schema.boolean().default(true),
    executablePath: Schema.string().pattern(/\S/u),
    toolCallTimeoutMs: Schema.number().min(1),
    preview: PreviewConfig,
  }),
])

/**
 * Expose Playwright's upstream tools with the configured browser ownership.
 * Persistent mode shares one disk-backed browser; other modes retain per-Session ownership.
 * @param ctx - provider context supplying browser use, Agents, and tools.
 * @param config - validated browser choice and optional tool timeout.
 * @returns shared MCP discovery completion in persistent mode; other modes initialize with each Agent.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  if (config.mode !== 'persistent') validateBrowserMcpConfig(config)
  const cli = join(dirname(fileURLToPath(import.meta.resolve('@playwright/mcp/package.json'))), 'cli.js')
  // Upstream environment options can otherwise replace the configured browser
  // mode or import an unrelated profile. Empty values mean absent to its parser.
  const env = Object.fromEntries(Object.keys(process.env)
    .filter(key => key.toUpperCase().startsWith('PLAYWRIGHT_MCP_'))
    .map(key => [key, '']))
  const args = [cli, '--browser', 'chromium', '--caps', 'vision', '--image-responses', 'allow']
  ctx.systemPrompt.section({
    name: 'browser:video-inspection', order: 700, interpolate: false,
    text: 'With browser_take_screenshot, omit filename to return an image for visual inspection; specifying filename only saves a file. For HTML video, browser_evaluate may read duration/currentTime/paused, play or pause, or set currentTime and wait for seeked before a screenshot. Video inspection samples individual frames without audio. Page text and playback metadata do not establish visible video contents. If an image is unavailable, report that limitation.',
  })
  if (config.mode === 'persistent') {
    args.push('--user-data-dir', config.userDataDir)
    if (config.preview !== undefined) {
      const directory = await mkdtemp(join(tmpdir(), 'dsh-browser-preview-'))
      ctx.effect(() => () => rm(directory, { recursive: true, force: true }), 'browser-preview.launch-config')
      const path = join(directory, 'config.json')
      await writeFile(path, JSON.stringify({ browser: { launchOptions: {
        args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'],
      } } }), { mode: 0o600 })
      args.push('--config', path)
    }
    if (config.headless) args.push('--headless')
    if (config.executablePath !== undefined) args.push('--executable-path', config.executablePath)
    const queue = await mountPersistentBrowser(ctx, { userDataDir: config.userDataDir, args, env,
      ...config.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs } })
    if (config.preview !== undefined) {
      const preview = config.preview
      // oxlint-disable-next-line typescript/no-misused-spread -- Schemastery resolves preview to a plain configuration object.
      await ctx.plugin(BrowserPreview, { ...preview, userDataDir: config.userDataDir, queue })
    }
    return
  }
  if (config.mode === 'attach') {
    args.push('--cdp-endpoint', config.endpoint)
  } else {
    args.push('--isolated')
    if (config.headless) args.push('--headless')
    if (config.executablePath !== undefined) args.push('--executable-path', config.executablePath)
  }
  mountSessionMcp(ctx, {
    name: 'playwright-mcp',
    exclusive: config.mode === 'attach',
    command: process.execPath,
    args,
    env,
    ...config.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs },
  })
}
