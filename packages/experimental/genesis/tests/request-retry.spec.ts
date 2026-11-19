/** Attempt deadlines remain subordinate to the owning operation's cancellation. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { retryRequest } from '../src/request-retry.ts'

// Fake time controls only these owned retry timers; no sockets or life storage run here.
afterEach(() => { vi.useRealTimers() })

it('cancels a stalled attempt and retries with a fresh signal', async () => {
  vi.useFakeTimers()
  const signals: AbortSignal[] = []
  const retried: number[] = []
  const pending = retryRequest(async (signal) => {
    signals.push(signal)
    if (signals.length === 1)
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    return 'completed'
  }, 1, 0, new AbortController().signal, retry => retried.push(retry), 60000)
  await vi.advanceTimersByTimeAsync(60001)
  await expect(pending).resolves.toBe('completed')
  expect(signals).toHaveLength(2)
  expect(signals[0]!.aborted).toBe(true)
  expect(signals[1]!.aborted).toBe(false)
  expect(retried).toEqual([1])
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps operation cancellation terminal and releases the attempt timer', async () => {
  vi.useFakeTimers()
  const owner = new AbortController()
  let attempts = 0
  const pending = retryRequest(async (signal) => {
    attempts++
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }, 3, 0, owner.signal, () => { throw new Error('Cancellation must not retry') }, 60000)
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  owner.abort()
  await rejected
  expect(attempts).toBe(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('reports an exhausted attempt deadline without starting extra requests', async () => {
  vi.useFakeTimers()
  let attempts = 0
  const secondAttempt = Promise.withResolvers<undefined>()
  const pending = retryRequest(async (signal) => {
    attempts++
    if (attempts === 2) secondAttempt.resolve(undefined)
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
  }, 1, 0, new AbortController().signal, () => {}, 60000)
  const rejected = expect(pending).rejects.toMatchObject({ failure: { code: 'TIMEOUT' },
    message: expect.stringContaining('memory.overview.requestTimeoutMs') })
  await vi.advanceTimersByTimeAsync(60000)
  await secondAttempt.promise
  await vi.advanceTimersByTimeAsync(60000)
  await rejected
  expect(attempts).toBe(2)
  expect(vi.getTimerCount()).toBe(0)
})
