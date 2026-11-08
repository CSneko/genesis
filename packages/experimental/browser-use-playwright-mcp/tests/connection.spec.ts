/** External address validation and provider-owned endpoint capture. @module */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { mountSharedBrowser } from '../src/persistent.ts'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as Connection from '../src/connection.ts'

vi.mock('../src/persistent.ts', () => ({ mountSharedBrowser: vi.fn().mockResolvedValue({}) }))
afterEach(() => { vi.clearAllMocks() })

it('captures one shared endpoint until provider restart without taking ownership of Chrome', async () => {
  let endpoint = 'http://127.0.0.1:9222'
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  try {
    await Connection.apply(ctx, { endpoint: { get: () => endpoint } })
    const options = vi.mocked(mountSharedBrowser).mock.calls[0]![1]
    expect(options.shutdownTool).toBeUndefined()
    const first = options.args
    endpoint = 'http://127.0.0.1:9333'
    expect(options.args.slice(-2)).toEqual(['--cdp-endpoint', 'http://127.0.0.1:9222'])
    expect(first.slice(-2)).toEqual(['--cdp-endpoint', 'http://127.0.0.1:9222'])
  } finally {
    await ctx.fiber.dispose()
  }
})

it('defaults to server-local Chrome and rejects invalid operator edits before connection', () => {
  expect(Connection.Config({}).endpoint.get()).toBe('http://127.0.0.1:9222')
  for (const endpoint of ['file:///tmp/chrome', 'http://localhost:bad', 'http://local host:9222']) {
    expect(() => Connection.Config({ endpoint })).toThrow()
  }
  expect(vi.mocked(mountSharedBrowser)).not.toHaveBeenCalled()
})
