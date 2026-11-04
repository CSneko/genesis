/** Sampled Genesis state and pending first-run naming on the Genesis overview. @module */
import { useId } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import css from './StatusPanel.module.css'
import { LifeSetupButton } from './Awakening.tsx'

/** Explicit user refresh action supplied by the registering plugin. */
export interface StatusActions {
  refresh(this: void): void
  /** Open the first life-mode conversation, or continue initialization after naming. */
  startConversation(this: void, signal: AbortSignal): Promise<boolean>
  /** Checks model and embedding configuration before naming the existing life. */
  initialize(this: void, name: string, signal: AbortSignal): Promise<boolean>
}
/** Derived Genesis section slot shares, locale and resource seat. */
export type StatusPanelProps = PropsRuntime<'genesis.page'> & PropsLocale<'genesis'> & InjectFace<StatusActions>

/**
 * Display real sampled identity, counts, capabilities and sourced history.
 * @param props - Framework resource hook, refresh action and typed dictionaries.
 * @returns Accessible, wrapping status section retaining its last sample on failure.
 */
export function StatusPanel({ useResource, refresh, initialize, startConversation, close, t }: StatusPanelProps) {
  const heading = useId()
  const resource = useResource<'genesis'>('dsh-resource://genesis/status')
  const status = resource.value
  return <section className={css.panel} aria-labelledby={heading}>
    <header className={css.header}>
      <h3 id={heading}>{t('title')}</h3>
      <Button variant="outline" size="sm" onClick={refresh} disabled={resource.status === 'loading'}>{t('refresh')}</Button>
    </header>
    {resource.status === 'loading' && status === undefined
      ? <div className={css.loading} role="status" aria-label={t('title')}><StateDot state="ongoing" /></div>
      : null}
    {resource.status === 'failed' ? <p role="alert" className={css.notice}>{t('failed')}</p> : null}
    {resource.status === 'none' ? <p role="status">{t('unavailable')}</p> : null}
    {status === undefined ? null : <>
      {status.setup?.phase === 'credentials' ? <p role="status">{t('configureFirst')}</p> : null}
      <LifeSetupButton t={t} setup={status.setup} initialize={initialize} startConversation={startConversation}
        refresh={refresh} done={close} />
      <p className={css.status}><StateDot state={resource.status === 'failed' ? 'warning' : 'done'} />
        {resource.status === 'failed' ? t('failed') : t('active')}
      </p>
      <dl className={css.facts}>
        <dt>{t('name')}</dt><dd>{status.identity.name ?? t('unnamed')}</dd>
        <dt>{t('lifeId')}</dt><dd><code>{status.identity.id}</code></dd>
        <dt>{t('born')}</dt><dd><time dateTime={status.identity.createdAt}>{new Date(status.identity.createdAt).toLocaleString()}</time></dd>
        <dt>{t('version')}</dt><dd>{status.identity.lifeCoreVersion}</dd>
        <dt>{t('sessions')}</dt><dd>{status.runtime.liveSessions}</dd>
        <dt>{t('sampled')}</dt><dd><time dateTime={status.sampledAt}>{new Date(status.sampledAt).toLocaleString()}</time></dd>
      </dl>
      <div className={css.counts}>
        <div><span>{t('events')}</span><strong>{status.counts.events}</strong></div>
        <div><span>{t('growth')}</span><strong>{status.counts.growth}</strong></div>
      </div>
      <h4>{t('capabilities')}</h4>
      <p className={css.secondary}>{t('permission')}</p>
      {status.capabilities.length === 0 ? <p>{t('noCapabilities')}</p> : <ul className={css.records}>
        {status.capabilities.map(({ sessionId, capability }) => <li key={`${sessionId}:${capability.id}`}>
          <code>{capability.id}</code><span className={css.secondary}>{sessionId}</span>
          <span>{t(capability.verification === 'succeeded' ? 'succeeded' : capability.verification === 'failed' ? 'toolFailed' : 'unverified')}</span>
        </li>)}
      </ul>}
      {status.omitted.capabilities > 0 ? <p>{t('omitted', { count: status.omitted.capabilities })}</p> : null}
      {status.interest === undefined ? null : <>
        <h4>{t('interestTitle')}</h4>
        <p className={css.secondary}>{t('interestDescription')}</p>
        {status.interest.review?.state === 'failed' ? <p role="alert" className={css.notice}>
          {t('interestReviewFailed', { reason: status.interest.review.failure.message })}</p> : null}
        {status.interest.entries.length === 0 ? <p>{t('interestEmpty')}</p> : <ul className={css.records}>
          {status.interest.entries.map(item => <li key={item.id}>
            <span>{item.topic} · {t(`interestStage.${item.stage}`)}</span>
            <p>{item.reason}</p>
            <span className={css.secondary}>{t('interestEvidence', { count: item.evidenceCount })}</span>
            <span className={css.secondary}>{t('source')}: {item.sourceEventIds.map(id => <code key={id}>{id} </code>)}</span>
          </li>)}
        </ul>}
        {status.interest.omitted > 0 ? <p>{t('omitted', { count: status.interest.omitted })}</p> : null}
        <h4>{t('interestHistory')}</h4>
        {status.interest.history.length === 0 ? <p>{t('interestHistoryEmpty')}</p> : <ul className={css.records}>
          {status.interest.history.map(item => <li key={item.id}>
            <span>{item.topic} · {t(`interestStage.${item.after}`)}</span>
            <p>{item.reason}</p>
            <time className={css.secondary} dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString()}</time>
            <span className={css.secondary}>{t('source')}: {item.sourceEventIds.map(id => <code key={id}>{id} </code>)}</span>
          </li>)}
        </ul>}
        {status.interest.historyOmitted > 0 ? <p>{t('omitted', { count: status.interest.historyOmitted })}</p> : null}
      </>}
      <h4>{t('growth')}</h4>
      {status.growth.length === 0 ? <p>{t('emptyGrowth')}</p> : <ul className={css.records}>
        {status.growth.map(record => <li key={record.id}>
          <span>{record.title}</span><p>{record.description}</p>
          <time className={css.secondary} dateTime={record.timestamp}>{new Date(record.timestamp).toLocaleString()}</time>
        </li>)}
      </ul>}
      {status.omitted.growth > 0 ? <p>{t('omitted', { count: status.omitted.growth })}</p> : null}
    </>}
    <p className={css.secondary}>{t('limitations')}</p>
  </section>
}
