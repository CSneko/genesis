/** Versioned operator memory drafts, with editable candidate fields and source ownership on the Host. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, InlineEditor, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LifeMemory, MemoryDraft, MemoryId } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { MemoryActions } from './MemoryPanel.tsx'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'
import recordCss from './RecordsPanel.module.css'

/**
 * Edit a candidate memory without inventing source references or replacing its identity.
 * A supplied preset fixes the layer and category and hides score controls; without it all draft fields are editable.
 * @param props - Optional existing version, authenticated save and owning page callbacks.
 * @returns A dismissible editor retaining drafts after rejected writes.
 */
export function MemoryEditor({
  initial,
  save,
  saved,
  close,
  t,
  preset,
  title,
}: PropsLocale<'genesis'> &
  Pick<MemoryActions, 'save'> & {
    preset?: Pick<MemoryDraft, 'category' | 'kind'> | undefined
    title?: string | undefined
    initial: LifeMemory | undefined
    saved: (memory: LifeMemory) => void
    close: () => void
  }) {
  const field = useId()
  const [id] = useState(() => initial?.id ?? brandString<MemoryId>(randomUUID()))
  const [draft, setDraft] = useState<MemoryDraft>(() => ({
    content: initial?.content ?? '',
    category: initial?.category ?? preset?.category ?? 'semantic',
    kind: initial?.kind ?? preset?.kind ?? (initial?.category === 'procedural' ? 'non-declarative' : 'declarative'),
    importance: initial?.importance ?? 0.5,
    confidence: initial?.confidence ?? 0.5,
  }))
  const [organizationType, setOrganizationType] = useState<NonNullable<LifeMemory['organization']>['type']>(
    initial?.organization?.type ?? (initial?.experience === undefined ? 'unclassified' : 'event'),
  )
  const [paths, setPaths] = useState(() => (initial?.organization?.paths ?? []).map(path => path.join(' / ')).join('\n'))
  const [subjects, setSubjects] = useState(() => (initial?.organization?.subjects ?? []).map(subject => subject.name).join('\n'))
  const [organizationChanged, setOrganizationChanged] = useState(false)
  const validOrganization =
    draft.kind !== 'declarative' ||
    ((organizationType !== 'knowledge' || paths.split('\n').some(path => path.split('/').every(part => part.trim()))) &&
      (organizationType !== 'person' || Boolean(subjects.trim())))
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  const submit = () => {
    if (operation.current !== undefined || !draft.content.trim() || !validOrganization) return
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    setFailure(undefined)
    const organization: LifeMemory['organization'] =
      draft.kind !== 'declarative' || (!organizationChanged && initial?.organization === undefined)
        ? undefined
        : {
          version: 1,
          type: organizationType,
          ...(paths.trim()
            ? {
              paths: paths
                .split('\n')
                .filter(line => line.trim())
                .map(line => line.split('/').map(part => part.trim())),
            }
            : {}),
          ...(subjects.trim()
            ? {
              subjects: subjects
                .split('\n')
                .filter(line => line.trim())
                .map((line, index) => {
                  const name = line.trim()
                  const original = initial?.organization?.subjects?.[index]
                  return original?.name === name ? original : { name }
                }),
            }
            : {}),
        }
    void save(id, { ...draft, ...(organization === undefined ? {} : { organization }) }, initial?.updatedAt ?? null, owned.signal)
      .then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) saved(result.value)
        else setFailure(operationFailure(result.error, [], t('unknownError')))
      })
      .catch((error: unknown) => {
        if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
      })
      .finally(() => {
        operation.current = undefined
        if (!owned.signal.aborted) setPending(false)
      })
  }
  return (
    <Modal
      open
      className={recordCss.dialog ?? ''}
      contentClassName={recordCss.dialogContent ?? ''}
      title={title ?? t(initial === undefined ? 'addMemory' : 'editMemory')}
      closeLabel={t('close')}
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <fieldset className={css.modelFields} disabled={pending}>
          <InlineEditor
            label={t('memoryContent')}
            value={draft.content}
            onChange={(content) => {
              setDraft(current => ({ ...current, content }))
            }}
            onSave={submit}
            onCancel={close}
          />
          {preset === undefined ? (
            <>
              <div className={css.actions}>
                {(['declarative', 'non-declarative'] as const).map(kind => (
                  <Button
                    key={kind}
                    type="button"
                    variant="outline"
                    aria-pressed={draft.kind === kind}
                    onClick={() => {
                      setDraft(current => ({ ...current, kind }))
                    }}
                  >
                    {t(`kind.${kind}`)}
                  </Button>
                ))}
              </div>
              <div className={css.actions}>
                {(['episodic', 'semantic', 'self', 'procedural'] as const).map(category => (
                  <Button
                    key={category}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={draft.category === category}
                    onClick={() => {
                      setDraft(current => ({ ...current, category }))
                    }}
                  >
                    {t(`category.${category}`)}
                  </Button>
                ))}
              </div>
              {draft.kind !== 'declarative' ? null : (
                <>
                  <label htmlFor={`${field}-organization`}>{t('memoryOrganizationTypes')}</label>
                  <select
                    className={recordCss.select}
                    id={`${field}-organization`}
                    value={organizationType}
                    onChange={(event) => {
                      const type = event.target.value
                      if (type === 'knowledge' || type === 'person' || type === 'event' || type === 'unclassified') {
                        setOrganizationType(type)
                        setOrganizationChanged(true)
                      }
                    }}
                  >
                    {(['knowledge', 'person', 'event', 'unclassified'] as const).map(type => (
                      <option key={type} value={type}>
                        {t(`memoryType.${type}`)}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`${field}-paths`}>{t('memoryDirectoryPaths')}</label>
                  <textarea
                    className={recordCss.select}
                    id={`${field}-paths`}
                    rows={3}
                    value={paths}
                    onChange={(event) => {
                      setPaths(event.target.value)
                      setOrganizationChanged(true)
                    }}
                  />
                  <label htmlFor={`${field}-subjects`}>{t('memorySubjectNames')}</label>
                  <textarea
                    className={recordCss.select}
                    id={`${field}-subjects`}
                    rows={3}
                    value={subjects}
                    onChange={(event) => {
                      setSubjects(event.target.value)
                      setOrganizationChanged(true)
                    }}
                  />
                  <p className={css.secondary}>{t('memoryOrganizationEditHint')}</p>
                </>
              )}
              <label htmlFor={`${field}-importance`}>{t('memoryImportance')}</label>
              <Input
                id={`${field}-importance`}
                required
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.importance}
                onChange={(event) => {
                  setDraft(current => ({ ...current, importance: Number(event.target.value) }))
                }}
              />
              <label htmlFor={`${field}-confidence`}>{t('memoryConfidence')}</label>
              <Input
                id={`${field}-confidence`}
                required
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={draft.confidence}
                onChange={(event) => {
                  setDraft(current => ({ ...current, confidence: Number(event.target.value) }))
                }}
              />
            </>
          ) : null}
          <p className={css.secondary}>{t('operatorMemoryHint')}</p>
          <Button type="submit" disabled={!draft.content.trim() || !validOrganization}>
            {t(pending ? 'working' : 'saveMemory')}
          </Button>
        </fieldset>
        {failure === undefined ? null : <p role="alert">{t('memoryEditFailed', { reason: failure })}</p>}
      </form>
    </Modal>
  )
}
