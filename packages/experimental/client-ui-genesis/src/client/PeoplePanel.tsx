/** Operator browsing of retained people, sourced appraisals and explicit forgetting. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { PersonSummary } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RelationshipPanel, type RelationshipActions } from './RelationshipPanel.tsx'
import { RelationshipValues } from './RelationshipValues.tsx'
import css from './StatusPanel.module.css'
import emotionCss from './EmotionPanel.module.css'

/** Generated operator mutation and existing conversation navigation; no QQ tool authority is added. */
export interface PeopleActions {
  forget: TypertClientRemote['genesisPeople']['forget']
  openSession(this: void, id: SessionId): void
}
type Props = PropsRuntime<'genesis.page'> & PropsLocale<'genesis'> & InjectFace<PeopleActions & RelationshipActions>
/**
 * Browse bounded profile pages and retain the legacy operator editor separately.
 * @param props - Shared resources, authenticated mutations and localization.
 * @returns People page with evidence details; query failures never become an empty list.
 */
export function PeoplePanel(props: Props) {
  const { useResource, refresh, t } = props
  const [offset, setOffset] = useState(0)
  const [opened, setOpened] = useState<PersonSummary>()
  const resource = useResource<'genesis-people'>(`dsh-resource://genesis-people/catalog?offset=${offset}`)
  const value = resource.value
  return <section className={`${css.panel} ${emotionCss.content}`}>
    <header className={css.header}><h3>{t('peopleTitle')}</h3><Button variant="outline" onClick={refresh}>{t('refresh')}</Button></header>
    <p className={css.secondary}>{t('peopleDescription')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('peopleQueryFailed')}</p> : null}
    {resource.status === 'loading' && value === undefined ? <div className={css.loading} role="status" aria-label={t('peopleTitle')}><StateDot state="ongoing" /></div> : null}
    {value === undefined ? null : <>
      <p className={css.secondary}>{t('peopleCount', { count: value.total })}</p>
      {value.total === 0 ? <p>{t('peopleEmpty')}</p> : null}
      <ul className={css.records}>{value.items.map(person => <li key={person.id}>
        <div className={css.header}><h4>{person.name}</h4>{person.operator ? <span>{t('peopleOperator')}</span> : null}</div>
        <p className={css.secondary}>{t('peopleAccount', { account: person.accountId })} · {t('peopleEvidenceCount', { count: person.evidenceCount })}</p>
        <Button variant="outline" onClick={() => { setOpened(person) }}>{t('peopleDetails')}</Button>
      </li>)}</ul>
      <div className={css.actions}>
        <Button variant="outline" disabled={offset === 0} onClick={() => { setOffset(0) }}>{t('peopleFirst')}</Button>
        <Button variant="outline" disabled={value.nextOffset === null} onClick={() => { if (value.nextOffset !== null) setOffset(value.nextOffset) }}>{t('peopleNext')}</Button>
      </div>
    </>}
    <details><summary>{t('peopleLegacyOperator')}</summary><RelationshipPanel {...props} /></details>
    {opened === undefined ? null : <PersonDialog {...props} person={opened} close={() => { setOpened(undefined) }} />}
  </section>
}
function PersonDialog({ person, useResource, forget, openSession, refresh, close, t }: Props & { person: PersonSummary; close: () => void }) {
  const [offset, setOffset] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const resource = useResource<'genesis-person'>(`dsh-resource://genesis-person/detail?id=${encodeURIComponent(person.id)}&offset=${offset}`)
  const value = resource.value
  const current = value?.person ?? person
  return <Modal open title={current.name} closeLabel={t('close')} onClose={close}
    className={emotionCss.dialog!} contentClassName={emotionCss.dialogContent!}>
    <div className={`${css.editor} ${emotionCss.content}`}>
      <p>{t('peopleAccount', { account: current.accountId })}{current.operator ? ` · ${t('peopleOperator')}` : ''}</p>
      <p className={css.secondary}>{t('peoplePermissionHint')}</p>
      <RelationshipValues relationship={current.relationship} t={t} />
      <details><summary>{t('peopleIdentity')}</summary><p className={css.secondary}>{current.id}</p></details>
      <header className={css.header}><h4>{t('peopleEvidence')}</h4><Button variant="outline" onClick={refresh}>{t('refresh')}</Button></header>
      {resource.status === 'failed' ? <p role="alert">{t('peopleQueryFailed')}</p> : null}
      {resource.status === 'loading' && value === undefined ? <div className={css.loading} role="status" aria-label={t('peopleEvidence')}><StateDot state="ongoing" /></div> : null}
      {value === undefined ? null : <>
        {value.events.length === 0 ? <p>{t('peopleNoEvidence')}</p> : <ul className={css.records}>{value.events.map(event => <li key={event.id}>
          <div className={css.header}><span>{t(event.kind === 'migration' ? 'peopleMigration' : 'peopleAppraisal')}</span><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleString()}</time></div>
          {event.reason ? <p>{event.reason}</p> : null}{event.summary ? <p className={css.secondary}>{event.summary}</p> : null}
          <details><summary>{t('source')}</summary><ul className={css.records}>{event.sources.map(source => <li key={source.id}>
            <p className={css.secondary}>{source.id}{source.eventId === null ? '' : ` · #${source.eventId}`}</p>
            {source.sessionId === null ? null : <Button variant="outline" onClick={() => { openSession(source.sessionId!); close() }}>{t('peopleOpenSession')}</Button>}
          </li>)}</ul></details>
        </li>)}</ul>}
        <div className={css.actions}><Button variant="outline" disabled={offset === 0} onClick={() => { setOffset(0) }}>{t('peopleFirst')}</Button>
          <Button variant="outline" disabled={value.nextOffset === null} onClick={() => { if (value.nextOffset !== null) setOffset(value.nextOffset) }}>{t('peopleNext')}</Button></div>
      </>}
      <p className={css.secondary}>{t('peopleForgetHint')}</p>
      {confirming ? <>
        <p role="alert">{t('peopleForgetConfirm', { name: current.name })}</p>
        <div className={css.actions}><Button disabled={pending || resource.status !== 'live'} onClick={() => {
          if (operation.current !== undefined || resource.status !== 'live') return
          const owned = new AbortController(); operation.current = owned; setPending(true)
          void forget(current.id, current.updatedAt, owned.signal).then((result) => {
            if (!owned.signal.aborted && result.ok) { refresh(); close() }
          }).catch((_error: unknown) => { /* Shell feedback reports the outcome; failed deletion retains this profile. */ })
            .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
        }}>{t('peopleForget')}</Button><Button variant="outline" disabled={pending} onClick={() => { setConfirming(false) }}>{t('cancel')}</Button></div>
      </> : <Button variant="outline" disabled={resource.status !== 'live'} onClick={() => { setConfirming(true) }}>{t('peopleForget')}</Button>}
    </div>
  </Modal>
}
