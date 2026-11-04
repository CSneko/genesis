/** Persistent operator relationship and explicit, revision-fenced adjustments. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { LifeStatus, RelationshipVector } from '@deepseek-ai/dsh-experimental-genesis/types'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'
import { RelationshipValues } from './RelationshipValues.tsx'
import emotionCss from './EmotionPanel.module.css'

const fields = ['affection', 'trust', 'attachment', 'familiarity', 'feltSecurity'] as const
type Sample = NonNullable<LifeStatus['emotion']>
/** Authenticated relationship mutation and shared resource refresh. */
export interface RelationshipActions {
  adjust: TypertClientRemote['genesisStatus']['adjustRelationship']
  refresh(this: void): void
}
function draftOf(sample: Sample) {
  const values = sample.relationship?.values ?? { affection: 0, trust: 0.5, attachment: 0, familiarity: 0, feltSecurity: 0.5 }
  return { label: sample.relationship?.label ?? '', reason: '',
    values: Object.fromEntries(fields.map(field => [field, String(values[field])])) as Record<keyof RelationshipVector, string> }
}
function RelationshipEditor({ sample, adjust, close, saved, t }: PropsLocale<'genesis'> & Pick<RelationshipActions, 'adjust'> & {
  sample: Sample; close: () => void; saved: () => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(() => draftOf(sample))
  const [revision, setRevision] = useState(sample.revision)
  const [failure, setFailure] = useState<string>()
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  return <Modal open title={t('relationshipAdjust')} closeLabel={t('close')} onClose={close}
    className={emotionCss.dialog!} contentClassName={emotionCss.dialogContent!}>
    <form className={emotionCss.form} onSubmit={(event) => {
      event.preventDefault()
      if (operation.current !== undefined || !event.currentTarget.reportValidity()) return
      const owned = new AbortController(); operation.current = owned; setPending(true); setFailure(undefined)
      const values: RelationshipVector = { affection: Number(draft.values.affection), trust: Number(draft.values.trust), attachment: Number(draft.values.attachment),
        familiarity: Number(draft.values.familiarity), feltSecurity: Number(draft.values.feltSecurity) }
      void adjust({ label: draft.label, values, reason: draft.reason }, revision, owned.signal).then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) saved()
        else setFailure(operationFailure(result.error, [], t('unknownError')))
      }).catch((error: unknown) => { if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError'))) })
        .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
    }}>
      <p className={css.secondary}>{t('relationshipAdjustmentHint')}</p>
      <fieldset className={css.modelFields} disabled={pending}>
        <label className={emotionCss.field} htmlFor={`${id}-label`}>{t('relationshipLabel')}
          <Input id={`${id}-label`} required maxLength={200} value={draft.label} onChange={(event) => { setDraft(current => ({ ...current, label: event.target.value })) }} />
        </label>
        <div className={emotionCss.fields}>{fields.map(field => <label key={field} className={emotionCss.field} htmlFor={`${id}-${field}`}>
          {t(`relationship.${field}`)}
          <Input id={`${id}-${field}`} required type="number" min={0} max={1} step="any" value={draft.values[field]}
            onChange={(event) => { setDraft(current => ({ ...current, values: { ...current.values, [field]: event.target.value } })) }} />
        </label>)}</div>
        <label className={emotionCss.field} htmlFor={`${id}-reason`}>{t('emotionReason')}
          <Input id={`${id}-reason`} required maxLength={1000} value={draft.reason} onChange={(event) => { setDraft(current => ({ ...current, reason: event.target.value })) }} />
        </label>
        <div className={css.actions}><Button type="submit">{t(pending ? 'working' : 'relationshipSave')}</Button>
          <Button variant="outline" onClick={() => { setDraft(draftOf(sample)); setRevision(sample.revision); setFailure(undefined) }}>{t('emotionReload')}</Button></div>
      </fieldset>
      {failure === undefined ? null : <p role="alert">{t('emotionOperationFailed', { reason: failure })}</p>}
    </form>
  </Modal>
}

/**
 * Show one deployment operator relationship, its uncertainty and sourced changes.
 * @param props - Shared resource seat, localization and authenticated editor actions.
 * @returns Responsive Genesis relationship page; refresh failures retain the last sample and pending drafts.
 */
export function RelationshipPanel({ useResource, adjust, refresh, t }: PropsRuntime<'genesis.page'> & PropsLocale<'genesis'> & InjectFace<RelationshipActions>) {
  const resource = useResource<'genesis'>('dsh-resource://genesis/status')
  const emotion = resource.value?.emotion
  const relation = emotion?.relationship
  const [editing, setEditing] = useState(false)
  const history = emotion?.history.filter(entry => entry.kind === 'relationship-adjusted'
    || Object.values(entry.effects?.relationship ?? {}).some(delta => delta !== 0)) ?? []
  return <section className={`${css.panel} ${emotionCss.content}`}>
    <header className={css.header}><h3>{t('relationshipTitle')}</h3>
      <Button variant="outline" size="sm" onClick={refresh} disabled={resource.status === 'loading'}>{t('refresh')}</Button></header>
    <p className={css.secondary}>{t('relationshipDescription')}</p>
    {resource.status === 'loading' && resource.value === undefined ? <div className={css.loading} role="status" aria-label={t('relationshipTitle')}><StateDot state="ongoing" /></div> : null}
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {emotion === undefined ? resource.value === undefined ? null : <p>{t('emotionUnavailable')}</p> : <>
      <div className={css.header}><p>{t(emotion.settings.relationshipEnabled && emotion.settings.enabled ? 'relationshipAutomaticOn' : 'relationshipAutomaticOff')}</p>
        <Button variant="outline" size="sm" onClick={() => { setEditing(true) }}>{t('relationshipAdjust')}</Button></div>
      {relation === null || relation === undefined ? <p>{t('relationshipUnknown')}</p> : <section className={emotionCss.card}>
        <h4>{relation.label === 'operator' ? t('relationshipOperator') : relation.label}</h4>
        <p className={css.secondary}>{t('relationshipStableId', { id: relation.id })}</p>
        <RelationshipValues relationship={relation} t={t} />
      </section>}
      <h4>{t('relationshipHistory')}</h4>
      {history.length === 0 ? <p>{t('relationshipNoHistory')}</p> : <ul className={css.records}>{history.map(entry => <li key={entry.id}>
        <div className={css.header}><span>{t(`emotionSource.${entry.source}`)}</span><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></div>
        <p>{entry.reason}</p>
        {entry.appraisal === undefined ? null : <p className={css.secondary}>{entry.appraisal.summary}</p>}
        <details><summary>{t('emotionHistoryValues')}</summary>
          {entry.relationship === undefined || entry.relationship === null ? null : <p>{fields.map(field => `${t(`relationship.${field}`)} ${Math.round(entry.relationship!.values[field] * 100)}%`).join(' · ')}</p>}
          {entry.sourceEventIds.length ? <p className={css.secondary}>{t('source')}: {entry.sourceEventIds.join(', ')}</p> : null}
        </details>
      </li>)}</ul>}
      {emotion.omitted ? <p className={css.secondary}>{t('omitted', { count: emotion.omitted })}</p> : null}
      {editing ? <RelationshipEditor sample={emotion} adjust={adjust} t={t} close={() => { setEditing(false) }} saved={() => { setEditing(false); refresh() }} /> : null}
    </>}
  </section>
}
