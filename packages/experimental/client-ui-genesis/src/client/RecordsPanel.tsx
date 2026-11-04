/** Record browsing and operator-managed types, using shared on-demand resources. @module */
import { useId, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { WritingCatalog, WritingId, WritingType } from '@deepseek-ai/dsh-experimental-genesis/types'
import { WritingDialog } from './WritingDialog.tsx'
import { WritingTypeEditor } from './WritingTypeEditor.tsx'
import css from './StatusPanel.module.css'
import recordCss from './RecordsPanel.module.css'

type RecordRemote = TypertClientRemote['genesisRecords']
/** Generated revision-fenced mutations and a refresh shared by all record resources. */
export interface RecordsActions {
  edit: RecordRemote['edit']
  remove: RecordRemote['deleteRecord']
  saveType: RecordRemote['saveType']
  refresh(this: void): void
}
type ViewProps = Pick<PropsRuntime<'genesis.page'>, 'useResource'> & PropsLocale<'genesis'> & InjectFace<RecordsActions>

/**
 * Browse writings and manage categories independently of long-term memory.
 * @param props - Resource access, localized copy and authenticated record mutations.
 * @returns Independent Genesis writings page; disabled recording remains explicit.
 */
export function RecordsPanel({ useResource, edit, remove, saveType, refresh, t }: PropsRuntime<'genesis.page'> & PropsLocale<'genesis'> & InjectFace<RecordsActions>) {
  const id = useId()
  const resource = useResource<'genesis-records'>('dsh-resource://genesis-records/catalog')
  return <section className={css.panel} aria-labelledby={`${id}-title`}>
    <header className={css.header}>
      <h3 id={`${id}-title`}>{t('recordsTitle')}</h3>
      <Button variant="outline" size="sm" onClick={refresh}>{t('refresh')}</Button>
    </header>
    <p className={css.secondary}>{t('recordsDescription')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('recordsQueryFailed')}</p> : null}
    {resource.value === undefined && resource.status === 'loading' ? <div className={css.loading} role="status" aria-label={t('recordsTitle')}><StateDot state="ongoing" /></div> : null}
    {resource.value === null ? <p role="status">{t('recordsDisabled')}</p> : null}
    {resource.value == null ? null : <RecordsBrowser catalog={resource.value} {...{ useResource, edit, remove, saveType, refresh, t }} />}
  </section>
}

function RecordsBrowser({ catalog, useResource, edit, remove, saveType, refresh, t }: ViewProps & { catalog: WritingCatalog }) {
  const id = useId()
  const [filters, setFilters] = useState({ text: '', type: '', after: '', before: '' })
  const [selection, setSelection] = useState(filters)
  const [pages, setPages] = useState([0])
  const [opened, setOpened] = useState<WritingId>()
  const [typeEditor, setTypeEditor] = useState<{ type: WritingType | undefined }>()
  const params = new URLSearchParams({ text: selection.text, offset: String(pages.at(-1)!) })
  if (selection.type) params.set('type', selection.type)
  if (selection.after) params.set('after', new Date(`${selection.after}T00:00:00`).toISOString())
  if (selection.before) params.set('before', new Date(`${selection.before}T23:59:59.999`).toISOString())
  const resource = useResource<'genesis-record-search'>(`dsh-resource://genesis-record-search/?${params}`)
  const result = resource.value
  return <>
    <form className={recordCss.filters} onSubmit={(event) => {
      event.preventDefault(); if (!event.currentTarget.reportValidity()) return
      setSelection({ ...filters }); setPages([0]); refresh()
    }}>
      <label className={recordCss.field} htmlFor={`${id}-search`}>{t('recordsSearch')}
        <Input id={`${id}-search`} value={filters.text} onChange={(event) => { setFilters(current => ({ ...current, text: event.target.value })) }} /></label>
      <label className={recordCss.field} htmlFor={`${id}-type`}>{t('recordType')}
        <select className={recordCss.select} id={`${id}-type`} value={filters.type} onChange={(event) => { setFilters(current => ({ ...current, type: event.target.value })) }}>
          <option value="">{t('recordAllTypes')}</option>
          {catalog.types.map(type => <option key={type.id} value={type.id}>{type.name}{type.enabled ? '' : ` · ${t('recordTypeDisabled')}`}</option>)}
        </select></label>
      <label className={recordCss.field} htmlFor={`${id}-after`}>{t('recordsAfter')}
        <Input id={`${id}-after`} type="date" value={filters.after} max={filters.before || undefined}
          onChange={(event) => { setFilters(current => ({ ...current, after: event.target.value })) }} /></label>
      <label className={recordCss.field} htmlFor={`${id}-before`}>{t('recordsBefore')}
        <Input id={`${id}-before`} type="date" value={filters.before} min={filters.after || undefined}
          onChange={(event) => { setFilters(current => ({ ...current, before: event.target.value })) }} /></label>
      <Button type="submit">{t('search')}</Button>
    </form>
    {resource.status === 'failed' ? <p role="alert">{t('recordsQueryFailed')}</p> : null}
    {resource.status === 'loading' && result === undefined ? <div className={css.loading} role="status" aria-label={t('recordsSearch')}><StateDot state="ongoing" /></div> : null}
    {result === undefined ? null : <>
      <p className={css.secondary}>{t('recordsCount', { count: result.total })}</p>
      {result.items.length ? <ul className={css.records}>{result.items.map(entry => <li key={entry.id}>
        <div className={css.header}>
          <h4>{entry.title}</h4>
          <Button variant="outline" size="sm" onClick={() => { setOpened(entry.id) }}>{t('recordOpen')}</Button>
        </div>
        <span className={css.secondary}><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time>
          {' · '}{catalog.types.find(type => type.id === entry.typeId)?.name ?? entry.typeId}
          {entry.updatedBy === 'operator' ? ` · ${t('recordOperatorEdited')}` : ''}</span>
        <p>{entry.content}{entry.truncated ? t('recordExcerpt') : ''}</p>
      </li>)}</ul> : <p>{t('recordsEmpty')}</p>}
      <div className={css.actions}>
        <Button variant="outline" disabled={pages.length < 2} onClick={() => { setPages(current => current.slice(0, -1)) }}>{t('recordsPrevious')}</Button>
        <Button variant="outline" disabled={result.nextOffset === null} onClick={() => {
          if (result.nextOffset !== null) setPages(current => [...current, result.nextOffset!])
        }}>{t('recordsNext')}</Button>
      </div>
    </>}
    <details className={recordCss.types}>
      <summary>{t('recordTypes')}</summary>
      <p className={css.secondary}>{t('recordTypesHint')}</p>
      <Button variant="outline" onClick={() => { setTypeEditor({ type: undefined }) }}>{t('recordTypeAdd')}</Button>
      <ul className={css.records}>{catalog.types.map(type => <li key={type.id}>
        <div className={css.header}><span>{type.name}{type.enabled ? '' : ` · ${t('recordTypeDisabled')}`}</span>
          <Button variant="outline" size="sm" onClick={() => { setTypeEditor({ type }) }}>{t('recordTypeEdit')}</Button></div>
      </li>)}</ul>
    </details>
    {opened === undefined ? null : <WritingDialog id={opened} catalog={catalog} {...{ useResource, edit, remove, refresh, t }} close={() => { setOpened(undefined) }} />}
    {typeEditor === undefined ? null : <WritingTypeEditor initial={typeEditor.type} catalog={catalog} {...{ saveType, t }} close={() => { setTypeEditor(undefined) }} />}
  </>
}
