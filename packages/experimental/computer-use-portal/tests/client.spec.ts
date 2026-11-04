/** Worker cancellation closes the process before queued calls may start a replacement. */
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SubprocessLocal from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { SessionId } from '@deepseek-ai/dsh-session'
import { PortalClient } from '../src/client.ts'
import { Config } from '../src/config.ts'

let ctx: Context | undefined
let client: PortalClient | undefined
afterEach(async () => {
  await client?.close()
  await ctx?.fiber.dispose()
  vi.restoreAllMocks()
})

it.skipIf(process.platform !== 'linux')('settles active cancellation and starts a disconnected replacement without replay', async () => {
  ctx = new Context()
  await ctx.plugin(SubprocessLocal)
  const handles: SubprocessHandle[] = []
  const originalSpawn = ctx.subprocess.spawn.bind(ctx.subprocess)
  const spawn = vi.spyOn(ctx.subprocess, 'spawn').mockImplementation((spec) => {
    const handle = originalSpawn(spec)
    handles.push(handle)
    return handle
  })
  client = new PortalClient(ctx, Config({ python: fileURLToPath(new URL('./fixtures/python.mjs', import.meta.url)) }))
  await client.start()
  const first = handles[0]
  if (first === undefined || first.stdin === undefined) throw new Error('Fixture worker did not expose stdin')
  const stdin = first.stdin
  const controller = new AbortController()
  const sent: PromiseWithResolvers<void> = Promise.withResolvers()
  const write = stdin.write.bind(stdin)
  vi.spyOn(stdin, 'write').mockImplementation((...args: Parameters<typeof write>) => {
    const result = write(...args)
    sent.resolve()
    return result
  })
  const pending = client.call(SessionId('one'), { action: 'hang' }, controller.signal)
  const rejected = expect(pending).rejects.toThrow('interrupted')
  await sent.promise
  controller.abort()
  await rejected
  expect(await first.done).toMatchObject({ exitCode: null })
  const result = await client.call(SessionId('two'), { action: 'status' }, new AbortController().signal)
  expect(JSON.stringify(result)).toContain('"connected\\":false')
  expect(spawn).toHaveBeenCalledTimes(2)
  await client.close()
  const replacement = handles[1]
  if (replacement === undefined) throw new Error('Replacement worker was not started')
  expect(await replacement.waitForExit()).toBe(true)
})

it.skipIf(process.platform !== 'linux').each(['python.mjs', 'python-worker.py'])('receives a screenshot-sized %s response across multiple stdout chunks', async (worker) => {
  ctx = new Context()
  await ctx.plugin(SubprocessLocal)
  client = new PortalClient(ctx, Config({ python: fileURLToPath(new URL(`./fixtures/${worker}`, import.meta.url)) }))
  await client.start()
  const result = await client.call(SessionId('large'), { action: 'large-response' }, new AbortController().signal)
  expect(result).toEqual({ payload: 'x'.repeat(512 * 1024) })
})
