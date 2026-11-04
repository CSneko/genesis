/** Bounded retries for auxiliary inference; life-state commits remain outside this operation. @module */
import { setTimeout } from 'node:timers/promises'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { AuxiliaryRequestError } from './error.ts'

/**
 * Repeat transient inference failures and malformed JSON under one cancellation deadline.
 * @param operation - One inference attempt; it must not commit life state.
 * @param maxRetries - Additional attempts after the first failure.
 * @param delayMs - Cancelable pause between attempts.
 * @param signal - Original operation cancellation and deadline; never reset by a retry.
 * @param onRetry - Synchronous audit notification without provider response bodies.
 * @returns The first successful result; exhaustion preserves the final failure.
 */
export async function retryRequest<T>(operation: () => Promise<T>, maxRetries: number, delayMs: number,
  signal: AbortSignal, onRetry: (retry: number) => void): Promise<T> {
  for (let retry = 0; ; retry++) {
    signal.throwIfAborted()
    try { return await operation() }
    catch (error) {
      signal.throwIfAborted()
      const failure = error instanceof LlmError || error instanceof AuxiliaryRequestError ? error.failure : undefined
      const transient = failure !== undefined
        && !['AUTH', 'QUOTA', 'ACCOUNT_QUOTA', 'MISSING_CREDENTIAL', 'INVALID_CREDENTIAL'].includes(failure.code)
        && (['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'].includes(failure.code)
          || failure.status === 408 || failure.status === 429 || (failure.status !== undefined && failure.status >= 500))
      if (retry >= maxRetries || !(transient || error instanceof SyntaxError)) throw error
      onRetry(retry + 1)
      await setTimeout(delayMs, undefined, { signal })
    }
  }
}

/**
 * Send one model HTTP request, classifying transport failures without retaining sensitive diagnostics.
 * @param url - Validated model endpoint.
 * @param options - Captured request and owner cancellation.
 * @returns The owned response; the caller must consume or cancel its body.
 */
export async function modelFetch(url: string, options: RequestInit): Promise<Response> {
  try { return await fetch(url, options) }
  catch (error) {
    options.signal?.throwIfAborted()
    if (!(error instanceof TypeError)) throw error
    throw new AuxiliaryRequestError('Auxiliary model connection failed. Check service connectivity.', { code: 'TRANSPORT' }, { cause: error })
  }
}
