/** Source-preserving memory layer conversion controls. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LifeStatus, MemoryKind } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { MemoryActions } from './MemoryPanel.tsx'
import { MemorySummaryEditor } from './MemorySummaryEditor.tsx'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

type Props = PropsLocale<'genesis'> &
  Pick<MemoryActions, 'convert' | 'remove' | 'saveSummary' | 'summarize'> & {
    memory: LifeStatus['memories'][number]
    edit: () => void
    removed: () => void
    converted: (memory: LifeStatus['memories'][number]) => void
    selected?: boolean | undefined
    selectionDisabled?: boolean | undefined
    select?: ((checked: boolean) => void) | undefined
    operatorName?: string | undefined
  }

/**
 * Show a memory's layer, source and reversible operator conversion.
 * @param props - Displayed version and authenticated conversion; stale versions are refused by the Host.
 * @returns One wrapping list entry retaining its original content after a failure.
 */
export function MemoryEntry({
  memory,
  convert,
  remove,
  saveSummary,
  summarize,
  edit,
  removed,
  converted,
  selected,
  selectionDisabled = false,
  select,
  operatorName,
  t,
}: Props) {
  const kind: MemoryKind = memory.kind ?? (memory.category === 'procedural' ? 'non-declarative' : 'declarative')
  const target = kind === 'declarative' ? 'non-declarative' : 'declarative'
  const [deleting, setDeleting] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [pending, setPending] = useState<false | 'summary' | 'convert' | 'delete'>(false)
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  return (
    <li>
      {selected === undefined || select === undefined ? null : (
        <Checkbox label={t('selectMemory')} checked={selected} disabled={selectionDisabled} onChange={select} />
      )}
      <span className={css.secondary}>
        {t(`kind.${kind}`)} · {t(`category.${memory.category}`)} · {t('candidate')}
      </span>
      {kind !== 'declarative' ? null : (
        <div className={css.secondary}>
          <span>{t(`memoryType.${memory.organization?.type ?? (memory.experience === undefined ? 'unclassified' : 'event')}`)}</span>
          {memory.organization?.paths?.map(path => (
            <p key={JSON.stringify(path)}>{path.join(' / ')}</p>
          ))}
          {memory.organization?.subjects?.map((subject, index) => (
            <p key={index}>{subject.name}</p>
          ))}
        </div>
      )}
      {memory.experience === undefined ? null : (
        <div className={css.secondary}>
          <span>{t('experienceSpan')} </span>
          <time dateTime={memory.experience.startedAt}>{new Date(memory.experience.startedAt).toLocaleString()}</time>
          {' — '}
          <time dateTime={memory.experience.endedAt}>{new Date(memory.experience.endedAt).toLocaleString()}</time>
          <p>{memory.experience.topics.join(' · ')}</p>
        </div>
      )}
      {memory.habit === undefined ? null : (
        <div className={css.secondary}>
          <span>{t(memory.habit.active && kind === 'non-declarative' ? 'habitActive' : 'habitRetired')}</span>
          <p>{t('habitCue', { cue: memory.habit.cue })}</p>
          <p>{t('habitResponse', { response: memory.habit.response })}</p>
          <details>
            <summary>{t('habitEvidence')}</summary>
            <code>{memory.habit.supportEventIds.join(', ')}</code>
          </details>
        </div>
      )}
      {memory.history?.length ? <span className={css.secondary}>{t('currentUnderstanding')}</span> : null}
      <p>{memory.summary ?? memory.content}</p>
      {memory.summary === undefined ? null : (
        <details>
          <summary>{t('viewMemoryContent')}</summary>
          <p>{memory.content}</p>
        </details>
      )}
      {memory.attribution === undefined ? null : (
        <span className={css.secondary}>
          {memory.attribution === 'user-stated' && operatorName
            ? t('namedAttribution', { name: operatorName })
            : t(`attribution.${memory.attribution}`)}
        </span>
      )}
      {memory.experienceIds?.length ? (
        <details>
          <summary>{t('relatedExperiences')}</summary>
          <code>{memory.experienceIds.join(', ')}</code>
        </details>
      ) : null}
      {memory.history?.length ? (
        <details>
          <summary>{t('pastUnderstandings', { count: memory.history.length })}</summary>
          <p className={css.secondary}>{t('historyHint')}</p>
          <ol>
            {[...memory.history].reverse().map(version => (
              <li key={version.supersededAt}>
                <span className={css.secondary}>
                  <time dateTime={version.recordedAt}>{new Date(version.recordedAt).toLocaleString()}</time>
                  {' — '}
                  <time dateTime={version.supersededAt}>{new Date(version.supersededAt).toLocaleString()}</time>
                </span>
                <p>{version.content}</p>
                <details>
                  <summary>{t('source')}</summary>
                  <code>{version.sourceEventIds.join(', ')}</code>
                </details>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <details>
        <summary>{t('source')}</summary>
        <code>{memory.sourceEventIds.join(', ')}</code>
      </details>
      <div className={css.actions}>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(pending)}
          onClick={() => {
            setEditingSummary(true)
          }}
        >
          {t('editMemorySummary')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(pending)}
          onClick={() => {
            if (operation.current !== undefined) return
            const owned = new AbortController()
            operation.current = owned
            setPending('summary')
            setFailure(undefined)
            void summarize(memory.id, memory.updatedAt, owned.signal)
              .then((result) => {
                if (owned.signal.aborted) return
                if (result.ok) converted(result.value)
                else setFailure(operationFailure(result.error, [], t('unknownError')))
              })
              .catch((error: unknown) => {
                if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
              })
              .finally(() => {
                operation.current = undefined
                if (!owned.signal.aborted) setPending(false)
              })
          }}
        >
          {t(pending === 'summary' ? 'working' : memory.summary === undefined ? 'generateMemorySummary' : 'regenerateMemorySummary')}
        </Button>
        <Button variant="outline" size="sm" disabled={Boolean(pending)} onClick={edit}>
          {t('editMemory')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(pending)}
          onClick={() => {
            if (operation.current !== undefined) return
            const owned = new AbortController()
            operation.current = owned
            setPending('convert')
            setFailure(undefined)
            void convert(memory.id, target, memory.updatedAt, owned.signal)
              .then((result) => {
                if (owned.signal.aborted) return
                if (result.ok) converted(result.value)
                else setFailure(operationFailure(result.error, [], t('unknownError')))
              })
              .catch((error: unknown) => {
                if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
              })
              .finally(() => {
                operation.current = undefined
                if (!owned.signal.aborted) setPending(false)
              })
          }}
        >
          {t(pending === 'convert' ? 'converting' : target === 'declarative' ? 'toDeclarative' : 'toImplicit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(pending)}
          onClick={() => {
            setDeleting(true)
          }}
        >
          {t('deleteMemory')}
        </Button>
      </div>
      {deleting ? (
        <div className={css.actions}>
          <Button
            size="sm"
            disabled={Boolean(pending)}
            onClick={() => {
              if (operation.current !== undefined) return
              const owned = new AbortController()
              operation.current = owned
              setPending('delete')
              setFailure(undefined)
              void remove(memory.id, memory.updatedAt, owned.signal)
                .then((result) => {
                  if (owned.signal.aborted) return
                  if (result.ok) removed()
                  else setFailure(operationFailure(result.error, [], t('unknownError')))
                })
                .catch((error: unknown) => {
                  if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
                })
                .finally(() => {
                  operation.current = undefined
                  if (!owned.signal.aborted) setPending(false)
                })
            }}
          >
            {t('confirmDeleteMemory')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(pending)}
            onClick={() => {
              setDeleting(false)
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      ) : null}
      {failure === undefined ? null : <p role="alert">{t('memoryEditFailed', { reason: failure })}</p>}
      {!editingSummary ? null : (
        <MemorySummaryEditor
          memory={memory}
          saveSummary={saveSummary}
          t={t}
          close={() => {
            setEditingSummary(false)
          }}
          saved={(memory) => {
            converted(memory)
            setEditingSummary(false)
          }}
        />
      )}
    </li>
  )
}
