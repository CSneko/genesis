/** Open-Meteo adapter based on sunshine-lang/dsh-weather (MIT); see THIRD_PARTY_NOTICES.md. @module */
import { z } from 'zod'

/** Structured lookup failure; no upstream response body or user location is included in diagnostics. */
export class WeatherError extends Error {
  /** @param code - Handling category. @param message - Safe recovery instruction. */
  constructor(
    readonly code: 'configuration' | 'provider' | 'limit' | 'disabled' | 'storage',
    message: string,
  ) {
    super(message)
    this.name = 'WeatherError'
  }
}
const coordinateSchema = z.object({
  name: z.string().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
})
const currentSchema = z.object({
  time: z.string().min(1).max(40),
  temperature_2m: z.number().min(-100).max(100),
  apparent_temperature: z.number().min(-150).max(150),
  relative_humidity_2m: z.number().min(0).max(100),
  weather_code: z.number().int().min(0).max(99),
  wind_speed_10m: z.number().min(0).max(500),
})
const dailySchema = z.object({
  time: z.array(z.string().max(40)).length(7),
  temperature_2m_max: z.array(z.number()).length(7),
  temperature_2m_min: z.array(z.number()).length(7),
  weather_code: z.array(z.number().int().min(0).max(99)).length(7),
})
/** Validated provider reading, including provenance and Celsius/km/h units. */
export const readingSchema = z.object({
  location: z.string().min(1).max(200),
  sampledAt: z.number().int().nonnegative(),
  coordinates: coordinateSchema,
  current: currentSchema,
  daily: dailySchema,
})
/** Structured current weather and forecast. */
export type WeatherReading = z.infer<typeof readingSchema>
/** Complete finite network budgets. */
export interface WeatherLimits {
  timeoutMs: number
  maxResponseBytes: number
}

async function readJson(url: URL, signal: AbortSignal, maxBytes: number): Promise<unknown> {
  const response = await fetch(url, { signal, redirect: 'error' })
  if (!response.ok) {
    await response.body?.cancel()
    throw new WeatherError('provider', `Weather service returned HTTP ${response.status}. Retry after the refresh interval.`)
  }
  if (!response.body) throw new WeatherError('provider', 'Weather service returned no data. Retry after the refresh interval.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) throw new WeatherError('limit', 'Weather response exceeded maxResponseBytes. Check the service before retrying.')
      chunks.push(chunk.value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
}

/**
 * Resolve a place and fetch seven forecast days once; later refreshes reuse its coordinates.
 * @param location - Explicit operator or tool location, never an inferred user location.
 * @param previous - Previous successful reading; absent resolves coordinates first.
 * @param limits - Request deadline and complete response byte limit.
 * @param signal - Plugin cancellation; shared lookups survive individual caller cancellation.
 * @returns Validated reading with a fetch timestamp; malformed responses reject without invented weather.
 */
export async function fetchWeather(
  location: string,
  previous: WeatherReading | null,
  limits: WeatherLimits,
  signal: AbortSignal,
): Promise<WeatherReading> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(limits.timeoutMs)])
  try {
    let coordinates = previous?.coordinates
    if (!coordinates) {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
      url.search = new URLSearchParams({ name: location, count: '1' }).toString()
      const result = z
        .object({ results: z.array(coordinateSchema).max(1).optional() })
        .parse(await readJson(url, deadline, limits.maxResponseBytes))
      coordinates = result.results?.[0]
      if (!coordinates)
        throw new WeatherError('configuration', 'Location was not found. Enter a city name, preferably in English, and save again.')
    }
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min,weather_code',
      forecast_days: '7',
      timezone: 'auto',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
    }).toString()
    const data = z.object({ current: currentSchema, daily: dailySchema }).parse(await readJson(url, deadline, limits.maxResponseBytes))
    return { location, sampledAt: Date.now(), coordinates, ...data }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof WeatherError) throw error
    throw new WeatherError(
      'provider',
      'Weather lookup failed or returned invalid data. Check connectivity and retry after the refresh interval.',
    )
  }
}

/** Weather families avoid injecting every small WMO code change. @param code - WMO code. @returns Compact English condition. */
export function condition(code: number): string {
  if (code === 0 || code === 1) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if ([56, 57, 66, 67].includes(code)) return 'freezing rain'
  if (code >= 95) return 'thunderstorm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 65) || (code >= 80 && code <= 82)) return 'rain'
  return `WMO ${code}`
}
