/** Authenticated operator controls for sleep and private cognition. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type { Config } from './config.ts'
import type { SleepSettings, SleepStatus } from './sleep-model.ts'
import type { SpontaneitySettings, SpontaneityStatus } from './spontaneity-state.ts'
import { statusFailure } from './status-error.ts'
import { GenesisError } from './error.ts'

/** Complete bounded operator sample; null explicitly means unavailable in this profile. */
export interface RhythmStatus { lifePreset: string | null; sleep: SleepStatus | null; spontaneity: SpontaneityStatus | null }
declare module '@deepseek-ai/cordis' { interface Context { genesisRhythm: GenesisRhythmGateway } }
/** Transport exposes owner operations without impersonating a Life tool call. */
export class GenesisRhythmGateway extends TypertRemoteService {
  static inject = ['genesis']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /**
   *
   * @param ctx - Existing authenticated Remote services.
   *
   * @param config - Validated response budgets.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'genesisRhythm')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, work: () => T | Promise<T>): Promise<T> {
    const owned = AbortSignal.any([signal, this.lifetime.signal]); owned.throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) throw statusFailure(new GenesisError('invalid-source', 'Sleep and cognition controls require operator access.'))
    const operation = Promise.resolve().then(() => { owned.throwIfAborted(); return work() }); this.operations.add(operation)
    try { return await operation } catch (error) { throw statusFailure(error) } finally { this.operations.delete(operation) }
  }
  /** Read policies, thoughts, actual sleep times and maintenance progress.
   *
   * @param signal - Caller cancellation.
   *
   * @returns Bounded independent feature samples.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<RhythmStatus> {
    return this.operation(signal, () => {
      const result = { lifePreset: this.config.awakening?.lifePreset ?? null, sleep: this.ctx.get('genesisSleep')?.inspect() ?? null,
        spontaneity: this.ctx.get('genesisSpontaneity')?.inspect() ?? null }
      const fits = () => JSON.stringify(result).length <= this.config.resultChars
      while (!fits() && result.spontaneity !== null && result.spontaneity.items.length) { result.spontaneity.items.shift(); result.spontaneity.itemsOmitted++ }
      while (!fits() && result.spontaneity !== null && result.spontaneity.runs.length) { result.spontaneity.runs.shift(); result.spontaneity.runsOmitted++ }
      while (!fits() && result.sleep !== null && result.sleep.cycles.length) { result.sleep.cycles.shift(); result.sleep.cyclesOmitted++ }
      if (!fits()) throw new GenesisError('capacity', 'Sleep and cognition status exceeds resultChars. Increase its response budget.')
      return result
    })
  }
  /** Save the complete sleep schedule.
   *
   * @param settings - Validated owner draft.
   *
   * @param revision - Displayed revision.
   *
   * @param signal - Cancellation before admission.
   *
   * @returns Committed settings revision.
   */
  @Remote('saveSleep')
  saveSleep(settings: SleepSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => {
      const owner = this.ctx.get('genesisSleep')
      if (owner === undefined) throw new GenesisError('invalid-state', 'Sleep is unavailable in this profile.')
      return owner.save(settings, revision)
    })
  }
  /** Apply an explicit wake control without a model decision.
   *
   * @param kind - Temporary wake or wake until the next scheduled interval.
   *
   * @param signal - Cancellation before admission.
   *
   * @returns After durable wake state commits.
   */
  @Remote('wake')
  wake(kind: 'temporary' | 'keep-awake', signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => {
      const owner = this.ctx.get('genesisSleep')
      if (owner === undefined) throw new GenesisError('invalid-state', 'Sleep is unavailable in this profile.')
      return owner.wake(kind)
    })
  }
  /** Save private cognition controls.
   *
   * @param settings - Complete owner draft.
   *
   * @param revision - Displayed settings revision.
   *
   * @param signal - Cancellation before admission.
   *
   * @returns Committed revision.
   */
  @Remote('saveSpontaneity')
  saveSpontaneity(settings: SpontaneitySettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => {
      const owner = this.ctx.get('genesisSpontaneity')
      if (owner === undefined) throw new GenesisError('invalid-state', 'Spontaneity is unavailable in this profile.')
      return owner.configure(settings, revision)
    })
  }
  /** Stop an active private exploration without deleting confirmed progress.
   *
   * @param signal - Caller cancellation.
   *
   * @returns After the stop request is admitted; the receipt reports final settlement.
   */
  @Remote('stop')
  stop(signal: AbortSignal): Promise<void> { return this.operation(signal, () => {
    const owner = this.ctx.get('genesisSpontaneity'); if (owner === undefined) throw new GenesisError('invalid-state', 'Spontaneity is unavailable in this profile.'); owner.stop()
  }) }
  /** Retry a failed sleeping-memory batch from its retained cursor.
   *
   * @param id - Displayed cycle identity.
   *
   * @param signal - Cancellation before admission.
   *
   * @returns After retry admission.
   */
  @Remote('retry')
  retry(id: string, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => {
      const owner = this.ctx.get('genesisSleep')
      if (owner === undefined) throw new GenesisError('invalid-state', 'Sleep is unavailable in this profile.')
      return owner.retry(id)
    })
  }
}
