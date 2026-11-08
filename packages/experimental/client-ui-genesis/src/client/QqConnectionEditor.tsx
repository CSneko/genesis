/** Nonsecret connection drafts and write-only OneBot credentials share the existing settings feedback. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { QqConnection, QqStatus } from '@deepseek-ai/dsh-experimental-genesis-qq/types'
import type { QqActions } from './QqPanel.tsx'
import css from './StatusPanel.module.css'
import emotionCss from './EmotionPanel.module.css'

/** Edit connection choices without copying credentials into status or policy records.
 * @param props - Current sample, localized labels and authenticated actions.
 * @returns Separate connection and credential forms that retain failed drafts. */
export function QqConnectionEditor({ sample, writable, saveConnection, setToken, refresh, t }: PropsLocale<'genesis'> &
  Pick<QqActions, 'saveConnection' | 'setToken' | 'refresh'> & { sample: QqStatus; writable: boolean }) {
  const [draft, setDraft] = useState(() => ({ connection: { ...sample.connection }, revision: sample.connectionRevision }))
  const [token, editToken] = useState('')
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const conflict = sample.connectionRevision > draft.revision
  const edit = <K extends keyof QqConnection,>(key: K, value: QqConnection[K]) => {
    setDraft(current => ({ ...current, connection: { ...current.connection, [key]: value } }))
  }
  const run = (task: (signal: AbortSignal) => Promise<unknown>) => {
    if (!writable || operation.current !== undefined) return
    const owned = new AbortController(); operation.current = owned; setPending(true)
    void task(owned.signal).catch((_error: unknown) => { /* Shell feedback owns failures; rejected drafts stay visible. */ })
      .finally(() => { operation.current = undefined; if (!owned.signal.aborted) { setPending(false); refresh() } })
  }
  return <div className={css.editor}>
    <form className={css.editor} onSubmit={(event) => {
      event.preventDefault()
      if (conflict || !event.currentTarget.reportValidity()) return
      run(async (signal) => {
        const result = await saveConnection(draft.connection, draft.revision, signal)
        if (result.ok && !signal.aborted) setDraft(current => ({ ...current, revision: result.value }))
      })
    }}>
      {conflict ? <p role="alert">{t('qqConflict')}</p> : null}
      <fieldset className={css.modelFields} disabled={pending || !writable}>
        <legend>{t('qqConnection')}</legend>
        <Checkbox label={t('qqConnectionEnabled')} checked={draft.connection.enabled} onChange={(value) => { edit('enabled', value) }} />
        <label className={emotionCss.field}>{t('qqEndpoint')}<Input value={draft.connection.wsUrl}
          onChange={(event) => { edit('wsUrl', event.target.value) }} /></label>
        <p className={css.secondary}>{t('qqEndpointHint')}</p>
        <label className={emotionCss.field}>{t('qqPort')}<Input type="number" required min={0} max={65535} step={1}
          value={draft.connection.port} onChange={(event) => { edit('port', Number(event.target.value)) }} /></label>
        <label className={emotionCss.field}>{t('qqBot')}<Input inputMode="numeric" pattern="[1-9][0-9]*" required={draft.connection.enabled}
          value={draft.connection.botQq} onChange={(event) => { edit('botQq', event.target.value) }} /></label>
        <p className={css.secondary}>{t('qqContactOperatorHint')}</p>
      </fieldset>
      <p className={css.secondary}>{t('qqConnectionHint')}</p>
      <div className={css.actions}>
        <Button type="submit" disabled={pending || !writable || conflict}>{t('qqConnectSave')}</Button>
        <Button variant="outline" disabled={pending} onClick={() => { setDraft({ connection: { ...sample.connection }, revision: sample.connectionRevision }) }}>{t('qqReloadConnection')}</Button>
      </div>
    </form>
    <form className={css.editor} onSubmit={(event) => {
      event.preventDefault()
      if (!event.currentTarget.reportValidity()) return
      run(async (signal) => { const result = await setToken(token, signal); if (result.ok && !signal.aborted) editToken('') })
    }}>
      <label className={emotionCss.field}>{t('qqToken')}<Input type="password" autoComplete="new-password" minLength={16} maxLength={4096}
        required disabled={pending || !writable} value={token} onChange={(event) => { editToken(event.target.value) }} /></label>
      <p className={css.secondary}>{t('qqTokenHint')}</p>
      <div className={css.actions}>
        <Button type="submit" disabled={pending || !writable || token.length < 16}>{t('qqSaveToken')}</Button>
        <Button variant="outline" disabled={pending || !writable || !sample.tokenConfigured} onClick={() => {
          run(async (signal) => { const result = await setToken(undefined, signal); if (result.ok && !signal.aborted) editToken('') })
        }}>{t('qqRemoveToken')}</Button>
      </div>
    </form>
  </div>
}
