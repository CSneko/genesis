/** QQ-only decision settings reuse registered models and credential storage without changing memory routes. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { QqStatus, QqDecisionSettings } from '@deepseek-ai/dsh-experimental-genesis-qq/types'
import type { QqActions } from './QqPanel.tsx'
import css from './StatusPanel.module.css'
import emotionCss from './EmotionPanel.module.css'
const draftOf = (sample: NonNullable<QqStatus['decision']>) => {
  const route = sample.settings
  return { revision: sample.revision, inherit: route.kind === 'inherit', providerMode: route.kind !== 'jev',
    provider: route.kind === 'provider' ? route.provider : '', model: route.kind === 'inherit' ? '' : route.model,
    url: route.kind === 'jev' ? route.url : '', threshold: route.kind === 'jev' ? String(route.threshold) : '0.5', useKey: route.kind === 'jev' && route.useKey }
}
/**
 * Edit a revision-fenced QQ route and its write-only key.
 * @param props - Safe sample, generated shell-owned actions and localized labels.
 * @returns Independent model settings and bounded actual decision probabilities.
 */
export function QqDecisionEditor({ sample, writable, saveDecision, setDecisionKey, refresh, t }: PropsLocale<'genesis'> &
  Pick<QqActions, 'saveDecision' | 'setDecisionKey' | 'refresh'> & { sample: NonNullable<QqStatus['decision']>; writable: boolean }) {
  const [draft, setDraft] = useState(() => draftOf(sample))
  const [key, setKey] = useState('')
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const conflict = draft.revision !== sample.revision
  return <section className={css.editor}>
    <h4>{t('qqDecisionTitle')}</h4><p className={css.secondary}>{t('qqDecisionHint')}</p>
    {conflict ? <p role="alert">{t('qqConflict')}</p> : null}
    <form onSubmit={(event) => {
      event.preventDefault()
      if (operation.current || pending || !writable || conflict || !event.currentTarget.reportValidity()) return
      const owned = new AbortController(); operation.current = owned; setPending(true)
      const settings: QqDecisionSettings = draft.inherit ? { kind: 'inherit' } : draft.providerMode
        ? { kind: 'provider', provider: draft.provider, model: draft.model }
        : { kind: 'jev', url: draft.url, model: draft.model, threshold: Number(draft.threshold), useKey: draft.useKey }
      void saveDecision(settings, draft.revision, owned.signal).then((result) => {
        if (result.ok && !owned.signal.aborted) { setDraft(value => ({ ...value, revision: result.value })); refresh() }
      }).catch((_error: unknown) => { /* Shell-owned outcome feedback preserves rejected drafts. */ })
        .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
    }}>
      <fieldset className={css.modelFields} disabled={pending || !writable}>
        <legend>{t('qqDecisionTitle')}</legend>
        <Checkbox label={t('qqDecisionInherit')} checked={draft.inherit} onChange={(inherit) => { setDraft(value => ({ ...value, inherit })) }} />
        {draft.inherit ? null : <>
          <Checkbox label={t('useProvider')} checked={draft.providerMode} onChange={(providerMode) => { setDraft(value => ({ ...value, providerMode })) }} />
          {draft.providerMode ? <label className={emotionCss.field}>{t('providerId')}<Input required value={draft.provider} onChange={(event) => { setDraft(value => ({ ...value, provider: event.target.value })) }} /></label>
            : <label className={emotionCss.field}>{t('modelEndpoint')}<Input required type="url" value={draft.url} onChange={(event) => { setDraft(value => ({ ...value, url: event.target.value })) }} /></label>}
          <label className={emotionCss.field}>{t('modelId')}<Input required value={draft.model} onChange={(event) => { setDraft(value => ({ ...value, model: event.target.value })) }} /></label>
          {draft.providerMode ? null : <>
            <label className={emotionCss.field}>{t('qqDecisionThreshold')}<Input type="number" min={0} max={1} step="any" required value={draft.threshold}
              onChange={(event) => { setDraft(value => ({ ...value, threshold: event.target.value })) }} /></label>
            <Checkbox label={t('qqDecisionUseKey')} checked={draft.useKey} onChange={(useKey) => { setDraft(value => ({ ...value, useKey })) }} />
          </>}
        </>}
        <div className={css.actions}><Button type="submit" disabled={conflict}>{t('qqDecisionSave')}</Button>
          <Button variant="outline" onClick={() => { setDraft(draftOf(sample)) }}>{t('reloadConfiguration')}</Button></div>
      </fieldset>
    </form>
    <label className={emotionCss.field}>{t('qqDecisionKey')}<Input type="password" autoComplete="new-password" disabled={pending || !writable} value={key}
      onChange={(event) => { setKey(event.target.value) }} /></label>
    <p>{t(sample.keyConfigured ? 'qqTokenPresent' : 'qqTokenMissing')}</p>
    <div className={css.actions}>{([false, true] as const).map(remove => <Button key={String(remove)} variant="outline"
      disabled={pending || !writable || (remove ? !sample.keyConfigured : !key.trim())} onClick={() => {
        if (operation.current) return
        const owned = new AbortController(); operation.current = owned; setPending(true)
        void setDecisionKey(remove ? undefined : key, owned.signal).then((result) => {
          if (result.ok && !owned.signal.aborted) { setKey(''); refresh() }
        }).catch((_error: unknown) => { /* Shell-owned feedback reports credential failures. */ })
          .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
      }}>{t(remove ? 'removeKey' : 'saveKey')}</Button>)}</div>
    <h4>{t('qqDecisions')}</h4>
    {sample.recent.length === 0 ? <p>{t('qqNoDecisions')}</p> : <ul className={css.records}>{sample.recent.toReversed().map(row => <li key={`${row.sessionId}:${row.messageId}`}>
      <div>{t(`qqDecisionOutcome.${row.outcome}`)} · {row.target} · {row.messageId}</div>
      <time dateTime={row.timestamp}>{new Date(row.timestamp).toLocaleString()}</time>
      <p>{row.decision === null ? t('qqDecisionNoProbability') : t('qqDecisionProbability', {
        probability: Math.round(row.decision.probability * 1000) / 10, threshold: Math.round(row.decision.threshold * 1000) / 10 })}</p>
    </li>)}</ul>}
  </section>
}
