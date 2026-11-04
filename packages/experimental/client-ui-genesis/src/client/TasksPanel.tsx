/** Read-only delegated-task monitoring; execution remains controlled by the original Session. @module */
import { useId, useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ManagedTaskCatalog } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { GenesisKey } from './locales.ts'
import css from './StatusPanel.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { 'genesis-tasks': ManagedTaskCatalog }
}
const states: Readonly<Record<string, GenesisKey>> = {
  running: 'taskState.running', background: 'taskState.background', stopping: 'taskState.stopping', stopped: 'taskState.stopped',
  completed: 'taskState.completed', failed: 'taskState.failed', error: 'taskState.error', aborted: 'taskState.aborted',
  interrupted: 'taskState.interrupted', queued: 'taskState.queued', 'pending-delivery': 'taskState.pending-delivery',
  canceled: 'taskState.canceled', 'not-started': 'taskState.not-started', unavailable: 'taskState.unavailable',
}

/** Authenticated reads and navigation supplied by the active Genesis integration. */
export interface TaskActions {
  refresh: () => void
  openSession: (id: SessionId) => void
}

/** Show actual task receipts and execution, retaining stale data on refresh failure.
 * @param props - Shared on-demand resource, locale and original-conversation navigation.
 * @returns A bounded, paged task list; this page never creates, resumes or retries work. */
export function TasksPanel({ useResource, refresh, openSession, t }: PropsRuntime<'genesis.page'> &
  PropsLocale<'genesis'> & InjectFace<TaskActions>) {
  const id = useId()
  const [offsets, setOffsets] = useState([0])
  const offset = offsets.at(-1) ?? 0
  const resource = useResource<'genesis-tasks'>(`dsh-resource://genesis-tasks/status?offset=${offset}`)
  const sample = resource.value
  return <section className={css.panel} aria-labelledby={id}>
    <header className={css.header}><h3 id={id}>{t('tasksTitle')}</h3>
      <Button variant="outline" size="sm" onClick={refresh} disabled={resource.status === 'loading'}>{t('refresh')}</Button></header>
    <p className={css.secondary}>{t('tasksDescription')}</p>
    {resource.status === 'loading' && sample === undefined
      ? <div className={css.loading} role="status" aria-label={t('tasksTitle')}><StateDot state="ongoing" /></div> : null}
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {resource.status === 'none' ? <p role="status">{t('tasksUnavailable')}</p> : null}
    {sample === undefined ? null : <>
      <p className={css.secondary}>{t('sampled')}: <time dateTime={sample.sampledAt}>{new Date(sample.sampledAt).toLocaleString()}</time></p>
      {sample.items.length === 0 ? <p>{t('tasksEmpty')}</p> : <ul className={css.records}>{sample.items.map(task => <li key={task.id}>
        <div className={css.header}><strong>{task.workspaceTitle}</strong>
          <span>{t(states[task.executionState] ?? 'taskState.unavailable')}</span></div>
        {!task.confirmed ? <p role="alert">{t('taskUnconfirmed')}</p> : null}
        <dl className={css.facts}>
          <dt>{t('taskMode')}</dt><dd>{task.mode}</dd>
          <dt>{t('taskTurn')}</dt><dd>{task.turn}</dd>
          <dt>{t('taskAttempts')}</dt><dd>{task.attempts}</dd>
          <dt>{t('taskActivity')}</dt><dd>{task.activeWork}</dd>
          <dt>{t('taskReceipt')}</dt><dd>{t(`taskDelivery.${task.delivery}`)}</dd>
        </dl>
        <div className={css.actions}><Button variant="outline" size="sm" disabled={!task.readable}
          onClick={() => { openSession(task.id) }}>{t('taskOpen')}</Button></div>
      </li>)}</ul>}
      <nav className={css.actions} aria-label={t('tasksTitle')}>
        <Button variant="ghost" disabled={offsets.length === 1 || resource.status === 'loading'}
          onClick={() => { setOffsets(values => values.slice(0, -1)) }}>{t('taskPrevious')}</Button>
        <Button variant="ghost" disabled={sample.nextOffset === null || resource.status === 'loading'}
          onClick={() => { const next = sample.nextOffset; if (next !== null) setOffsets(values => [...values, next]) }}>{t('taskNext')}</Button>
      </nav>
    </>}
  </section>
}
