/** Edit the Desktop-owned Web listener settings without returning the saved key. */

import { useEffect, useState, type FormEvent } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopWebAccessBridge, DesktopWebAccessState } from '../types.ts'
import css from './DesktopWebAccessRow.module.css'

/** The shell bridge available only to the trusted Desktop window. */
interface DesktopWebAccessRowInjected {
  readonly webAccess: DesktopWebAccessBridge
}

/**
 * Show the pending and active Desktop Web listener configuration.
 * @param props Local Desktop transport and settings strings.
 * @returns General settings form for Web access.
 */
export function DesktopWebAccessRow({ webAccess, t }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<DesktopWebAccessRowInjected>) {
  const [saved, setSaved] = useState<DesktopWebAccessState>()
  const [enabled, setEnabled] = useState(false)
  const [port, setPort] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<'keyError' | 'portError' | 'ioError'>()
  useEffect(() => {
    let live = true
    void webAccess.get().then((state) => {
      if (!live) return
      setSaved(state)
      setEnabled(state.enabled)
      setPort(String(state.port))
    }, () => { if (live) setError('ioError') })
    return () => { live = false }
  }, [webAccess])

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const next = await webAccess.save({ enabled, port: Number(port), key })
      if (typeof next === 'string') { setError(next === 'key' ? 'keyError' : 'portError'); return }
      setSaved(next)
      setKey('')
    } catch (error) {
      console.error('Desktop Web access settings could not be saved', error)
      setError('ioError')
    }
    finally { setBusy(false) }
  }

  return <form aria-label={t('desktop.webAccess.title')} className={css.form} onSubmit={(event) => { void save(event) }}>
    <strong>{t('desktop.webAccess.title')}</strong>
    <div className={css.description}>{t('desktop.webAccess.description')}</div>
    <fieldset disabled={busy || saved === undefined} className={css.fields}>
      <label className={css.toggle}><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
        {t('desktop.webAccess.enabled')}</label>
      <label>{t('desktop.webAccess.port')}<input type="number" min={1} max={65535} required value={port}
        onChange={event => setPort(event.target.value)} /></label>
      <label>{t('desktop.webAccess.key')}<input type="password" autoComplete="new-password" maxLength={1024}
        placeholder={saved?.hasKey ? t('desktop.webAccess.existingKey') : undefined}
        value={key} onChange={event => setKey(event.target.value)} /></label>
      <button type="submit">{t('desktop.webAccess.save')}</button>
    </fieldset>
    {saved?.activePort !== undefined && <div role="status">{t('desktop.webAccess.active', { port: String(saved.activePort) })}</div>}
    {saved?.restartRequired && <div role="status">{t('desktop.webAccess.restart')}</div>}
    {(error !== undefined || saved?.portUnavailable) && <div role="alert">{t(`desktop.webAccess.${error ?? 'portError'}`)}</div>}
  </form>
}
