/** Independent memory browser and operator CRUD, separate from model/knowledge configuration. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { LifeMemory, MemoryCatalog, MemoryKind } from '@deepseek-ai/dsh-experimental-genesis/types'
import { ConsolidationControls } from './ConsolidationControls.tsx'
import { MemoryEntry } from './MemoryEntry.tsx'
import { MemoryEditor } from './MemoryEditor.tsx'
import { MemoryOrganizer } from './MemoryOrganizer.tsx'
import { OperatorIdentity } from './OperatorIdentity.tsx'
import { ReviewSummary } from './ReviewNotice.tsx'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

type MemoryRemote = TypertClientRemote['genesisMemory']
/** Authenticated mutation methods and paged memory browsing supplied by the owning plugin. */
export interface MemoryActions {
  saveOperator: MemoryRemote['saveOperator']
  organize: MemoryRemote['organize']
  setConsolidation: MemoryRemote['setConsolidation']
  consolidate: MemoryRemote['consolidate']
  save: MemoryRemote['save']
  saveSummary: MemoryRemote['saveSummary']
  summarize: MemoryRemote['summarize']
  remove: MemoryRemote['deleteMemory']
  convert: MemoryRemote['convert']
  browse(this: void, query: string, kind: MemoryKind | 'all', offset: number, signal: AbortSignal): Promise<RemoteResult<MemoryCatalog>>
  refresh(this: void): void
}

/**
 * Browse every stored memory one page at a time, search it, and mutate sourced candidates.
 * @param props - Shared resources, localized copy and authenticated version-fenced mutations.
 * @returns An independent Genesis memory page; failures retain the displayed data and drafts.
 */
export function MemoryPanel({ useResource, save, saveSummary, summarize, remove, convert, organize, saveOperator, setConsolidation, consolidate, browse, refresh, t }: PropsRuntime<'genesis.page'> &
  PropsLocale<'genesis'> & InjectFace<MemoryActions>) {
  const id = useId()
  const resource = useResource<'genesis'>('dsh-resource://genesis/status')
  const status = resource.value
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [layer, setLayer] = useState<MemoryKind | 'all'>('all')
  const [offset, setOffset] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const [catalog, setCatalog] = useState<MemoryCatalog>()
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<string>()
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState<{ memory: LifeMemory | undefined }>()
  const [selected, setSelected] = useState<LifeMemory[]>([])
  const [organizing, setOrganizing] = useState(false)
  const operation = useRef<AbortController>()
  const browseRef = useRef(browse)
  browseRef.current = browse
  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => () => { operation.current?.abort() }, [])
  useEffect(() => {
    const owned = new AbortController()
    operation.current?.abort(); operation.current = owned
    setLoading(true); setFailure(undefined)
    void browseRef.current(applied, layer, offset, owned.signal).then((result) => {
      if (owned.signal.aborted) return
      if (result.ok) setCatalog(result.value)
      else setFailure(operationFailure(result.error, [], tRef.current('unknownError')))
    }).catch((error: unknown) => {
      if (!owned.signal.aborted) setFailure(operationFailure(error, [], tRef.current('unknownError')))
    }).finally(() => { if (!owned.signal.aborted) { operation.current = undefined; setLoading(false) } })
    return () => owned.abort()
  }, [applied, layer, offset, revision])
  const memories = catalog?.items ?? []
  const nextOffset = catalog?.nextOffset ?? null
  const resetPage = () => { setOffset(0); setHistory([]) }
  const replace = (updated: LifeMemory) => {
    setCatalog(current => current === undefined ? current
      : current.items.some(item => item.id === updated.id)
        ? { ...current, items: current.items.map(item => item.id === updated.id ? updated : item) }
        : { ...current, items: [updated, ...current.items], total: current.total + 1 })
    refresh()
  }
  const forget = (memory: LifeMemory) => {
    setSelected(current => current.filter(item => item.id !== memory.id))
    setCatalog(current => current === undefined ? current
      : { ...current, items: current.items.filter(item => item.id !== memory.id), total: Math.max(0, current.total - 1) })
    refresh()
  }
  return <section className={css.panel} aria-labelledby={`${id}-title`}>
    <header className={css.header}>
      <h3 id={`${id}-title`}>{t('memoryPageTitle')}</h3>
      <div className={css.actions}>
        <Button size="sm" onClick={() => { setEditing({ memory: undefined }) }}>{t('addMemory')}</Button>
        <Button variant="outline" size="sm" onClick={() => {
          setQuery(''); setApplied(''); resetPage(); setRevision(current => current + 1); refresh()
        }}>{t('refresh')}</Button>
      </div>
    </header>
    <p className={css.secondary}>{t('memoryDescription')}</p>
    {status?.operator === undefined ? null : <details>
      <summary>{t('operatorIdentityTitle')} · {status.operator.name || t('operatorIdentityUnset')}</summary>
      <OperatorIdentity profile={status.operator} saveOperator={saveOperator} t={t}
        saved={() => { setSelected([]); refresh() }} />
    </details>}
    {status?.consolidation === undefined ? null : <ConsolidationControls status={status.consolidation}
      setConsolidation={setConsolidation} consolidate={consolidate} refresh={refresh} t={t} />}
    {(resource.status === 'loading' && status === undefined) || (loading && catalog === undefined)
      ? <div className={css.loading}><StateDot state="ongoing" /></div> : null}
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {failure === undefined ? null : <p role="alert">{t('memoryLoadFailed', { reason: failure })}</p>}
    {status?.review === undefined ? null : <ReviewSummary review={status.review} t={t} />}
    <div className={css.actions}>{(['all', 'declarative', 'non-declarative'] as const).map(kind =>
      <Button key={kind} variant="outline" size="sm" aria-pressed={layer === kind} onClick={() => { setLayer(kind); resetPage() }}>
        {t(kind === 'all' ? 'allMemories' : `kind.${kind}`)}
      </Button>)}</div>
    <form className={css.search} onSubmit={(event) => {
      event.preventDefault()
      if (applied === query && offset === 0) setRevision(current => current + 1)
      else { setApplied(query); resetPage() }
    }}>
      <label htmlFor={`${id}-query`}>{t('searchMemories')}</label>
      <Input id={`${id}-query`} value={query} onChange={(event) => { setQuery(event.target.value) }} />
      <Button type="submit">{t('search')}</Button>
    </form>
    <p>{t('memoryCount', { count: status?.counts.memories ?? 0 })}</p>
    {status?.organization === undefined ? null : <div className={css.editor}>
      <p className={css.secondary}>{t('organizationSelectionHint', { count: status.organization.selectionLimit })}</p>
      <div className={css.actions}>
        <span>{t('selectedMemories', { count: selected.length })}</span>
        <Button size="sm" disabled={selected.length < 2} onClick={() => { setOrganizing(true) }}>{t('organizeMemories')}</Button>
        <Button variant="outline" size="sm" disabled={selected.length === 0} onClick={() => { setSelected([]) }}>{t('clearSelection')}</Button>
      </div>
    </div>}
    {memories.length === 0 ? (catalog === undefined ? null : <p>{t('emptyMemories')}</p>) : <ul className={css.records}>
      {memories.map(memory => <MemoryEntry key={memory.id} memory={memory} convert={convert} remove={remove} saveSummary={saveSummary} summarize={summarize} t={t}
        operatorName={status?.operator?.name}
        selected={status?.organization === undefined ? undefined : selected.some(item => item.id === memory.id)}
        selectionDisabled={!selected.some(item => item.id === memory.id) && selected.length >= (status?.organization?.selectionLimit ?? 0)}
        select={(checked) => { setSelected(current => checked ? [...current.filter(item => item.id !== memory.id), memory] : current.filter(item => item.id !== memory.id)) }}
        edit={() => { setEditing({ memory }) }} converted={replace}
        removed={() => { forget(memory) }} />)}
    </ul>}
    {offset === 0 && nextOffset === null ? null : <div className={css.actions}>
      <Button variant="outline" size="sm" disabled={history.length === 0} onClick={() => {
        const previous = history[history.length - 1] ?? 0
        setHistory(current => current.slice(0, -1))
        if (previous === offset) setRevision(current => current + 1)
        else setOffset(previous)
      }}>{t('previousPage')}</Button>
      <span className={css.secondary}>{t('memoryRange', { start: offset + 1, end: offset + memories.length, total: catalog?.total ?? 0 })}</span>
      <Button variant="outline" size="sm" disabled={nextOffset === null} onClick={() => {
        if (nextOffset === null) return
        if (nextOffset === offset) { setRevision(current => current + 1); return }
        setHistory(current => [...current, offset]); setOffset(nextOffset)
      }}>{t('nextPage')}</Button>
    </div>}
    <p className={css.secondary}>{t('boundedSearch')}</p>
    {editing === undefined ? null : <MemoryEditor initial={editing.memory} save={save} t={t}
      close={() => { setEditing(undefined) }} saved={(memory) => {
        const created = editing.memory === undefined
        replace(memory); setEditing(undefined); if (created) resetPage()
      }} />}
    {!organizing || status?.organization === undefined ? null : <MemoryOrganizer sources={selected} maxResults={status.organization.maxResults}
      organize={organize} t={t} close={() => { setOrganizing(false); refresh() }} saved={(created) => {
        setCatalog(current => current === undefined ? current : {
          ...current,
          items: [...created, ...current.items.filter(item => !selected.some(source => source.id === item.id)
            && !created.some(memory => memory.id === item.id))],
          total: Math.max(0, current.total - selected.length) + created.length,
        })
        setSelected([]); setOrganizing(false); resetPage()
      }} />}
  </section>
}
