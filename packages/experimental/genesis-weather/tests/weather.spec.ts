/** Cache durability, failure cooldown and logged selective context with instance-owned storage. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as jsonStorage from '@deepseek-ai/dsh-storage-json'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WeatherCache, weatherDomain } from '../src/cache.ts'
import { fetchWeather, type WeatherReading } from '../src/weather.ts'
import { weatherContextUpdate } from '../src/context.ts'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const interval = 1800000
const limits = { timeoutMs: 10000, maxResponseBytes: 65536, refreshIntervalMs: interval, maxLocations: 2 }
const thresholds = { temperatureDeltaC: 5, windDeltaKmh: 15 }
const base = Date.parse('2026-11-13T00:00:00Z')
function payload(temperature = 20, weatherCode = 0) {
  return {
    current: {
      time: '2026-11-13T08:00',
      temperature_2m: temperature,
      apparent_temperature: temperature,
      relative_humidity_2m: 60,
      weather_code: weatherCode,
      wind_speed_10m: 5,
    },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => `2026-11-${13 + i}`),
      temperature_2m_max: Array<number>(7).fill(22),
      temperature_2m_min: Array<number>(7).fill(10),
      weather_code: Array<number>(7).fill(weatherCode),
    },
  }
}
function network() {
  const fixture = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.hostname === 'geocoding-api.open-meteo.com')
      return Response.json({ results: [{ name: 'Shanghai', latitude: 31.2, longitude: 121.5 }] })
    if (url.hostname === 'api.open-meteo.com') return Response.json(payload())
    throw new Error('Unexpected fixture request')
  })
  vi.stubGlobal('fetch', fixture)
  return fixture
}
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'genesis-weather-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}
async function open(root: string) {
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  await ctx.plugin(Storage)
  await ctx.plugin(jsonStorage, { root })
  await ctx.plugin(storageDomain, { backend: 'json' })
  const domain = await ctx.storageDomain.open(weatherDomain)
  const alive = new AbortController()
  const cache = new WeatherCache(domain, limits, alive.signal)
  const close = async () => {
    alive.abort()
    await cache.settled()
    await domain.close()
    await ctx.fiber.dispose()
  }
  cleanup.push(close)
  return { cache, domain, close }
}
function sample(temperature = 20, code = 0): WeatherReading {
  return {
    location: 'Shanghai',
    sampledAt: base,
    coordinates: { name: 'Shanghai', latitude: 31.2, longitude: 121.5 },
    ...payload(temperature, code),
  }
}
it('shares concurrent lookups, retains cooldown after restart and refreshes without repeated geocoding', async () => {
  let now = base
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const fetcher = network()
  const root = await directory()
  const first = await open(root)
  const [a, b] = await Promise.all([first.cache.get('Shanghai'), first.cache.get(' shanghai ')])
  expect(a).toEqual(b)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await first.close()
  const second = await open(root)
  now += interval - 1
  await second.cache.get('Shanghai')
  expect(fetcher).toHaveBeenCalledTimes(2)
  now += 1
  await second.cache.get('Shanghai')
  expect(fetcher).toHaveBeenCalledTimes(3)
})
it('persists failure cooldown and refuses malformed weather instead of inventing clear skies', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(base)
  const fetcher = network()
  fetcher.mockImplementation(async input =>
    new URL(String(input)).hostname === 'geocoding-api.open-meteo.com'
      ? Response.json({ results: [{ name: 'Shanghai', latitude: 31.2, longitude: 121.5 }] })
      : Response.json({ current: { temperature_2m: 20 } }),
  )
  const root = await directory()
  const first = await open(root)
  await expect(first.cache.get('Shanghai')).rejects.toMatchObject({ code: 'provider' })
  await first.close()
  const second = await open(root)
  await expect(second.cache.get('Shanghai')).rejects.toMatchObject({ code: 'provider' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('refuses corrupted durable cache and bounds provider responses', async () => {
  const root = await directory()
  const first = await open(root)
  network()
  await first.cache.get('Shanghai')
  await first.close()
  await writeFile(join(root, 'genesis_weather.json'), '{broken')
  await expect(open(root)).rejects.toThrow()
  const fetcher = network()
  fetcher.mockImplementation(async () => new Response('x'.repeat(2048)))
  await expect(fetchWeather('Shanghai', null, { ...limits, maxResponseBytes: 1024 }, new AbortController().signal)).rejects.toMatchObject({
    code: 'limit',
  })
})
it('compares to committed weather, accumulates small changes and restores missing context', () => {
  const session = Session.create(SessionId('weather-context'))
  const update = weatherContextUpdate(session, sample(), thresholds)
  expect(update).toBeDefined()
  expect(weatherContextUpdate(session, sample(), thresholds)?.content).toEqual(update?.content)
  session.append('user/message', update!, { surfaceOp: 'append' })
  expect(weatherContextUpdate(session, sample(24), thresholds)).toBeUndefined()
  expect(weatherContextUpdate(session, sample(25), thresholds)).toBeDefined()
  expect(weatherContextUpdate(session, sample(20, 61), thresholds)).toBeDefined()
  const restored = Session.create(SessionId('weather-restored'))
  for (const event of session.ownEvents()) restored.append(event.type, event.data, { surfaceOp: 'append' })
  expect(weatherContextUpdate(restored, sample(), thresholds)).toBeUndefined()
  const unavailable = weatherContextUpdate(session, 'unavailable', thresholds)
  expect(unavailable?.content).toEqual([expect.objectContaining({ text: expect.stringContaining('historical') })])
  session.append('user/message', unavailable!, { surfaceOp: 'append' })
  expect(weatherContextUpdate(session, 'unavailable', thresholds)).toBeUndefined()
  expect(weatherContextUpdate(session, sample(), thresholds)).toBeDefined()
  const disabled = weatherContextUpdate(session, 'disabled', thresholds)
  session.append('user/message', disabled!, { surfaceOp: 'append' })
  expect(weatherContextUpdate(session, 'disabled', thresholds)).toBeUndefined()
})
