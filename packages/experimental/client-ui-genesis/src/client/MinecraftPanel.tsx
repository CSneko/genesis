/** Minecraft configuration retains operator drafts while live game status updates independently. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { MinecraftSettings, MinecraftStatus } from '@deepseek-ai/dsh-experimental-genesis-minecraft/types'
import css from './StatusPanel.module.css'

/** Generated Remote actions; credentials use the existing knowledge settings credential owner. */
export interface MinecraftActions {
  save: TypertClientRemote['genesisMinecraft']['save']
  disconnect: TypertClientRemote['genesisMinecraft']['disconnect']
  stop: TypertClientRemote['genesisMinecraft']['stop']
  credential(this: void, ref: string, value: string | undefined): Promise<RemoteResult<void>>
}
/**
 * Show sampled game status and independent Jev configuration in its own settings section.
 * @param props - Framework resource, locale and generated actions.
 * @returns A responsive form with an always-accessible stop control and retained failed drafts.
 */
export function MinecraftPanel({ useResource, t, ...actions }: PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<MinecraftActions>) {
  const resource = useResource<'genesis-minecraft'>('dsh-resource://genesis-minecraft/status')
  const sample = resource.value
  return <section className={css.panel}>
    <header className={css.header}><h3>{t('minecraftTitle')}</h3></header>
    <p>{t('minecraftDescription')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('minecraftUnavailable')}</p> : null}
    {sample === undefined ? resource.status === 'loading'
      ? <div className={css.loading} role="status" aria-label={t('minecraftTitle')}><StateDot state="ongoing" /></div>
      : null
      : <MinecraftEditor sample={sample} writable={resource.status === 'live'} t={t} {...actions} />}
  </section>
}
function MinecraftEditor({ sample, writable, t, ...actions }: PropsLocale<'genesis'> & MinecraftActions & { sample: MinecraftStatus; writable: boolean }) {
  const id = useId()
  const [draft, setDraft] = useState(() => ({ settings: { ...sample.settings }, revision: sample.revision }))
  const [pending, setPending] = useState(false)
  const [secret, setSecret] = useState('')
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const conflict = sample.revision > draft.revision
  const edit = <K extends keyof MinecraftSettings,>(key: K, value: MinecraftSettings[K]) => {
    setDraft(current => ({ ...current, settings: { ...current.settings, [key]: value } }))
  }
  const run = (task: (signal: AbortSignal) => Promise<unknown>) => {
    if (operation.current !== undefined) return
    const owned = new AbortController(); operation.current = owned; setPending(true)
    void task(owned.signal).catch((_error: unknown) => { /* Shell-owned actions report failures without discarding this draft. */ })
      .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
  }
  const settings = draft.settings
  return <div className={css.editor}>
    <p role="status">{t(`minecraftConnection.${sample.connection}`)} · {t(`minecraftMonitor.${sample.monitor}`)}</p>
    {sample.sessionId === null ? null : <p className={css.secondary}>{t('minecraftSession')}: <code>{sample.sessionId}</code></p>}
    {sample.task === null ? null : <p className={css.secondary}>{t('minecraftTask')}: {sample.task.goal} · {t(`minecraftTaskPhase.${sample.task.phase}`)} · {sample.task.step}/{sample.task.totalSteps}
      {sample.task.reason === null || (sample.task.phase !== 'blocked' && sample.task.phase !== 'failed') ? null : <> · {t('minecraftFailure', { code: sample.task.reason })}</>}</p>}
    {sample.failure === null ? null : <p role="alert">{t('minecraftFailure', { code: sample.failure })}</p>}
    <div className={css.actions}>
      <Button variant="outline" disabled={sample.connection === 'disconnected'}
        onClick={() => { void actions.stop(new AbortController().signal).catch((_error: unknown) => { /* Shell feedback owns errors. */ }) }}>{t('minecraftStop')}</Button>
      <Button variant="outline" disabled={sample.connection === 'disconnected'}
        onClick={() => { void actions.disconnect(new AbortController().signal).catch((_error: unknown) => { /* Shell feedback owns errors. */ }) }}>{t('minecraftDisconnect')}</Button>
    </div>
    {sample.observation === null ? null : <dl className={css.facts}>
      <dt>{t('minecraftHealth')}</dt><dd>{sample.observation.health} / 20</dd>
      <dt>{t('minecraftActivity')}</dt><dd>{sample.observation.action}</dd>
      <dt>{t('minecraftPosition')}</dt><dd>{Object.values(sample.observation.position).map(value => value.toFixed(1)).join(', ')}</dd>
    </dl>}
    {sample.image === null ? null : <img className={css.minecraftImage} src={sample.image} alt={t('minecraftView')} />}
    <form className={css.editor} onSubmit={(event) => {
      event.preventDefault()
      if (!event.currentTarget.reportValidity() || conflict || !writable) return
      run(async (signal) => {
        const result = await actions.save(settings, draft.revision, signal)
        if (result.ok && !signal.aborted) setDraft(current => ({ ...current, revision: result.value }))
      })
    }}>
      {conflict ? <p role="alert">{t('minecraftConflict')}</p> : null}
      <fieldset className={css.modelFields} disabled={pending || !writable}>
        <legend>{t('minecraftAccess')}</legend>
        <Checkbox checked={settings.enabled} label={t('minecraftEnabled')} onChange={(value) => { edit('enabled', value) }} />
        <p className={css.secondary}>{t('minecraftConnectionHint')}</p>
        <Checkbox checked={settings.vision} label={t('minecraftVision')} onChange={(value) => { edit('vision', value) }} />
      </fieldset>
      <fieldset className={css.modelFields} disabled={pending || !writable}>
        <legend>{t('minecraftJev')}</legend>
        <Checkbox checked={settings.jevEnabled} label={t('minecraftJevEnabled')} onChange={(value) => { edit('jevEnabled', value) }} />
        <Checkbox checked={settings.reuseKnowledge} label={t('minecraftReuseKnowledge')} onChange={(value) => { edit('reuseKnowledge', value) }} />
        <p className={css.secondary}>{t('minecraftKnowledgeHint')}</p>
        <label className={css.minecraftField}>{t('modelId')}<Input required value={settings.jevModel} onChange={(event) => { edit('jevModel', event.target.value) }} /></label>
        {settings.reuseKnowledge ? null : <>
          <label className={css.minecraftField}>{t('modelEndpoint')}<Input type="url" required value={settings.jevUrl} onChange={(event) => { edit('jevUrl', event.target.value) }} /></label>
          <label className={css.minecraftField}>{t('keyReference')}<Input required pattern="[A-Za-z_][A-Za-z0-9_]*" value={settings.jevKeyRef}
            onChange={(event) => { edit('jevKeyRef', event.target.value); setSecret('') }} /></label>
        </>}
        {(['intervalMs', 'timeoutMs', 'notificationIntervalMs', 'threshold', 'lowHealth', 'skillTimeoutMs'] as const).map(key => <label className={css.minecraftField} key={key}>
          {t(`minecraftField.${key}`)}<Input type="number" required value={settings[key]}
            min={key === 'threshold' || key === 'lowHealth' ? 0 : key === 'intervalMs' ? 250 : key === 'timeoutMs' ? 100 : 1000}
            max={key === 'threshold' ? 1 : key === 'lowHealth' ? 20 : key === 'intervalMs' ? 60000 : key === 'timeoutMs' ? 120000 : 300000}
            step={key === 'threshold' ? 0.01 : 1} onChange={(event) => { edit(key, Number(event.target.value)) }} /></label>)}
        <p className={css.secondary}>{t('minecraftFrequencyHint')}</p>
      </fieldset>
      <p className={css.secondary}>{t('minecraftSaveHint')}</p>
      <div className={css.actions}>
        <Button type="submit" disabled={pending || !writable || conflict}>{t('minecraftSave')}</Button>
        <Button variant="outline" disabled={pending} onClick={() => { setDraft({ settings: { ...sample.settings }, revision: sample.revision }); setSecret('') }}>{t('reloadConfiguration')}</Button>
      </div>
    </form>
    {settings.reuseKnowledge ? null : <form className={css.naming} onSubmit={(event) => {
      event.preventDefault()
      run(async () => { const result = await actions.credential(settings.jevKeyRef, secret); if (result.ok) setSecret('') })
    }}>
      <label className={css.minecraftField} htmlFor={`${id}-key`}>{t('decisionKey')}</label>
      <Input id={`${id}-key`} type="password" autoComplete="new-password" value={secret} disabled={pending || !writable}
        onChange={(event) => { setSecret(event.target.value) }} />
      <div className={css.actions}><Button type="submit" disabled={pending || !writable || !secret.trim()}>{t('saveKey')}</Button>
        <Button variant="outline" disabled={pending || !writable} onClick={() => { run(() => actions.credential(settings.jevKeyRef, undefined)) }}>{t('removeKey')}</Button></div>
    </form>}
  </div>
}
