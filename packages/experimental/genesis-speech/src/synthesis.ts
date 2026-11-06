/** Bounded CosyVoice HTTP synthesis; credentials never accompany audio downloads. @module */
import { z } from 'zod'

/** Handling-relevant synthesis failure. */
export class SpeechError extends Error {
  /** @param code - Stable failure category. @param message - Recovery instruction without secrets. */
  constructor(readonly code: 'configuration' | 'provider' | 'limit' | 'permission', message: string) { super(message); this.name = 'SpeechError' }
}

/** Captured operator route and finite request budgets. */
export interface SpeechRoute {
  endpoint: string
  model: string
  voice: string
  keyEnv: string
  maxTextChars: number
  maxAudioBytes: number
  timeoutMs: number
  /** Explicit multiplier for the synthesis request, from 0.5 through 2.0. */
  rate: number
  /** Present sends this expression instruction; absent leaves provider expression unchanged. */
  instruction?: string
}

/** Require an HTTPS API endpoint without embedded credentials. @param value - Operator endpoint. @returns Parsed endpoint URL. */
export function httpsUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password) throw new SpeechError('configuration', 'Speech API endpoint requires HTTPS without embedded credentials. Check the configured endpoint.')
  return url
}

/** Provider HTTP download links use HTTPS with their path and signed query preserved. */
function audioDownloadUrl(value: string): URL {
  let url: URL
  try { url = new URL(value) }
  catch (_error) { throw new SpeechError('provider', 'Speech provider returned an invalid audio download URL. Synthesis may already have been billed; check the provider before retrying.') }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new SpeechError('provider', 'Speech provider returned an unsupported audio download URL. Audio links must use HTTP(S) without embedded credentials; synthesis may already have been billed.')
  }
  if (url.protocol === 'http:') url.protocol = 'https:'
  return url
}

async function bytes(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) throw new SpeechError('provider', 'Speech service returned no content. Check the route before retrying.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) throw new SpeechError('limit', 'Speech response exceeds the configured byte limit. Shorten the text.')
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel(); reader.releaseLock() }
  if (size === 0) throw new SpeechError('provider', 'Speech service returned empty audio. Check the voice and model before retrying.')
  return Buffer.concat(chunks, size)
}

/**
 * Generate WAV bytes once, without automatic retries after uncertain provider outcomes.
 * @param route - Captured operator-selected endpoint, model, voice and budgets.
 * @param text - Complete input text, bounded before network access.
 * @param key - Per-invocation resolved secret; used only for the synthesis request.
 * @param signal - Caller cancellation, unload and deadline combined by the owner.
 * @returns Completed bounded WAV and the actual route identifiers.
 */
export async function synthesize(route: SpeechRoute, text: string, key: string, signal: AbortSignal) {
  if (!text.trim() || text.length > route.maxTextChars) throw new SpeechError('limit', 'Speech text is empty or exceeds maxTextChars. Shorten the text.')
  if (!Number.isFinite(route.rate) || route.rate < 0.5 || route.rate > 2) throw new SpeechError('configuration', 'Speech rate must be between 0.5 and 2.0.')
  if (route.instruction !== undefined && (!route.instruction.trim()
    || Array.from(route.instruction).reduce((total, char) => total + (/\p{Script=Han}/u.test(char) ? 2 : 1), 0) > 100)) {
    throw new SpeechError('configuration', 'Speech instruction must contain 1–100 weighted characters; Han characters count as two. Shorten the emotion or style instruction.')
  }
  const response = await fetch(httpsUrl(route.endpoint), { method: 'POST', redirect: 'error', signal,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: route.model, input: { text, voice: route.voice, format: 'wav', sample_rate: 24000, rate: route.rate,
      ...(route.instruction === undefined ? {} : { instruction: route.instruction }) } }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new SpeechError('provider', `Speech service returned HTTP ${response.status}. Check the API key, endpoint, quota and model/voice pairing before retrying; a request may have been billed.`)
  }
  const raw: unknown = JSON.parse(new TextDecoder().decode(await bytes(response, 65536)))
  const parsed = z.object({ output: z.object({ finish_reason: z.literal('stop'), audio: z.object({ url: z.string().max(8192) }) }) }).safeParse(raw)
  if (!parsed.success) throw new SpeechError('provider', 'Speech service did not return completed audio. Check the model/voice pairing; do not assume the request was unbilled.')
  const audio = await fetch(audioDownloadUrl(parsed.data.output.audio.url), { signal, redirect: 'error' })
  if (!audio.ok) { await audio.body?.cancel(); throw new SpeechError('provider', 'Generated audio could not be downloaded. The synthesis may already have been billed.') }
  const data = await bytes(audio, route.maxAudioBytes)
  if (Buffer.from(data.subarray(0, 4)).toString('ascii') !== 'RIFF' || Buffer.from(data.subarray(8, 12)).toString('ascii') !== 'WAVE') {
    throw new SpeechError('provider', 'Speech service returned invalid WAV audio. Check the endpoint before retrying.')
  }
  return { data, model: route.model, voice: route.voice }
}
