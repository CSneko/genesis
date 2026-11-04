/** Authenticated operator settings and lifecycle controls for temporary memories. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import type { TemporaryMemoryEngine } from './temporary.ts'
import type { TemporaryMemoryId, TemporarySettings, TemporaryStatus } from './temporary-model.ts'
import { statusFailure } from './status-error.ts'
import { GenesisError } from './error.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisTemporary: GenesisTemporaryGateway } }
/** Operator controls never send a conversation message or change long-term memories. */
export class GenesisTemporaryGateway extends TypertRemoteService {
  static inject = ['genesis']
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /**
   * @param ctx - Authenticated Remote owner.
   * @param options - Life-owned temporary worker.
   */
  constructor(ctx: Context, private readonly options: { engine: TemporaryMemoryEngine }) {
    super(ctx, 'genesisTemporary')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) throw statusFailure(new GenesisError('invalid-source', 'Temporary-memory settings require operator access.'))
    const task = Promise.resolve().then(run); this.operations.add(task)
    try { return await task } catch (error) { throw statusFailure(error) } finally { this.operations.delete(task) }
  }
  /**
   * Read current settings, expiry times and pending failures.
   * @param signal - Caller cancellation.
   * @returns Bounded operator sample.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<TemporaryStatus> { return this.operation(signal, async () => this.options.engine.inspect()) }
  /**
   * Save independent summary model and quiet interval.
   * @param settings - Complete nonsecret draft.
   * @param revision - Displayed revision.
   * @param signal - Caller cancellation.
   * @returns Committed revision.
   */
  @Remote('save')
  save(settings: TemporarySettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => this.options.engine.save(settings, revision))
  }
  /**
   * Remove a current summary; next context admission carries its removal.
   * @param id - Summary identity.
   * @param signal - Caller cancellation.
   * @returns After removal commits.
   */
  @Remote('forget')
  forget(id: TemporaryMemoryId, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.options.engine.mutate(id, 'delete')) }
  /**
   * Explicitly retry a failed batch without resetting committed progress.
   * @param sessionId - Failed source conversation.
   * @param signal - Caller cancellation.
   * @returns After the admitted retry settles.
   */
  @Remote('retry')
  retry(sessionId: SessionId, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.options.engine.mutate(sessionId, 'retry')) }
  /**
   * Store or remove the fixed summary endpoint credential; it is never returned.
   * @param value - Secret or undefined to remove it.
   * @param signal - Caller cancellation.
   * @returns After the credential provider confirms the write.
   */
  @Remote('setKey')
  setKey(value: string | undefined, signal: AbortSignal): Promise<void> {
    return this.operation(signal, async () => {
      const credentials = this.ctx.get('credentials')
      if (credentials === undefined) throw new GenesisError('invalid-state', 'Configure a credential provider before saving a summary endpoint key.')
      const ref = credentialRef('GENESIS_TEMPORARY_API_KEY')
      if (value === undefined) await credentials.unset(ref)
      else { z.string().min(1).max(8192).regex(/^[^\s]+$/u).parse(value); await credentials.set(ref, value) }
    })
  }
}
