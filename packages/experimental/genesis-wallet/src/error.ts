/** Stable wallet refusals for model results and localized operator feedback. @module */
/** Expected refusal; confirmed wallet data remains unchanged. */
export class WalletError extends Error {
  /**
   * @param code - Stable refusal reason; provider error bodies and credentials are excluded.
   */
  constructor(
    readonly code: 'stale' | 'insufficient' | 'unavailable' | 'invalid' | 'denied' | 'source' | 'source-key' | 'source-rate' | 'source-url',
  ) {
    super(
      code === 'denied'
        ? 'Wallet operation refused: denied. Use a Life conversation; on QQ, the current authenticated speaker must be the bound operator and wallet tool access must be allowed.'
        : `Wallet operation refused: ${code}.`,
    )
  }
}
