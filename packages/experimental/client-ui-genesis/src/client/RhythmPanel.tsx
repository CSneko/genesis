/** Operator sleep schedule, private thoughts and bounded activity controls. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SleepStatus, SpontaneityStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import css from './StatusPanel.module.css'

type Remote = TypertClientRemote['genesisRhythm']
/** Authenticated owner operations; no model tool calls are forged. */
export interface RhythmActions {
  saveSleep: Remote['saveSleep']
  wake: Remote['wake']
  saveSpontaneity: Remote['saveSpontaneity']
  stop: Remote['stop']
  retry: Remote['retry']
  refresh(this: void): void
}
function time(value: number): string {
  return `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
function minute(value: string): number {
  const [hour = '0', minutes = '0'] = value.split(':')
  return Number(hour) * 60 + Number(minutes)
}
function date(value: number): string {
  return new Date(value).toLocaleString(undefined, { timeZone: 'Asia/Shanghai' })
}
function useOperation() {
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  const run = (work: (signal: AbortSignal) => Promise<RemoteResult<unknown>>) => {
    if (operation.current !== undefined) return
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    void Promise.resolve()
      .then(() => work(owned.signal))
      .catch((_error: unknown) => {
        /* The shell-owned mutation reporter retains the failure. */
      })
      .finally(() => {
        operation.current = undefined
        if (!owned.signal.aborted) setPending(false)
      })
  }
  return { pending, run }
}
/** Read a shared, retained operator sample for one settings or daily-use surface.
 * @param props - Standard resource, locale and explicit owner callbacks.
 * @returns Sleep or thought controls without blanking retained data after a refresh failure.
 */
export function RhythmPanel({
  useResource,
  t,
  view,
  ...actions
}: PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<RhythmActions & { view: 'sleep' | 'thoughts' }>) {
  const resource = useResource<'genesis-rhythm'>('dsh-resource://genesis-rhythm/status')
  const sample = resource.value
  return (
    <section className={css.panel}>
      <header className={css.header}>
        <h3>{t(view === 'sleep' ? 'sleepTitle' : 'thoughtsTitle')}</h3>
        <Button variant="outline" onClick={actions.refresh}>
          {t('refresh')}
        </Button>
      </header>
      {resource.status === 'failed' ? <p role="alert">{t('rhythmUnavailable')}</p> : null}
      {sample === undefined ? (
        <div className={css.loading} role="status">
          <StateDot state="ongoing" />
        </div>
      ) : view === 'sleep' ? (
        sample.sleep === null ? (
          <p>{t('rhythmDisabled')}</p>
        ) : (
          <SleepEditor sample={sample.sleep} writable={resource.status === 'live'} t={t} {...actions} />
        )
      ) : sample.spontaneity === null ? (
        <p>{t('rhythmDisabled')}</p>
      ) : (
        <ThoughtEditor sample={sample.spontaneity} writable={resource.status === 'live'} t={t} {...actions} />
      )}
    </section>
  )
}
const days = ['sleepMonday', 'sleepTuesday', 'sleepWednesday', 'sleepThursday', 'sleepFriday', 'sleepSaturday', 'sleepSunday'] as const
function SleepEditor({
  sample,
  writable,
  t,
  ...actions
}: PropsLocale<'genesis'> & RhythmActions & { sample: SleepStatus; writable: boolean }) {
  const [draft, setDraft] = useState(() => structuredClone(sample.settings))
  const [revision, setRevision] = useState(sample.revision)
  const { pending, run } = useOperation()
  const stale = revision !== sample.revision
  return (
    <div className={css.editor}>
      <div role="status">
        <p>{t('sleepBacklog', { count: sample.backlog.pending, uncertain: sample.backlog.uncertain })}</p>
        <strong>{t(`sleepMode.${sample.mode}`)}</strong>
        {sample.current === null ? null : <p>{t('sleepUntil', { time: date(sample.current.end) })}</p>}
        {sample.next === null ? null : <p>{t('sleepNext', { time: date(sample.next.start) })}</p>}
        {sample.temporaryUntil === null ? null : <p>{t('sleepTemporaryUntil', { time: date(sample.temporaryUntil) })}</p>}
      </div>
      <div className={css.actions}>
        <Button
          disabled={pending || !writable}
          onClick={() => {
            run(signal => actions.wake('temporary', signal))
          }}
        >
          {t('sleepWake')}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !writable}
          onClick={() => {
            run(signal => actions.wake('keep-awake', signal))
          }}
        >
          {t('sleepKeepAwake')}
        </Button>
      </div>
      <p className={css.secondary}>{t('sleepExplanation')}</p>
      {!sample.calendarCovered ? <p role="alert">{t('sleepCalendarMissing')}</p> : null}
      <form
        className={css.naming}
        onSubmit={(event) => {
          event.preventDefault()
          if (!stale)
            run(async (signal) => {
              const result = await actions.saveSleep(draft, revision, signal)
              if (result.ok) setRevision(result.value)
              return result
            })
        }}
      >
        <fieldset className={css.modelFields} disabled={pending || !writable}>
          <legend>{t('sleepSchedule')}</legend>
          <Checkbox
            label={t('sleepEnabled')}
            checked={draft.enabled}
            onChange={(enabled) => {
              setDraft(value => ({ ...value, enabled }))
            }}
          />
          <Checkbox
            label={t('sleepHoliday')}
            checked={draft.holidayExempt}
            onChange={(holidayExempt) => {
              setDraft(value => ({ ...value, holidayExempt }))
            }}
          />
          <Checkbox
            label={t('sleepGreetings')}
            checked={draft.greetings}
            onChange={(greetings) => {
              setDraft(value => ({ ...value, greetings }))
            }}
          />
          <label>
            {t('sleepJitter')}
            <Input
              type="number"
              min={0}
              max={5}
              step={1}
              required
              value={draft.jitterMs / 60000}
              onChange={(event) => {
                setDraft(value => ({ ...value, jitterMs: Number(event.target.value) * 60000 }))
              }}
            />
          </label>
          <label>
            {t('sleepIdleMinutes')}
            <Input
              type="number"
              min={1}
              max={1440}
              step={1}
              required
              value={draft.temporaryIdleMs / 60000}
              onChange={(event) => {
                setDraft(value => ({ ...value, temporaryIdleMs: Number(event.target.value) * 60000 }))
              }}
            />
          </label>
          <label>
            {t('sleepExemptDates')}
            <Input
              value={draft.exemptDates.join(', ')}
              onChange={(event) => {
                const exemptDates = event.target.value.split(/[,，\s]+/u).filter(Boolean)
                setDraft(value => ({ ...value, exemptDates }))
              }}
            />
          </label>
          {draft.schedule.map((period, index) => (
            <div key={index} className={css.naming}>
              <div className={css.actions}>
                {days.map((label, day) => (
                  <Checkbox
                    key={label}
                    label={t(label)}
                    checked={period.days.includes(day + 1)}
                    onChange={(checked) => {
                      setDraft(value => ({
                        ...value,
                        schedule: value.schedule.map((row, i) =>
                          i !== index
                            ? row
                            : {
                              ...row,
                              days: checked ? [...row.days, day + 1] : row.days.filter(item => item !== day + 1),
                            },
                        ),
                      }))
                    }}
                  />
                ))}
              </div>
              <div className={css.actions}>
                <label>
                  {t('sleepStart')}
                  <Input
                    type="time"
                    required
                    value={time(period.start)}
                    onChange={(event) => {
                      const start = minute(event.target.value)
                      setDraft(value => ({ ...value, schedule: value.schedule.map((row, i) => (i === index ? { ...row, start } : row)) }))
                    }}
                  />
                </label>
                <label>
                  {t('sleepEnd')}
                  <Input
                    type="time"
                    required
                    value={time(period.end)}
                    onChange={(event) => {
                      const end = minute(event.target.value) || 1440
                      setDraft(value => ({ ...value, schedule: value.schedule.map((row, i) => (i === index ? { ...row, end } : row)) }))
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setDraft(value => ({ ...value, schedule: value.schedule.filter((_, i) => i !== index) }))
                  }}
                >
                  {t('sleepRemovePeriod')}
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={draft.schedule.length >= 28}
            onClick={() => {
              setDraft(value => ({ ...value, schedule: [...value.schedule, { days: [1, 2, 3, 4, 5], start: 540, end: 720 }] }))
            }}
          >
            {t('sleepAddPeriod')}
          </Button>
        </fieldset>
        {stale ? <p role="alert">{t('qqConflict')}</p> : null}
        <div className={css.actions}>
          <Button type="submit" disabled={pending || !writable || stale}>
            {t('sleepSave')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft(structuredClone(sample.settings))
              setRevision(sample.revision)
            }}
          >
            {t('reloadConfiguration')}
          </Button>
        </div>
      </form>
      <h4>{t('sleepMemory')}</h4>
      {sample.cycles.length ? (
        <ul className={css.records}>
          {sample.cycles.map(cycle => (
            <li key={cycle.id}>
              <p>
                {date(cycle.from)} — {date(cycle.until)}
              </p>
              <p>
                {t(`sleepCycle.${cycle.stage}`)} · {t('sleepMemoryProgress', { count: cycle.pendingCount, batches: cycle.batch })}
              </p>
              {cycle.failure === null ? null : <p role="alert">{cycle.failure}</p>}
              {cycle.stage !== 'failed' ? null : (
                <Button
                  disabled={pending || !writable}
                  onClick={() => {
                    run(signal => actions.retry(cycle.id, signal))
                  }}
                >
                  {t('temporaryRetry')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('sleepNoCycles')}</p>
      )}
      {sample.cyclesOmitted ? <p>{t('omitted', { count: sample.cyclesOmitted })}</p> : null}
      {sample.failure === null ? null : <p role="alert">{sample.failure}</p>}
    </div>
  )
}
const budgetFields = [
  ['idleMs', 'thoughtIdle'],
  ['maxDurationMs', 'thoughtDuration'],
  ['maxOutputTokens', 'thoughtTokens'],
  ['maxPer24Hours', 'thoughtDaily'],
] as const
function ThoughtEditor({
  sample,
  writable,
  t,
  ...actions
}: PropsLocale<'genesis'> & RhythmActions & { sample: SpontaneityStatus; writable: boolean }) {
  const [draft, setDraft] = useState(sample.settings)
  const [revision, setRevision] = useState(sample.revision)
  const [query, setQuery] = useState('')
  const { pending, run } = useOperation()
  return (
    <div className={css.editor}>
      <p role="status">{t(sample.working ? 'thoughtRunning' : sample.enabled ? 'thoughtReady' : 'thoughtPaused')}</p>
      <p className={css.secondary}>{t('thoughtDescription')}</p>
      <Button
        variant="outline"
        disabled={pending || !writable || !sample.working}
        onClick={() => {
          run(signal => actions.stop(signal))
        }}
      >
        {t('thoughtStop')}
      </Button>
      <form
        className={css.naming}
        onSubmit={(event) => {
          event.preventDefault()
          if (revision === sample.revision)
            run(async (signal) => {
              const result = await actions.saveSpontaneity(draft, revision, signal)
              if (result.ok) setRevision(result.value)
              return result
            })
        }}
      >
        <fieldset className={css.modelFields} disabled={pending || !writable}>
          <legend>{t('thoughtBudgets')}</legend>
          <Checkbox
            label={t('thoughtEnabled')}
            checked={draft.enabled}
            onChange={(enabled) => {
              setDraft(value => ({ ...value, enabled }))
            }}
          />
          {budgetFields.map(([field, label]) => (
            <label key={field}>
              {t(label)}
              <Input
                type="number"
                min={field === 'idleMs' ? 0 : field === 'maxOutputTokens' ? 0.000001 : 1}
                step={field === 'maxOutputTokens' ? 0.000001 : 1}
                max={field === 'maxOutputTokens' ? Number.MAX_SAFE_INTEGER / 1000000 : undefined}
                required
                value={field === 'maxOutputTokens' ? draft[field] / 1000000 : draft[field]}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setDraft(previous => ({ ...previous, [field]: field === 'maxOutputTokens' ? Math.round(value * 1000000) : value }))
                }}
              />
            </label>
          ))}
        </fieldset>
        {revision !== sample.revision ? <p role="alert">{t('qqConflict')}</p> : null}
        <div className={css.actions}>
          <Button type="submit" disabled={pending || !writable || revision !== sample.revision}>
            {t('thoughtSave')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft(sample.settings)
              setRevision(sample.revision)
            }}
          >
            {t('reloadConfiguration')}
          </Button>
        </div>
      </form>
      <label>
        {t('thoughtSearch')}
        <Input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
      </label>
      <ul className={css.records}>
        {sample.items
          .filter(item => `${item.title} ${item.content}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          .map(item => (
            <li key={item.id}>
              <h4>{item.title}</h4>
              <p>{t(`thoughtState.${item.status}`)}</p>
              <p>{item.content}</p>
              <p className={css.secondary}>{item.reason}</p>
              <details>
                <summary>{t('thoughtEvidence')}</summary>
                <p>{item.id}</p>
                <p>{item.sourceEventIds.join('\n')}</p>
              </details>
            </li>
          ))}
      </ul>
      {!sample.items.length ? <p>{t('thoughtEmpty')}</p> : null}
      {sample.itemsOmitted ? <p>{t('omitted', { count: sample.itemsOmitted })}</p> : null}
      <h4>{t('thoughtHistory')}</h4>
      <ul className={css.records}>
        {sample.runs.map(row => (
          <li key={row.key}>
            <p>
              {date(row.createdAt)} · {t(`thoughtRun.${row.status}`)}
            </p>
            {row.note === undefined ? null : <p>{row.note}</p>}
          </li>
        ))}
      </ul>
      {sample.failure === null ? null : <p role="alert">{sample.failure}</p>}
    </div>
  )
}
/** Surface the shared sleep state only in Life conversations.
 * @param props - Standard Session/resource hooks, locale and authenticated controls.
 * @returns A compact status with explicit wake actions.
 */
export function SleepBanner({
  sessionId,
  useSessions,
  useResource,
  t,
  wake,
}: PropsRuntime<'conversation.input.dock'> & PropsLocale<'genesis'> & InjectFace<RhythmActions>) {
  const rhythm = useResource<'genesis-rhythm'>('dsh-resource://genesis-rhythm/status').value
  const sleep = rhythm?.sleep
  const preset = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
  const { pending, run } = useOperation()
  if (sleep == null || sleep.mode === 'awake' || rhythm === undefined || (rhythm.lifePreset !== null && rhythm.lifePreset !== preset))
    return null
  return (
    <div className={css.panel} role="status">
      <p>
        {t(`sleepMode.${sleep.mode}`)}
        {sleep.current === null ? '' : ` · ${t('sleepUntil', { time: date(sleep.current.end) })}`}
      </p>
      <div className={css.actions}>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            run(signal => wake('temporary', signal))
          }}
        >
          {t('sleepWake')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            run(signal => wake('keep-awake', signal))
          }}
        >
          {t('sleepKeepAwake')}
        </Button>
      </div>
    </div>
  )
}
