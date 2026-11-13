/** Browser-safe wallet records; money is expressed in integer fen or cents. @module */
import type { z } from 'zod'
import type { currencySchema, productInputSchema, stateSchema } from './model.ts'
export type { ProductId, OrderId, LedgerId } from './model.ts'
/** Supported currencies with independent balances. */
export type Currency = z.infer<typeof currencySchema>
/** Complete editable product fields. */
export type ProductInput = z.infer<typeof productInputSchema>
/** Immutable product snapshot when embedded in an order. */
export type Product = z.infer<typeof stateSchema>['products'][number]
/** Purchase state with durable Session/tool attribution. */
export type Order = z.infer<typeof stateSchema>['orders'][number]
/** Logged balance movement; direct balance edits are excluded. */
export type Ledger = z.infer<typeof stateSchema>['ledger'][number]
/** Paginated wallet view; each list uses the same independent offset. */
export interface WalletStatus {
  revision: number
  balances: Record<Currency, number>
  pending: number
  products: Product[]
  orders: Order[]
  ledger: Ledger[]
  nextOffset: number | null
  pollMs: number
  productSource: boolean
}

/** Operator-visible source selection; credential values are excluded. */
export interface ProductSourceStatus {
  provider: 'custom' | 'yuantoutao'
  keyPresent: boolean
  uncertain: boolean
}
