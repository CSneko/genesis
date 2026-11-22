/** Operator-only QQ policy and diagnostics through the existing authenticated Remote transport. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf, remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { z } from 'zod'
import type { QqController } from './controller.ts'
import type { QqPreferences } from './preferences.ts'
import type { ImRuntime } from './im-runtime.ts'
import type { ImChannel, ImConnection, QqDecisionSettings, QqConnection, QqSettings, QqStatus } from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' { interface RemoteErrorDetailsMap { 'genesis-qq/operation': { reason: string } } }

declare module '@deepseek-ai/cordis' { interface Context { genesisQqSettings: QqGateway } }
/** Only operator policy can change admission; inspecting receipts has no external send side effect. */
export class QqGateway extends TypertRemoteService {
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /**
   * @param ctx - Authenticated operator transport.
   * @param owners - Active channel and its independent durable policy.
   */
  constructor(ctx: Context, private readonly owners: { runtime: QqController; preferences: QqPreferences; im: ImRuntime }) {
    super(ctx, 'genesisQqSettings')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }
  private async operation<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
    AbortSignal.any([signal, this.lifetime.signal]).throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('genesis-qq/operation', 'IM settings require operator access.', { reason: 'operator-required' })
    const pending = Promise.resolve().then(run); this.operations.add(pending)
    try { return await pending } catch (error) {
      if (remoteErrorOf(error) !== undefined) throw error
      throw new RemoteError('genesis-qq/operation', 'IM settings operation failed. Refresh the page and inspect Host diagnostics if it persists.',
        { reason: error instanceof GenesisError ? error.code : error instanceof z.ZodError ? 'validation' : 'unavailable' })
    } finally { this.operations.delete(pending) }
  }
  /**
   * Read secret-free connection and delivery diagnostics.
   * @param signal - Caller cancellation.
   * @returns Current bounded sample.
   */
  @Remote('inspect')
  inspect(signal: AbortSignal): Promise<QqStatus> {
    return this.operation(signal, async () => this.owners.runtime.inspect(await this.owners.im.inspect()))
  }
  /**
   * Apply the authenticated operator's saved Telegram or Matrix configuration.
   * @param channel - Channel to configure.
   * @param connection - Nonsecret settings and allowlists.
   * @param revision - Last displayed connection revision.
   * @param signal - Caller cancellation before admission.
   * @returns Committed revision.
   */
  @Remote('saveImConnection')
  saveImConnection(channel: ImChannel, connection: ImConnection, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => this.owners.im.saveConnection(z.enum(['telegram', 'matrix']).parse(channel), connection, revision))
  }
  /**
   * Set or remove a text-channel credential through the credential provider.
   * @param channel - Channel to configure.
   * @param value - New token, or undefined to remove the managed token.
   * @param revision - Last displayed connection revision.
   * @param signal - Caller cancellation before admission.
   * @returns After storage and worker replacement settle; no token is returned.
   */
  @Remote('setImToken')
  setImToken(channel: ImChannel, value: string | undefined, revision: number, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => this.owners.im.setToken(z.enum(['telegram', 'matrix']).parse(channel), value, revision))
  }
  /**
   * Persist nonsecret connection choices and replace the old transport.
   * @param connection - Complete operator choices.
   * @param revision - Displayed connection revision.
   * @param signal - Cancellation before admission.
   * @returns Committed connection revision.
   */
  @Remote('saveConnection')
  saveConnection(connection: QqConnection, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => this.owners.runtime.saveConnection(connection, revision))
  }
  /**
   * Save or remove the OneBot token through credential storage; no token is returned.
   * @param value - Token or undefined for removal.
   * @param signal - Cancellation before admission.
   * @returns After credential persistence.
   */
  @Remote('setToken')
  setToken(value: string | undefined, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => this.owners.runtime.setToken(value))
  }
  /**
   * Save an independent QQ decision route.
   * @param settings - Nonsecret route.
   * @param revision - Revision fence.
   * @param signal - Cancellation.
   * @returns Committed revision.
   */
  @Remote('saveDecision')
  saveDecision(settings: QqDecisionSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => this.owners.runtime.saveDecision(settings, revision))
  }
  /**
   * Save/remove the QQ decision credential.
   * @param value - Secret or removal.
   * @param signal - Cancellation.
   * @returns After credential confirmation.
   */
  @Remote('setDecisionKey')
  setDecisionKey(value: string | undefined, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => this.owners.runtime.setDecisionKey(value))
  }
  /**
   * Save route policy independently of connection settings.
   * @param settings - Complete operator admission policy.
   * @param revision - Last displayed revision.
   * @param signal - Caller cancellation before admission; admitted writes drain on teardown.
   * @returns Committed revision; the next queued operation checks the new policy.
   */
  @Remote('save')
  save(settings: QqSettings, revision: number, signal: AbortSignal): Promise<number> {
    return this.operation(signal, () => {
      z.number().int().nonnegative().parse(revision)
      return this.owners.preferences.save(settings, revision)
    })
  }
}
