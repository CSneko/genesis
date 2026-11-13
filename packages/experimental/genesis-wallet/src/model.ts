/** Version-one life-bound wallet records; every purchase settles in one durable state write. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'
import { GenesisError, type LifeId } from '@deepseek-ai/dsh-experimental-genesis'
import type { Config } from './config.ts'

/** Product identity independent of platform URLs. */
export type ProductId = Branded<'GenesisWalletProductId'>
/** Purchase request and settled order identity. */
export type OrderId = Branded<'GenesisWalletOrderId'>
/** Retained balance movement identity. */
export type LedgerId = Branded<'GenesisWalletLedgerId'>
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
/** Stored currency; no automatic exchange is performed. */
export const currencySchema = z.enum(['CNY', 'USD'])
/** Operator-editable product fields; amounts use minor currency units. */
export const productInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  price: money.positive(),
  currency: currencySchema,
  url: z.union([
    z.literal(''),
    z
      .url()
      .max(2000)
      .refine(value => ['https:', 'http:'].includes(new URL(value).protocol)),
  ]),
  specification: z.string().max(500),
  available: z.boolean(),
  source: z.enum(['custom', 'taobao']),
})
const productSchema = productInputSchema.extend({
  id: z
    .string()
    .min(1)
    .transform(brandString<ProductId>),
})
const orderSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .transform(brandString<OrderId>),
  product: productSchema,
  quantity: z.number().int().min(1).max(1000),
  total: money.positive(),
  reason: z.string().min(1).max(2000),
  status: z.enum(['pending', 'purchased', 'rejected', 'cancelled', 'refunded']),
  note: z.string().max(2000),
  createdAt: z.number().int(),
  settledAt: z.number().int().nullable(),
  sessionId: z.string().transform(SessionId),
  callId: z.string().transform(ToolCallId),
  fingerprint: z.string(),
})
const ledgerSchema = z.strictObject({
  id: z.string().transform(brandString<LedgerId>),
  kind: z.enum(['deposit', 'withdraw', 'purchase', 'refund']),
  currency: currencySchema,
  amount: money.positive(),
  note: z.string().min(1).max(2000),
  at: z.number().int(),
  orderId: z
    .string()
    .transform(brandString<OrderId>)
    .nullable(),
})
/** Durable wallet data; direct balance replacement stores no old value or edit receipt. */
export const stateSchema = z
  .strictObject({
    version: z.literal(1),
    lifeId: z
      .string()
      .min(1)
      .transform(brandString<LifeId>),
    revision: z.number().int().nonnegative(),
    balances: z.strictObject({ CNY: money, USD: money }),
    products: z.array(productSchema),
    orders: z.array(orderSchema),
    ledger: z.array(ledgerSchema),
  })
  .superRefine((state, ctx) => {
    for (const values of [state.products, state.orders, state.ledger])
      if (new Set(values.map(value => value.id)).size !== values.length)
        ctx.addIssue({ code: 'custom', message: 'Duplicate wallet IDs.' })
    if (new Set(state.orders.map(order => `${order.sessionId}:${order.callId}`)).size !== state.orders.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate purchase source.' })
    for (const order of state.orders)
      if (!Number.isSafeInteger(order.total) || order.total !== order.product.price * order.quantity)
        ctx.addIssue({ code: 'custom', message: 'Order total differs from its product snapshot.' })
  })
/** Explicit domain version; incompatible durable data rejects during open. */
export const walletDomain = defineDomain({
  name: 'genesis_wallet',
  version: 1,
  tables: {
    state: domainTable<'current', z.infer<typeof stateSchema>>(stateSchema),
    identity: domainTable<'life', { lifeId: LifeId }>(z.strictObject({ lifeId: z.string().transform(brandString<LifeId>) })),
  },
})
/** Serializes complete writes and fences unknown outcomes until reload. */
export class WalletStore {
  private tail: Promise<void> = Promise.resolve()
  private failure: GenesisError | undefined
  private closed = false
  /**
   * @param domain - Exclusive wallet domain.
   * @param config - Retention and serialized state limits.
   */
  constructor(
    private readonly domain: Domain<typeof walletDomain>,
    private readonly config: Pick<Config, 'maxRecords' | 'maxStateChars'>,
  ) {}
  /** Restore the matching life without silently recreating lost initialized data.
   * @param lifeId - Stable Genesis identity.
   * @param initialized - Life integration marker from a previous successful initialization.
   * @returns After the ownership marker is durable.
   */
  async start(lifeId: LifeId, initialized: boolean): Promise<void> {
    const saved = this.domain.table('state').get('current'),
      identity = this.domain.table('identity').get('life')
    if (saved === undefined) {
      if (initialized || identity !== undefined)
        throw new GenesisError('invalid-state', 'Wallet state is missing. Restore matching wallet storage before restarting.')
      await this.put({ version: 1, lifeId, revision: 0, balances: { CNY: 0, USD: 0 }, products: [], orders: [], ledger: [] })
    } else if (saved.lifeId !== lifeId || (identity !== undefined && identity.lifeId !== lifeId))
      throw new GenesisError('invalid-state', 'Wallet belongs to another life. Restore matching storage.')
    if (identity === undefined) {
      try {
        await this.domain.table('identity').put('life', { lifeId })
      } catch (error) {
        this.failure = new GenesisError('storage', 'Wallet ownership write is uncertain. Reload verified storage.', { cause: error })
        throw this.failure
      }
    }
  }
  /** Read detached validated data; quarantined stores reject.
   * @returns Current confirmed wallet state.
   */
  read(): z.infer<typeof stateSchema> {
    if (this.failure !== undefined) throw this.failure
    return structuredClone(stateSchema.parse(this.domain.table('state').get('current')))
  }
  private async put(state: z.infer<typeof stateSchema>): Promise<void> {
    const value = stateSchema.parse(state)
    if (
      value.products.length + value.orders.length + value.ledger.length > this.config.maxRecords ||
      JSON.stringify(value).length > this.config.maxStateChars
    )
      throw new GenesisError('capacity', 'Wallet storage is full. Increase the configured retention budget before retrying.')
    try {
      await this.domain.table('state').put('current', value)
    } catch (error) {
      this.failure = new GenesisError('storage', 'Wallet write outcome is uncertain. Stop wallet actions and reload verified storage.', {
        cause: error,
      })
      throw this.failure
    }
  }
  /** Commit one serial mutation; balance, order and receipt publish together.
   * @param work - Mutation applied only to a detached draft.
   * @returns Mutation result after durable confirmation.
   */
  change<T>(work: (state: z.infer<typeof stateSchema>) => T): Promise<T> {
    if (this.closed) return Promise.reject(new GenesisError('closed', 'Wallet is closing.'))
    const result = this.tail.then(async () => {
      const draft = this.read(),
        result = work(draft)
      await this.put(draft)
      return result
    })
    this.tail = result.then(
      () => {},
      (_error: unknown) => {
        /* The operation caller owns reporting; failed writes remain fenced. */
      },
    )
    return result
  }
  /** Refuse new writes and drain accepted writes before releasing storage.
   * @returns After the exclusive domain is closed.
   */
  async close(): Promise<void> {
    this.closed = true
    await this.tail
    await this.domain.close()
  }
}
