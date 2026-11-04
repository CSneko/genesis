/** Secret-free QQ connection diagnostics and revision-fenced route policy drafts. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, ConfigField, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { QqStatus, QqSettings } from '@deepseek-ai/dsh-experimental-genesis-qq/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { QqDecisionEditor } from './QqDecisionEditor.tsx'
import { QqConnectionEditor } from './QqConnectionEditor.tsx'
import css from './StatusPanel.module.css'
import emotionCss from './EmotionPanel.module.css'

/** Existing authenticated Remote actions and navigation; no credentials cross this interface. */
export interface QqActions {
  saveConnection: TypertClientRemote['genesisQqSettings']['saveConnection']
  setToken: TypertClientRemote['genesisQqSettings']['setToken']
  saveDecision: TypertClientRemote['genesisQqSettings']['saveDecision']
  setDecisionKey: TypertClientRemote['genesisQqSettings']['setDecisionKey']
  saveQq: TypertClientRemote['genesisQqSettings']['save']
  refresh(this: void): void
  openSession(this: void, id: SessionId): void
}
/**
 * Show the channel's real state and explicit paused/unavailable/uncertain outcomes.
 * @param props - Framework resource, localized labels and generated operator actions.
 * @returns QQ settings; failed reads preserve the last sample and disable writes.
 */
export function QqPanel({ useResource, saveQq, saveConnection, setToken, saveDecision, setDecisionKey, refresh, openSession, t }: PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<QqActions>) {
  const resource = useResource<'genesis-qq'>('dsh-resource://genesis-qq/status')
  const sample = resource.value
  return <section className={`${css.panel} ${emotionCss.content}`}>
    <header className={css.header}><h3>{t('qqTitle')}</h3><Button variant="outline" onClick={refresh}>{t('refresh')}</Button></header>
    <p className={css.secondary}>{t('qqDescription')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('qqUnavailable')}</p> : null}
    {sample === undefined && resource.status === 'loading' ? <div className={css.loading} role="status" aria-label={t('qqTitle')}><StateDot state="ongoing" /></div> : null}
    {sample === undefined ? null : <>
      <p role="status">{t(`qqMode.${sample.mode}`)}</p>
      {sample.failure === null ? null : <p role="alert">{t(`qqFailure.${sample.failure}`)}</p>}
      <dl className={css.facts}>
        <dt>{t('qqBot')}</dt><dd>{sample.botQq}</dd>
        <dt>{t('qqOperator')}</dt><dd>{sample.operatorQq || t('qqNoOperator')}</dd>
        <dt>{t('qqEndpoint')}</dt><dd>{sample.endpoint}</dd>
        <dt>{t('qqToken')}</dt><dd>{t(sample.tokenConfigured ? 'qqTokenPresent' : 'qqTokenMissing')}</dd>
        <dt>{t('qqWork')}</dt><dd>{t('qqWorkCounts', { pending: sample.pending, sessions: sample.liveSessions })}</dd>
      </dl>
      <QqConnectionEditor sample={sample} writable={resource.status === 'live'} saveConnection={saveConnection} setToken={setToken} refresh={refresh} t={t} />
      <QqEditor sample={sample} writable={resource.status === 'live'} saveQq={saveQq} refresh={refresh} t={t} />
      {sample.decision === undefined ? null : <QqDecisionEditor sample={sample.decision} writable={resource.status === 'live'} saveDecision={saveDecision} setDecisionKey={setDecisionKey} refresh={refresh} t={t} />}
      <h4>{t('qqDeliveries')}</h4><p className={css.secondary}>{t('qqDeliveryHint')}</p>
      {sample.deliveries.length === 0 ? <p>{t('qqNoDeliveries')}</p> : <ul className={css.records}>{sample.deliveries.map(delivery => <li key={`${delivery.sessionId}:${delivery.seq}`}>
        <div className={css.header}><span>{t(`qqDelivery.${delivery.status}`)}</span><time dateTime={delivery.timestamp}>{new Date(delivery.timestamp).toLocaleString()}</time></div>
        <p>{t('qqParts', { count: delivery.acknowledged, total: delivery.parts })}</p>
        <Button variant="outline" onClick={() => { openSession(delivery.sessionId) }}>{t('peopleOpenSession')}</Button>
      </li>)}</ul>}
      {sample.omitted > 0 ? <p className={css.secondary}>{t('omitted', { count: sample.omitted })}</p> : null}
    </>}
  </section>
}
function draftOf(sample: QqStatus) {
  return { revision: sample.revision, settings: { ...sample.settings },
    privateContextTokens: String(sample.settings.privateContextTokens), groupContextTokens: String(sample.settings.groupContextTokens),
    operatorContextTokens: String(sample.settings.operatorContextTokens), groups: sample.settings.allowGroups.join(', '), users: sample.settings.allowUsers.join(', ') }
}
function QqEditor({ sample, writable, saveQq, refresh, t }: PropsLocale<'genesis'> & Pick<QqActions, 'saveQq' | 'refresh'> & { sample: QqStatus; writable: boolean }) {
  const [draft, setDraft] = useState(() => draftOf(sample))
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const conflict = draft.revision !== sample.revision
  const edit = (key: 'enabled' | 'acceptPrivateFromAnyone' | 'replyOnlyWhenMentioned' | 'groupAutoReply', value: boolean) => {
    setDraft(current => ({ ...current, settings: { ...current.settings, [key]: value } }))
  }
  return <form className={css.editor} onSubmit={(event) => {
    event.preventDefault()
    if (operation.current !== undefined || !writable || conflict || !event.currentTarget.reportValidity()) return
    const owned = new AbortController(); operation.current = owned; setPending(true)
    const parse = (value: string) => [...new Set(value.split(/[,，\s]+/u).filter(Boolean))]
    const settings: QqSettings = { ...draft.settings, allowGroups: parse(draft.groups), allowUsers: parse(draft.users),
      privateContextTokens: Number(draft.privateContextTokens), groupContextTokens: Number(draft.groupContextTokens),
      operatorContextTokens: Number(draft.operatorContextTokens) }
    void saveQq(settings, draft.revision, owned.signal).then((result) => {
      if (!owned.signal.aborted && result.ok) { setDraft(current => ({ ...current, revision: result.value })); refresh() }
    }).catch((_error: unknown) => { /* Shell feedback owns failures; preserve the rejected draft. */ })
      .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
  }}>
    {conflict ? <p role="alert">{t('qqConflict')}</p> : null}
    <fieldset className={css.modelFields} disabled={pending || !writable}>
      <legend>{t('qqPolicy')}</legend>
      <Checkbox label={t('qqEnabled')} checked={draft.settings.enabled} onChange={(value) => { edit('enabled', value) }} />
      <label className={emotionCss.field}>{t('qqGroups')}<Input value={draft.groups} pattern={'[0-9,，\\s]*'} onChange={(event) => { setDraft(current => ({ ...current, groups: event.target.value })) }} /></label>
      <label className={emotionCss.field}>{t('qqUsers')}<Input value={draft.users} pattern={'[0-9,，\\s]*'} onChange={(event) => { setDraft(current => ({ ...current, users: event.target.value })) }} /></label>
      <p className={css.secondary}>{t('qqAllowlistHint')}</p>
      <Checkbox label={t('qqAnyone')} checked={draft.settings.acceptPrivateFromAnyone} onChange={(value) => { edit('acceptPrivateFromAnyone', value) }} />
      <Checkbox label={t('qqAutoReply')} checked={draft.settings.groupAutoReply} onChange={(value) => { edit('groupAutoReply', value) }} />
      <p className={css.secondary}>{t('qqAutoReplyHint')}</p>
      <Checkbox label={t('qqMention')} checked={draft.settings.replyOnlyWhenMentioned} onChange={(value) => { edit('replyOnlyWhenMentioned', value) }} />
    </fieldset>
    <fieldset className={css.modelFields} disabled={pending || !writable}>
      <legend>{t('qqConversation')}</legend>
      <ConfigField label={t('qqExtraPrompt')} value={draft.settings.extraPrompt} secret={false} choices={[]}
        disabled={pending || !writable} overridden={draft.settings.extraPrompt !== ''} invalid={false}
        labels={{ reset: t('qqClearPrompt'), inherited: t('qqExtraPrompt'), invalid: t('qqUnavailable') }}
        onChange={(extraPrompt) => { setDraft(current => ({ ...current, settings: { ...current.settings, extraPrompt } })) }}
        onReset={() => { setDraft(current => ({ ...current, settings: { ...current.settings, extraPrompt: '' } })) }} />
      {(['privateContextTokens', 'groupContextTokens', 'operatorContextTokens'] as const).map(key =>
        <label key={key} className={emotionCss.field}>{t(`qqContext.${key}`)}
          <Input type="number" min={1000} step={1} required value={draft[key]}
            onChange={(event) => { setDraft(current => ({ ...current, [key]: event.target.value })) }} />
        </label>)}
      <p className={css.secondary}>{t('qqContextHint')}</p>
      <p className={css.secondary}>{t('qqWorkspaceHint')}</p>
    </fieldset>
    <p className={css.secondary}>{t('qqSaveHint')}</p>
    <div className={css.actions}><Button type="submit" disabled={pending || !writable || conflict}>{t('qqSave')}</Button>
      <Button variant="outline" disabled={pending} onClick={() => { setDraft(draftOf(sample)) }}>{t('reloadConfiguration')}</Button></div>
  </form>
}
