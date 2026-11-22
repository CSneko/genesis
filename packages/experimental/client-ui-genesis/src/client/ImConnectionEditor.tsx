/** Operator settings and write-only credentials for one text channel. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ImChannel, ImChannelState, ImConnectionStatus } from '@deepseek-ai/dsh-experimental-genesis-qq/types'
import type { QqActions } from './QqPanel.tsx'
import css from './StatusPanel.module.css'
import emotionCss from './EmotionPanel.module.css'

const splitIds = (value: string) => [...new Set(value.split(/[,，\s]+/u).filter(Boolean))]
const draftOf = ({ connection, revision }: ImConnectionStatus) => ({
  ...connection, revision, allowChats: connection.allowChats.join(', '), allowUsers: connection.allowUsers.join(', '),
})

/**
 * Edit and apply the settings of one IM channel without navigating away.
 * @param props - Latest confirmed settings, status, localized labels and authenticated actions.
 * @returns Channel controls whose failed drafts stay visible.
 */
export function ImConnectionEditor({ channel, mode, sample, writable, saveImConnection, setImToken, refresh, t }:
  PropsLocale<'genesis'> & Pick<QqActions, 'saveImConnection' | 'setImToken' | 'refresh'> &
  { channel: ImChannel; mode: ImChannelState; sample: ImConnectionStatus; writable: boolean }) {
  const [draft, setDraft] = useState(() => draftOf(sample))
  const [token, editToken] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const settings = useRef<HTMLDetailsElement>(null)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])

  const label = t(channel === 'telegram' ? 'imTelegram' : 'imMatrix')
  const conflict = sample.revision > draft.revision
  const enabled = conflict ? sample.connection.enabled : draft.enabled
  const blocked = !writable || !sample.writable || pending || conflict
  const address = draft.homeserver.trim()
  const origin = URL.canParse(address) ? new URL(address).origin : address
  const changedOrigin = channel === 'matrix' && origin !== sample.connection.homeserver
  const tokenBlocked = channel === 'matrix' && (!sample.connection.homeserver || changedOrigin)
  const movesToken = changedOrigin && sample.tokenConfigured && !!sample.connection.homeserver
  const run = (task: (signal: AbortSignal) => Promise<boolean>) => {
    if (blocked || operation.current !== undefined) return
    const controller = new AbortController()
    operation.current = controller
    setPending(true)
    setFailed(false)
    void task(controller.signal).then((ok) => {
      if (!controller.signal.aborted) setFailed(!ok)
    }, (_error: unknown) => {
      if (!controller.signal.aborted) setFailed(true)
    }).finally(() => {
      operation.current = undefined
      if (!controller.signal.aborted) { setPending(false); refresh() }
    })
  }
  const toggle = () => {
    const next = !enabled
    if (next && channel === 'matrix' && !sample.connection.homeserver) {
      if (settings.current !== null) {
        settings.current.open = true
        settings.current.querySelector('input')?.focus()
      }
      return
    }
    run(async (signal) => {
      const result = await saveImConnection(channel, { ...sample.connection, enabled: next }, sample.revision, signal)
      if (result.ok && !signal.aborted) {
        setDraft(current => ({ ...current, enabled: next, revision: result.value }))
        if (next && !sample.tokenConfigured && settings.current !== null) settings.current.open = true
      }
      return result.ok
    })
  }

  return (
    <section className={css.sectionBlock} aria-label={label}>
      <div className={css.header}>
        <h4 className={css.imChannelTitle}>{label}</h4>
        <Button variant={enabled ? 'outline' : 'primary'} disabled={blocked || sample.revision !== draft.revision} onClick={toggle}>
          {t(enabled ? 'imDisable' : 'imEnabled', { channel: label })}
        </Button>
      </div>
      <p role="status" className={css.secondary}>{t(`imState.${mode}`)}</p>
      {!sample.writable ? <p role="alert">{t('imStorageFailure')}</p> : null}
      {mode === 'failed' ? <p className={css.secondary}>{t('imConnectionFailure')}</p> : null}
      {failed ? <p role="alert">{t('imSaveFailure')}</p> : null}
      {conflict ? <p role="alert">{t('imConflict')}</p> : null}
      <details ref={settings} className={css.editor}>
        <summary>{t('imPolicy', { channel: label })}</summary>
        <form className={css.editor} onSubmit={(event) => {
          event.preventDefault()
          if (movesToken || !event.currentTarget.reportValidity()) return
          run(async (signal) => {
            const result = await saveImConnection(channel, {
              enabled: draft.enabled, homeserver: draft.homeserver.trim(),
              allowChats: splitIds(draft.allowChats), allowUsers: splitIds(draft.allowUsers),
            }, draft.revision, signal)
            if (result.ok && !signal.aborted) setDraft(current => ({ ...current, revision: result.value }))
            return result.ok
          })
        }}>
          <fieldset className={css.modelFields} disabled={blocked} aria-label={t('imPolicy', { channel: label })}>
            {channel === 'matrix' ? (
              <label className={emotionCss.field}>{t('imHomeserver')}
                <Input type="url" value={draft.homeserver} required={enabled}
                  onChange={(event) => {
                    const homeserver = event.target.value
                    setDraft(current => ({ ...current, homeserver }))
                    editToken('')
                  }} />
              </label>
            ) : null}
            <label className={emotionCss.field}>{t(channel === 'matrix' ? 'imRooms' : 'imChats')}
              <Input value={draft.allowChats} onChange={(event) => {
                const allowChats = event.target.value; setDraft(current => ({ ...current, allowChats }))
              }} />
            </label>
            <label className={emotionCss.field}>{t('imUsers')}
              <Input value={draft.allowUsers} onChange={(event) => {
                const allowUsers = event.target.value; setDraft(current => ({ ...current, allowUsers }))
              }} />
            </label>
          </fieldset>
          <p className={css.secondary}>{t(movesToken ? 'imRemoveBeforeMove' : 'imAllowlistHint')}</p>
          <div className={css.actions}>
            <Button type="submit" disabled={blocked || movesToken}>{t('imApply')}</Button>
            <Button variant="outline" disabled={pending} onClick={() => {
              setDraft(draftOf(sample))
              editToken('')
              setFailed(false)
            }}>{t('imReload')}</Button>
          </div>
        </form>
        <form className={css.editor} onSubmit={(event) => {
          event.preventDefault()
          if (tokenBlocked || !event.currentTarget.reportValidity()) return
          run(async (signal) => {
            const result = await setImToken(channel, token, draft.revision, signal)
            if (result.ok && !signal.aborted) editToken('')
            return result.ok
          })
        }}>
          <p className={css.secondary}>{t(tokenBlocked ? 'imSaveHomeserverFirst' : sample.tokenConfigured ? 'qqTokenPresent' : 'qqTokenMissing')}</p>
          <label className={emotionCss.field}>{t(channel === 'telegram' ? 'imBotToken' : 'imAccessToken')}
            <Input type="password" autoComplete="new-password" required maxLength={4096}
              disabled={blocked || tokenBlocked} value={token} onChange={(event) => { editToken(event.target.value) }} />
          </label>
          <div className={css.actions}>
            <Button type="submit" disabled={blocked || tokenBlocked || token.length === 0}>{t('imSaveToken')}</Button>
            <Button variant="outline" disabled={blocked || !sample.tokenConfigured} onClick={() => {
              run(async (signal) => {
                const result = await setImToken(channel, undefined, draft.revision, signal)
                if (result.ok && !signal.aborted) editToken('')
                return result.ok
              })
            }}>{t('imRemoveToken')}</Button>
          </div>
        </form>
      </details>
    </section>
  )
}
