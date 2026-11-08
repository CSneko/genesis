/** Independent reviewer and writer editors; secrets use the existing credential store. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemoryModelsSettings, LifeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { operationFailure } from './operation-failure.ts'
import type { KnowledgeActions } from './KnowledgePanel.tsx'
import css from './StatusPanel.module.css'

type Role = 'decision' | 'writer'
type Props = PropsLocale<'genesis'> & Pick<KnowledgeActions, 'saveModels' | 'testModel' | 'credential' | 'refresh' | 'deployLocalDecision' | 'stopLocalDecision'> & {
  initial: NonNullable<LifeStatus['models']>
  writable: boolean
  localStatus?: LifeStatus['localDecision']
}

/**
 * Edit captured routes together so one review never combines half of a configuration update.
 * @param props - Public settings, credential availability and cancellable Host actions.
 * @returns Two role-specific forms sharing one revision-fenced save.
 */
export function MemoryModels({ initial, writable, saveModels, testModel, credential, refresh, deployLocalDecision, stopLocalDecision, localStatus, t }: Props) {
  const id = useId()
  const copy = (): MemoryModelsSettings => ({ maxRetries: initial.maxRetries,
    writerInherit: initial.writerInherit, localDecision: initial.localDecision,
    decision: { ...(initial.configuredDecision ?? initial.decision) }, writer: { ...initial.writer } })
  const [draft, setDraft] = useState(copy)
  const [decisionExpanded, setDecisionExpanded] = useState(false)
  const [revision, setRevision] = useState(initial.revision)
  const [secrets, setSecrets] = useState({ decision: '', writer: '' })
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'modelsSaved' | 'modelTested' | 'credentialSaved' | 'credentialRemoved'>()
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const run = async (action: (signal: AbortSignal) => Promise<RemoteResult<unknown>>, success: NonNullable<typeof outcome>) => {
    if (operation.current !== undefined) return
    const labels = { modelsSaved: 'saveModels', credentialSaved: 'saveKey',
      credentialRemoved: 'removeKey', modelTested: 'checkSavedModel' } as const
    const actionName = t(labels[success])
    const owned = new AbortController()
    operation.current = owned
    setPending(true); setOutcome(undefined); setFailure(undefined)
    try {
      const result = await action(owned.signal)
      if (!owned.signal.aborted) {
        if (result.ok) { setOutcome(success); refresh() }
        else setFailure(`${actionName}: ${operationFailure(result.error, Object.values(secrets), t('unknownError'))}`)
      }
    } catch (error) {
      if (!owned.signal.aborted) setFailure(`${actionName}: ${operationFailure(error, Object.values(secrets), t('unknownError'))}`)
    } finally { operation.current = undefined; if (!owned.signal.aborted) setPending(false) }
  }
  const edit = (role: Role, route: MemoryModelsSettings[Role]) => {
    // Each caller preserves the role's protocol; the role-specific branch below constructs new protocol choices.
    setDraft(current => role === 'decision'
      ? { ...current, decision: route }
      : route.kind === 'jev' ? current : { ...current, writer: route })
    setOutcome(undefined); setFailure(undefined)
  }
  return <div className={css.editor}>
    <h4>{t('memoryModelsTitle')}</h4>
    <p className={css.secondary}>{t('memoryModelsDescription')}</p>
    <form className={css.naming} onSubmit={(event) => {
      event.preventDefault()
      void run(async (signal) => {
        const saved = await saveModels(draft, revision, signal)
        if (saved.ok && !signal.aborted) setRevision(saved.value)
        return saved
      }, 'modelsSaved')
    }}>
      {(['writer', 'decision'] as const).map((role) => {
        const route = draft[role]
        const prefix = `${id}-${role}`
        return <fieldset className={css.modelFields} key={role} disabled={pending || !writable}>
          <legend>{t(role === 'decision' ? 'decisionTitle' : 'writerTitle')}</legend>
          <p className={css.secondary}>{t(role === 'decision' ? 'decisionDescription' : 'writerDescription')}</p>
          {role === 'writer' ? <Checkbox label={t('inheritDshLlm')} checked={draft.writerInherit === true} onChange={(writerInherit) => {
            setDraft(current => ({ ...current, writerInherit })); setOutcome(undefined); setFailure(undefined)
          }} /> : <>
            <div className={css.actions}>
              <Button type="button" variant="outline" onClick={() => {
                setDecisionExpanded(true); setDraft(current => ({ ...current, localDecision: false }))
              }}>{t('cloudDecision')}</Button>
              <Button type="button" variant="outline" onClick={() => {
                void run(async (signal) => {
                  const result = await deployLocalDecision(revision, signal)
                  if (result.ok && !signal.aborted) { setRevision(result.value); setDraft(current => ({ ...current, localDecision: true })) }
                  return result
                }, 'modelsSaved')
              }}>{t('deployLocalDecision')}</Button>
            </div>
            <p className={css.secondary}>{t('localDecisionHint')}</p>
            <p role="status">{t(initial.localDecision ? 'usingLocalDecision' : 'usingCloudDecision')}</p>
            {localStatus === undefined ? null : <p role="status">{t(`localDecisionPhase.${localStatus.phase}`)}</p>}
            {localStatus?.phase === 'idle' || localStatus === undefined ? null : <div className={css.actions}>
              {([false, true] as const).map(remove => <Button key={String(remove)} type="button" variant="outline" onClick={() => {
                void run(async (signal) => {
                  const result = await stopLocalDecision(revision, remove, signal)
                  if (result.ok && !signal.aborted) { setRevision(result.value); setDraft(current => ({ ...current, localDecision: false })) }
                  return result
                }, 'modelsSaved')
              }}>{t(remove ? 'uninstallLocalDecision' : 'stopLocalDecision')}</Button>)}
            </div>}
          </>}
          {role === 'writer' && draft.writerInherit ? <p className={css.secondary}>{initial.writer.model}</p> : null}
          {(role === 'writer' ? !draft.writerInherit : decisionExpanded && !draft.localDecision) ? <>
            <Checkbox label={t('useProvider')} checked={route.kind === 'provider'} onChange={(checked) => {
              edit(role, checked ? { kind: 'provider', provider: '', model: '' }
                : role === 'decision' ? { kind: 'jev', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', threshold: 0.5, keyRef: 'GENESIS_DECISION_API_KEY' }
                  : { kind: 'openai', url: '', model: '', keyRef: 'GENESIS_WRITER_API_KEY' })
              setSecrets(current => ({ ...current, [role]: '' }))
            }} />
            <label htmlFor={`${prefix}-route`}>{t(route.kind === 'provider' ? 'providerId' : 'modelEndpoint')}</label>
            <Input id={`${prefix}-route`} required type={route.kind === 'provider' ? 'text' : 'url'}
              value={route.kind === 'provider' ? route.provider : route.url}
              onChange={(event) => { edit(role, route.kind === 'provider' ? { ...route, provider: event.target.value } : { ...route, url: event.target.value }) }} />
            <label htmlFor={`${prefix}-model`}>{t('modelId')}</label>
            <Input id={`${prefix}-model`} required value={route.model} onChange={(event) => { edit(role, { ...route, model: event.target.value }) }} />
            {role === 'decision' && route.kind !== 'provider' ? <Checkbox label={t('useJevProtocol')} checked={route.kind === 'jev'}
              onChange={(jev) => { edit('decision', jev ? { ...route, kind: 'jev', threshold: 0.5 }
                : { kind: 'openai', url: '', model: '', ...(route.keyRef === undefined ? {} : { keyRef: route.keyRef }) }) }} /> : null}
            {route.kind === 'jev' ? <>
              <label htmlFor={`${prefix}-threshold`}>{t('decisionThreshold')}</label>
              <Input id={`${prefix}-threshold`} type="number" min={0} max={1} step={0.01} required value={route.threshold}
                onChange={(event) => { edit(role, { ...route, threshold: Number(event.target.value) }) }} />
            </> : null}
            {route.kind === 'provider' ? <p className={css.secondary}>{t('providerCredentials')}</p> : <>
              <Checkbox label={t('requiresKey')} checked={route.keyRef !== undefined} onChange={(checked) => {
                const { keyRef: _key, ...rest } = route
                edit(role, checked ? { ...rest, keyRef: role === 'decision' ? 'GENESIS_DECISION_API_KEY' : 'GENESIS_WRITER_API_KEY' } : rest)
                setSecrets(current => ({ ...current, [role]: '' }))
              }} />
              {route.keyRef === undefined ? null : <>
                <label htmlFor={`${prefix}-ref`}>{t('keyReference')}</label>
                <Input id={`${prefix}-ref`} required pattern="[A-Za-z_][A-Za-z0-9_]*" value={route.keyRef}
                  onChange={(event) => { edit(role, { ...route, keyRef: event.target.value }); setSecrets(current => ({ ...current, [role]: '' })) }} />
              </>}
            </>}
          </> : null}
          <Button type="button" variant="outline" onClick={() => { void run(signal => testModel(role, signal), 'modelTested') }}>{t('checkSavedModel')}</Button>
        </fieldset>
      })}
      <details><summary>{t('advancedModelSettings')}</summary>
        <div className={css.naming}>
          <label htmlFor={`${id}-retries`}>{t('auxiliaryMaxRetries')}</label>
          <Input id={`${id}-retries`} type="number" min={0} max={100} step={1} required
            disabled={pending || !writable} value={draft.maxRetries ?? ''}
            onChange={(event) => {
              setDraft(current => ({ ...current, maxRetries: event.target.value === '' ? undefined : Number(event.target.value) }))
              setOutcome(undefined); setFailure(undefined)
            }} />
          <p className={css.secondary}>{t('auxiliaryMaxRetriesHint')}</p>
        </div>
      </details>
      <div className={css.actions}>
        <Button type="submit" disabled={pending || !writable}>{t('saveModels')}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => {
          setDraft(copy()); setDecisionExpanded(false); setRevision(initial.revision); setSecrets({ decision: '', writer: '' }); setOutcome(undefined); setFailure(undefined)
        }}>{t('reloadConfiguration')}</Button>
      </div>
    </form>
    {(['decision', 'writer'] as const).map((role) => {
      const route = draft[role]
      if (route.kind === 'provider' || route.keyRef === undefined || (role === 'writer' ? draft.writerInherit : !decisionExpanded || draft.localDecision)) return null
      const ref = route.keyRef
      return <form key={role} className={css.naming} aria-label={t(role === 'decision' ? 'decisionKey' : 'writerKey')}
        onSubmit={(event) => {
          event.preventDefault()
          void run(async (signal) => {
            const ok = await credential(ref, secrets[role])
            if (ok.ok && !signal.aborted) setSecrets(current => ({ ...current, [role]: '' }))
            return ok
          }, 'credentialSaved')
        }}>
        <label htmlFor={`${id}-${role}-key`}>{t(role === 'decision' ? 'decisionKey' : 'writerKey')}</label>
        <p className={css.secondary}>{t(initial.keys[role].configured && initial[role].kind !== 'provider' && ref === initial[role].keyRef ? 'keyStored' : 'keyMissing')}</p>
        <Input id={`${id}-${role}-key`} type="password" autoComplete="new-password" required value={secrets[role]}
          disabled={pending || !initial.keys[role].writable}
          onChange={(event) => { setSecrets(current => ({ ...current, [role]: event.target.value })) }} />
        <div className={css.actions}>
          <Button type="submit" disabled={pending || !initial.keys[role].writable || !secrets[role].trim()}>{t('saveKey')}</Button>
          <Button type="button" variant="outline" disabled={pending || !initial.keys[role].writable}
            onClick={() => { void run(() => credential(ref, undefined), 'credentialRemoved') }}>{t('removeKey')}</Button>
        </div>
      </form>
    })}
    {pending ? <p role="status">{t('working')}</p> : null}
    {failure === undefined ? null : <p role="alert">{t('operationFailed', { reason: failure })}</p>}
    {outcome === undefined ? null : <p role="status">{t(outcome)}</p>}
  </div>
}
