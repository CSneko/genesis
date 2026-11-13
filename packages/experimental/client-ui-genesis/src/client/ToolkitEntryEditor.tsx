/** One revision-fenced toolkit draft; unrelated groups retain their confirmed values. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolkitDefinition, ToolkitStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { ToolkitActions } from './ToolkitsPanel.tsx'
import css from './StatusPanel.module.css'
import toolkitCss from './ToolkitsPanel.module.css'

/** Edit or remove one group against its original catalogue revision.
 * @param props - Selected definition, latest catalogue and authenticated save callback.
 * @returns A modal retaining failed and stale drafts until explicit reload or cancellation.
 */
export function ToolkitEntryEditor({
  initial,
  initialRevision,
  isNew,
  sample,
  writable,
  save,
  refresh,
  close,
  t,
}: PropsLocale<'genesis'> &
  Pick<ToolkitActions, 'save' | 'refresh'> & {
    initial: ToolkitDefinition
    initialRevision: number
    isNew: boolean
    sample: ToolkitStatus
    writable: boolean
    close(): void
  }) {
  const [draft, setDraft] = useState(() => ({ ...initial, members: initial.tools.join(', ') }))
  const [revision, setRevision] = useState(initialRevision)
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false)
  const [showTools, setShowTools] = useState(false),
    [showKnown, setShowKnown] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  const conflict = revision !== sample.revision
  const rules = draft.members
    .split(/[,，\n]/u)
    .map(value => value.trim())
    .filter(Boolean)
  const matching = [...new Set([...sample.learned, ...sample.available])]
    .filter(name => rules.some(rule => (rule.endsWith('*') ? name.startsWith(rule.slice(0, -1)) : name === rule)))
    .sort()
  const commit = (remove: boolean) => {
    if (operation.current || !writable || conflict) return
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    setFailed(false)
    const { members: _members, ...entry } = draft
    const value = { ...entry, tools: [...new Set(rules)] }
    const entries = sample.entries.filter(item => item.id !== initial.id)
    if (!remove)
      entries.splice(
        Math.max(
          0,
          sample.entries.findIndex(item => item.id === initial.id),
        ),
        0,
        value,
      )
    void save(entries, revision, owned.signal)
      .then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) {
          refresh()
          close()
        } else setFailed(true)
      })
      .catch(() => {
        if (!owned.signal.aborted) setFailed(true)
      })
      .finally(() => {
        operation.current = undefined
        if (!owned.signal.aborted) setPending(false)
      })
  }
  return (
    <Modal
      open
      title={initial.name || t('toolkitsNew')}
      closeLabel={t('close')}
      onClose={close}
      className={toolkitCss.dialog ?? ''}
      contentClassName={toolkitCss.dialogContent ?? ''}
    >
      <form
        className={css.editor}
        onSubmit={(event) => {
          event.preventDefault()
          if (event.currentTarget.reportValidity()) commit(false)
        }}
      >
        <fieldset className={toolkitCss.form} disabled={pending || !writable}>
          <label className={toolkitCss.field}>
            {t('toolkitName')}
            <Input
              required
              maxLength={200}
              value={draft.name}
              onChange={(event) => {
                setDraft(value => ({ ...value, name: event.target.value }))
              }}
            />
          </label>
          <label className={toolkitCss.field}>
            {t('toolkitDescription')}
            <Input
              maxLength={2000}
              value={draft.description}
              onChange={(event) => {
                setDraft(value => ({ ...value, description: event.target.value }))
              }}
            />
          </label>
          <label className={toolkitCss.field}>
            {t('toolkitMembers')}
            <Input
              value={draft.members}
              onChange={(event) => {
                setDraft(value => ({ ...value, members: event.target.value }))
              }}
            />
          </label>
          <p className={css.secondary}>{t('toolkitsMembersHint')}</p>
          <Checkbox
            label={t('toolkitQqEnabled')}
            checked={draft.qqAccess === 'anyone' || draft.qqAccess === 'operator'}
            onChange={(value) => {
              setDraft(current => ({ ...current, qqAccess: value ? 'operator' : 'disabled' }))
            }}
          />
          {draft.qqAccess === 'anyone' || draft.qqAccess === 'operator' ? (
            <Checkbox
              label={t('toolkitQqOperator')}
              checked={draft.qqAccess === 'operator'}
              onChange={(value) => {
                setDraft(current => ({ ...current, qqAccess: value ? 'operator' : 'anyone' }))
              }}
            />
          ) : null}
          <p className={css.secondary}>{t('toolkitQqHint')}</p>
        </fieldset>
        <details
          open={showTools}
          onToggle={(event) => {
            setShowTools(event.currentTarget.open)
          }}
        >
          <summary>{t('toolkitMembersCount', { count: matching.length })}</summary>
          {showTools ? (
            <ul className={toolkitCss.tools}>
              {matching.map(name => (
                <li key={name}>
                  {name} · {t(sample.available.includes(name) ? 'toolkitAvailable' : 'toolkitUnavailable')}
                </li>
              ))}
            </ul>
          ) : null}
        </details>
        <details
          open={showKnown}
          onToggle={(event) => {
            setShowKnown(event.currentTarget.open)
          }}
        >
          <summary>{t('toolkitsKnown')}</summary>
          {showKnown ? (
            <ul className={toolkitCss.tools}>
              {[...new Set([...sample.learned, ...sample.available])].sort().map(name => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : null}
        </details>
        {conflict ? <p role="alert">{t('toolkitsConflict')}</p> : null}
        {failed ? <p role="alert">{t('toolkitSaveFailed')}</p> : null}
        <div className={`${css.actions} ${toolkitCss.actions}`}>
          <Button type="submit" disabled={!writable || pending || conflict}>
            {t(pending ? 'working' : 'toolkitsSave')}
          </Button>
          <Button variant="outline" disabled={pending} onClick={close}>
            {t('cancel')}
          </Button>
          {sample.entries.some(item => item.id === initial.id) ? (
            <Button
              variant="outline"
              disabled={!writable || pending || conflict}
              onClick={() => {
                commit(true)
              }}
            >
              {t('toolkitRemove')}
            </Button>
          ) : null}
          {conflict ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                const latest = sample.entries.find(item => item.id === initial.id)
                if (latest === undefined && !isNew) {
                  close()
                  return
                }
                setDraft({ ...(latest ?? initial), members: (latest ?? initial).tools.join(', ') })
                setRevision(sample.revision)
                setFailed(false)
              }}
            >
              {t('toolkitsReload')}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}
