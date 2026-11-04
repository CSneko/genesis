/** Read-only task monitoring over the authenticated existing Remote transport. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ManagedTaskCatalog } from './status-types.ts'
import { statusFailure } from './status-error.ts'

declare module '@deepseek-ai/cordis' { interface Context { genesisTasks: GenesisTaskGateway } }

/** Operator inspection shares the live task owner's reads and never impersonates a Life Agent. */
export class GenesisTaskGateway extends TypertRemoteService {
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()

  /** @param ctx - Existing authenticated transport owner. @param options - Bounded reads from the active task owner. */
  constructor(ctx: Context, private readonly options: {
    catalog: (offset: number, signal: AbortSignal) => Promise<ManagedTaskCatalog>
  }) {
    super(ctx, 'genesisTasks')
    ctx.effect(() => async () => { this.lifetime.abort(); await Promise.allSettled(this.operations) })
  }

  /**
   * Read managed tasks only in currently accessible, unarchived workspaces.
   * @param offset - Page position; the task owner's configured limits bound results.
   * @param signal - Caller cancellation, combined with the service lifetime.
   * @returns Actual sampled execution and delivery states without loading or dispatching Agents.
   */
  @Remote('catalog')
  async catalog(offset: number, signal: AbortSignal): Promise<ManagedTaskCatalog> {
    const owned = AbortSignal.any([signal, this.lifetime.signal])
    owned.throwIfAborted()
    const operation = this.options.catalog(offset, owned)
    this.operations.add(operation)
    try { return await operation } catch (error) { throw statusFailure(error) } finally { this.operations.delete(operation) }
  }
}
