/** Optional dsh-weather adaptation with independent tools and private operator context. @module */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-experimental-genesis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { WeatherCache, weatherDomain } from './cache.ts'
import { weatherContextUpdate } from './context.ts'
import { condition, WeatherError } from './weather.ts'

/** Live feature switches and deployment-owned network/context budgets. */
export interface Config {
  /** Master switch; disabled makes no weather requests. */
  enabled: Volatile<boolean>
  /** Independently expose the learnable get_weather tool. */
  toolEnabled: Volatile<boolean>
  /** Independently share configured-location weather in private operator Life conversations. */
  contextEnabled: Volatile<boolean>
  /** Explicit user city; empty requires a tool location and disables context requests. */
  location: Volatile<string>
  /** Allowed Life preset. */
  lifePreset: string
  /** Minimum delay between lookup attempts for each location, including failures. */
  refreshIntervalMs: number
  /** Temperature or apparent-temperature change since last injection, in Celsius. */
  temperatureDeltaC: number
  /** Wind-speed change since last injection, in km/h. */
  windDeltaKmh: number
  /** Entire lookup deadline, including geocoding. */
  timeoutMs: number
  /** Maximum bytes in each complete provider response. */
  maxResponseBytes: number
  /** Maximum retained locations; unexpired entries are never evicted to bypass cooldown. */
  maxLocations: number
}
/** Validate settings; feature and location edits apply on the next invocation without restarting. */
export const Config = Schema.object({
  enabled: Schema.boolean().default(false).volatile(),
  toolEnabled: Schema.boolean().default(false).volatile(),
  contextEnabled: Schema.boolean().default(false).volatile(),
  location: Schema.string().max(200).default('').volatile(),
  lifePreset: Schema.string().default('life'),
  refreshIntervalMs: Schema.natural().min(1800000).max(86400000).default(1800000),
  temperatureDeltaC: Schema.number().min(1).max(20).default(5),
  windDeltaKmh: Schema.number().min(1).max(100).default(15),
  timeoutMs: Schema.natural().min(1000).max(60000).default(10000),
  maxResponseBytes: Schema.natural().min(1024).max(1048576).default(65536),
  maxLocations: Schema.natural().min(1).max(64).default(16),
})
/** Loader and configuration namespace. */
export const name = 'genesis-weather'
/** Existing logged tool execution, life authorization, and durable cache owners. */
export const inject = ['tools', 'agents', 'genesis', 'agentPresets', 'storageDomain']

/**
 * Register the optional tool and pre-step context; idle profiles make no network requests.
 * @param ctx - Plugin registration and teardown owner.
 * @param config - Validated live switches and finite budgets.
 * @returns Once the durable cache is open and registrations are active.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const domain = await ctx.storageDomain.open(weatherDomain)
  const alive = new AbortController()
  const cache = new WeatherCache(domain, config, alive.signal)
  ctx.effect(() => async () => {
    alive.abort()
    await cache.settled()
    await domain.close()
  })
  const permitted = (agent: Parameters<typeof ctx.agentPresets.composedPreset>[0]) =>
    ctx.agentPresets.composedPreset(agent) === config.lifePreset
  const enabledTool = () => config.enabled.get() && config.toolEnabled.get()
  ctx.tools.register(
    defineTool({
      name: 'get_weather',
      description:
        'Read Open-Meteo current weather and up to seven forecast days for an explicit city. Omit location to use the operator-configured city. Same-location queries share a cache and refresh at most once per 30 minutes, including failed attempts. Dates are provider-local; temperatures default to Celsius and wind is km/h. This forecast is approximate, not proof of anyone’s physical location.',
      parameters: {
        location: { type: 'string', description: 'City or place name; omitted uses the operator-configured city.' },
        units: { type: 'string', enum: ['celsius', 'fahrenheit'], description: 'Temperature unit; omitted uses Celsius.' },
        days: { type: 'integer', description: 'Number of forecast days, 1–7; omitted returns current conditions only.' },
      },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      async execute(args, exec) {
        if (!enabledTool())
          throw new WeatherError('disabled', 'The weather tool is disabled. Ask the operator to enable Weather and its tool switch.')
        if (
          !exec.agent ||
          !permitted(exec.agent.ctx) ||
          !ctx.genesis.isOperatorSession(exec.agent.id) ||
          ctx.genesis.isQqSession(exec.agent.id)
        ) {
          throw new WeatherError('disabled', 'Weather requires a private operator Life conversation.')
        }
        const location = args.location ?? config.location.get()
        const days = args.days ?? 1
        if (!Number.isInteger(days) || days < 1 || days > 7)
          throw new WeatherError('configuration', 'Forecast days must be an integer from 1 to 7.')
        const reading = await cache.get(location)
        exec.signal.throwIfAborted()
        if (!enabledTool()) throw new WeatherError('disabled', 'The weather tool was disabled while the lookup was running.')
        const convert = (value: number) => (args.units === 'fahrenheit' ? Math.round(((value * 9) / 5 + 32) * 10) / 10 : value)
        return {
          source: 'Open-Meteo',
          location: reading.coordinates.name,
          requestedLocation: reading.location,
          sampledAt: new Date(reading.sampledAt).toISOString(),
          observedAt: reading.current.time,
          temperatureUnit: args.units === 'fahrenheit' ? '°F' : '°C',
          windUnit: 'km/h',
          temperature: convert(reading.current.temperature_2m),
          feelsLike: convert(reading.current.apparent_temperature),
          humidity: reading.current.relative_humidity_2m,
          wind: reading.current.wind_speed_10m,
          condition: condition(reading.current.weather_code),
          weatherCode: reading.current.weather_code,
          forecast:
            days === 1
              ? []
              : reading.daily.time
                .slice(0, days)
                .map((date, i) => {
                  const low = reading.daily.temperature_2m_min[i]
                  const high = reading.daily.temperature_2m_max[i]
                  const weatherCode = reading.daily.weather_code[i]
                  if (low === undefined || high === undefined || weatherCode === undefined)
                    throw new WeatherError('provider', 'Forecast arrays are incomplete. Retry after the refresh interval.')
                  return { date, low: convert(low), high: convert(high), condition: condition(weatherCode), weatherCode }
                }),
        }
      },
      presentCall: args => ({ card: 'generic', title: 'Open-Meteo', kind: 'read', rawInput: args.location ?? config.location.get() }),
    }),
    {
      when: ({ agent }) =>
        enabledTool() && permitted(agent.ctx) && ctx.genesis.isOperatorSession(agent.id) && !ctx.genesis.isQqSession(agent.id),
    },
  )
  let reportedFailure = false
  ctx.on(
    'agent/pre-step',
    async ({ agent, signal }, next) => {
      const decision = await next()
      if (
        decision.kind === 'reject' ||
        signal.aborted ||
        !permitted(agent.ctx) ||
        !ctx.genesis.isOperatorSession(agent.id) ||
        ctx.genesis.isQqSession(agent.id)
      )
        return decision
      const location = config.location.get().trim()
      const sharing = () =>
        config.enabled.get() && config.contextEnabled.get() && config.location.get().trim() === location && location !== ''
      let reading: Awaited<ReturnType<WeatherCache['get']>> | 'disabled' | 'unavailable' = 'disabled'
      if (sharing()) {
        try {
          reading = await cache.get(location)
          reportedFailure = false
        } catch (error) {
          if (alive.signal.aborted || signal.aborted) return decision
          reading = 'unavailable'
          if (!reportedFailure) {
            ctx.logger.warn(
              'Weather context is unavailable. Check the configured city, network and weather cache; retries wait for the refresh interval.',
              error,
            )
            reportedFailure = true
          }
        }
        if (!sharing()) reading = 'disabled'
      }
      if (signal.aborted || alive.signal.aborted) return decision
      const update = weatherContextUpdate(agent.session, reading, config)
      return update ? { ...decision, messages: [...decision.messages, update] } : decision
    },
    { prepend: true },
  )
}
