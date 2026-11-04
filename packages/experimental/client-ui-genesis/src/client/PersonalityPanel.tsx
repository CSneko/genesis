/** Personality and expression editing over existing versioned memory operations. @module */
import { useId, useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LifeMemory } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { MemoryActions } from './MemoryPanel.tsx'
import { MemoryEditor } from './MemoryEditor.tsx'
import { MemoryEntry } from './MemoryEntry.tsx'
import css from './StatusPanel.module.css'

/**
 * Edit enduring personality and expression records without changing their evidence or identity.
 * @param props - Shared on-demand resource, locale and authenticated memory operations.
 * @returns Two wrapping groups; failed reads retain the last sample and failed saves retain the editor draft.
 */
export function PersonalityPanel({ useResource, save, saveSummary, summarize, remove, convert, refresh, t }: PropsRuntime<'genesis.page'> &
  PropsLocale<'genesis'> & InjectFace<MemoryActions>) {
  const id = useId()
  const resource = useResource<'genesis-personality'>('dsh-resource://genesis-personality/current')
  const [editing, setEditing] = useState<{ memory?: LifeMemory; category: 'self' | 'procedural' }>()
  const ready = resource.value !== undefined
  return <section className={css.panel} aria-labelledby={`${id}-title`}>
    <header className={css.header}>
      <h3 id={`${id}-title`}>{t('personalityTitle')}</h3>
      <Button variant="outline" size="sm" onClick={refresh} disabled={resource.status === 'loading'}>{t('refresh')}</Button>
    </header>
    <p className={css.secondary}>{t('personalityDescription')}</p>
    <p className={css.secondary}>{t('personalityLearningHint')}</p>
    {resource.status === 'loading' && !ready ? <div className={css.loading} role="status" aria-label={t('personalityTitle')}><StateDot state="ongoing" /></div> : null}
    {resource.status === 'failed' ? <p role="alert">{t('failed')}</p> : null}
    {resource.status === 'none' ? <p role="status">{t('unavailable')}</p> : null}
    {ready ? (['self', 'procedural'] as const).map((category) => {
      const entries = (resource.value?.entries ?? []).filter(memory => memory.category === category)
      return <div key={category}>
        <div className={css.header}>
          <h4>{t(category === 'self' ? 'personalityTendencies' : 'personalityStyle')}</h4>
          <Button size="sm" variant="outline" onClick={() => { setEditing({ category }) }}>
            {t(category === 'self' ? 'personalityAdd' : 'personalityAddStyle')}
          </Button>
        </div>
        {entries.length === 0 ? <p>{t('personalityEmpty')}</p> : <ul className={css.records}>
          {entries.map(memory => <MemoryEntry key={memory.id} memory={memory} remove={remove} convert={convert} saveSummary={saveSummary} summarize={summarize} t={t}
            edit={() => { setEditing({ category, memory }) }} removed={refresh} converted={refresh} />)}
        </ul>}
      </div>
    }) : null}
    {resource.value?.omitted ? <p className={css.secondary}>{t('omitted', { count: resource.value.omitted })}</p> : null}
    {editing === undefined ? null : <MemoryEditor initial={editing.memory} save={save} t={t}
      preset={{ category: editing.category, kind: 'non-declarative' }}
      title={t(editing.memory === undefined
        ? editing.category === 'self' ? 'personalityAdd' : 'personalityAddStyle'
        : editing.category === 'self' ? 'personalityEdit' : 'personalityEditStyle')}
      close={() => { setEditing(undefined) }} saved={() => { setEditing(undefined); refresh() }} />}
  </section>
}
