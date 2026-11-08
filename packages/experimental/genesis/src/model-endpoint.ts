/** Bounded TypeSafe System One and OpenAI Chat Completions auxiliary transports. @module */
import type { Context } from '@deepseek-ai/cordis'
import { assertUsableApiKey } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import type { MemoryModelsSettings, EndpointRoute } from './status-types.ts'
import { LOCAL_DECISION_KEY } from './local-decision.ts'
import { AuxiliaryRequestError, GenesisError } from './error.ts'

/** Validated update decision; endpoint probabilities remain distinct from emotion intensity. */
export const reviewDecisionSchema = z.strictObject({ update: z.boolean(),
  decision: z.strictObject({ probability: z.number().min(0).max(1), threshold: z.number().min(0).max(1) }).optional() })

/**
 * Resolve a stored key per request, falling back to its named environment variable.
 * @param ctx - Optional credential owner.
 * @param route - Nonsecret endpoint and credential reference.
 * @returns HTTP headers; no key is copied into model requests or settings.
 */
export async function modelHeaders(ctx: Context, route: EndpointRoute): Promise<Record<string, string>> {
  const url = new URL(route.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !route.model.trim()) {
    throw new GenesisError('memory-provider', 'Configure an HTTP(S) model endpoint and model name without URL credentials or query parameters.')
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (route.keyRef === LOCAL_DECISION_KEY) {
    const local = ctx.get('genesisLocalDecision')
    if (local === undefined) throw new GenesisError('memory-provider', 'The managed local decision runtime is not loaded.')
    return { ...headers, ...local.headers(route.url) }
  }
  if (route.keyRef !== undefined) {
    const credentials = ctx.get('credentials')
    const stored = await credentials?.resolve(credentialRef(route.keyRef))
    const key = assertUsableApiKey(stored?.value ?? process.env[route.keyRef] ?? '', route.kind, route.keyRef)
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

/**
 * Decode only bounded successful JSON; remote error bodies may contain private provider data.
 * @param response - Owned HTTP response.
 * @param limit - Maximum complete decoded characters and UTF-8 byte budget / 4.
 * @param setting - Deployment setting that owns this response limit, included in capacity diagnostics.
 * @returns Parsed, untrusted JSON for protocol-specific validation.
 */
export async function modelJson(response: Response, limit: number, setting: 'memory.outputChars' | 'modelCatalogChars' | 'minecraft.responseChars' | 'localDecision.outputChars'): Promise<unknown> {
  if (!response.ok || response.body === null) {
    await response.body?.cancel()
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new AuxiliaryRequestError(`Memory endpoint failed (HTTP ${response.status}). Check service availability.`,
        { code: response.status === 429 ? 'RATE_LIMIT' : response.status === 408 ? 'TIMEOUT' : 'SERVER', status: response.status })
    }
    throw new GenesisError('memory-provider', `Memory endpoint failed (HTTP ${response.status}). Check its address, model and credential.`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > limit * 4) throw new GenesisError('capacity', `Endpoint response exceeds ${setting} (${limit} characters or ${limit * 4} UTF-8 bytes). Increase this response budget if the endpoint is trusted.`)
      text += decoder.decode(chunk.value, { stream: true })
      if (text.length > limit) throw new GenesisError('capacity', `Endpoint response exceeds ${setting} (${limit} characters or ${limit * 4} UTF-8 bytes). Increase this response budget if the endpoint is trusted.`)
    }
    text += decoder.decode()
    if (text.length > limit) throw new GenesisError('capacity', `Endpoint response exceeds ${setting} (${limit} characters or ${limit * 4} UTF-8 bytes). Increase this response budget if the endpoint is trusted.`)
    return JSON.parse(text)
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    throw new AuxiliaryRequestError('Memory endpoint response was interrupted. Check service connectivity.', { code: 'TRANSPORT' }, { cause: error })
  } finally { await reader.cancel() }
}

/**
 * Build the exact nonsecret request recorded before inference.
 * @param route - Captured endpoint route.
 * @param system - Stable role-specific instructions.
 * @param input - Bounded conversation and candidate evidence.
 * @param maxTokens - Writer output token budget.
 * @param question - Named binary question used by the decision consumer.
 * @param criteria - Explicit yes/no descriptions for a System One question.
 * @returns TypeSafe state/questions or a nonstreaming Chat Completions request.
 */
export function endpointRequest(route: Exclude<MemoryModelsSettings['decision'] | MemoryModelsSettings['writer'], { kind: 'provider' }>,
  system: string, input: unknown, maxTokens: number, question = 'remember', criteria?: { true: string; false: string }): object {
  return route.kind === 'jev'
    ? { model: route.model, state: input, questions: { [question]: { type: 'noul', instructions: system,
      ...(criteria === undefined ? {} : { criteria }) } } }
    : { model: route.model, stream: false, max_tokens: maxTokens, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] }
}

/**
 * Validate the protocol response before it can affect life state.
 * @param route - Protocol and Jev decision threshold.
 * @param raw - Untrusted HTTP JSON.
 * @param question - Named binary answer expected by the decision consumer.
 * @returns Update decision or decoded writer JSON; malformed output applies no changes.
 */
export function endpointResult(route: Exclude<MemoryModelsSettings['decision'] | MemoryModelsSettings['writer'], { kind: 'provider' }>, raw: unknown, question = 'remember'): unknown {
  if (route.kind === 'jev') {
    const result = z.object({ answers: z.object({ [question]: z.object({ type: z.literal('noul'), noul: z.number().min(0).max(1) }) }) }).parse(raw)
    const probability = result.answers[question]!.noul
    return { update: probability >= route.threshold, decision: { probability, threshold: route.threshold } }
  }
  const result = z.object({ choices: z.tuple([z.object({ finish_reason: z.literal('stop'),
    message: z.object({ content: z.string() }) })]) }).parse(raw)
  return JSON.parse(result.choices[0].message.content)
}

/**
 * Resolve the catalog for a saved inference endpoint without changing its inference protocol.
 * @param route - System One or Chat Completions route.
 * @returns Catalog URL; OpenRouter System One includes decision models through its documented modality filter.
 */
export function modelCatalogUrl(route: EndpointRoute): URL {
  const url = new URL(route.url)
  url.pathname = url.pathname.replace(/\/(systemone|chat\/completions)\/?$/u, '/models')
  if (url.href === route.url) throw new GenesisError('memory-provider', 'Use the full /systemone or /chat/completions endpoint.')
  if (url.origin === 'https://openrouter.ai' && url.pathname === '/api/v1/models' && route.kind === 'jev') {
    url.searchParams.set('output_modalities', 'decisions')
  }
  return url
}

/**
 * Read model identifiers from TypeSafe or OpenAI-compatible catalogs, independently of the inference protocol.
 * @param raw - Bounded, untrusted JSON response.
 * @returns Validated model identifiers; a missing catalog field is refused.
 */
export function catalogModels(raw: unknown): string[] {
  const catalog = z.object({
    models: z.array(z.object({ name: z.string() })).optional(),
    data: z.array(z.object({ id: z.string() })).optional(),
  }).refine(value => value.models !== undefined || value.data !== undefined, 'Expected models or data in the model catalog.').parse(raw)
  return [...(catalog.models ?? []).map(item => item.name), ...(catalog.data ?? []).map(item => item.id)]
}
