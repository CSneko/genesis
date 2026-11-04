/** Real process ownership and crash recovery for the persistent writer lock. @module */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { acquireLease } from '../src/lease.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  const failures: unknown[] = []
  for (const dispose of cleanup.splice(0).reverse()) {
    try { await dispose() } catch (error) { failures.push(error) }
  }
  if (failures.length) throw new AggregateError(failures, 'Genesis lease teardown')
})

async function leasePath() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-lease-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return join(root, 'writer.lock')
}

function holder(path: string) {
  const child = spawn(process.execPath, ['--import', 'tsx/esm',
    fileURLToPath(new URL('./fixtures/lease-holder.mjs', import.meta.url)), path], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  })
  const exited = once(child, 'exit')
  cleanup.push(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exited
  })
  // An early exit rejects readiness instead of leaving a waiter until the test deadline.
  const message = () => Promise.race([
    once(child, 'message').then((values: unknown[]) => values[0]),
    exited.then(([code, signal]) => { throw new Error(`Lease fixture exited: ${code}/${signal}`) }),
  ])
  return { child, exited, message, async acquire() {
    const result = message()
    child.send('acquire')
    return result
  } }
}

it('reuses an existing file and preserves its inode across concurrent and repeated release', async () => {
  const path = await leasePath()
  await writeFile(path, '')
  const before = await stat(path)
  const release = await acquireLease(path)
  cleanup.push(release)
  await expect(acquireLease(path)).rejects.toMatchObject({ code: 'locked' })
  await Promise.all([release(), release()])
  expect((await stat(path)).ino).toBe(before.ino)
  expect(await readFile(path, 'utf8')).toBe('')
  const next = await acquireLease(path)
  cleanup.push(next)
  await release()
  await expect(acquireLease(path)).rejects.toMatchObject({ code: 'locked' })
})

it('excludes concurrent processes and recovers immediately after the winning writer is killed', async () => {
  const path = await leasePath()
  const first = holder(path)
  const second = holder(path)
  expect(await Promise.all([first.message(), second.message()])).toEqual(['ready', 'ready'])
  const results = await Promise.all([first.acquire(), second.acquire()])
  expect([...results].sort()).toEqual(['acquired', 'locked'])
  const [winner, successor] = results[0] === 'acquired' ? [first, second] : [second, first]
  await expect(acquireLease(path)).rejects.toMatchObject({ code: 'locked' })
  winner.child.kill('SIGKILL')
  await winner.exited
  expect(await successor.acquire()).toBe('acquired')
  await expect(acquireLease(path)).rejects.toMatchObject({ code: 'locked' })
  successor.child.kill('SIGKILL')
  await successor.exited
  const release = await acquireLease(path)
  cleanup.push(release)
})
