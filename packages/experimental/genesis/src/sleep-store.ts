/** Single-writer sleep transactions; uncertain writes never grant wakefulness. @module */
import { randomBytes } from 'node:crypto'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type { LifeId } from './model.ts'
import type { SleepConfig } from './config.ts'
import { sleepDomain, sleepStateSchema, sleepSettingsSchema, type SleepState } from './sleep-model.ts'
import { GenesisError } from './error.ts'

/** Own the durable state and drain accepted commits before domain disposal. */
export class SleepStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  private initial: SleepState
  /**
   * @param domain - Life-lease-protected domain.
   * @param lifeId - Existing life.
   * @param config - Initial settings and retention.
   *
   * @param now - First initialization instant. */
  constructor(private readonly domain: Domain<typeof sleepDomain>, lifeId: LifeId, private readonly config: SleepConfig, now: number) {
    this.initial = { schemaVersion: 1, lifeId, transitionSeq: 0, seed: randomBytes(32).toString('hex'), revision: 0,
      settings: sleepSettingsSchema.parse({ enabled: config.enabled, jitterMs: config.jitterMs, temporaryIdleMs: config.temporaryIdleMs,
        holidayExempt: config.holidayExempt, greetings: config.greetings, schedule: config.schedule, exemptDates: config.exemptDates }), mode: 'awake', windowId: null, temporaryUntil: null, awakeSince: now,
      windows: [], cycles: [], receipts: [] }
  }
  /** Restore matching state; absent initialized storage is never recreated.
   *
   * @param marked - Whether life history already owns this domain.
   * @returns After durable initialization/recovery. */
  async start(marked: boolean): Promise<void> {
    const existing = this.domain.table('state').get('current')
    if (existing === undefined && marked) throw new GenesisError('invalid-state', 'Sleep storage is missing. Restore matching life and sleep stores.')
    if (existing !== undefined && existing.lifeId !== this.initial.lifeId) throw new GenesisError('configuration-conflict', 'Sleep state belongs to another life.')
    await this.change(state => {
      for (const cycle of state.cycles) if (cycle.stage === 'running') {
        cycle.stage = 'failed'; cycle.failure = 'Interrupted memory review has an unknown model-call outcome. Inspect its Session before retrying.'
      }
    })
  }
  private committed(): SleepState {
    if (this.failure !== undefined) throw this.failure
    return structuredClone(this.domain.table('state').get('current') ?? this.initial)
  }
  /** Read detached confirmed state.
   * @returns Current state; closing and uncertain storage reject. */
  read(): SleepState {
    if (this.closing !== undefined) throw new GenesisError('closed', 'Sleep state is closing.')
    return this.committed()
  }
  /** Commit a bounded mutation.
   * @param edit - Latest-state transaction.
   * @returns Detached transaction result after durability. */
  change<T>(edit: (state: SleepState) => T): Promise<T> {
    this.read()
    const operation = this.tail.then(async () => {
      const state = this.committed()
      const result = edit(state)
      if (state.cycles.length + state.receipts.length > this.config.maxRecords || JSON.stringify(state).length > this.config.maxStateChars) {
        throw new GenesisError('capacity', 'Sleep history reached its storage budget. Increase sleep retention limits before retrying.')
      }
      const next = sleepStateSchema.parse(state)
      try { await this.domain.table('state').put('current', next) }
      catch (error) { this.failure = new GenesisError('storage', 'Sleep write outcome is uncertain. Automatic activity is stopped; reload verified storage.', { cause: error }); throw this.failure }
      return result
    })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* Caller reports failure; disposal drains accepted writes. */ })
    return operation
  }
  /** Drain writes before closing storage.
   * @returns After domain disposal. */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
