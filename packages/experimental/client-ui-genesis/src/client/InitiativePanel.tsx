/** Revision-fenced proactive policy and real Harness delivery receipts. @module */
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Button, Input, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { InitiativeSettings, InitiativeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

/** Real bounded status reads and persisted policy saves. */
export interface InitiativeActions {
  /** Omitted retains the combined view; registered Settings and main pages select their own content. */
  view?: 'settings' | 'activity'
  refresh(this: void): void
  saveSettings: TypertClientRemote['genesisInitiativeStatus']['saveSettings']
}

/**
 * Show active policy, trigger decisions and actual receipts, including unavailable channels.
 * @param props - Shared resource, generated actions and localized copy.
 * @returns A policy editor or delivery monitor that retains failed drafts and marks sampled status.
 */
export function InitiativePanel({
  useResource,
  saveSettings,
  refresh,
  view,
  t,
}: PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<InitiativeActions>) {
  const id = useId()
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [pages, setPages] = useState([0])
  const offset = pages.at(-1) ?? 0
  const params = new URLSearchParams({ query: search, offset: String(offset) })
  const resource = useResource<'genesis-initiative'>(`dsh-resource://genesis-initiative/status?${params}`)
  const sample = resource.value
  return (
    <section className={css.panel} aria-labelledby={`${id}-title`}>
      <header className={css.header}>
        <h3 id={`${id}-title`}>
          {t(view === 'settings' ? 'initiativePolicyTitle' : view === 'activity' ? 'outboxTitle' : 'initiativeTitle')}
        </h3>
        <Button variant="outline" onClick={refresh} disabled={resource.status === 'loading'}>
          {t('refresh')}
        </Button>
      </header>
      <p>{t('initiativeDescription')}</p>
      {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
      {sample === undefined ? (
        <p role="status">{t(resource.status === 'loading' ? 'working' : 'unavailable')}</p>
      ) : (
        <>
          <p role="status">{t(`initiativeMode.${sample.mode}`)}</p>
          <p className={css.secondary}>
            {t('initiativeSampled')}: <time dateTime={sample.sampledAt}>{new Date(sample.sampledAt).toLocaleString()}</time>
          </p>
          {sample.failure === null ? null : <p role="alert">{sample.failure.message}</p>}
          {view === 'settings' ? null : (
            <dl className={`${css.facts} ${css.sectionBlock}`}>
              <dt>{t('initiativeLastCheck')}</dt>
              <dd>{sample.lastCheckAt === null ? t('agencyNone') : new Date(sample.lastCheckAt).toLocaleString()}</dd>
              <dt>{t('initiativeNextCheck')}</dt>
              <dd>{sample.nextCheckAt === null ? t('agencyNone') : new Date(sample.nextCheckAt).toLocaleString()}</dd>
              {(Object.keys(sample.counts) as Array<keyof typeof sample.counts>).map(state => (
                <Fragment key={state}>
                  <dt>{t(`initiativeState.${state}`)}</dt>
                  <dd>{sample.counts[state]}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          {view === 'activity' ? null : sample.available && sample.settings !== null ? (
            <PolicyEditor sample={sample} settings={sample.settings} saveSettings={saveSettings} refresh={refresh} t={t} />
          ) : (
            <p>{t('initiativeUnavailable')}</p>
          )}
          {view === 'settings' ? null : (
            <>
              <section className={css.sectionBlock}>
                <h4>{t('initiativeChannels')}</h4>
                {sample.channels.length ? (
                  <ul>
                    {sample.channels.map(channel => (
                      <li key={channel.id}>
                        {channel.id} · {t(channel.idle ? 'agencyIdle' : 'agencyRunning')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('initiativeNoChannel')}</p>
                )}
                {sample.channelsOmitted ? <p>{t('omitted', { count: sample.channelsOmitted })}</p> : null}
              </section>
              <section className={css.sectionBlock}>
                <h4>{t('initiativeLatestMessage')}</h4>
                {sample.lastMessage === null ? (
                  <p>{t('initiativeNoSent')}</p>
                ) : (
                  <>
                    <p>{sample.lastMessage.message}</p>
                    <p>
                      {sample.lastMessage.sessionId} ·{' '}
                      {sample.lastMessage.sentAt === undefined ? (
                        t('agencyNone')
                      ) : (
                        <time dateTime={sample.lastMessage.sentAt}>{new Date(sample.lastMessage.sentAt).toLocaleString()}</time>
                      )}
                    </p>
                    {sample.lastMessageTruncated ? <p>{t('initiativeTruncated')}</p> : null}
                  </>
                )}
              </section>
              <section className={css.sectionBlock}>
                <h4>{t('initiativeHistory')}</h4>
                <form
                  className={css.search}
                  onSubmit={(event) => {
                    event.preventDefault()
                    setSearch(query.trim())
                    setPages([0])
                  }}
                >
                  <label htmlFor={`${id}-search`}>{t('outboxSearch')}</label>
                  <Input
                    id={`${id}-search`}
                    value={query}
                    maxLength={500}
                    onChange={(event) => {
                      setQuery(event.target.value)
                    }}
                  />
                  <Button type="submit">{t('search')}</Button>
                </form>
                {sample.records.length ? (
                  <ul className={css.records}>
                    {sample.records.map(({ record, triggerType, choice, messageTruncated }) => (
                      <li key={record.id}>
                        <div className={css.header}>
                          <strong>{t(`initiativeState.${record.status}`)}</strong>
                          <time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleString()}</time>
                        </div>
                        <p>
                          {t('initiativeTrigger')}: {record.key.startsWith('timer:') ? t('initiativeTimer') : t('initiativeEvent')} ·{' '}
                          {triggerType}
                        </p>
                        <p>
                          {t('initiativeChoice')}: {choice === null ? t('agencyNone') : t(`agencyChoice.${choice}`)}
                        </p>
                        {record.reason ? <p>{record.reason}</p> : null}
                        {record.note ? (
                          <p>
                            {t('initiativeNote')}: {record.note}
                          </p>
                        ) : null}
                        {record.message ? <p>{record.message}</p> : null}
                        {messageTruncated ? <p>{t('initiativeTruncated')}</p> : null}
                        {record.sentAt ? (
                          <p>
                            {t('initiativeSentAt')}: <time dateTime={record.sentAt}>{new Date(record.sentAt).toLocaleString()}</time>
                          </p>
                        ) : null}
                        <details>
                          <summary>{t('agencyEvidence')}</summary>
                          <p>
                            {t('source')}: {record.sourceEventId}
                          </p>
                          <p>
                            {t('initiativeTarget')}: {record.sessionId ?? t('agencyNone')}
                          </p>
                          <p>
                            {t('initiativeReceipt')}: {record.messageSeq ?? t('agencyNone')}
                          </p>
                        </details>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('initiativeNoHistory')}</p>
                )}
                <nav className={css.pagination} aria-label={t('initiativeHistory')}>
                  <Button
                    variant="outline"
                    disabled={pages.length === 1 || resource.status !== 'live'}
                    onClick={() => {
                      setPages(value => value.slice(0, -1))
                    }}
                  >
                    {t('recordsPrevious')}
                  </Button>
                  <span>{t('listPage', { page: pages.length })}</span>
                  <Button
                    variant="outline"
                    disabled={resource.status !== 'live' || sample.omitted === 0 || sample.records.length === 0}
                    onClick={() => {
                      setPages(value => [...value, offset + sample.records.length])
                    }}
                  >
                    {t('recordsNext')}
                  </Button>
                </nav>
              </section>
            </>
          )}
        </>
      )}
    </section>
  )
}

const durations = ['intervalMs', 'minSendIntervalMs', 'userIdleMs', 'maxPendingAgeMs'] as const
function draftOf(settings: InitiativeSettings) {
  return {
    ...settings,
    sessionId: settings.sessionId ?? '',
    intervalMs: String(settings.intervalMs / 1000),
    minSendIntervalMs: String(settings.minSendIntervalMs / 1000),
    userIdleMs: String(settings.userIdleMs / 1000),
    maxPendingAgeMs: String(settings.maxPendingAgeMs / 1000),
    maxPer24Hours: String(settings.maxPer24Hours),
    maxPending: String(settings.maxPending),
    eventImportance: String(settings.eventImportance),
  }
}

function PolicyEditor({
  sample,
  settings,
  saveSettings,
  refresh,
  t,
}: PropsLocale<'genesis'> &
  InitiativeActions & {
    sample: InitiativeStatus
    settings: InitiativeSettings
  }) {
  const id = useId()
  const [draft, setDraft] = useState(() => draftOf(settings))
  const [revision, setRevision] = useState(sample.revision)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [saved, setSaved] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  return (
    <form
      className={css.editor}
      onSubmit={(event) => {
        event.preventDefault()
        if (operation.current !== undefined || !event.currentTarget.reportValidity()) return
        const owned = new AbortController()
        operation.current = owned
        setPending(true)
        setFailure(undefined)
        setSaved(false)
        const sessionId = draft.sessionId.trim()
        const policy: InitiativeSettings = {
          enabled: draft.enabled,
          ...(sessionId ? { sessionId } : {}),
          intervalMs: Math.round(Number(draft.intervalMs) * 1000),
          minSendIntervalMs: Math.round(Number(draft.minSendIntervalMs) * 1000),
          userIdleMs: Math.round(Number(draft.userIdleMs) * 1000),
          maxPendingAgeMs: Math.round(Number(draft.maxPendingAgeMs) * 1000),
          maxPer24Hours: Number(draft.maxPer24Hours),
          maxPending: Number(draft.maxPending),
          eventImportance: Number(draft.eventImportance),
        }
        void saveSettings(policy, revision, owned.signal)
          .then((result) => {
            if (owned.signal.aborted) return
            if (result.ok) {
              setRevision(result.value)
              setSaved(true)
              refresh()
            } else setFailure(operationFailure(result.error, [], t('unknownError')))
          })
          .catch((error: unknown) => {
            if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
          })
          .finally(() => {
            operation.current = undefined
            if (!owned.signal.aborted) setPending(false)
          })
      }}
    >
      <fieldset className={css.modelFields} disabled={pending}>
        <legend>{t('initiativeSettings')}</legend>
        <Switch
          label={t('initiativeEnabled')}
          checked={draft.enabled}
          onChange={(enabled) => {
            setDraft(value => ({ ...value, enabled }))
          }}
        />
        <p className={css.secondary}>{t('initiativePauseHint')}</p>
        <label htmlFor={`${id}-target`}>{t('initiativeTarget')}</label>
        <Input
          id={`${id}-target`}
          value={draft.sessionId}
          maxLength={300}
          list={`${id}-channels`}
          onChange={(event) => {
            setDraft(value => ({ ...value, sessionId: event.target.value }))
          }}
        />
        <datalist id={`${id}-channels`}>
          {sample.channels.map(channel => (
            <option key={channel.id} value={channel.id} />
          ))}
        </datalist>
        <p className={css.secondary}>{t('initiativeTargetHint')}</p>
        {durations.map(field => (
          <label key={field}>
            {t(`initiativeSetting.${field}`)}
            <Input
              type="number"
              required
              min={field === 'intervalMs' || field === 'maxPendingAgeMs' ? 1 : 0}
              max={field === 'maxPendingAgeMs' ? 604800 : 86400}
              step={0.001}
              value={draft[field]}
              onChange={(event) => {
                setDraft(value => ({ ...value, [field]: event.target.value }))
              }}
            />
          </label>
        ))}
        {(['maxPer24Hours', 'maxPending', 'eventImportance'] as const).map(field => (
          <label key={field}>
            {t(`initiativeSetting.${field}`)}
            <Input
              type="number"
              required
              min={field === 'eventImportance' ? 0 : 1}
              max={field === 'eventImportance' ? 1 : 100}
              step={field === 'eventImportance' ? 'any' : 1}
              value={draft[field]}
              onChange={(event) => {
                setDraft(value => ({ ...value, [field]: event.target.value }))
              }}
            />
          </label>
        ))}
        <div className={css.actions}>
          <Button type="submit">{t(pending ? 'working' : 'initiativeSave')}</Button>
          <Button
            variant="outline"
            onClick={() => {
              setDraft(draftOf(settings))
              setRevision(sample.revision)
              setFailure(undefined)
              setSaved(false)
            }}
          >
            {t('emotionReload')}
          </Button>
        </div>
      </fieldset>
      {failure ? <p role="alert">{failure}</p> : null}
      {saved ? <p role="status">{t('initiativeSaved')}</p> : null}
    </form>
  )
}
