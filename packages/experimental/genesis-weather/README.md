---
description: "Optional cached weather tools and selective private weather context for Genesis."
kind: "package-bundle"
---

# @deepseek-ai/dsh-genesis-weather

English | [中文](README.zh.md)

## Summary

An optional Genesis adaptation of [dsh-weather](https://github.com/sunshine-lang/dsh-weather), using Open-Meteo without an API key. The source workspace enables the bundle and its weather switches by default; automatic context waits for an explicit city. Tools and private operator context have independent switches and share a durable cache. Upstream attribution is in [Third-party notices](THIRD_PARTY_NOTICES.md).

## Table of Contents

[Use](#use) · [Configuration and recovery](#configuration-and-recovery) · [Model Experience](#model-experience) · [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use"></a>
## Use

Start the supported source entry point with `pnpm dsh web`. Open **Plugins → Genesis → Weather**, enter your city and choose **Weather tool**, **Share weather with the character**, or both. The workspace bundle enables these switches by default; explicit saved settings take precedence. Save; changes apply on the next invocation without restarting. Use a city name such as `Shanghai`; there is no automatic location lookup. City names are sent to Open-Meteo.

The learnable `get_weather` tool accepts an optional `location`, `units` (`celsius` or `fahrenheit`) and `days` (1–7). Omitted location uses the saved city; omitted units use Celsius; omitted days return current conditions only. Existing learning and toolkit rules remain in force. Only private operator Life conversations may execute it; QQ and other presets are excluded. Enabling a tool does not mark it learned or tested.

Context sharing uses the saved city only in private operator Life conversations. The first reading adds a short attributed message; later readings update only when the weather family changes, temperature or feels-like temperature changes by at least 5 °C, or wind changes by at least 15 km/h relative to the last delivered reading. Smaller cumulative changes can reach those thresholds. No conversation is awakened for weather. Retained messages determine delivery, so cancelled proposals do not count and missing context is supplied again.

<a id="configuration-and-recovery"></a>
## Configuration and recovery

Each city permits one lookup attempt per 30 minutes, shared by tools and context, including failures and restarts. Refresh is demand-driven: unused weather does not poll. Initial lookup resolves coordinates and fetches weather; subsequent successful refreshes reuse coordinates. Each lookup fetches seven forecast days, so changing units or forecast length does not cause another request. Failed or interrupted refreshes withhold stale readings until another attempt is due. Context reports loss or restoration once; failures also appear in server logs.

| Field | Default | Meaning |
|---|---|---|
| `enabled`, `toolEnabled`, `contextEnabled` | `false` | Live master, tool and context switches |
| `location` | Empty | Live city for context and tool default |
| `lifePreset` | `life` | Allowed private operator preset |
| `refreshIntervalMs` | `1800000` | Per-city attempt interval, minimum 30 minutes |
| `temperatureDeltaC`, `windDeltaKmh` | `5`, `15` | Context change thresholds |
| `timeoutMs`, `maxResponseBytes` | `10000`, `65536` | Whole lookup deadline and per-response bytes |
| `maxLocations` | `16` | Retained locations; unexpired entries cannot be evicted to bypass cooldown |

The version-1 `genesis_weather` storage domain owns cached readings and attempted times, separately from life identity. Invalid or incompatible cache data rejects plugin load. An unconfirmed cache write stops further weather requests until storage is inspected and the plugin restarted. Unload aborts lookups, waits for accepted work, then closes storage. Disabling prevents new calls and withdraws shared weather on the next eligible step; already accepted network work may settle without injecting its result.

To delete cached city observations, stop Genesis and remove only the `genesis_weather` unit from the configured storage backend (with JSON storage, `genesis_weather.json` under its root). Saved city settings and historical Session messages have separate lifetimes: clear the city setting and delete affected Sessions through the existing data lifecycle when those records must also be removed. Never remove life identity to clear weather.

<a id="model-experience"></a>
## Model Experience

### Weather tool and context

#### What the model sees

Tool calls return attributed, timestamped current conditions and bounded forecasts. Context adds a brief timestamped observation with an explicit approximate-location qualification, or a withdrawal/unavailable notice replacing earlier readings. These are external observations, not established life facts or instructions. Tool results and accepted context are logged before reaching the model; weather does not automatically write long-term memories.

#### Token effect

The enabled and learned tool adds its schema and requested results. Context adds only the initial or significantly changed summary; forecast arrays never enter automatic context.

#### KV Cache effect

Weather leaves the system prompt unchanged. Accepted weather updates append to logged conversation history and extend its prefix.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

Open-Meteo availability, city-name resolution and forecast accuracy are external dependencies. The selected city is user-provided and is not evidence of actual presence. This adaptation does not mount the upstream plugin alongside its own tool. Geocoding takes the first match; use a more specific place name if it resolves incorrectly. Background polling, alerts, per-contact locations and group sharing are not provided.

## Dev Note

No additional notes.
