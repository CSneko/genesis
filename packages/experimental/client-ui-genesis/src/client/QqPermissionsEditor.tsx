/** Compact QQ permission rules with isolated, revision-fenced operator drafts. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { QqPermissionStatus, QqPermissionRule } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { ToolkitActions } from './ToolkitsPanel.tsx'
import css from './StatusPanel.module.css'
import toolkitCss from './ToolkitsPanel.module.css'

type Actions = Pick<ToolkitActions, 'savePermissions' | 'refresh'>
type Selection = { rule: QqPermissionRule; revision: number; index: number | null }
/** Show each person or group override without keeping every rule in an editable form.
 * @param props - Confirmed policy, connection state and authenticated edit actions.
 * @returns Rule summaries and one retained draft, with explicit conflict recovery.
 */
export function QqPermissionsEditor({
  sample,
  writable,
  savePermissions,
  refresh,
  t,
}: PropsLocale<'genesis'> &
  Actions & {
    sample: QqPermissionStatus
    writable: boolean
  }) {
  const [selected, setSelected] = useState<Selection>()
  return (
    <section className={toolkitCss.section}>
      <header className={css.header}>
        <h4>{t('qqPermissionsTitle')}</h4>
        <Button
          variant="outline"
          disabled={!writable}
          onClick={() => {
            setSelected({ rule: { scope: 'person', target: '', tool: '', effect: 'deny' }, revision: sample.revision, index: null })
          }}
        >
          {t('qqPermissionAdd')}
        </Button>
      </header>
      <p className={css.secondary}>{t('qqPermissionsHint')}</p>
      {sample.rules.length === 0 ? <p className={css.secondary}>{t('qqPermissionsEmpty')}</p> : null}
      <ul className={toolkitCss.list}>
        {sample.rules.map((rule, index) => (
          <li key={`${rule.scope}:${rule.target}:${rule.tool}`} className={toolkitCss.row}>
            <div className={toolkitCss.summary}>
              <span>
                {t(rule.scope === 'person' ? 'qqPermissionPerson' : 'qqPermissionGroup')} · {rule.target}
              </span>
              <p>{rule.tool}</p>
              <p className={css.secondary}>{t(rule.effect === 'allow' ? 'qqPermissionAllowed' : 'qqPermissionDenied')}</p>
            </div>
            <Button
              variant="outline"
              disabled={!writable}
              aria-label={t('permissionEditNamed', { target: rule.target, tool: rule.tool })}
              onClick={() => {
                setSelected({ rule, revision: sample.revision, index })
              }}
            >
              {t('toolkitEdit')}
            </Button>
          </li>
        ))}
      </ul>
      {selected ? (
        <PermissionEditor
          initial={selected}
          {...{ sample, writable, savePermissions, refresh, t }}
          close={() => {
            setSelected(undefined)
          }}
        />
      ) : null}
    </section>
  )
}
function PermissionEditor({
  initial,
  sample,
  writable,
  savePermissions,
  refresh,
  close,
  t,
}: PropsLocale<'genesis'> &
  Actions & {
    initial: Selection
    sample: QqPermissionStatus
    writable: boolean
    close(): void
  }) {
  const [draft, setDraft] = useState(() => ({ ...initial.rule }))
  const [revision] = useState(initial.revision)
  const [pending, setPending] = useState(false),
    [failed, setFailed] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  const conflict = sample.revision !== revision
  const commit = (remove: boolean) => {
    if (operation.current || !writable || conflict) return
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    setFailed(false)
    const rules = sample.rules.filter((_rule, index) => index !== initial.index)
    if (!remove) rules.splice(initial.index ?? rules.length, 0, draft)
    void savePermissions(rules, revision, owned.signal)
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
      title={t('qqPermissionsTitle')}
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
        <fieldset className={toolkitCss.form} disabled={!writable || pending}>
          <Checkbox
            label={t('qqPermissionWholeGroup')}
            checked={draft.scope === 'group'}
            onChange={(value) => {
              setDraft(rule => ({ ...rule, scope: value ? 'group' : 'person' }))
            }}
          />
          <label className={toolkitCss.field}>
            {t(draft.scope === 'person' ? 'qqPermissionPerson' : 'qqPermissionGroup')}
            <Input
              required
              pattern="[1-9][0-9]*"
              value={draft.target}
              onChange={(event) => {
                setDraft(rule => ({ ...rule, target: event.target.value }))
              }}
            />
          </label>
          <label className={toolkitCss.field}>
            {t('qqPermissionTool')}
            <Input
              required
              maxLength={512}
              value={draft.tool}
              onChange={(event) => {
                setDraft(rule => ({ ...rule, tool: event.target.value }))
              }}
            />
          </label>
          <Checkbox
            label={t('qqPermissionAllow')}
            checked={draft.effect === 'allow'}
            onChange={(value) => {
              setDraft(rule => ({ ...rule, effect: value ? 'allow' : 'deny' }))
            }}
          />
          <p>{t(draft.effect === 'allow' ? 'qqPermissionAllowed' : 'qqPermissionDenied')}</p>
        </fieldset>
        {conflict ? <p role="alert">{t('toolkitsConflict')}</p> : null}
        {failed ? <p role="alert">{t('toolkitSaveFailed')}</p> : null}
        <div className={`${css.actions} ${toolkitCss.actions}`}>
          <Button type="submit" disabled={!writable || pending || conflict}>
            {t(pending ? 'working' : 'qqPermissionsSave')}
          </Button>
          <Button variant="outline" disabled={pending} onClick={close}>
            {t('cancel')}
          </Button>
          {initial.index !== null ? (
            <Button
              variant="outline"
              disabled={!writable || pending || conflict}
              onClick={() => {
                commit(true)
              }}
            >
              {t('qqPermissionRemove')}
            </Button>
          ) : null}
          {conflict ? (
            <Button variant="outline" disabled={pending} onClick={close}>
              {t('qqPermissionsReload')}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  )
}
