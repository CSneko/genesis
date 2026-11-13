/** Compact operator groups with one independently saved editor at a time. @module */
import { useState } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { ToolkitDefinition, ToolkitStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { QqPermissionsEditor } from './QqPermissionsEditor.tsx'
import { ToolkitEntryEditor } from './ToolkitEntryEditor.tsx'
import css from './StatusPanel.module.css'
import toolkitCss from './ToolkitsPanel.module.css'

/** Generated authenticated edits and resource invalidation. */
export interface ToolkitActions {
  savePermissions: TypertClientRemote['genesisToolkits']['savePermissions']
  save: TypertClientRemote['genesisToolkits']['save']
  refresh(this: void): void
}
/** Show compact toolkit summaries and separate QQ permission rules.
 * @param props - Shared catalogue resource, operator edits and localized copy.
 * @returns Bounded status with single-entry editing and retained data on query failure.
 */
export function ToolkitsPanel({
  useResource,
  save,
  savePermissions,
  refresh,
  t,
}: PropsRuntime<'settings.section'> & PropsLocale<'genesis'> & InjectFace<ToolkitActions>) {
  const resource = useResource<'genesis-toolkits'>('dsh-resource://genesis-toolkits/catalogue')
  return (
    <section className={css.panel}>
      <header className={css.header}>
        <h3>{t('toolkitsTitle')}</h3>
        <Button variant="outline" onClick={refresh}>
          {t('refresh')}
        </Button>
      </header>
      <p className={css.secondary}>{t('toolkitsDescription')}</p>
      {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
      {resource.value === undefined ? (
        resource.status === 'loading' ? (
          <div className={css.loading} role="status" aria-label={t('toolkitsTitle')}>
            <StateDot state="ongoing" />
          </div>
        ) : (
          <p>{t('unavailable')}</p>
        )
      ) : (
        <div className={toolkitCss.sections}>
          <ToolkitList sample={resource.value} writable={resource.status === 'live'} {...{ save, refresh, t }} />
          <QqPermissionsEditor
            sample={resource.value.qqPermissions}
            writable={resource.status === 'live'}
            {...{ savePermissions, refresh, t }}
          />
        </div>
      )}
    </section>
  )
}
function ToolkitList({
  sample,
  writable,
  save,
  refresh,
  t,
}: PropsLocale<'genesis'> & Pick<ToolkitActions, 'save' | 'refresh'> & { sample: ToolkitStatus; writable: boolean }) {
  const [selected, setSelected] = useState<{ entry: ToolkitDefinition; revision: number; isNew: boolean }>()
  const learned = (entry: ToolkitDefinition) =>
    sample.learned.filter(name => entry.tools.some(rule => (rule.endsWith('*') ? name.startsWith(rule.slice(0, -1)) : name === rule)))
      .length
  return (
    <section className={toolkitCss.section}>
      <header className={css.header}>
        <h4>{t('toolkitGroups')}</h4>
        <Button
          variant="outline"
          disabled={!writable}
          onClick={() => {
            setSelected({
              entry: { id: brandString<ToolkitDefinition['id']>(randomUUID()), name: '', description: '', tools: [] },
              revision: sample.revision,
              isNew: true,
            })
          }}
        >
          {t('toolkitsAdd')}
        </Button>
      </header>
      {sample.entries.length === 0 ? <p className={css.secondary}>{t('toolkitsEmpty')}</p> : null}
      <ul className={toolkitCss.list}>
        {sample.entries.map(entry => (
          <li key={entry.id} className={toolkitCss.row}>
            <div className={toolkitCss.summary}>
              <span>{entry.name}</span>
              {entry.description ? <p className={css.secondary}>{entry.description}</p> : null}
              <p className={css.secondary}>{t(learned(entry) > 0 ? 'toolkitVisible' : 'toolkitHidden', { count: learned(entry) })}</p>
            </div>
            <Button
              variant="outline"
              disabled={!writable}
              aria-label={t('toolkitEditNamed', { name: entry.name })}
              onClick={() => {
                setSelected({ entry, revision: sample.revision, isNew: false })
              }}
            >
              {t('toolkitEdit')}
            </Button>
          </li>
        ))}
      </ul>
      {sample.managed?.length ? (
        <>
          <h4>{t('toolkitsManaged')}</h4>
          <p className={css.secondary}>{t('toolkitsManagedHint')}</p>
          <ul className={toolkitCss.list}>
            {sample.managed.map(entry => (
              <li key={entry.id} className={toolkitCss.row}>
                <div className={toolkitCss.summary}>
                  <span>{entry.name}</span>
                  <p className={css.secondary}>{t(learned(entry) > 0 ? 'toolkitVisible' : 'toolkitHidden', { count: learned(entry) })}</p>
                </div>
                <span className={css.secondary}>{t('toolkitAutomatic')}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {selected ? (
        <ToolkitEntryEditor
          key={selected.entry.id}
          initial={selected.entry}
          initialRevision={selected.revision}
          isNew={selected.isNew}
          sample={sample}
          writable={writable}
          {...{ save, refresh, t }}
          close={() => {
            setSelected(undefined)
          }}
        />
      ) : null}
    </section>
  )
}
