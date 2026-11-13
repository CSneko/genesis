/** Optional built-in-source credentials; key values never enter wallet records or model context. @module */
import { useId, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import css from './StatusPanel.module.css'
import walletCss from './WalletPanel.module.css'

/** Render the optional key editor alongside the product query form.
 * @param props - Source status resource, locale and operator-only credential callback.
 * @returns Secret-free status, application link and a transient password draft.
 */
export function WalletSourceSettings({
  useResource,
  t,
  busy,
  perform,
  saveKey,
}: Pick<PropsRuntime<'main'>, 'useResource'> &
  PropsLocale<'genesis.wallet'> & {
    busy: boolean
    perform: (work: () => Promise<RemoteResult<void>>) => Promise<boolean>
    saveKey: TypertClientRemote['genesisWallet']['setSourceKey']
  }) {
  const source = useResource<'genesis-wallet-source'>('dsh-resource://genesis-wallet-source/settings')
  const [key, setKey] = useState(''),
    id = useId()
  if (source.status === 'failed') return <p role="alert">{t('sourceUnavailable')}</p>
  if (!source.value) return <StateDot state="ongoing" />
  if (source.value.provider === 'custom') return <p className={css.secondary}>{t('customSource')}</p>
  return (
    <form
      className={walletCss.form}
      onSubmit={(event) => {
        event.preventDefault()
        if (key.trim())
          void perform(() => saveKey(key.trim())).then((ok) => {
            if (ok) setKey('')
          })
      }}
    >
      <p className={css.secondary}>{t('sourceHint')}</p>
      <p role="status">{t(source.value.keyPresent ? 'sourceKeyPresent' : 'sourceNoKey')}</p>
      {source.value.uncertain ? <p role="alert">{t('sourceKeyUncertain')}</p> : null}
      <label htmlFor={id}>{t('sourceKey')}</label>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        maxLength={4096}
        value={key}
        onChange={(event) => {
          setKey(event.target.value)
        }}
      />
      <div className={css.actions}>
        <Button type="submit" disabled={busy || source.value.uncertain || !key.trim()}>
          {t('saveKey')}
        </Button>
        <Button
          variant="outline"
          disabled={busy || source.value.uncertain || !source.value.keyPresent}
          onClick={() => {
            void perform(() => saveKey(undefined))
          }}
        >
          {t('removeKey')}
        </Button>
        <a href="https://yuantoutao.com/developers" target="_blank" rel="noopener noreferrer">
          {t('applyKey')}
        </a>
      </div>
    </form>
  )
}
