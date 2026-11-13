/** Wallet business operations; operator settlement never injects messages or wakes an Agent. @module */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'
import { currencySchema, productInputSchema, WalletStore } from './model.ts'
import type { OrderId, ProductId, LedgerId } from './model.ts'
import type { Currency, ProductInput, Product, Order, WalletStatus } from './types.ts'
import type { Config } from './config.ts'
import { WalletError } from './error.ts'
import { ProductSource } from './product-source.ts'
import type { ProductSourceStatus } from './types.ts'

/** Life-wide wallet owner over one serial durable store. */
export class WalletRuntime {
  private readonly products: ProductSource
  private readonly lifetime = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  /**
   * @param ctx - Runtime services, including optional query credentials.
   * @param store - Exclusive durable wallet state.
   * @param config - Validated deployment bounds and endpoint.
   */
  constructor(
    ctx: Context,
    readonly store: WalletStore,
    readonly config: Config,
  ) {
    this.products = new ProductSource(ctx, config)
  }
  private checkRevision(actual: number, expected: number): void {
    if (actual !== expected) throw new WalletError('stale')
  }
  private active(): void {
    this.lifetime.signal.throwIfAborted()
  }
  /** Read one bounded page without changing state or notifying the character.
   * @param view - Product, pending-order, all-order or ledger list.
   * @param query - Literal title, description or note search.
   * @param offset - Zero-based continuation offset.
   * @returns Current balances, pending count and the selected list page.
   */
  inspect(view: 'summary' | 'products' | 'pending' | 'orders' | 'ledger', query: string, offset: number): WalletStatus {
    this.active()
    const parsed = z
      .strictObject({
        view: z.enum(['summary', 'products', 'pending', 'orders', 'ledger']),
        query: z.string().max(200),
        offset: z.number().int().nonnegative(),
      })
      .parse({ view, query, offset })
    const state = this.store.read(),
      match = parsed.query.toLowerCase()
    const products =
      view === 'products'
        ? state.products.filter(item => `${item.title}\n${item.description}`.toLowerCase().includes(match)).reverse()
        : []
    const orders =
      view === 'orders' || view === 'pending'
        ? state.orders
          .filter(
            item =>
              (view !== 'pending' || item.status === 'pending') &&
                `${item.product.title}\n${item.reason}\n${item.note}`.toLowerCase().includes(match),
          )
          .reverse()
        : []
    const ledger = view === 'ledger' ? state.ledger.filter(item => item.note.toLowerCase().includes(match)).reverse() : []
    const end = offset + this.config.pageSize
    return {
      revision: state.revision,
      balances: state.balances,
      pending: state.orders.filter(order => order.status === 'pending').length,
      products: products.slice(offset, end),
      orders: orders.slice(offset, end),
      ledger: ledger.slice(offset, end),
      nextOffset: Math.max(products.length, orders.length, ledger.length) > end ? end : null,
      pollMs: this.config.pollMs,
      productSource: true,
    }
  }
  /** Replace a product or create a new one without changing retained order snapshots.
   * @param input - Complete editable fields.
   * @param id - Existing product ID, or null for creation.
   * @param revision - Last displayed wallet revision.
   * @returns Committed product.
   */
  saveProduct(input: ProductInput, id: ProductId | null, revision: number): Promise<Product> {
    this.active()
    const draft = productInputSchema.parse(input)
    return this.store.change((state) => {
      this.checkRevision(state.revision, revision)
      const index = id === null ? -1 : state.products.findIndex(item => item.id === id)
      if (id !== null && index < 0) throw new WalletError('unavailable')
      const item = { ...draft, id: id ?? brandString<ProductId>(randomUUID()) }
      if (index < 0) state.products.push(item)
      else state.products[index] = item
      state.revision++
      return item
    })
  }
  /** Remove a catalog product while keeping existing purchase snapshots.
   * @param id - Product to remove.
   * @param revision - Displayed wallet revision.
   * @returns After durable removal.
   */
  removeProduct(id: ProductId, revision: number): Promise<void> {
    this.active()
    return this.store.change((state) => {
      this.checkRevision(state.revision, revision)
      state.products = state.products.filter(item => item.id !== id)
      state.revision++
    })
  }
  /** Set a balance without history, or record an annotated deposit/withdrawal.
   * @param action - Direct replacement or recorded movement.
   * @param currency - Independent account currency.
   * @param amount - Integer minor units; zero is allowed only for replacement.
   * @param note - Required for recorded movements; discarded for direct replacement.
   * @param revision - Last displayed wallet revision, preventing duplicate movement retries.
   * @returns After the balance and optional ledger receipt commit together.
   */
  balance(action: 'set' | 'deposit' | 'withdraw', currency: Currency, amount: number, note: string, revision: number): Promise<void> {
    this.active()
    const value = z
      .strictObject({
        action: z.enum(['set', 'deposit', 'withdraw']),
        currency: currencySchema,
        amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        note: z.string().max(2000),
      })
      .parse({ action, currency, amount, note })
    if (value.action !== 'set' && (value.amount === 0 || !value.note.trim())) throw new WalletError('invalid')
    return this.store.change((state) => {
      this.checkRevision(state.revision, revision)
      const result = action === 'set' ? amount : state.balances[currency] + (action === 'deposit' ? amount : -amount)
      if (result < 0) throw new WalletError('insufficient')
      if (!Number.isSafeInteger(result)) throw new WalletError('invalid')
      state.balances[currency] = result
      if (action !== 'set')
        state.ledger.push({
          id: brandString<LedgerId>(randomUUID()),
          kind: action,
          currency,
          amount,
          note: value.note.trim(),
          at: Date.now(),
          orderId: null,
        })
      state.revision++
    })
  }
  /** Reserve a purchase request once per actual logged tool call; no balance is reserved.
   * @param input - Selected product, expected quote, quantity and reason.
   * @param source - Durable Session/tool-call attribution.
   * @returns Existing replay receipt or newly committed pending order.
   */
  buy(
    input: { productId: ProductId; price: number; currency: Currency; quantity: number; reason: string },
    source: { sessionId: SessionId; callId: ToolCallId },
  ): Promise<Order> {
    this.active()
    const parsed = z
      .strictObject({
        productId: z
          .string()
          .min(1)
          .transform(brandString<ProductId>),
        price: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        currency: currencySchema,
        quantity: z.number().int().min(1).max(1000),
        reason: z.string().trim().min(1).max(2000),
      })
      .parse(input)
    const fingerprint = JSON.stringify(parsed)
    return this.store.change((state) => {
      const prior = state.orders.find(order => order.sessionId === source.sessionId && order.callId === source.callId)
      if (prior !== undefined) {
        if (prior.fingerprint !== fingerprint) throw new WalletError('invalid')
        return prior
      }
      const product = state.products.find(item => item.id === parsed.productId && item.available)
      if (product === undefined) throw new WalletError('unavailable')
      if (product.price !== parsed.price || product.currency !== parsed.currency) throw new WalletError('stale')
      const total = product.price * parsed.quantity
      if (!Number.isSafeInteger(total)) throw new WalletError('invalid')
      if (state.balances[product.currency] < total) throw new WalletError('insufficient')
      const order: Order = {
        id: brandString<OrderId>(randomUUID()),
        product,
        quantity: parsed.quantity,
        total,
        reason: parsed.reason,
        status: 'pending',
        note: '',
        createdAt: Date.now(),
        settledAt: null,
        ...source,
        fingerprint,
      }
      state.orders.push(order)
      state.revision++
      return order
    })
  }
  /** Settle a pending request or refund a purchase; repeated settlements never charge twice.
   * @param id - Durable purchase request identity.
   * @param action - Operator purchase, rejection or refund.
   * @param note - Optional operator explanation.
   * @param revision - Last displayed revision.
   * @returns Committed current order, with no Agent notification.
   */
  settle(id: OrderId, action: 'purchased' | 'rejected' | 'refunded', note: string, revision: number): Promise<Order> {
    this.active()
    z.enum(['purchased', 'rejected', 'refunded']).parse(action)
    z.string().max(2000).parse(note)
    return this.store.change((state) => {
      const order = state.orders.find(item => item.id === id)
      if (order === undefined) throw new WalletError('unavailable')
      if (order.status === action) return order
      this.checkRevision(state.revision, revision)
      if (action === 'refunded' ? order.status !== 'purchased' : order.status !== 'pending') throw new WalletError('invalid')
      const currency = order.product.currency
      if (action === 'purchased' && state.balances[currency] < order.total) throw new WalletError('insufficient')
      if (action !== 'rejected') {
        const amount = state.balances[currency] + (action === 'purchased' ? -order.total : order.total)
        if (!Number.isSafeInteger(amount)) throw new WalletError('invalid')
        state.balances[currency] = amount
        state.ledger.push({
          id: brandString<LedgerId>(randomUUID()),
          kind: action === 'purchased' ? 'purchase' : 'refund',
          currency,
          amount: order.total,
          note: note.trim() || order.product.title,
          at: Date.now(),
          orderId: order.id,
        })
      }
      order.status = action
      order.note = note
      order.settledAt = Date.now()
      state.revision++
      return order
    })
  }
  /** Withdraw a request from its originating conversation before operator settlement.
   * @param id - Pending order identity.
   * @param sessionId - Actual calling Session.
   * @returns Current cancelled order; no balance movement occurs.
   */
  cancel(id: OrderId, sessionId: SessionId): Promise<Order> {
    this.active()
    return this.store.change((state) => {
      const order = state.orders.find(item => item.id === id && item.sessionId === sessionId)
      if (order === undefined) throw new WalletError('unavailable')
      if (order.status === 'cancelled') return order
      if (order.status !== 'pending') throw new WalletError('invalid')
      order.status = 'cancelled'
      order.settledAt = Date.now()
      state.revision++
      return order
    })
  }
  /** Query the configured product-information adapter; no provider response creates a product automatically.
   * @param query - Keyword or product URL; URLs are data sent to the fixed endpoint.
   * @param signal - Caller cancellation combined with plugin disposal and timeout.
   * @returns Validated bounded product candidates with no credential or raw provider data.
   */
  search(query: string, signal: AbortSignal): Promise<ProductInput[]> {
    this.active()
    z.string().trim().min(1).max(2000).parse(query)
    const owned = AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(this.config.timeoutMs)])
    return this.own(this.products.query(query, owned))
  }
  /** Import a candidate fetched from the configured source; repeated imports reuse the catalog entry.
   * @param query - Keyword or product URL sent to the fixed adapter.
   * @param index - Candidate position in the current bounded response.
   * @param signal - Query cancellation before storage admission.
   * @returns Existing or newly committed source product; purchase still requires confirmation.
   */
  async importProduct(query: string, index: number, signal: AbortSignal): Promise<Product> {
    z.number()
      .int()
      .nonnegative()
      .max(this.config.pageSize - 1)
      .parse(index)
    const candidate = (await this.search(query, signal))[index]
    signal.throwIfAborted()
    if (candidate === undefined || !candidate.url) throw new WalletError('source')
    this.active()
    return this.store.change((state) => {
      const existing = state.products.find(
        item => item.source === 'taobao' && item.url === candidate.url && item.specification === candidate.specification,
      )
      if (existing !== undefined) return existing
      const product = { ...candidate, id: brandString<ProductId>(randomUUID()) }
      state.products.push(product)
      state.revision++
      return product
    })
  }
  /** Inspect source selection and key presence without exposing the key.
   * @returns Current source settings.
   */
  sourceStatus(): Promise<ProductSourceStatus> {
    this.active()
    return this.own(this.products.status())
  }
  /** Save or remove the optional built-in-source key independently of wallet records.
   * @param value - New key or undefined to remove a managed credential.
   * @returns After credential confirmation; uncertain writes block source queries until reload.
   */
  setSourceKey(value: string | undefined): Promise<void> {
    this.active()
    return this.own(this.products.setKey(value))
  }
  private own<T>(work: Promise<T>): Promise<T> {
    this.operations.add(work)
    void work
      .finally(() => {
        this.operations.delete(work)
      })
      .catch((_error: unknown) => {
        /* The operation caller owns failure reporting; teardown still drains it. */
      })
    return work
  }
  /** Enforce the complete emitted result budget.
   * @param value - Complete result, including wrappers.
   * @returns Original bounded value.
   */
  bounded<T>(value: T): T {
    if (JSON.stringify(value).length > this.config.resultChars)
      throw new GenesisError('capacity', 'Wallet result exceeds resultChars. Narrow the search or reduce pageSize.')
    return value
  }
  /** Abort queries and drain source operations before the plugin releases its dependencies.
   * @returns After runtime resources are closed.
   */
  async close(): Promise<void> {
    this.lifetime.abort()
    await Promise.allSettled(this.operations)
    await this.products.close()
  }
}
