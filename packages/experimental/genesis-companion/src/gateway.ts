/** Operator-only controls for the internal partner connection and conversations. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService, RemoteError, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { CompanionController } from './controller.ts'
import type { CompanionSettings } from './state.ts'
import type { CompanionStatus } from './types.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisCompanion: CompanionGateway } }
declare module '@deepseek-ai/dsh-typert-protocol' { interface RemoteErrorDetailsMap { 'genesis-companion/operation': { reason: string } } }
/** Internal peers cannot invoke operator controls or grant tool permissions. */
export class CompanionGateway extends TypertRemoteService {
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /**
   * @param ctx - Authenticated Remote registration owner.
   * @param controller - Exclusive partner state and connection owner.
   */
  constructor(ctx: Context, private readonly controller: CompanionController) {
    super(ctx, 'genesisCompanion')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, work: () => T | Promise<T>): Promise<T> {
    const owned = AbortSignal.any([signal, this.lifetime.signal]); owned.throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('genesis-companion/operation', 'Companion controls require operator access.', { reason: 'operator-required' })
    const pending = Promise.resolve().then(() => { owned.throwIfAborted(); return work() }); this.operations.add(pending)
    try { return await pending }
    catch (error) { throw new RemoteError('genesis-companion/operation', 'Companion operation failed. Refresh settings and inspect its connection and sleep states.',
      { reason: error instanceof GenesisError ? error.code : 'operation' }, { cause: error }) }
    finally { this.operations.delete(pending) }
  }
  /** Read settings, relationship and recent internal messages.
   * @param signal - Caller cancellation.
   * @returns Bounded nonsecret sample; inspection never starts a model.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<CompanionStatus> { return this.operation(signal, () => this.controller.status()) }
  /** Save settings and apply the connection without starting a conversation.
   * @param settings - Complete operator draft.
   * @param revision - Displayed settings revision.
   * @param signal - Cancellation before command admission.
   * @returns Committed revision; inspect reports connection failure separately.
   */
  @Remote('save')
  save(settings: CompanionSettings, revision: number, signal: AbortSignal): Promise<number> { return this.operation(signal, () => this.controller.save(settings, revision)) }
  /** Save/remove the credential without returning its value.
   * @param token - Shared secret, or undefined for removal.
   * @param signal - Cancellation before command admission.
   * @returns After credential mutation and connection attempt.
   */
  @Remote('setToken')
  setToken(token: string | undefined, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.controller.setToken(token)) }
  /** Start one bounded internal exchange.
   * @param topic - Explicitly shared conversation topic.
   * @param signal - Cancellation before command admission.
   * @returns After admission; status reports subsequent progress.
   */
  @Remote('begin')
  begin(topic: string, signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.controller.begin(topic)) }
  /** Continue one internal conversation with one more bounded exchange.
   * @param sessionId - Conversation to continue; absent keeps the current binding.
   * @param signal - Cancellation before command admission.
   * @returns After admission; status reports subsequent progress.
   */
  @Remote('continueExchange')
  continueExchange(sessionId: string | undefined, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => this.controller.continueConversation(sessionId === undefined ? undefined : SessionId(sessionId)))
  }
  /** Wake one side without starting any conversation.
   * @param target - Genesis or the partner gateway schedule.
   * @param signal - Cancellation before command admission.
   * @returns After the wake override commits.
   */
  @Remote('wake')
  wake(target: 'genesis' | 'partner', signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.controller.wake(target)) }
  /** Stop current model work while preserving confirmed history.
   * @param signal - Caller cancellation before stopping.
   * @returns After model and Agent cleanup.
   */
  @Remote('stop')
  stop(signal: AbortSignal): Promise<void> { return this.operation(signal, () => this.controller.stop()) }
}
