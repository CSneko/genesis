/** Authenticated operator wallet API; model callers cannot approve their own purchases. @module */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { WalletRuntime } from './runtime.ts'
import { WalletError } from './error.ts'
import type { Currency, ProductInput, Product, Order, OrderId, ProductId, WalletStatus, ProductSourceStatus } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    genesisWallet: WalletGateway
  }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'genesis-wallet/operation': { reason: string }
  }
}
/** Operator-only wallet management; every model-facing read uses the logged wallet tool. */
export class WalletGateway extends TypertRemoteService {
  /**
   * @param ctx - Authenticated Remote transport owner.
   * @param runtime - Exclusive wallet business owner.
   */
  constructor(
    ctx: Context,
    private readonly runtime: WalletRuntime,
  ) {
    super(ctx, 'genesisWallet')
  }
  private async operation<T>(signal: AbortSignal, work: () => T | Promise<T>): Promise<T> {
    signal.throwIfAborted()
    if (principalOf(this.ctx.invocation) !== undefined)
      throw new RemoteError('genesis-wallet/operation', 'Wallet controls require operator access.', { reason: 'denied' })
    try {
      return await work()
    } catch (error) {
      throw new RemoteError(
        'genesis-wallet/operation',
        'Wallet operation failed. Refresh the wallet and inspect the current state before retrying.',
        { reason: error instanceof WalletError ? error.code : error instanceof GenesisError ? error.code : 'invalid' },
        { cause: error },
      )
    }
  }
  /** Read one wallet page.
   * @param view - Selected list.
   * @param query - Literal search.
   * @param offset - Page offset.
   * @param signal - Cancellation before admission.
   * @returns Current balances and bounded matching records.
   */
  @Remote('inspect') inspect(
    view: 'summary' | 'products' | 'pending' | 'orders' | 'ledger',
    query: string,
    offset: number,
    signal: AbortSignal,
  ): Promise<WalletStatus> {
    return this.operation(signal, () => this.runtime.bounded(this.runtime.inspect(view, query, offset)))
  }
  /** Create or replace a product without changing retained orders.
   * @param input - Complete editable fields.
   * @param id - Existing product or null.
   * @param revision - Displayed wallet revision.
   * @param signal - Cancellation before admission; accepted writes drain.
   * @returns Committed product.
   */
  @Remote('saveProduct') saveProduct(input: ProductInput, id: ProductId | null, revision: number, signal: AbortSignal): Promise<Product> {
    return this.operation(signal, () => this.runtime.saveProduct(input, id, revision))
  }
  /** Remove a catalog entry while retaining order snapshots.
   * @param id - Exact product identity.
   * @param revision - Displayed revision.
   * @param signal - Cancellation before admission.
   * @returns After durable removal.
   */
  @Remote('removeProduct') removeProduct(id: ProductId, revision: number, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => this.runtime.removeProduct(id, revision))
  }
  /** Replace a balance without history, or record an annotated movement.
   * @param action - Set, deposit or withdraw.
   * @param currency - CNY or USD account.
   * @param amount - Integer minor units.
   * @param note - Required for movements, discarded for set.
   * @param revision - Displayed revision prevents repeated movements.
   * @param signal - Cancellation before admission.
   * @returns After durable confirmation.
   */
  @Remote('balance') balance(
    action: 'set' | 'deposit' | 'withdraw',
    currency: Currency,
    amount: number,
    note: string,
    revision: number,
    signal: AbortSignal,
  ): Promise<void> {
    return this.operation(signal, () => this.runtime.balance(action, currency, amount, note, revision))
  }
  /** Confirm, reject or refund an order without waking or notifying any conversation.
   * @param id - Exact order identity.
   * @param action - Selected settlement.
   * @param note - Optional explanation.
   * @param revision - Displayed wallet revision.
   * @param signal - Cancellation before admission.
   * @returns Current settled order; repeat confirmation cannot charge twice.
   */
  @Remote('settle') settle(
    id: OrderId,
    action: 'purchased' | 'rejected' | 'refunded',
    note: string,
    revision: number,
    signal: AbortSignal,
  ): Promise<Order> {
    return this.operation(signal, () => this.runtime.settle(id, action, note, revision))
  }
  /** Query the built-in catalog or the configured custom product adapter.
   * @param query - Search keyword or product URL.
   * @param signal - Cancellation including network work.
   * @returns Validated candidates requiring explicit catalog import.
   */
  @Remote('search') search(query: string, signal: AbortSignal): Promise<ProductInput[]> {
    return this.operation(signal, async () => this.runtime.bounded(await this.runtime.search(query, signal)))
  }
  /** Read source mode and key presence without returning the credential.
   * @param signal - Cancellation before admission.
   * @returns Current source settings and any uncertain key write.
   */
  @Remote('sourceStatus') sourceStatus(signal: AbortSignal): Promise<ProductSourceStatus> {
    return this.operation(signal, () => this.runtime.sourceStatus())
  }
  /** Store or remove the optional built-in-source key in the credential service.
   * @param value - Key or undefined to remove a managed credential.
   * @param signal - Cancellation before admission; admitted writes drain.
   * @returns After credential confirmation; errors never include the supplied key.
   */
  @Remote('setSourceKey') setSourceKey(value: string | undefined, signal: AbortSignal): Promise<void> {
    return this.operation(signal, () => this.runtime.setSourceKey(value))
  }
}
