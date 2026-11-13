/** Return an expected value or fail with its owning error. @module */

/**
 * Read a value whose absence makes the current operation invalid.
 * @param value - Optional value at a checked wire or lifecycle point.
 * @param error - Owning structured failure for an absent value.
 * @returns The present value.
 */
export function required<T>(value: T | null | undefined, error: Error): T {
  if (value === null || value === undefined) throw error
  return value
}
