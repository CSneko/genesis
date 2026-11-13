// @vitest-environment jsdom
/** Wallet confirmation and currency amounts remain explicit operator actions. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { Order, WalletStatus } from '@deepseek-ai/dsh-experimental-genesis-wallet/types'
import { WalletPanel } from '../src/client/WalletPanel.tsx'
import { zh } from '../src/client/wallet-locales.ts'
import { globalProps } from './global-props.client.ts'
import type {} from '../src/client/wallet-mount.tsx'
afterEach(cleanup)
function fixture() {
  const order: Order = {
    id: brandString<Order['id']>('order'),
    product: {
      id: brandString<Order['product']['id']>('book'),
      title: '一本书',
      description: '阅读',
      price: 3500,
      currency: 'CNY',
      url: 'https://item.taobao.com/item.htm?id=123',
      specification: '纸质',
      source: 'custom',
      available: true,
    },
    quantity: 2,
    total: 7000,
    reason: '想阅读',
    status: 'pending',
    note: '',
    createdAt: 1,
    settledAt: null,
    sessionId: brandString<Order['sessionId']>('session'),
    callId: brandString<Order['callId']>('call'),
    fingerprint: 'source',
  }
  const sample: WalletStatus = {
    revision: 3,
    balances: { CNY: 10000, USD: 500 },
    pending: 1,
    products: [],
    orders: [order],
    ledger: [],
    nextOffset: null,
    pollMs: 5000,
    productSource: false,
  }
  const labels: Record<string, string> = zh
  const props: ComponentProps<typeof WalletPanel> = {
    ...globalProps,
    t: key => labels[key] ?? key,
    useResource: (() => ({ status: 'live', value: sample, failure: undefined })) as ComponentProps<typeof WalletPanel>['useResource'],
    saveProduct: vi.fn().mockResolvedValue({ ok: true, value: order.product }),
    removeProduct: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    setSourceKey: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    balance: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    settle: vi.fn().mockResolvedValue({ ok: true, value: { ...order, status: 'purchased' } }),
    search: vi.fn(),
    refresh: vi.fn(),
  }
  return { props, sample, order }
}
it('shows the immutable quote and waits for an explicit purchase confirmation', async () => {
  const { props, order } = fixture()
  render(<WalletPanel {...props} />)
  expect(screen.getByText(/¥70\.00 CNY/u)).toBeTruthy()
  expect(props.settle).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText(zh.note), { target: { value: '同意' } })
  fireEvent.click(screen.getByRole('button', { name: zh.confirm }))
  await waitFor(() => expect(props.settle).toHaveBeenCalledWith(order.id, 'purchased', '同意', 3, expect.any(AbortSignal)))
  expect(screen.queryByText(/代购/u)).toBeNull()
})
it('sets an exact decimal balance without passing a note and requires notes for transfers', async () => {
  const { props } = fixture()
  render(<WalletPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: zh.balance }))
  expect((screen.getByRole('button', { name: zh.apply }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: zh.set }))
  fireEvent.change(screen.getByLabelText(`${zh.amount} · CNY`), { target: { value: '10.01' } })
  fireEvent.click(screen.getByRole('button', { name: zh.apply }))
  await waitFor(() => expect(props.balance).toHaveBeenCalledWith('set', 'CNY', 1001, '', 3))
  expect(screen.getByText(zh.setHint)).toBeTruthy()
})
it('keeps the optional source key in a password draft and clears it only after saving', async () => {
  const { WalletSourceSettings } = await import('../src/client/WalletSourceSettings.tsx')
  const labels: Record<string, string> = zh
  const saveKey = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  const perform = async (work: () => Promise<RemoteResult<void>>)  => (await work()).ok
  render(
    <WalletSourceSettings
      t={key => labels[key] ?? key}
      busy={false}
      saveKey={saveKey}
      perform={perform}
      useResource={
        (() => ({
          status: 'live',
          value: { provider: 'yuantoutao', keyPresent: false, uncertain: false },
          failure: undefined,
        })) as ComponentProps<typeof WalletSourceSettings>['useResource']
      }
    />,
  )
  const input = screen.getByLabelText(zh.sourceKey) as HTMLInputElement
  expect(input.type).toBe('password')
  expect(screen.getByText(zh.sourceNoKey)).toBeTruthy()
  fireEvent.change(input, { target: { value: ' fixture-only-key ' } })
  fireEvent.click(screen.getByRole('button', { name: zh.saveKey }))
  await waitFor(() => expect(saveKey).toHaveBeenCalledWith('fixture-only-key'))
  await waitFor(() => expect(input.value).toBe(''))
  expect(screen.queryByText('fixture-only-key')).toBeNull()
})
