/** Independent short-lived memory policy, current summaries and explicit failure recovery. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TemporaryStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

type Remote = TypertClientRemote['genesisTemporary']
/** Generated operator mutations and shared-resource refresh. */
export interface TemporaryActions {
  save: Remote['save']
  forget: Remote['forget']
  retry: Remote['retry']
  setKey: Remote['setKey']
  refresh(this: void): void
}
/**
 * Edit the independent summary route without changing long-term memory settings.
 * @param props - Localized resource and cancellable operator actions.
 * @returns Current expiring summaries and version-fenced drafts.
 */
export function TemporaryMemoryPanel({
  useResource,
  t,
  ...actions
}: PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<TemporaryActions>) {
  const id = useId()
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [pages, setPages] = useState([0])
  const offset = pages.at(-1) ?? 0
  const params = new URLSearchParams({ query: search, offset: String(offset) })
  const policy = useResource<'genesis-temporary'>('dsh-resource://genesis-temporary/status')
  const resource = useResource<'genesis-temporary'>(`dsh-resource://genesis-temporary/status?${params}`)
  return (
    <section className={css.panel}>
      <header className={css.header}>
        <h3>{t('temporaryTitle')}</h3>
        <Button variant="outline" onClick={actions.refresh}>
          {t('refresh')}
        </Button>
      </header>
      <p className={css.secondary}>{t('temporaryDescription')}</p>
      <form
        className={css.search}
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(query.trim())
          setPages([0])
        }}
      >
        <label htmlFor={id}>{t('temporarySearch')}</label>
        <Input
          id={id}
          maxLength={500}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
        <Button type="submit">{t('search')}</Button>
      </form>
      {resource.status === 'failed' || policy.status === 'failed' ? <p role="alert">{t('temporaryUnavailable')}</p> : null}
      {policy.value === undefined ? (
        policy.status === 'loading' ? (
          <div role="status">
            <StateDot state="ongoing" />
          </div>
        ) : null
      ) : (
        <TemporaryEditor sample={policy.value} memories={resource.value} writable={policy.status === 'live'} t={t} {...actions} />
      )}
      <nav className={css.pagination} aria-label={t('temporaryTitle')}>
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
          disabled={resource.status !== 'live' || !resource.value?.omitted || !resource.value.memories.length}
          onClick={() => {
            const count = resource.value?.memories.length ?? 0
            if (count > 0) setPages(value => [...value, offset + count])
          }}
        >
          {t('recordsNext')}
        </Button>
      </nav>
    </section>
  )
}
function TemporaryEditor({
  sample,
  memories,
  writable,
  t,
  save,
  forget,
  retry,
  setKey,
  refresh,
}: PropsLocale<'genesis'> & TemporaryActions & { sample: TemporaryStatus; memories: TemporaryStatus | undefined; writable: boolean }) {
  const [draft, setDraft] = useState(() => structuredClone(sample.settings))
  const [revision, setRevision] = useState(sample.revision)
  const [key, setSecret] = useState('')
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
  const run = (action: (signal: AbortSignal) => Promise<RemoteResult<unknown>>) => {
    if (operation.current !== undefined || !writable) return
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    setFailure(undefined)
    setSaved(false)
    void Promise.resolve()
      .then(() => action(owned.signal))
      .then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) {
          setSaved(true)
          refresh()
        } else setFailure(operationFailure(result.error, [key], t('unknownError')))
      })
      .catch((error) => {
        if (!owned.signal.aborted) setFailure(operationFailure(error, [key], t('unknownError')))
      })
      .finally(() => {
        operation.current = undefined
        if (!owned.signal.aborted) setPending(false)
      })
  }
  const route = draft.summary
  return (
    <div className={css.editor}>
      <form
        className={`${css.naming} ${css.sectionBlock}`}
        onSubmit={(event) => {
          event.preventDefault()
          if (!event.currentTarget.reportValidity() || revision !== sample.revision) return
          run(async (signal) => {
            const result = await save(
              {
                ...draft,
                summary: draft.summary.kind === 'openai' ? { ...draft.summary, keyRef: 'GENESIS_TEMPORARY_API_KEY' } : draft.summary,
              },
              revision,
              signal,
            )
            if (result.ok && !signal.aborted) setRevision(result.value)
            return result
          })
        }}
      >
        <fieldset className={css.modelFields} disabled={pending || !writable}>
          <legend>{t('temporaryPolicy')}</legend>
          <Checkbox
            label={t('temporaryEnabled')}
            checked={draft.enabled}
            onChange={(enabled) => {
              setDraft(value => ({ ...value, enabled }))
            }}
          />
          <label>
            {t('temporaryIdle')}
            <Input
              type="number"
              min={1000}
              max={604800000}
              step={1000}
              required
              value={draft.idleMs}
              onChange={(event) => {
                setDraft(value => ({ ...value, idleMs: Number(event.target.value) }))
              }}
            />
          </label>
          <Checkbox
            label={t('inheritMemoryLlm')}
            checked={draft.inheritWriter === true}
            onChange={(inheritWriter) => {
              setDraft(value => ({ ...value, inheritWriter }))
            }}
          />
          {!draft.inheritWriter ? (
            <>
              <Checkbox
                label={t('useProvider')}
                checked={route.kind === 'provider'}
                onChange={(provider) => {
                  setDraft(value => ({
                    ...value,
                    summary: provider
                      ? { kind: 'provider', provider: '', model: '' }
                      : { kind: 'openai', url: '', model: '', keyRef: 'GENESIS_TEMPORARY_API_KEY' },
                  }))
                }}
              />
              <label>
                {t(route.kind === 'provider' ? 'providerId' : 'modelEndpoint')}
                <Input
                  required={draft.enabled}
                  type={route.kind === 'provider' ? 'text' : 'url'}
                  value={route.kind === 'provider' ? route.provider : route.url}
                  onChange={(event) => {
                    setDraft(value => ({
                      ...value,
                      summary:
                        route.kind === 'provider'
                          ? { ...route, provider: event.target.value }
                          : { ...route, url: event.target.value, keyRef: 'GENESIS_TEMPORARY_API_KEY' },
                    }))
                  }}
                />
              </label>
              <label>
                {t('modelId')}
                <Input
                  required={draft.enabled}
                  value={route.model}
                  onChange={(event) => {
                    setDraft(value => ({ ...value, summary: { ...route, model: event.target.value } }))
                  }}
                />
              </label>
            </>
          ) : null}
        </fieldset>
        <p className={css.secondary}>{t('temporaryModelHint')}</p>
        {revision !== sample.revision ? <p role="alert">{t('qqConflict')}</p> : null}
        <div className={css.actions}>
          <Button type="submit" disabled={pending || !writable || revision !== sample.revision}>
            {t('temporarySave')}
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft(structuredClone(sample.settings))
              setRevision(sample.revision)
              setFailure(undefined)
              setSaved(false)
            }}
          >
            {t('reloadConfiguration')}
          </Button>
        </div>
      </form>
      {!draft.inheritWriter && route.kind === 'openai' ? (
        <div className={css.naming}>
          <label>
            {t('temporaryKey')}
            <Input
              type="password"
              autoComplete="new-password"
              value={key}
              disabled={pending || !writable}
              onChange={(event) => {
                setSecret(event.target.value)
              }}
            />
          </label>
          <Button
            disabled={pending || !writable || !key}
            onClick={() => {
              run(async (signal) => {
                const result = await setKey(key, signal)
                if (result.ok && !signal.aborted) setSecret('')
                return result
              })
            }}
          >
            {t('saveKey')}
          </Button>
          <Button
            variant="outline"
            disabled={pending || !writable}
            onClick={() => {
              run(signal => setKey(undefined, signal))
            }}
          >
            {t('removeKey')}
          </Button>
        </div>
      ) : null}
      {failure === undefined ? null : <p role="alert">{failure}</p>}
      {saved ? <p role="status">{t('temporarySaved')}</p> : null}
      {sample.failure === null ? null : <p role="alert">{t('temporaryFailure', { reason: sample.failure })}</p>}
      {sample.failures.map(item => (
        <div className={css.sectionBlock} key={item.sessionId}>
          <p role="alert">{t('temporaryFailure', { reason: item.message ?? item.reason })}</p>
          <Button
            disabled={pending || !writable}
            onClick={() => {
              run(signal => retry(item.sessionId, signal))
            }}
          >
            {t('temporaryRetry')}
          </Button>
        </div>
      ))}
      {memories === undefined ? (
        <StateDot state="ongoing" />
      ) : (
        <section className={css.sectionBlock}>
          <h4>{t('temporaryCount', { count: memories.count })}</h4>
          {memories.count === 0 ? <p>{t('temporaryEmpty')}</p> : null}
          <ul className={css.records}>
            {memories.memories.map(memory => (
              <li key={memory.id}>
                <p>{memory.summary}</p>
                <p className={css.secondary}>{t('temporaryExpires', { time: new Date(memory.expiresAt).toLocaleString() })}</p>
                <Button
                  variant="outline"
                  disabled={pending || !writable}
                  onClick={() => {
                    run(signal => forget(memory.id, signal))
                  }}
                >
                  {t('temporaryRemove')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
