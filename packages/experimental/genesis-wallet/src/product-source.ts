/** Built-in read-only Taobao catalog adapter and optional operator-defined JSON source. @module */
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import { productInputSchema } from './model.ts'
import { WalletError } from './error.ts'
import type { Config } from './config.ts'
import type { ProductInput, ProductSourceStatus } from './types.ts'

const rpcSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.literal(1),
  error: z.object({ code: z.number() }).optional(),
  result: z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    })
    .optional(),
})
const itemSchema = z.object({
  platform: z.enum(['tb', 'tbk']),
  title: z.string().min(1).max(200),
  price_final: z.number().int().nonnegative().nullable(),
  subtitle: z.string().nullable().optional(),
  shop_name: z.string().nullable().optional(),
  shop_type: z.string().nullable().optional(),
  buy_url: z.string().optional(),
  detail_url: z.string().optional(),
  page_url: z.string().optional(),
  status: z.string().optional(),
})
/** Restricts the built-in service to product reads; no external checkout tools are exposed. */
export class ProductSource {
  private writes: Promise<void> = Promise.resolve()
  private uncertain = false
  /**
   * @param ctx - Credential service owner.
   * @param config - Fixed operator-selected endpoints and resource bounds.
   */
  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {
    for (const endpoint of [config.taobaoEndpoint, config.productEndpoint])
      if (endpoint) {
        const url = new URL(endpoint)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new WalletError('source')
      }
    if (!config.taobaoEndpoint) throw new WalletError('source')
    credentialRef(config.taobaoCredentialRef)
    if (config.credentialRef) credentialRef(config.credentialRef)
  }
  /** Read source selection and credential presence without returning the secret.
   * @returns Current source configuration and any uncertain credential write.
   */
  async status(): Promise<ProductSourceStatus> {
    await this.writes
    return {
      provider: this.config.productEndpoint ? 'custom' : 'yuantoutao',
      uncertain: this.uncertain,
      keyPresent: !this.uncertain && (await this.ctx.credentials.resolve(credentialRef(this.config.taobaoCredentialRef))) !== undefined,
    }
  }
  /** Store or remove the optional built-in-source key; unknown writes fence product queries.
   * @param value - New key or undefined to remove a managed key.
   * @returns After credential storage confirms the change; secret values are never returned.
   */
  setKey(value: string | undefined): Promise<void> {
    if (this.config.productEndpoint) return Promise.reject(new WalletError('source'))
    const key =
      value === undefined
        ? undefined
        : z
          .string()
          .trim()
          .min(1)
          .max(4096)
          .regex(/^[^\s]+$/u)
          .parse(value)
    const operation = this.writes.then(async () => {
      if (this.uncertain) throw new WalletError('source-key')
      const ref = credentialRef(this.config.taobaoCredentialRef)
      try {
        if (key === undefined) await this.ctx.credentials.unset(ref)
        else await this.ctx.credentials.set(ref, key)
      } catch (_error: unknown) {
        this.uncertain = true
        throw new WalletError('source-key')
      }
    })
    this.writes = operation.catch((_error: unknown) => {
      /* The authenticated caller reports failure; status retains uncertainty. */
    })
    return operation
  }
  /** Query a fixed endpoint within a caller-owned deadline; URLs are identifiers, never fetch targets.
   * @param query - Keyword or supported product link.
   * @param signal - Caller, plugin and timeout cancellation.
   * @returns Validated bounded CNY product candidates, or custom-source products.
   */
  async query(query: string, signal: AbortSignal): Promise<ProductInput[]> {
    try {
      if (this.config.productEndpoint) return await this.custom(query, signal)
      await this.writes
      if (this.uncertain) throw new WalletError('source-key')
      const key = await this.ctx.credentials.resolve(credentialRef(this.config.taobaoCredentialRef))
      const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
      if (key !== undefined) headers.authorization = `Bearer ${key.value}`
      const link = /^https?:\/\//iu.test(query)
      const params = link
        ? { name: 'shelf_item', arguments: { platform: 'tb', item_id: this.itemId(query) } }
        : {
          name: 'cps_smart_search',
          arguments: { q: query, platforms: 'tbk', page_size: Math.min(this.config.pageSize, 50), live: key === undefined ? 0 : 1 },
        }
      const raw = await this.request(
        new URL(this.config.taobaoEndpoint),
        { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params }) },
        signal,
      )
      const rpc = rpcSchema.parse(raw)
      if (rpc.error !== undefined || rpc.result === undefined) throw new WalletError('source')
      if (rpc.result.isError) {
        const failure = z.object({ code: z.string() }).safeParse(rpc.result.structuredContent)
        throw new WalletError(
          failure.success && failure.data.code === 'UNAUTHORIZED'
            ? 'source-key'
            : failure.success && failure.data.code === 'RATE_LIMITED'
              ? 'source-rate'
              : link
                ? 'source-url'
                : 'source',
        )
      }
      let data = rpc.result.structuredContent
      if (data === undefined) {
        const text = rpc.result.content?.find(block => block.type === 'text')?.text
        if (text === undefined) throw new WalletError('source')
        data = JSON.parse(text)
      }
      const items = link
        ? [itemSchema.parse(data)]
        : z.object({ items: z.array(itemSchema).max(Math.min(this.config.pageSize, 50)) }).parse(data).items
      return items
        .filter(item => item.price_final !== null && item.price_final > 0)
        .map(item =>
          productInputSchema.parse({
            title: item.title,
            price: item.price_final,
            currency: 'CNY',
            source: 'taobao',
            available: item.status === undefined || item.status === 'active',
            description: [item.subtitle, item.shop_name, item.shop_type]
              .filter(value => value !== null && value !== undefined && value !== '')
              .join('\n'),
            specification: '',
            url: item.buy_url || item.detail_url || item.page_url || '',
          }),
        )
    } catch (error) {
      if (signal.aborted) throw signal.reason
      if (error instanceof WalletError) throw error
      throw new WalletError('source')
    }
  }
  private itemId(input: string): string {
    const url = new URL(input)
    if (url.username || url.password) throw new WalletError('source-url')
    const host = url.hostname.toLowerCase()
    const id =
      host === 'yuantoutao.com' || host === 'www.yuantoutao.com'
        ? /^\/(?:go|p)\/tb\/([A-Za-z0-9_-]+)\/?$/u.exec(url.pathname)?.[1]
        : host === 'taobao.com' || host.endsWith('.taobao.com') || host === 'tmall.com' || host.endsWith('.tmall.com')
          ? url.searchParams.get('id')
          : null
    if (!id || !/^[A-Za-z0-9_-]{1,200}$/u.test(id)) throw new WalletError('source-url')
    return id
  }
  private async custom(query: string, signal: AbortSignal): Promise<ProductInput[]> {
    const url = new URL(this.config.productEndpoint)
    url.searchParams.set(/^https?:\/\//iu.test(query) ? 'url' : 'query', query)
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.config.credentialRef) {
      const key = await this.ctx.credentials.resolve(credentialRef(this.config.credentialRef))
      if (key === undefined) throw new WalletError('source-key')
      headers.authorization = `Bearer ${key.value}`
    }
    const raw = await this.request(url, { headers }, signal)
    return z
      .strictObject({ items: z.array(productInputSchema.extend({ source: z.literal('taobao') })).max(this.config.pageSize) })
      .parse(raw).items
  }
  private async request(url: URL, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(url, { ...init, signal, redirect: 'error' })
    if (!response.ok || response.body === null) {
      await response.body?.cancel()
      throw new WalletError(
        response.status === 401 || response.status === 403 ? 'source-key' : response.status === 429 ? 'source-rate' : 'source',
      )
    }
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > this.config.maxResponseBytes) throw new WalletError('source')
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }
  /** Drain admitted credential writes before the credential service is released.
   * @returns After every accepted key mutation settles.
   */
  async close(): Promise<void> {
    await this.writes
  }
}
