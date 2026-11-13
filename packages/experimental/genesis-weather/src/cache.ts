/** Durable shared lookup cache; attempts are committed before network IO, including failures and crashes. @module */
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { fetchWeather, readingSchema, WeatherError, type WeatherReading, type WeatherLimits } from './weather.ts'

const entrySchema = z.object({
  attemptedAt: z.number().int().nonnegative(),
  status: z.enum(['pending', 'ready', 'failed']),
  reading: readingSchema.nullable(),
})
/** Versioned disposable weather observations, separate from life identity and Session logs. */
export const weatherDomain = defineDomain({
  name: 'genesis_weather',
  version: 1,
  tables: { readings: domainTable<string, z.infer<typeof entrySchema>>(entrySchema) },
})
/** One plugin instance owns pending work and its durable cache. */
export class WeatherCache {
  private readonly pending = new Map<string, Promise<WeatherReading>>()
  private queue: Promise<void> = Promise.resolve()
  private blocked = false
  /**
   * @param domain - Caller-owned durable cache.
   * @param limits - Network budgets and cache bounds.
   * @param signal - Plugin lifetime cancellation.
   */
  constructor(
    private readonly domain: Domain<typeof weatherDomain>,
    private readonly limits: WeatherLimits & { refreshIntervalMs: number; maxLocations: number },
    private readonly signal: AbortSignal,
  ) {}

  /**
   * Share one lookup per normalized location; failed attempts retain their cooldown across restart.
   * @param location - Explicit place name; trimmed and case-folded for lookup identity.
   * @returns A fresh-enough successful reading, or a rejection; stale readings are never returned as current.
   */
  get(location: string): Promise<WeatherReading> {
    const trimmed = location.trim()
    if (!trimmed || trimmed.length > 200)
      return Promise.reject(new WeatherError('configuration', 'Enter a location of 1–200 characters in Weather settings or the tool call.'))
    const key = trimmed.toLocaleLowerCase('en-US')
    const existing = this.pending.get(key)
    if (existing) return existing
    if (this.pending.size >= this.limits.maxLocations)
      return Promise.reject(new WeatherError('limit', 'Too many weather locations are pending. Wait for current lookups to finish.'))
    const work = this.queue.then(() => this.lookup(key, trimmed))
    this.pending.set(key, work)
    // A failed lookup does not prevent unrelated queued lookups; storage failures separately block the cache.
    this.queue = work.then(
      () => {},
      (_error) => {},
    )
    void work
      .finally(() => {
        this.pending.delete(key)
      })
      .catch((_error) => {
        /* The returned work carries the lookup failure. */
      })
    return work
  }
  /** @returns After all accepted operations settle; call after aborting the lifetime signal. */
  async settled(): Promise<void> {
    await this.queue
  }

  private async write(key: string, value: z.infer<typeof entrySchema>) {
    try {
      await this.domain.table('readings').put(key, value)
    } catch (_error) {
      this.blocked = true
      throw new WeatherError(
        'storage',
        'Weather cache write could not be confirmed. Weather requests are stopped; inspect storage and restart before retrying.',
      )
    }
  }
  private async lookup(key: string, location: string): Promise<WeatherReading> {
    this.signal.throwIfAborted()
    if (this.blocked)
      throw new WeatherError('storage', 'Weather cache is unavailable after a storage failure. Inspect storage and restart.')
    const table = this.domain.table('readings')
    const now = Date.now()
    const previous = table.get(key)
    if (previous && now < previous.attemptedAt + this.limits.refreshIntervalMs) {
      if (previous.status === 'ready' && previous.reading) return previous.reading
      throw new WeatherError('provider', 'The previous weather lookup did not complete successfully. Retry after the refresh interval.')
    }
    if (!previous && table.size >= this.limits.maxLocations) {
      const expired = [...table.entries()].find(([, value]) => now >= value.attemptedAt + this.limits.refreshIntervalMs)
      if (!expired)
        throw new WeatherError('limit', 'Weather location cache is full. Reuse a recent location or wait for the refresh interval.')
      try {
        await table.delete(expired[0])
      } catch (_error) {
        this.blocked = true
        throw new WeatherError('storage', 'Weather cache cleanup failed. Inspect storage and restart.')
      }
    }
    await this.write(key, { attemptedAt: now, status: 'pending', reading: previous?.reading ?? null })
    let reading: WeatherReading
    try {
      reading = await fetchWeather(location, previous?.reading ?? null, this.limits, this.signal)
    } catch (error) {
      await this.write(key, { attemptedAt: now, status: 'failed', reading: previous?.reading ?? null })
      throw error
    }
    this.signal.throwIfAborted()
    await this.write(key, { attemptedAt: now, status: 'ready', reading })
    return reading
  }
}
