/** Sampled emotion management, with explicit operator edits and attributed history. @module */
import { useId, useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { LifeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { moodFields, needsFields, currentFields, type AffectValues } from './emotion-fields.ts'
import { ReviewDetails } from './ReviewDetails.tsx'
import { EmotionEditor } from './EmotionEditor.tsx'
import { EmotionSettingsEditor } from './EmotionSettingsEditor.tsx'
import css from './StatusPanel.module.css'
import emotionCss from './EmotionPanel.module.css'

/** Authenticated revision-fenced emotion mutations and shared status refresh. */
export interface EmotionActions {
  saveSettings: TypertClientRemote['genesisStatus']['saveEmotionSettings']
  adjust: TypertClientRemote['genesisStatus']['adjustEmotion']
  refresh(this: void): void
}
/** Current effective emotion sample supplied to operator editors. */
export type EmotionSample = NonNullable<LifeStatus['emotion']>

/**
 * Show independent current/mood intensities, last review and bounded attributed transitions.
 * @param props - Framework resource seat, locale and authenticated actions.
 * @returns A wrapping Genesis emotion page that retains its last sample and open drafts on query failure.
 */
export function EmotionPanel({ useResource, saveSettings, adjust, refresh, t }: PropsRuntime<'genesis.page'> &
  PropsLocale<'genesis'> & InjectFace<EmotionActions>) {
  const id = useId()
  const resource = useResource<'genesis'>('dsh-resource://genesis/status')
  const status = resource.value
  const emotion = status?.emotion
  const latestAppraisal = emotion?.history.find(entry => entry.appraisal !== undefined)?.appraisal
  const [editor, setEditor] = useState<'adjust' | 'settings'>()
  const entries = (vector: AffectValues) => 'tenderness' in vector
    ? currentFields.map(field => ({ field, value: vector[field] })) : 'valence' in vector
      ? moodFields.map(field => ({ field, value: vector[field] })) : needsFields.map(field => ({ field, value: vector[field] }))
  const values = (vector: AffectValues) => entries(vector).map(({ field, value }) => `${t(`emotion.${field}`)} ${Math.round(value * 100)}%`).join(' · ')
  return <section className={`${css.panel} ${emotionCss.content}`} aria-labelledby={`${id}-title`}>
    <header className={css.header}>
      <h3 id={`${id}-title`}>{t('emotionTitle')}</h3>
      <Button variant="outline" size="sm" onClick={refresh} disabled={resource.status === 'loading'}>{t('refresh')}</Button>
    </header>
    <p className={css.secondary}>{t('emotionDescription')}</p>
    {resource.status === 'loading' && status === undefined ? <div className={css.loading} role="status" aria-label={t('emotionTitle')}><StateDot state="ongoing" /></div> : null}
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {resource.status === 'none' ? <p role="status">{t('unavailable')}</p> : null}
    {status === undefined || emotion !== undefined ? null : <p role="status">{t('emotionUnavailable')}</p>}
    {status === undefined || emotion === undefined ? null : <>
      <div className={css.header}>
        <p className={css.status}><StateDot state={emotion.settings.enabled ? 'done' : 'idle'} />
          {t(emotion.settings.enabled ? 'emotionAutomaticOn' : 'emotionAutomaticOff')}</p>
        <div className={css.actions}>
          <Button variant="outline" size="sm" onClick={() => { setEditor('adjust') }}>{t('emotionAdjust')}</Button>
          <Button variant="outline" size="sm" onClick={() => { setEditor('settings') }}>{t('emotionSettings')}</Button>
        </div>
      </div>
      <div className={emotionCss.readings}>
        {(['current', 'mood', 'needs'] as const).map(layer => <section key={layer} className={emotionCss.card} aria-labelledby={`${id}-${layer}`}>
          <h4 id={`${id}-${layer}`}>{t(layer === 'current' ? 'emotionCurrent' : layer === 'mood' ? 'emotionMood' : 'emotionNeeds')}</h4>
          <p className={css.secondary}>{t(layer === 'current' ? 'emotionCurrentHint' : layer === 'mood' ? 'emotionMoodHint' : 'emotionNeedsHint')}</p>
          <dl className={emotionCss.meters}>
            {entries(emotion[layer]).map(({ field, value }) => <div key={field}>
              <dt id={`${id}-${layer}-${field}`}>{t(`emotion.${field}`)}</dt>
              <dd><meter aria-labelledby={`${id}-${layer}-${field}`} min={field === 'valence' ? -1 : 0} max={1} value={value} />
                <span>{Math.round(value * 100)}%</span></dd>
            </div>)}
          </dl>
        </section>)}
      </div>
      <p className={css.secondary}>{t('sampled')}{' '}<time dateTime={status.sampledAt}>{new Date(status.sampledAt).toLocaleString()}</time></p>
      {emotion.review === undefined ? <p>{t('emotionNotReviewed')}</p> : emotion.review.state === 'failed'
        ? <p role="alert">{t('emotionReviewFailed', { stage: t(`emotionStage.${emotion.review.failure.stage}`), reason: emotion.review.failure.message })}</p>
        : <p role="status">{t(emotion.review.state === 'saved' ? 'emotionReviewSaved' : 'emotionReviewSkipped')}</p>}
      {emotion.review === undefined ? null : <ReviewDetails review={emotion.review} t={t} />}
      {latestAppraisal === undefined ? null : <section className={emotionCss.card}>
        <h4>{t('emotionAppraisal')}</h4>
        <p>{latestAppraisal.summary}</p>
        <p className={css.secondary}>{t('appraisalInference')}</p>
      </section>}
      <h4>{t('emotionHistory')}</h4>
      <ul className={css.records}>{emotion.history.map(entry => <li key={entry.id}>
        <div className={css.header}><span>{t(`emotionHistory.${entry.kind}`)} · {t(`emotionSource.${entry.source}`)}</span>
          <time className={css.secondary} dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></div>
        {entry.appraisal === undefined ? null : <p className={css.secondary}>{t(`appraisalKind.${entry.appraisal.kind}`)} · {t('appraisalImportance', { value: Math.round(entry.appraisal.importance * 100) })}</p>}
        {entry.reason && entry.reason !== 'operator-settings' ? <p>{entry.reason}</p> : null}
        <details><summary>{t('emotionHistoryValues')}</summary>
          <p>{t('emotionCurrent')}: {values(entry.current)}</p><p>{t('emotionMood')}: {values(entry.mood)}</p><p>{t('emotionNeeds')}: {values(entry.needs)}</p>
          {entry.targets === undefined ? null : <p>{currentFields.filter(field => entry.targets?.[field] !== undefined).map(field => `${t(`emotion.${field}`)}: ${entry.targets![field]}`).join(' · ')}</p>}
          {entry.appraisal === undefined ? null : <>
            <p>{t('appraisalDimensions', { novelty: Math.round(entry.appraisal.novelty * 100), expected: entry.appraisal.expectationMatch.toFixed(2),
              control: Math.round(entry.appraisal.controllability * 100), confidence: Math.round(entry.appraisal.confidence * 100) })}</p>
            <p>{t('appraisalAttribution', { meaning: t(`appraisalMeaning.${entry.appraisal.relationshipMeaning}`), responsibility: t(`appraisalResponsibility.${entry.appraisal.responsibility}`) })}</p>
          </>}
          {entry.effects?.moodEligible === false ? <p className={css.secondary}>{t('appraisalMoodDeferred')}</p> : null}
          {entry.effects?.repeated ? <p className={css.secondary}>{t('appraisalRepeated')}</p> : null}
          {entry.sourceEventIds.length ? <p className={css.secondary}>{t('source')}: {entry.sourceEventIds.join(', ')}</p> : null}
        </details>
      </li>)}</ul>
      {emotion.history.length === 0 ? <p>{t('emotionEmptyHistory')}</p> : null}
      {emotion.omitted ? <p className={css.secondary}>{t('omitted', { count: emotion.omitted })}</p> : null}
      {editor === 'adjust' ? <EmotionEditor initial={emotion} latest={emotion} adjust={adjust} t={t}
        close={() => { setEditor(undefined) }} saved={() => { setEditor(undefined); refresh() }} /> : null}
      {editor === 'settings' ? <EmotionSettingsEditor initial={emotion} latest={emotion} saveSettings={saveSettings} t={t}
        close={() => { setEditor(undefined) }} saved={() => { setEditor(undefined); refresh() }} /> : null}
    </>}
  </section>
}
