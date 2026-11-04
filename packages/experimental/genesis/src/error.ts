/** Genesis failures retain machine-readable handling codes and contained causes. @module */
import type { LifeGoalId } from './agency-state.ts'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
/** Failure that prevents trusted Genesis operations until corrected or reloaded. */
export class GenesisError extends Error {
  /**
   * @param code - Stable failure category.
   * @param message - Affected operation and safe recovery action.
   * @param options - Contained implementation failure, never model-visible.
   */
  constructor(
    readonly code: 'configuration-conflict' | 'closed' | 'storage' | 'invalid-source' | 'capacity' | 'locked' | 'invalid-state' | 'memory-provider',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'GenesisError'
  }
}

/** Safe auxiliary failure text with structured provider facts for retry classification. */
export class AuxiliaryRequestError extends GenesisError {
  /**
   * @param message - Nonsecret diagnostic owned by Genesis.
   * @param failure - Provider-neutral code and optional HTTP status; response bodies are excluded.
   * @param options - Host-only contained transport error.
   */
  constructor(message: string, readonly failure: Pick<LlmFailure, 'code' | 'status'>, options?: ErrorOptions) {
    super('memory-provider', message, options)
  }
}

/** Rejected execution links; the proposal's goal changes remain uncommitted. */
export class InactiveLifeGoalsError extends GenesisError {
  /**
   * @param goalIds - Selected goals that are inactive after applying the rejected proposal.
   */
  constructor(readonly goalIds: LifeGoalId[]) {
    super('invalid-source', 'Paused or terminal life goals cannot execute.')
    this.name = 'InactiveLifeGoalsError'
  }
}
