/** Operator view of persistent motivations, life goals and explained choices. @module */
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { AgencyStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'
import recordsCss from './RecordsPanel.module.css'

/** Authenticated bounded agency reads and explicit operator controls. */
export interface AgencyActions {
  refresh(this: void): void
  setGoalStatus: TypertClientRemote['genesisAgency']['setGoalStatus']
  deliberate: TypertClientRemote['genesisAgency']['deliberate']
}
type Goal = AgencyStatus['goals'][number]

/**
 * Show sourced inclinations, persistent commitments and candidate comparisons without exposing private reasoning.
 * @param props - Shared resource hook, localized copy and authenticated actions.
 * @returns A wrapping Genesis goals view retaining its last sample and operator drafts on failure.
 */
export function AgencyPanel({ useResource, refresh, setGoalStatus, deliberate, t }: PropsRuntime<'genesis.page'> &
  PropsLocale<'genesis'> & InjectFace<AgencyActions>) {
  const id = useId()
  const resource = useResource<'genesis-agency'>('dsh-resource://genesis-agency/status')
  const sample = resource.value
  const [selection, setSelection] = useState('')
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const selected = sample?.sessions.find(item => item.id === (selection || sample.sessions.find(item => item.idle)?.id))
  return <section className={css.panel} aria-labelledby={`${id}-title`}>
    <header className={css.header}>
      <h3 id={`${id}-title`}>{t('agencyTitle')}</h3>
      <Button variant="outline" size="sm" onClick={refresh} disabled={resource.status === 'loading'}>{t('refresh')}</Button>
    </header>
    <p className={css.secondary}>{t('agencyDescription')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {resource.status === 'none' ? <p role="status">{t('unavailable')}</p> : null}
    {resource.status === 'loading' && sample === undefined
      ? <div className={css.loading} role="status" aria-label={t('agencyTitle')}><StateDot state="ongoing" /></div> : null}
    {sample === undefined ? null : <>
      {!sample.enabled ? <p role="status">{t('agencyDisabled')}</p> : null}
      <fieldset className={css.modelFields} disabled={!sample.enabled || pending}>
        <legend>{t('agencyDeliberate')}</legend>
        <p>{t('agencyDeliberateHint')}</p>
        <label htmlFor={`${id}-session`}>{t('agencySession')}</label>
        <select id={`${id}-session`} className={recordsCss.select} value={selected?.id ?? ''}
          onChange={(event) => { setSelection(event.target.value) }}>
          <option value="">{t('agencyChooseSession')}</option>
          {sample.sessions.map(item => <option key={item.id} value={item.id} disabled={!item.idle}>
            {item.id} · {t(item.idle ? 'agencyIdle' : 'agencyRunning')}
          </option>)}
        </select>
        {!sample.sessions.some(item => item.idle) ? <p>{t('agencyNoSession')}</p> : null}
        <div className={css.actions}><Button disabled={selected === undefined || !selected.idle} onClick={() => {
          if (selected === undefined || !selected.idle || operation.current !== undefined) return
          const owned = new AbortController(); operation.current = owned; setPending(true)
          void deliberate(selected.id, owned.signal).catch((_error: unknown) => {
            // The injected shell notice reports the failed operation independently of this page.
          }).finally(() => {
            if (operation.current === owned) operation.current = undefined
            if (!owned.signal.aborted) { setPending(false); refresh() }
          })
        }}>{t(pending ? 'working' : 'agencyRun')}</Button></div>
      </fieldset>
      <h4>{t('agencyMotivations')}</h4>
      {sample.motivations.length === 0 ? <p>{t('agencyNoMotivations')}</p> : <ul className={css.records}>
        {sample.motivations.map(item => <li key={item.id}>
          <div className={css.header}><strong>{item.content}</strong><span>{t(`agencyMotivation.${item.status}`)}</span></div>
          <p>{item.reason}</p>
          <label>{t('agencyStrength')}{' '}{item.currentStrength === null ? t('agencyHistorical') : `${Math.round(item.currentStrength * 100)}%`}
            {item.currentStrength === null ? null : <meter min={0} max={1} value={item.currentStrength} aria-label={t('agencyStrength')} />}</label>
          <details><summary>{t('agencyEvidence')}</summary>
            <p>{t('source')}: {item.sourceEventIds.join(', ')}</p>
            <p>{t('agencyRelatedInterests')}: {item.interestIds.join(', ') || t('agencyNone')}</p>
            <p>{t('agencyRelatedMemories')}: {item.memoryIds.join(', ') || t('agencyNone')}</p>
          </details>
        </li>)}
      </ul>}
      {sample.omitted.motivations ? <p>{t('omitted', { count: sample.omitted.motivations })}</p> : null}
      <h4>{t('agencyGoals')}</h4>
      {sample.goals.length === 0 ? <p>{t('agencyNoGoals')}</p> : <ul className={css.records}>
        {sample.goals.map(goal => <li key={goal.id}>
          <div className={css.header}><strong>{goal.content}</strong><span>{t(`agencyGoal.${goal.status}`)}</span></div>
          <p>{goal.reason}</p>
          <p className={css.secondary}>{t(`agencyOrigin.${goal.origin}`)} · {t('agencyPriority', { value: Math.round(goal.priority * 100) })}</p>
          <p>{t('agencyNext')}: {goal.nextAction}</p>
          <p className={css.secondary}>{t('agencyFailures', { count: goal.failures })}</p>
          <details><summary>{t('agencyGoalHistory')}</summary>
            <p>{t('source')}: {goal.sourceEventIds.join(', ')}</p>
            <p>{t('agencyRelatedMemories')}: {goal.memoryIds.join(', ') || t('agencyNone')}</p>
            <ul>{goal.history.map((entry, index) => <li key={`${entry.decisionId}:${index}`}>
              <time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
              <span>{t(`agencyGoal.${entry.status}`)} · {t(entry.actor === 'operator' ? 'agencyOperator' : entry.actor === 'application' ? 'agencyApplication' : 'agencyCharacter')}</span>
              <p>{entry.reason}</p><p>{entry.nextAction}</p>
            </li>)}</ul>
            {goal.historyOmitted ? <p>{t('omitted', { count: goal.historyOmitted })}</p> : null}
          </details>
          {sample.enabled && (goal.status === 'active' || goal.status === 'paused')
            ? <GoalControls goal={goal} revision={sample.revision} setGoalStatus={setGoalStatus} refresh={refresh} t={t} /> : null}
        </li>)}
      </ul>}
      {sample.omitted.goals ? <p>{t('omitted', { count: sample.omitted.goals })}</p> : null}
      <h4>{t('agencyDecisions')}</h4>
      {sample.decisions.length === 0 ? <p>{t('agencyNoDecisions')}</p> : <ul className={css.records}>
        {sample.decisions.map(item => <li key={item.id}>
          <div className={css.header}><span>{t(`agencyChoice.${item.candidates[item.selected]?.disposition ?? 'wait'}`)}</span>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div>
          <p>{item.reason}</p><p>{item.candidates[item.selected]?.action}</p>
          <p className={css.secondary}>{t(`agencyOutcome.${item.outcome.status}`)}</p>
          <details><summary>{t('agencyCandidates')}</summary>
            <p>{t('source')}: {item.sourceEventIds.join(', ')}</p>
            <p>{t('agencyLinkedGoals')}: {item.goalIds.join(', ') || t('agencyNone')}</p>
            <p>{t('agencyOutcomeEvidence')}: {item.outcome.sourceEventIds.join(', ') || t('agencyNone')}</p>
            <ul>{item.candidates.map((candidate, index) => <li key={index}>
              <span>{t(`agencyChoice.${candidate.disposition}`)}{index === item.selected ? ` · ${t('agencySelected')}` : ''}</span>
              <p>{candidate.action}</p><p>{candidate.reason}</p>
              <dl className={css.facts}>{(Object.keys(candidate.factors) as Array<keyof typeof candidate.factors>).map(factor =>
                <Fragment key={factor}><dt>{t(`agencyFactor.${factor}`)}</dt><dd>{Math.round(candidate.factors[factor] * 100)}%</dd></Fragment>)}</dl>
            </li>)}</ul>
          </details>
        </li>)}
      </ul>}
      {sample.omitted.decisions ? <p>{t('omitted', { count: sample.omitted.decisions })}</p> : null}
      <p className={css.secondary}>{t('agencyCompletionHint')}</p>
    </>}
  </section>
}

function GoalControls({ goal, revision, setGoalStatus, refresh, t }: PropsLocale<'genesis'> & Pick<AgencyActions, 'setGoalStatus' | 'refresh'> & {
  goal: Goal
  revision: number
}) {
  const [editor, setEditor] = useState<{ status: 'active' | 'paused' | 'abandoned'; revision: number }>()
  const [reason, setReason] = useState('')
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  return editor === undefined ? <div className={css.actions}>
    <Button variant="outline" size="sm" onClick={() => { setEditor({ status: goal.status === 'active' ? 'paused' : 'active', revision }) }}>
      {t(goal.status === 'active' ? 'agencyPause' : 'agencyResume')}</Button>
    <Button variant="outline" size="sm" onClick={() => { setEditor({ status: 'abandoned', revision }) }}>{t('agencyAbandon')}</Button>
  </div> : <form className={css.editor} onSubmit={(event) => {
    event.preventDefault()
    if (!reason.trim() || operation.current !== undefined || !event.currentTarget.reportValidity()) return
    const owned = new AbortController(); operation.current = owned; setPending(true); setFailure(undefined)
    void setGoalStatus(goal.id, editor.status, editor.revision, reason, owned.signal).then((result) => {
      if (owned.signal.aborted) return
      if (result.ok) { setEditor(undefined); setReason('') }
      else setFailure(operationFailure(result.error, [], t('unknownError')))
    }).catch((error: unknown) => { if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError'))) })
      .finally(() => {
        if (operation.current === owned) operation.current = undefined
        if (!owned.signal.aborted) { setPending(false); refresh() }
      })
  }}>
    <p>{t('agencyChangeTo', { status: t(`agencyGoal.${editor.status}`) })}</p>
    <Input aria-label={t('agencyReason')} required maxLength={800} value={reason} disabled={pending}
      onChange={(event) => { setReason(event.target.value) }} />
    {editor.revision !== revision ? <p role="status">{t('agencyStale')}</p> : null}
    {failure === undefined ? null : <p role="alert">{failure}</p>}
    <div className={css.actions}>
      <Button type="submit" disabled={pending || !reason.trim() || editor.revision !== revision}>{t(pending ? 'working' : 'agencySave')}</Button>
      <Button variant="outline" disabled={pending} onClick={() => { setEditor({ ...editor, revision }); setFailure(undefined) }}>{t('agencyReload')}</Button>
      <Button variant="outline" onClick={() => { operation.current?.abort(); operation.current = undefined; setPending(false); setEditor(undefined) }}>{t('close')}</Button>
    </div>
  </form>
}
