/** Internal partner controls reuse retained resources and the existing settings layout. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CompanionStatus } from '@deepseek-ai/dsh-experimental-genesis-companion/types'
import css from './StatusPanel.module.css'

type Remote = TypertClientRemote['genesisCompanion']
/** Generated operator operations and navigation; the component never sees Cordis. */
export interface CompanionActions {
  save: Remote['save']; setToken: Remote['setToken']; begin: Remote['begin']; continueExchange: Remote['continueExchange']
  wake: Remote['wake']; stop: Remote['stop']
  refresh(this: void): void
  openSession(this: void, id: CompanionStatus['messages'][number]['sessionId']): void
}
function time(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
function minute(value: string): number { const [hour = '0', minutes = '0'] = value.split(':'); return Number(hour) * 60 + Number(minutes) }

/** Render sampled connection, sleep and relationship data without starting model work.
 * @param props - Framework resources, typed copy and explicit owner callbacks.
 * @returns Responsive settings and bounded internal history.
 */
export function CompanionPanel({ useResource, t, ...actions }: PropsRuntime<'settings.section'> & PropsLocale<'genesis.companion'> & InjectFace<CompanionActions>) {
  const resource = useResource<'genesis-companion'>('dsh-resource://genesis-companion/status')
  return <section className={css.panel}>
    <header className={css.header}><h3>{t('title')}</h3><Button variant="outline" onClick={actions.refresh}>{t('refresh')}</Button></header>
    <p>{t('description')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('unavailable')}</p> : null}
    {resource.value === undefined ? <div className={css.loading} role="status"><StateDot state="ongoing" /></div>
      : <Editor sample={resource.value} writable={resource.status === 'live'} t={t} {...actions} />}
  </section>
}
function Editor({ sample, writable, t, ...actions }: PropsLocale<'genesis.companion'> & CompanionActions & { sample: CompanionStatus; writable: boolean }) {
  const [draft, setDraft] = useState(() => structuredClone(sample.settings))
  const [revision, setRevision] = useState(sample.revision)
  const [token, setToken] = useState('')
  const [topic, setTopic] = useState('')
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const run = (work: (signal: AbortSignal) => Promise<RemoteResult<unknown>>) => {
    if (operation.current !== undefined) return
    const owned = new AbortController(); operation.current = owned; setPending(true)
    void Promise.resolve().then(() => work(owned.signal)).catch((_error: unknown) => { /* The shell-owned reporter retains the outcome. */ })
      .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
  }
  const disabled = pending || !writable
  const stale = revision !== sample.revision
  return <div className={css.editor}>
    <div role="status" aria-label={t('status')}>
      <Button variant="outline" disabled={sample.messages.length === 0 && sample.active === null} onClick={() => { actions.openSession(sample.sessionId) }}>{t('openSession')}</Button>
      <p>{t(sample.connected ? 'connected' : 'disconnected')} · {t('genesis')}: {t(sample.genesisAwake ? 'awake' : 'asleep')} · {t('partner')}: {t(sample.partnerAsleep ? 'asleep' : 'awake')}</p>
      <p>{t(sample.blocked === null ? 'ready' : `blocked.${sample.blocked}`)} · {t(sample.active === null ? 'idle' : 'active')}</p>
      {sample.failure !== null ? <p role="alert">{t('failure')}</p> : null}
    </div>
    <form className={css.naming} onSubmit={event => { event.preventDefault(); if (!stale) run(async signal => {
      const result = await actions.save(draft, revision, signal); if (result.ok) setRevision(result.value); return result
    }) }}>
      <fieldset className={css.modelFields} disabled={disabled}>
        <Checkbox label={t('enabled')} checked={draft.enabled} onChange={enabled => { setDraft(value => ({ ...value, enabled })) }} />
        <Checkbox label={t('interaction')} checked={draft.interactionEnabled} onChange={interactionEnabled => { setDraft(value => ({ ...value, interactionEnabled })) }} />
        <label className={css.minecraftField}>{t('endpoint')}<Input required value={draft.endpoint} onChange={event => { setDraft(value => ({ ...value, endpoint: event.target.value })) }} /></label>
        <label className={css.minecraftField}>{t('name')}<Input required maxLength={80} value={draft.name} onChange={event => { setDraft(value => ({ ...value, name: event.target.value })) }} /></label>
        <label className={css.minecraftField}>{t('rounds')}<Input required type="number" min={1} max={8} step={1} value={draft.maxRounds} onChange={event => { setDraft(value => ({ ...value, maxRounds: Number(event.target.value) })) }} /></label>
      </fieldset>
      <fieldset className={css.modelFields} disabled={disabled}>
        <legend>{t('sleep')}</legend>
        <Checkbox label={t('sleepEnabled')} checked={draft.sleepEnabled} onChange={sleepEnabled => { setDraft(value => ({ ...value, sleepEnabled })) }} />
        <label className={css.minecraftField}>{t('zone')}<Input required maxLength={80} value={draft.timeZone} onChange={event => { setDraft(value => ({ ...value, timeZone: event.target.value })) }} /></label>
        <label className={css.minecraftField}>{t('start')}<Input type="time" required value={time(draft.sleepStart)} onChange={event => { setDraft(value => ({ ...value, sleepStart: minute(event.target.value) })) }} /></label>
        <label className={css.minecraftField}>{t('end')}<Input type="time" required value={time(draft.sleepEnd)} onChange={event => { setDraft(value => ({ ...value, sleepEnd: minute(event.target.value) })) }} /></label>
        <p className={css.secondary}>{t('scheduleHint')}</p>
      </fieldset>
      {stale ? <p role="alert">{t('stale')} <Button type="button" variant="outline" onClick={() => { setDraft(structuredClone(sample.settings)); setRevision(sample.revision) }}>{t('reload')}</Button></p> : null}
      <div className={css.actions}><Button type="submit" disabled={disabled || stale}>{t('save')}</Button></div>
    </form>
    <form className={css.naming} onSubmit={event => { event.preventDefault(); run(async signal => {
      const result = await actions.setToken(token, signal); if (result.ok) setToken(''); return result
    }) }}>
      <label className={css.minecraftField}>{t('token')}<Input type="password" autoComplete="new-password" minLength={16} maxLength={4096} required value={token} disabled={disabled}
        onChange={event => { setToken(event.target.value) }} /></label>
      <p className={css.secondary}>{t(sample.tokenPresent ? 'tokenSaved' : 'tokenMissing')}</p>
      <div className={css.actions}><Button type="submit" disabled={disabled || token.length < 16}>{t('saveToken')}</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => { run(signal => actions.setToken(undefined, signal)) }}>{t('removeToken')}</Button></div>
    </form>
    <div className={css.actions}>
      <Button variant="outline" disabled={disabled} onClick={() => { run(signal => actions.wake('genesis', signal)) }}>{t('wakeGenesis')}</Button>
      <Button variant="outline" disabled={disabled} onClick={() => { run(signal => actions.wake('partner', signal)) }}>{t('wakePartner')}</Button>
      <Button variant="outline" disabled={!writable || sample.active === null} onClick={() => { run(signal => actions.stop(signal)) }}>{t('stop')}</Button>
    </div>
    <p className={css.secondary}>{t('wakeHint')}</p>
    <form className={css.naming} onSubmit={event => { event.preventDefault(); run(signal => actions.begin(topic, signal)) }}>
      <label className={css.minecraftField}>{t('topic')}<Input required maxLength={2000} value={topic} disabled={disabled} onChange={event => { setTopic(event.target.value) }} /></label>
      <div className={css.actions}><Button type="submit" disabled={disabled || sample.blocked !== null || sample.active !== null || !topic.trim()}
        title={sample.blocked === null ? undefined : t(`blocked.${sample.blocked}`)}>{t('begin')}</Button></div>
    </form>
  </div>
}
