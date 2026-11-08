import { existsSync } from 'node:fs'
import { parse, resolve, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountSessionMcp } from '@deepseek-ai/dsh-experimental-browser-use-runtime/mcp'
import * as Provider from '../src/index.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

vi.mock('@deepseek-ai/dsh-experimental-browser-use-runtime/mcp', async importOriginal => ({
  ...await importOriginal<typeof import('@deepseek-ai/dsh-experimental-browser-use-runtime/mcp')>(),
  mountSessionMcp: vi.fn(),
}))
let ctx: Context
beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
})
afterEach(async () => {
  await ctx.fiber.dispose()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

it('uses the pinned Playwright executable with isolated Chromium launch settings', async () => {
  vi.stubEnv('PLAYWRIGHT_MCP_CDP_ENDPOINT', 'http://invalid.example:1')
  await Provider.apply(ctx, Provider.Config({ mode: 'launch', executablePath: '/custom/chromium', toolCallTimeoutMs: 123 }))
  const options = vi.mocked(mountSessionMcp).mock.calls[0]![1]
  expect(existsSync(options.args[0]!)).toBe(true)
  expect(options).toMatchObject({ name: 'playwright-mcp', exclusive: false, command: process.execPath, toolCallTimeoutMs: 123 })
  expect(options.env?.PLAYWRIGHT_MCP_CDP_ENDPOINT).toBe('')
  expect(options.args.slice(1)).toEqual(['--browser', 'chromium', '--caps', 'vision', '--image-responses', 'allow', '--isolated', '--headless', '--executable-path', '/custom/chromium'])
  expect('default' in Provider).toBe(false)
})

it('supports headed launch and attaches without launching a browser or creating a profile', async () => {
  await Provider.apply(ctx, Provider.Config({ mode: 'launch', headless: false }))
  const launched = vi.mocked(mountSessionMcp).mock.calls[0]![1]
  expect(launched.args.slice(1)).toEqual(['--browser', 'chromium', '--caps', 'vision', '--image-responses', 'allow', '--isolated'])
  await ctx.fiber.dispose()
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await Provider.apply(ctx, Provider.Config({ mode: 'attach', endpoint: 'http://127.0.0.1:9222' }))
  const options = vi.mocked(mountSessionMcp).mock.calls[1]![1]
  expect(options.exclusive).toBe(true)
  expect(options.args.slice(1)).toEqual(['--browser', 'chromium', '--caps', 'vision', '--image-responses', 'allow', '--cdp-endpoint', 'http://127.0.0.1:9222'])
})

it('rejects malformed endpoints before mounting any browser resources', async () => {
  await expect(Provider.apply(ctx, Provider.Config({ mode: 'attach', endpoint: 'http://localhost:bad/path' }))).rejects.toThrow('browser endpoint')
  expect(mountSessionMcp).not.toHaveBeenCalled()
})

it.each(['../profile', join(parse(resolve('.')).root, 'profile', '..')])('rejects unsafe persistent profile path %s before registering browser resources', async (userDataDir) => {
  await expect(Provider.apply(ctx, Provider.Config({ mode: 'persistent', userDataDir }))).rejects.toThrow('absolute, non-root')
  expect(mountSessionMcp).not.toHaveBeenCalled()
})
