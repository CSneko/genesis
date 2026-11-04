/** Serialized atomic publication of temporary summaries, cursors and policy. @module */
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { temporaryStateSchema, temporaryDomain, type TemporaryState } from './temporary-model.ts'
import { GenesisError } from './error.ts'

/** One owner fences uncertain writes and never reconstructs a missing life identity. */
export class TemporaryStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closing: Promise<void> | undefined
  /**
   * @param domain - Exclusive temporary-memory storage.
   * @param initial - Explicit life-bound defaults for absent data.
   */
  constructor(private readonly domain: Domain<typeof temporaryDomain>, private readonly initial: TemporaryState) {
    const saved = temporaryStateSchema.parse(this.read())
    if (saved.lifeId !== initial.lifeId) throw new GenesisError('configuration-conflict', 'Temporary memories belong to another life. Restore matching life storage.')
  }
  /**
   * Read detached committed state.
   * @returns Current state; storage uncertainty is never hidden by defaults.
   */
  read(): TemporaryState {
    if (this.failure !== undefined) throw this.failure
    if (this.closing !== undefined) throw new GenesisError('closed', 'Temporary memory is closing.')
    return this.committed()
  }
  private committed(): TemporaryState {
    if (this.failure !== undefined) throw this.failure
    return structuredClone(this.domain.table('state').get('current') ?? this.initial)
  }
  /**
   * Publish one validated transaction; an unknown outcome stops subsequent work until reload.
   * @param change - Synchronous change applied to the latest committed state.
   * @returns After durable publication.
   */
  change(change: (state: TemporaryState) => void): Promise<void> {
    this.read()
    const operation = this.tail.then(async () => {
      const state = this.committed()
      change(state)
      const next = temporaryStateSchema.parse(state)
      try { await this.domain.table('state').put('current', next) }
      catch (error) {
        this.failure = new GenesisError('storage', 'Temporary-memory write outcome is uncertain. Reload verified storage before continuing.', { cause: error })
        throw this.failure
      }
    })
    this.tail = operation.then(() => {}, (_error: unknown) => { /* The caller owns reporting; disposal drains admitted writes. */ })
    return operation
  }
  /**
   * Drain accepted mutations before storage closes.
   * @returns After the domain closes.
   */
  close(): Promise<void> { this.closing ??= this.tail.then(() => this.domain.close()); return this.closing }
}
