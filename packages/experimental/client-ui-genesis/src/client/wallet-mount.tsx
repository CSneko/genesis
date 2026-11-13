/** Reversible wallet page and sidebar badge, using the same durable pending count. @module */
import { useEffect, useRef, useState } from 'react'
import { WalletSourceSettings } from './WalletSourceSettings.tsx'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { IconArchiveOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import contribution from '@deepseek-ai/dsh-experimental-genesis-wallet/remote'
import type { WalletStatus, ProductSourceStatus } from '@deepseek-ai/dsh-experimental-genesis-wallet/types'
import { WalletPanel, type WalletActions } from './WalletPanel.tsx'
import { en, zh, type WalletKey } from './wallet-locales.ts'
import { StatusResource } from './resource.ts'
import css from './WalletPanel.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.wallet': WalletKey
  }
  interface ResourceProtocolMap {
    'genesis-wallet': WalletStatus
    'genesis-wallet-source': ProductSourceStatus
  }
}
function WalletIcon({ size, useResource, t }: PropsRuntime<'sidebar.panellist'> & PropsLocale<'genesis.wallet'>) {
  const resource = useResource<'genesis-wallet'>('dsh-resource://genesis-wallet/catalog?view=summary')
  return (
    <span className={css.icon}>
      <IconArchiveOutlineRegular size={size} />
      {resource.value && resource.value.pending > 0 ? <span className={css.dot} role="status" aria-label={t('pendingBadge')} /> : null}
    </span>
  )
}
function WalletSettings({
  useResource,
  setSourceKey,
  t,
}: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.wallet'> & InjectFace<Pick<WalletActions, 'setSourceKey'>>) {
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false)
  const locked = useRef(false),
    mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const perform = async (work: () => Promise<RemoteResult<void>>) => {
    if (locked.current) return false
    locked.current = true
    setBusy(true)
    setFailed(false)
    try {
      const result = await work()
      if (mounted.current) setFailed(!result.ok)
      return result.ok
    } catch (_error) {
      if (mounted.current) setFailed(true)
      return false
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <>
      {failed ? <p role="alert">{t('failed')}</p> : null}
      <WalletSourceSettings {...{ useResource, t, busy, perform }} saveKey={setSourceKey} />
    </>
  )
}
interface Notice {
  sequence: number
  outcome: boolean | null
}
interface NoticeActions {
  hooks: { walletNotice: ObservableSnapshot<Notice> }
  dismiss: (sequence: number) => void
}
function WalletNotice({
  useWalletNotice,
  dismiss,
  t,
}: PropsRuntime<'shell.overlay'> & PropsLocale<'genesis.wallet'> & InjectFace<NoticeActions>) {
  const state = useWalletNotice(value => value)
  return state.outcome === null ? null : (
    <Toast
      key={state.sequence}
      text={t(state.outcome ? 'success' : 'failed')}
      {...(state.outcome ? { tone: 'success' as const } : {})}
      onDone={() => {
        dismiss(state.sequence)
      }}
    />
  )
}
/** Mount wallet controls only while its Host Remote is available.
 * @param ctx - Existing Genesis browser registration owner.
 * @returns Disposer removing UI before generated Remote metadata.
 */
export async function mountWallet(ctx: Context): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisWallet'], (scope) => {
    const notice = createSnapshotStore<Notice>({ sequence: 0, outcome: null })
    const perform = async <T,>(work: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T>> => {
      const report = (ok: boolean) =>
        notice.update((state) => {
          state.sequence++
          state.outcome = ok
        })
      try {
        const result = await work()
        report(result.ok)
        return result
      } catch (error) {
        report(false)
        throw error
      } finally {
        resource.refresh()
      }
    }
    const resource = new StatusResource(),
      panelId = brandString<MainPanelId>('genesis-wallet')
    scope.effect(() => scope.locale.register('genesis.wallet', { en, zh }))
    scope.effect(() =>
      scope.resources.register<'genesis-wallet'>({
        protocol: 'genesis-wallet',
        async *open(address, { signal }) {
          let timer: ReturnType<typeof setInterval> | undefined
          try {
            yield* resource.open(async (owned) => {
              const params = new URL(address).searchParams
              const view = params.get('view'),
                selected = view === 'summary' || view === 'products' || view === 'orders' || view === 'ledger' ? view : 'pending'
              const result = await scope.remote.genesisWallet.inspect(
                selected,
                params.get('query') ?? '',
                Number(params.get('offset') ?? 0),
                owned,
              )
              if (result.ok && timer === undefined)
                timer = setInterval(() => {
                  resource.refresh()
                }, result.value.pollMs)
              return result
            }, signal)
          } finally {
            clearInterval(timer)
          }
        },
      }),
    )
    scope.effect(() =>
      scope.resources.register<'genesis-wallet-source'>({
        protocol: 'genesis-wallet-source',
        open: (_address, { signal }) => resource.open(owned => scope.remote.genesisWallet.sourceStatus(owned), signal),
      }),
    )
    scope.slots.inject('shell.overlay', () =>
      scope.slots.register(
        {
          name: 'shell.overlay',
          id: 'genesis-wallet-notice',
          locale: 'genesis.wallet',
          inject: (): NoticeActions => ({
            hooks: { walletNotice: notice },
            dismiss: (sequence) => {
              notice.update((state) => {
                if (state.sequence === sequence) state.outcome = null
              })
            },
          }),
        },
        WalletNotice,
      ),
    )
    scope.on('connection/reset', () => {
      resource.refresh()
    })
    scope.slots.inject('genesis.plugin.settings', () =>
      scope.slots.register(
        {
          name: 'genesis.plugin.settings',
          key: 'genesis-wallet',
          locale: 'genesis.wallet',
          inject: () => ({
            setSourceKey: (...args: Parameters<WalletActions['setSourceKey']>) =>
              perform(() => scope.remote.genesisWallet.setSourceKey(...args)),
          }),
        },
        WalletSettings,
      ),
    )
    scope.slots.inject('main', () =>
      scope.slots.register(
        {
          name: 'main',
          key: panelId,
          locale: 'genesis.wallet',
          inject: (): WalletActions => ({
            saveProduct: (...args) => perform(() => scope.remote.genesisWallet.saveProduct(...args)),
            removeProduct: (...args) => perform(() => scope.remote.genesisWallet.removeProduct(...args)),
            setSourceKey: (...args) => perform(() => scope.remote.genesisWallet.setSourceKey(...args)),
            balance: (...args) => perform(() => scope.remote.genesisWallet.balance(...args)),
            settle: (...args) => perform(() => scope.remote.genesisWallet.settle(...args)),
            search: (...args) => scope.remote.genesisWallet.search(...args),
            refresh: () => {
              resource.refresh()
            },
          }),
        },
        WalletPanel,
      ),
    )
    scope.slots.inject('sidebar.panellist', () =>
      scope.slots.register(
        {
          name: 'sidebar.panellist',
          id: panelId,
          order: 19,
          locale: 'genesis.wallet',
          label: () => scope.locale.bind('genesis.wallet')('title'),
        },
        WalletIcon,
      ),
    )
  })
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmount()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmount()
  }
}
