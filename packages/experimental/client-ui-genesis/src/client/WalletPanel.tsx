/** Currency-aware wallet management with persistent pending requests and explicit operator settlement. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { Currency, Product, ProductInput, Order, WalletStatus } from '@deepseek-ai/dsh-experimental-genesis-wallet/types'
import type { WalletKey } from './wallet-locales.ts'
import pageCss from './GenesisPage.module.css'
import css from './StatusPanel.module.css'
import walletCss from './WalletPanel.module.css'

type Remote = TypertClientRemote['genesisWallet']
/** Operator callbacks resolved from the wallet Remote service. */
export interface WalletActions {
  saveProduct: Remote['saveProduct']
  removeProduct: Remote['removeProduct']
  balance: Remote['balance']
  settle: Remote['settle']
  search: Remote['search']
  setSourceKey: Remote['setSourceKey']
  refresh(this: void): void
}
type View = 'pending' | 'products' | 'orders' | 'ledger'
type Locale = PropsLocale<'genesis.wallet'>
const blank: ProductInput = {
  title: '',
  description: '',
  price: 0,
  currency: 'CNY',
  url: '',
  specification: '',
  available: true,
  source: 'custom',
}
function decimal(amount: number) {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
}
function money(amount: number, currency: Currency) {
  return `${currency === 'CNY' ? '¥' : '$'}${decimal(amount)} ${currency}`
}
function minor(value: string): number | undefined {
  if (!/^\d+(?:\.\d{1,2})?$/u.test(value)) return undefined
  const [whole, fraction = ''] = value.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(result) ? result : undefined
}
function failureKey(error: unknown): WalletKey {
  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'reason' in error.details
  ) {
    switch (error.details.reason) {
      case 'source-key':
        return 'sourceKeyFailed'
      case 'source-rate':
        return 'sourceRate'
      case 'source-url':
        return 'sourceUrl'
      case 'source':
        return 'sourceUnavailable'
      case 'stale':
        return 'stale'
      case 'insufficient':
        return 'insufficient'
      case 'storage':
      case 'invalid-state':
        return 'storage'
      case 'invalid':
        return 'invalid'
      default:
        return 'failed'
    }
  }
  return 'failed'
}
/** Render the dedicated wallet page, including drafts that survive polling.
 * @param props - Resource owner, locale and explicit operator actions.
 * @returns Current balances and a paged catalog or transaction view.
 */
export function WalletPanel({ useResource, t, ...actions }: PropsRuntime<'main'> & Locale & InjectFace<WalletActions>) {
  const [view, setView] = useState<View>('pending'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [pages, setPages] = useState([0])
  const offset = pages.at(-1) ?? 0
  const params = new URLSearchParams({ view, query: search, offset: String(offset) })
  const resource = useResource<'genesis-wallet'>(`dsh-resource://genesis-wallet/catalog?${params}`),
    sample = resource.value
  const [feedback, setFeedback] = useState<WalletKey>(),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<{ input: ProductInput; id: Product['id'] | null; revision: number }>()
  const [balanceOpen, setBalanceOpen] = useState(false),
    [sourceQuery, setSourceQuery] = useState(''),
    [candidates, setCandidates] = useState<ProductInput[]>([])
  const locked = useRef(false),
    mounted = useRef(true),
    lifetime = useRef<AbortController>()
  if (lifetime.current === undefined) lifetime.current = new AbortController()
  const signal = lifetime.current.signal
  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    lifetime.current = controller
    return () => {
      mounted.current = false
      controller.abort()
    }
  }, [])
  const perform = async <T,>(work: () => Promise<RemoteResult<T>>): Promise<boolean> => {
    if (locked.current) return false
    locked.current = true
    setBusy(true)
    setFeedback(undefined)
    try {
      const result = await work()
      if (mounted.current) setFeedback(result.ok ? undefined : failureKey(result.error))
      return result.ok
    } catch (error) {
      if (mounted.current) setFeedback(failureKey(error))
      return false
    } finally {
      locked.current = false
      if (mounted.current) {
        setBusy(false)
        actions.refresh()
      }
    }
  }
  return (
    <main className={pageCss.page}>
      <div className={pageCss.content}>
        <header className={pageCss.heading}>
          <h1>{t('title')}</h1>
          <p>{t('description')}</p>
        </header>
        <section className={css.panel}>
          <div className={css.header}>
            <div className={css.counts}>
              {(['CNY', 'USD'] as const).map(currency => (
                <div key={currency}>
                  <span>
                    {t('balance')} · {currency}
                  </span>
                  <strong>{sample ? money(sample.balances[currency], currency) : '—'}</strong>
                </div>
              ))}
            </div>
            <div className={css.actions}>
              <Button
                variant="outline"
                onClick={() => {
                  setBalanceOpen(value => !value)
                }}
              >
                {t('balance')}
              </Button>
              <Button variant="ghost" onClick={actions.refresh}>
                {t('refresh')}
              </Button>
            </div>
          </div>
          {resource.status === 'failed' ? <p role="alert">{t('unavailable')}</p> : null}
          <div className={walletCss.feedback} aria-live="polite">
            {feedback ? <p role={feedback === 'success' ? 'status' : 'alert'}>{t(feedback)}</p> : null}
          </div>
          {balanceOpen && sample ? <BalanceForm key="balance" {...{ t, busy, sample, perform, actions }} /> : null}
          <nav className={pageCss.navigation} aria-label={t('title')}>
            {(['pending', 'products', 'orders', 'ledger'] as const).map(item => (
              <Button
                key={item}
                size="sm"
                variant={view === item ? 'outline' : 'ghost'}
                aria-current={view === item ? 'page' : undefined}
                onClick={() => {
                  setView(item)
                  setPages([0])
                }}
              >
                {t(item)}
                {item === 'pending' && sample ? ` (${sample.pending})` : ''}
              </Button>
            ))}
          </nav>
          {sample === undefined ? (
            <div className={css.loading} role="status" aria-label={t('loading')}>
              <StateDot state="ongoing" />
            </div>
          ) : (
            <>
              <form
                className={css.search}
                onSubmit={(event) => {
                  event.preventDefault()
                  setSearch(query)
                  setPages([0])
                }}
              >
                <label htmlFor="wallet-query">{t('query')}</label>
                <Input
                  id="wallet-query"
                  value={query}
                  maxLength={200}
                  onChange={(event) => {
                    setQuery(event.target.value)
                  }}
                />
                <Button type="submit">{t('search')}</Button>
              </form>
              {view === 'products' ? (
                <>
                  <div className={css.actions}>
                    <Button
                      onClick={() => {
                        setEditor({ input: { ...blank }, id: null, revision: sample.revision })
                      }}
                    >
                      {t('add')}
                    </Button>
                  </div>
                  {editor ? (
                    <ProductForm
                      key={editor.id ?? `${editor.input.source}:${editor.input.url}:${editor.input.title}`}
                      initial={editor.input}
                      {...{ t, busy }}
                      cancel={() => {
                        setEditor(undefined)
                      }}
                      save={async (input) => {
                        if (await perform(() => actions.saveProduct(input, editor.id, editor.revision, signal)))
                          setEditor(undefined)
                      }}
                    />
                  ) : null}
                  <form
                    className={css.search}
                    onSubmit={(event) => {
                      event.preventDefault()
                      void perform(async () => {
                        const result = await actions.search(sourceQuery, signal)
                        if (result.ok && mounted.current) setCandidates(result.value)
                        return result
                      })
                    }}
                  >
                    <label htmlFor="wallet-source">{t('providerQuery')}</label>
                    <Input
                      id="wallet-source"
                      value={sourceQuery}
                      maxLength={2000}
                      onChange={(event) => {
                        setSourceQuery(event.target.value)
                      }}
                    />
                    <Button type="submit" disabled={busy || !sample.productSource || !sourceQuery.trim()}>
                      {t('providerSearch')}
                    </Button>
                  </form>
                  <ul className={css.records}>
                    {candidates.map((item, index) => (
                      <li key={index}>
                        <span>
                          {item.title} · {money(item.price, item.currency)}
                        </span>
                        <Button
                          disabled={busy}
                          onClick={() => {
                            setEditor({ input: item, id: null, revision: sample.revision })
                          }}
                        >
                          {t('import')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <ul className={css.records}>
                    {sample.products.map(item => (
                      <ProductCard
                        key={item.id}
                        {...{ item, t, busy }}
                        edit={() => {
                          setEditor({ input: item, id: item.id, revision: sample.revision })
                        }}
                        remove={() => perform(() => actions.removeProduct(item.id, sample.revision, signal))}
                      />
                    ))}
                  </ul>
                  {sample.products.length === 0 ? <p>{t('empty')}</p> : null}
                </>
              ) : view === 'ledger' ? (
                <ul className={css.records}>
                  {sample.ledger.map(item => (
                    <li key={item.id}>
                      <span>
                        {t(item.kind)} · {money(item.amount, item.currency)}
                      </span>
                      <p>{item.note}</p>
                      <span className={css.secondary}>{new Date(item.at).toLocaleString()}</span>
                    </li>
                  ))}
                  {sample.ledger.length === 0 ? <li>{t('empty')}</li> : null}
                </ul>
              ) : (
                <>
                  {view === 'pending' ? <p className={css.secondary}>{t('pendingHint')}</p> : null}
                  <ul className={css.records}>
                    {sample.orders.map(order => (
                      <OrderCard
                        key={order.id}
                        {...{ order, t, busy, sample }}
                        settle={(action, note) =>
                          perform(() => actions.settle(order.id, action, note, sample.revision, signal))
                        }
                      />
                    ))}
                  </ul>
                  {sample.orders.length === 0 ? <p>{t('empty')}</p> : null}
                </>
              )}
              <div className={css.pagination}>
                <Button
                  variant="outline"
                  disabled={offset === 0}
                  onClick={() => {
                    setPages(values => values.slice(0, -1))
                  }}
                >
                  {t('previous')}
                </Button>
                <Button
                  variant="outline"
                  disabled={sample.nextOffset === null}
                  onClick={() => {
                    const nextOffset = sample.nextOffset
                    if (nextOffset !== null) setPages(values => [...values, nextOffset])
                  }}
                >
                  {t('next')}
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
function BalanceForm({
  t,
  busy,
  sample,
  perform,
  actions,
}: Locale & {
  busy: boolean
  sample: WalletStatus
  actions: WalletActions
  perform: (work: () => Promise<RemoteResult<void>>) => Promise<boolean>
}) {
  const id = useId(),
    [action, setAction] = useState<'set' | 'deposit' | 'withdraw'>('deposit'),
    [currency, setCurrency] = useState<Currency>('CNY'),
    [amount, setAmount] = useState(''),
    [note, setNote] = useState('')
  const value = minor(amount)
  return (
    <form
      className={walletCss.form}
      onSubmit={(event) => {
        event.preventDefault()
        if (value !== undefined) void perform(() => actions.balance(action, currency, value, action === 'set' ? '' : note, sample.revision))
      }}
    >
      <div className={css.actions}>
        {(['set', 'deposit', 'withdraw'] as const).map(item => (
          <Button
            key={item}
            variant={action === item ? 'outline' : 'ghost'}
            aria-pressed={action === item}
            onClick={() => {
              setAction(item)
            }}
          >
            {t(item)}
          </Button>
        ))}
      </div>
      <CurrencyField {...{ t, currency }} change={setCurrency} />
      <label htmlFor={`${id}-amount`}>
        {t('amount')} · {currency}
      </label>
      <Input
        id={`${id}-amount`}
        inputMode="decimal"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value)
        }}
      />
      {action !== 'set' ? (
        <>
          <label htmlFor={`${id}-note`}>{t('note')}</label>
          <Input
            id={`${id}-note`}
            value={note}
            maxLength={2000}
            onChange={(event) => {
              setNote(event.target.value)
            }}
          />
        </>
      ) : null}
      <p className={css.secondary}>{t(action === 'set' ? 'setHint' : 'movementHint')}</p>
      <Button type="submit" disabled={busy || value === undefined || (action !== 'set' && (value === 0 || !note.trim()))}>
        {t('apply')}
      </Button>
    </form>
  )
}
function CurrencyField({ t, currency, change }: Locale & { currency: Currency; change: (currency: Currency) => void }) {
  return (
    <div className={css.actions} role="group" aria-label={t('currency')}>
      {(['CNY', 'USD'] as const).map(item => (
        <Button
          key={item}
          size="sm"
          variant={currency === item ? 'outline' : 'ghost'}
          aria-pressed={currency === item}
          onClick={() => {
            change(item)
          }}
        >
          {item}
        </Button>
      ))}
    </div>
  )
}
function ProductForm({
  initial,
  t,
  busy,
  save,
  cancel,
}: Locale & { initial: ProductInput; busy: boolean; save: (input: ProductInput) => Promise<void>; cancel: () => void }) {
  const [draft, setDraft] = useState(initial),
    [price, setPrice] = useState(initial.price ? decimal(initial.price) : ''),
    id = useId()
  const fields = [
    ['title', 'name'],
    ['description', 'detail'],
    ['specification', 'specification'],
    ['url', 'url'],
  ] as const
  const value = minor(price)
  return (
    <form
      className={walletCss.form}
      onSubmit={(event) => {
        event.preventDefault()
        if (value !== undefined)
          void save({
            title: draft.title,
            description: draft.description,
            specification: draft.specification,
            url: draft.url,
            available: draft.available,
            source: draft.source,
            currency: draft.currency,
            price: value,
          })
      }}
    >
      {fields.map(([field, label]) => (
        <div key={field} className={walletCss.field}>
          <label htmlFor={`${id}-${field}`}>{t(label)}</label>
          <Input
            id={`${id}-${field}`}
            type={field === 'url' ? 'url' : 'text'}
            required={field === 'title'}
            maxLength={field === 'title' ? 200 : field === 'specification' ? 500 : 2000}
            value={draft[field]}
            onChange={(event) => {
              setDraft(old => ({ ...old, [field]: event.target.value }))
            }}
          />
        </div>
      ))}
      <CurrencyField
        {...{ t }}
        currency={draft.currency}
        change={(currency) => {
          setDraft(old => ({ ...old, currency }))
        }}
      />
      <label htmlFor={`${id}-price`}>
        {t('price')} · {draft.currency}
      </label>
      <Input
        id={`${id}-price`}
        inputMode="decimal"
        value={price}
        onChange={(event) => {
          setPrice(event.target.value)
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={draft.available}
          onChange={(event) => {
            setDraft(old => ({ ...old, available: event.target.checked }))
          }}
        />{' '}
        {t('available')}
      </label>
      <div className={css.actions}>
        <Button type="submit" disabled={busy || value === undefined || value <= 0 || !draft.title.trim()}>
          {t('save')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={cancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}
function ProductCard({
  item,
  t,
  busy,
  edit,
  remove,
}: Locale & { item: Product; busy: boolean; edit: () => void; remove: () => Promise<boolean> }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <li>
      <h3>{item.title}</h3>
      <span>
        {money(item.price, item.currency)} · {t(item.source)}
        {item.available ? '' : ` · ${t('unlisted')}`}
      </span>
      <p>{item.description}</p>
      <p>{item.specification}</p>
      {item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {t('link')}
        </a>
      ) : null}
      <div className={css.actions}>
        <Button variant="outline" disabled={busy} onClick={edit}>
          {t('edit')}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (confirm) void remove()
            else setConfirm(true)
          }}
        >
          {t(confirm ? 'confirmRemove' : 'remove')}
        </Button>
        {confirm ? (
          <Button
            variant="ghost"
            onClick={() => {
              setConfirm(false)
            }}
          >
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
function OrderCard({
  order,
  t,
  busy,
  sample,
  settle,
}: Locale & {
  order: Order
  busy: boolean
  sample: WalletStatus
  settle: (action: 'purchased' | 'rejected' | 'refunded', note: string) => Promise<boolean>
}) {
  const [note, setNote] = useState(''),
    id = useId()
  return (
    <li>
      <div className={css.header}>
        <h3>{order.product.title}</h3>
        <span>{t(order.status)}</span>
      </div>
      <p>{order.product.specification}</p>
      <p>
        {t('quantity')}: {order.quantity} · {t('total')}: {money(order.total, order.product.currency)}
      </p>
      <p>
        {t('reason')}: {order.reason}
      </p>
      <p className={css.secondary}>
        {t('created')}: {new Date(order.createdAt).toLocaleString()}
      </p>
      {order.settledAt !== null ? (
        <p className={css.secondary}>
          {t('settled')}: {new Date(order.settledAt).toLocaleString()}
        </p>
      ) : null}
      {order.product.url ? (
        <a href={order.product.url} target="_blank" rel="noopener noreferrer">
          {t('link')}
        </a>
      ) : null}
      {order.note ? <p>{order.note}</p> : null}
      {order.status === 'pending' || order.status === 'purchased' ? (
        <>
          <label htmlFor={id}>{t('note')}</label>
          <Input
            id={id}
            value={note}
            maxLength={2000}
            onChange={(event) => {
              setNote(event.target.value)
            }}
          />
          <div className={css.actions}>
            {order.status === 'pending' ? (
              <>
                <Button
                  disabled={busy || sample.balances[order.product.currency] < order.total}
                  onClick={() => {
                    void settle('purchased', note)
                  }}
                >
                  {t('confirm')}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void settle('rejected', note)
                  }}
                >
                  {t('reject')}
                </Button>
                {sample.balances[order.product.currency] < order.total ? <p role="status">{t('insufficient')}</p> : null}
              </>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void settle('refunded', note)
                }}
              >
                {t('refundAction')}
              </Button>
            )}
          </div>
        </>
      ) : null}
    </li>
  )
}
