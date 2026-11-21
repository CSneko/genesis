/** Electric shock controls and status shared with the Genesis composer. @module */

/** Voltage choices displayed in the composer, in volts. */
export type ShockVoltage = 10 | 30 | 60 | 100 | 150 | 200 | 300 | 500

/** Zero selects one pulse. Positive choices are continuous durations in seconds. */
export type ShockDuration = 0 | 5 | 15 | 30

/** Current effect for the requested Life Session. */
export type ShockStatus =
  | { kind: 'unavailable' }
  | { kind: 'idle' }
  | { kind: 'queued' | 'delivered'; voltage: ShockVoltage }
  | { kind: 'continuous'; voltage: ShockVoltage; remainingSeconds: number }
