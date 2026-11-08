/** Knowledge settings and credential editing. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { EmbeddingSettings, MemoryModelsSettings } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { operationFailure } from './operation-failure.ts'
import type { StatusActions } from './StatusPanel.tsx'
import { LifeSetupButton } from './Awakening.tsx'
import { ReviewSummary } from './ReviewNotice.tsx'
import { MemoryModels } from './MemoryModels.tsx'
import css from './StatusPanel.module.css'

/** Settings and authenticated operations supplied by the owning plugin. */
export interface KnowledgeActions extends StatusActions {
  /** Persist both independent routes as one revision. */
  saveModels(this: void, settings: MemoryModelsSettings, revision: number, signal: AbortSignal): Promise<RemoteResult<number>>
  /** Check the saved route without sending conversation evidence. */
  testModel(this: void, role: 'decision' | 'writer', signal: AbortSignal): Promise<RemoteResult<void>>
  /** Persist a revision-fenced endpoint edit. */
  save(this: void, settings: EmbeddingSettings, revision: number, signal: AbortSignal): Promise<RemoteResult<number>>
  /** Store or remove a secret through the credential store; never through settings. */
  credential(this: void, ref: string, value: string | undefined): Promise<RemoteResult<void>>
  /** Verify the currently saved endpoint and credential, with cancellation. */
  test(this: void, signal: AbortSignal): Promise<RemoteResult<void>>
  /** Download and verify the managed local decision runtime, then select it. */
  deployLocalDecision(this: void, revision: number, signal: AbortSignal): Promise<RemoteResult<number>>
  /** Stop or uninstall only the Genesis-owned runtime. */
  stopLocalDecision(this: void, revision: number, remove: boolean, signal: AbortSignal): Promise<RemoteResult<number>>
  refresh(this: void): void
}

type KnowledgeProps = PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<KnowledgeActions>
type EditorProps = PropsLocale<'genesis'> & Pick<InjectFace<KnowledgeActions>, 'save' | 'credential' | 'test' | 'refresh'> & {
  initial: EmbeddingSettings
  revision: number
  writable: boolean
  keyConfigured: boolean
  keyWritable: boolean
}

function editableSettings(settings: EmbeddingSettings): EmbeddingSettings {
  return { ...(settings.enabled === undefined ? {} : { enabled: settings.enabled }), url: settings.url, model: settings.model, dimensions: settings.dimensions,
    ...(settings.keyRef === undefined ? {} : { keyRef: settings.keyRef }) }
}

function EmbeddingEditor({ initial, revision, writable, keyConfigured, keyWritable, save, credential, test, refresh, t }: EditorProps) {
  const id = useId()
  const [draft, setDraft] = useState(() => editableSettings(initial))
  const [expanded, setExpanded] = useState(() => initial.enabled !== false && Boolean(initial.url || initial.model || initial.dimensions))
  const [fence, setFence] = useState(revision)
  const [secret, setSecret] = useState('')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'saved' | 'credentialSaved' | 'credentialRemoved' | 'tested'>()
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const run = async (action: () => Promise<RemoteResult<unknown>>, success: NonNullable<typeof outcome>) => {
    if (operation.current !== undefined) return
    const labels = { saved: 'saveConfiguration', credentialSaved: 'saveKey',
      credentialRemoved: 'removeKey', tested: 'testSaved' } as const
    const actionName = t(labels[success])
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    setOutcome(undefined)
    setFailure(undefined)
    try {
      const result = await action()
      if (!owned.signal.aborted) {
        if (result.ok) { setOutcome(success); refresh() }
        else setFailure(`${actionName}: ${operationFailure(result.error, [secret], t('unknownError'))}`)
      }
    } catch (error) {
      if (!owned.signal.aborted) setFailure(`${actionName}: ${operationFailure(error, [secret], t('unknownError'))}`)
    } finally {
      operation.current = undefined
      if (!owned.signal.aborted) setPending(false)
    }
  }
  const edit = (value: Partial<EmbeddingSettings>) => {
    setDraft(current => ({ ...current, ...value })); setOutcome(undefined); setFailure(undefined)
  }
  return <div className={css.editor}>
    <h4>{t('embeddingTitle')}</h4>
    <p className={css.secondary}>{t('embeddingDescription')}</p>
    {!writable ? <p role="status">{t('settingsUnavailable')}</p> : null}
    <form className={css.naming} onSubmit={(event) => {
      event.preventDefault()
      void run(async () => {
        const saved = await save(expanded ? { ...draft, url: draft.url.trim(), model: draft.model.trim() }
          : { enabled: false, url: '', model: '', dimensions: 0 }, fence,
        operation.current?.signal ?? AbortSignal.abort())
        if (saved.ok && operation.current?.signal.aborted === false) setFence(saved.value)
        return saved
      }, 'saved')
    }}>
      <Checkbox label={t('embeddingEnabled')} checked={expanded} disabled={pending || !writable}
        onChange={(enabled) => { setExpanded(enabled); edit({ enabled }) }} />
      {expanded ? <>
        <label htmlFor={`${id}-url`}>{t('embeddingUrl')}</label>
        <Input id={`${id}-url`} type="url" required value={draft.url} disabled={pending || !writable}
          onChange={(event) => { edit({ url: event.target.value }) }} />
        <label htmlFor={`${id}-model`}>{t('embeddingModel')}</label>
        <Input id={`${id}-model`} required value={draft.model} disabled={pending || !writable}
          onChange={(event) => { edit({ model: event.target.value }) }} />
        <label htmlFor={`${id}-dimensions`}>{t('embeddingDimensions')}</label>
        <Input id={`${id}-dimensions`} type="number" min={1} max={65536} step={1} required
          value={draft.dimensions || ''} disabled={pending || !writable}
          onChange={(event) => { edit({ dimensions: Number(event.target.value) }) }} />
        <Checkbox label={t('requiresKey')} checked={draft.keyRef !== undefined} disabled={pending || !writable}
          onChange={(checked) => {
            setDraft((current) => {
              const { keyRef: _key, ...rest } = current
              return checked ? { ...rest, keyRef: 'GENESIS_EMBEDDING_API_KEY' } : rest
            })
            setSecret('')
            setOutcome(undefined); setFailure(undefined)
          }} />
        {draft.keyRef === undefined ? null : <>
          <label htmlFor={`${id}-ref`}>{t('keyReference')}</label>
          <Input id={`${id}-ref`} required pattern="[A-Za-z_][A-Za-z0-9_]*" value={draft.keyRef}
            disabled={pending || !writable} onChange={(event) => { edit({ keyRef: event.target.value }); setSecret('') }} />
        </>}
      </> : null}
      <div className={css.actions}>
        <Button type="submit" disabled={pending || !writable}>{t('saveConfiguration')}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => {
          setDraft(editableSettings(initial)); setExpanded(initial.enabled !== false && Boolean(initial.url || initial.model || initial.dimensions)); setFence(revision); setSecret(''); setOutcome(undefined); setFailure(undefined)
        }}>{t('reloadConfiguration')}</Button>
        <Button type="button" variant="outline" disabled={pending || !expanded}
          onClick={() => { void run(() => test(operation.current?.signal ?? AbortSignal.abort()), 'tested') }}>{t('testSaved')}</Button>
      </div>
    </form>
    {!expanded || draft.keyRef === undefined ? null : <form className={css.naming} onSubmit={(event) => {
      event.preventDefault()
      const ref = draft.keyRef
      if (ref === undefined) return
      void run(async () => {
        const ok = await credential(ref, secret)
        if (ok.ok && operation.current?.signal.aborted === false) setSecret('')
        return ok
      }, 'credentialSaved')
    }}>
      <label htmlFor={`${id}-key`}>{t('apiKey')}</label>
      <p className={css.secondary}>{t(keyConfigured && draft.keyRef === initial.keyRef ? 'keyStored' : 'keyMissing')}</p>
      <Input id={`${id}-key`} type="password" autoComplete="new-password" required value={secret}
        disabled={pending || !keyWritable} onChange={(event) => {
          setSecret(event.target.value); setOutcome(undefined); setFailure(undefined)
        }} />
      <div className={css.actions}>
        <Button type="submit" disabled={pending || !keyWritable || !secret.trim()}>{t('saveKey')}</Button>
        <Button type="button" variant="outline" disabled={pending || !keyWritable}
          onClick={() => {
            const ref = draft.keyRef
            if (ref !== undefined) void run(() => credential(ref, undefined), 'credentialRemoved')
          }}>{t('removeKey')}</Button>
      </div>
    </form>}
    <p className={css.secondary}>{t('embeddingChange')}</p>
    {pending ? <p role="status">{t('working')}</p> : null}
    {failure === undefined ? null : <p role="alert">{t('operationFailed', { reason: failure })}</p>}
    {outcome === undefined ? null : <p role="status">{t(outcome)}</p>}
  </div>
}

/**
 * Render independent model routes and saved embedding settings on their configuration page.
 * @param props - Framework resources, live configuration and cancellable Host operations.
 * @returns A wrapping page retaining drafts and search results after recoverable failures.
 */
export function KnowledgePanel({ useResource, initialize, startConversation, close, saveModels, testModel,
  save, credential, test, refresh, deployLocalDecision, stopLocalDecision, t }: KnowledgeProps) {
  const id = useId()
  const resource = useResource<'genesis'>('dsh-resource://genesis/status')
  const status = resource.value
  return <section className={css.panel} aria-labelledby={`${id}-title`}>
    <header className={css.header}>
      <h3 id={`${id}-title`}>{t('knowledgeTitle')}</h3>
      <Button variant="outline" size="sm" onClick={() => {
        refresh()
      }}>{t('refresh')}</Button>
    </header>
    {resource.status === 'loading' && status === undefined
      ? <div className={css.loading} role="status" aria-label={t('knowledgeTitle')}><StateDot state="ongoing" /></div> : null}
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {resource.status === 'none' ? <p role="status">{t('unavailable')}</p> : null}
    <LifeSetupButton t={t} setup={status?.setup} initialize={initialize} startConversation={startConversation}
      refresh={refresh} done={close} />
    {status?.models === undefined ? null : <MemoryModels t={t} initial={status.models} writable={resource.status === 'live'}
      saveModels={saveModels} testModel={testModel} credential={credential} refresh={refresh}
      localStatus={status.localDecision} deployLocalDecision={deployLocalDecision} stopLocalDecision={stopLocalDecision} />}
    {status?.review === undefined ? null : <ReviewSummary review={status.review} t={t} />}
    {status?.embedding === undefined ? null : <EmbeddingEditor t={t}
      initial={status.embedding} revision={status.embedding.revision}
      writable={resource.status === 'live'}
      keyConfigured={status.embedding.keyConfigured} keyWritable={status.embedding.keyWritable}
      save={save} credential={credential} test={test} refresh={refresh} />}
  </section>
}
