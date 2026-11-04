/** Operator catalogue drafts retain their revision across refreshes and failed saves. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { ToolkitDefinition, ToolkitStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import css from './StatusPanel.module.css'
import toolkitCss from './ToolkitsPanel.module.css'

/** Generated authenticated edits and resource invalidation. */
export interface ToolkitActions {
  save: TypertClientRemote['genesisToolkits']['save']
  refresh(this: void): void
}
/**
 * Show all operator groups, including those deliberately hidden from the character.
 * @param props - Framework resource hooks, generated edits and localized copy.
 * @returns Settings with explicit draft reload and retained content on query failure.
 */
export function ToolkitsPanel({ useResource, save, refresh, t }: PropsRuntime<'settings.section'> &
  PropsLocale<'genesis'> & InjectFace<ToolkitActions>) {
  const resource = useResource<'genesis-toolkits'>('dsh-resource://genesis-toolkits/catalogue')
  return <section className={css.panel}>
    <header className={css.header}><h3>{t('toolkitsTitle')}</h3>
      <Button variant="outline" onClick={refresh}>{t('refresh')}</Button></header>
    <p>{t('toolkitsDescription')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {resource.value === undefined ? resource.status === 'loading'
      ? <div className={css.loading} role="status" aria-label={t('toolkitsTitle')}><StateDot state="ongoing" /></div>
      : <p>{t('unavailable')}</p>
      : <ToolkitEditor sample={resource.value} writable={resource.status === 'live'} save={save} refresh={refresh} t={t} />}
  </section>
}
function draftOf(sample: ToolkitStatus) {
  return { revision: sample.revision, entries: sample.entries.map(entry => ({ ...entry, members: entry.tools.join(', ') })) }
}
function ToolkitEditor({ sample, writable, save, refresh, t }: PropsLocale<'genesis'> & ToolkitActions & { sample: ToolkitStatus; writable: boolean }) {
  const field = useId()
  const [draft, setDraft] = useState(() => draftOf(sample))
  const [pending, setPending] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const conflict = sample.revision !== draft.revision
  const update = (id: ToolkitDefinition['id'], changes: { name?: string; description?: string; members?: string; qqAccess?: ToolkitDefinition['qqAccess'] }) => {
    setDraft(value => ({ ...value, entries: value.entries.map(entry => entry.id === id ? { ...entry, ...changes } : entry) }))
  }
  return <form className={css.editor} onSubmit={(event) => {
    event.preventDefault()
    if (operation.current !== undefined || !writable || conflict || !event.currentTarget.reportValidity()) return
    const owned = new AbortController(); operation.current = owned; setPending(true)
    const entries = draft.entries.map(({ members, tools: _tools, ...entry }) => ({ ...entry,
      tools: [...new Set(members.split(/[,，\n]/u).map(name => name.trim()).filter(Boolean))] }))
    void save(entries, draft.revision, owned.signal).then((result) => {
      if (!owned.signal.aborted && result.ok) { setDraft(value => ({ ...value, revision: result.value })); refresh() }
    }).catch((_error: unknown) => { /* The shell-owned mutation action reports failures without discarding this draft. */ })
      .finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
  }}>
    {conflict ? <p role="alert">{t('toolkitsConflict')}</p> : null}
    <p className={css.secondary}>{t('toolkitsMembersHint')}</p>
    {draft.entries.length === 0 ? <p>{t('toolkitsEmpty')}</p> : null}
    {draft.entries.map((entry) => {
      const rules = entry.members.split(/[,，\n]/u).map(name => name.trim()).filter(Boolean)
      const learned = sample.learned.filter(name => rules.some(rule => rule.endsWith('*') ? name.startsWith(rule.slice(0, -1)) : name === rule))
      return <fieldset key={entry.id} className={`${css.modelFields} ${toolkitCss.fields}`} disabled={pending || !writable}>
        <legend>{entry.name || t('toolkitsNew')}</legend>
        <label htmlFor={`${field}-${entry.id}-name`}>{t('toolkitName')}</label>
        <Input className={toolkitCss.input!} id={`${field}-${entry.id}-name`} required maxLength={200} value={entry.name}
          onChange={(event) => { update(entry.id, { name: event.target.value }) }} />
        <label htmlFor={`${field}-${entry.id}-description`}>{t('toolkitDescription')}</label>
        <Input className={toolkitCss.input!} id={`${field}-${entry.id}-description`} maxLength={2000} value={entry.description}
          onChange={(event) => { update(entry.id, { description: event.target.value }) }} />
        <label htmlFor={`${field}-${entry.id}-members`}>{t('toolkitMembers')}</label>
        <Input className={toolkitCss.input!} id={`${field}-${entry.id}-members`} value={entry.members}
          onChange={(event) => { update(entry.id, { members: event.target.value }) }} />
        <Checkbox label={t('toolkitQqEnabled')} checked={entry.qqAccess === 'anyone' || entry.qqAccess === 'operator'}
          onChange={(value) => { update(entry.id, { qqAccess: value ? 'operator' : 'disabled' }) }} />
        {entry.qqAccess === 'anyone' || entry.qqAccess === 'operator' ? <Checkbox label={t('toolkitQqOperator')}
          checked={entry.qqAccess === 'operator'} onChange={(value) => { update(entry.id, { qqAccess: value ? 'operator' : 'anyone' }) }} /> : null}
        <p className={css.secondary}>{t('toolkitQqHint')}</p>
        <p className={css.secondary}>{t(learned.length > 0 ? 'toolkitVisible' : 'toolkitHidden', { count: learned.length })}</p>
        {learned.length > 0 ? <ul>{learned.map(name => <li key={name}>{name} · {t(sample.available.includes(name) ? 'toolkitAvailable' : 'toolkitUnavailable')}</li>)}</ul> : null}
        <div className={`${css.actions} ${toolkitCss.actions}`}><Button variant="outline" onClick={() => {
          setDraft(value => ({ ...value, entries: value.entries.filter(item => item.id !== entry.id) }))
        }}>{t('toolkitRemove')}</Button></div>
      </fieldset>
    })}
    <details><summary>{t('toolkitsKnown')}</summary>
      {Array.from(new Set([...sample.learned, ...sample.available])).sort().map(name => <p key={name}>{name}</p>)}
    </details>
    <p className={css.secondary}>{t('toolkitsRemovalHint')}</p>
    <div className={`${css.actions} ${toolkitCss.actions}`}>
      <Button variant="outline" disabled={pending || !writable} onClick={() => {
        setDraft(value => ({ ...value, entries: [...value.entries, {
          id: brandString<ToolkitDefinition['id']>(crypto.randomUUID()), name: '', description: '', tools: [], members: '',
        }] }))
      }}>{t('toolkitsAdd')}</Button>
      <Button type="submit" disabled={pending || !writable || conflict}>{t(pending ? 'working' : 'toolkitsSave')}</Button>
      <Button variant="outline" disabled={pending || !writable} onClick={() => { setDraft(draftOf(sample)) }}>{t('toolkitsReload')}</Button>
    </div>
  </form>
}
