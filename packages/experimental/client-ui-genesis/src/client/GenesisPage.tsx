/** Genesis daily-use navigation, separate from deployment and model settings. @module */
import { useId } from 'react'
import { Button, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { PropsRuntime, PropsLocale, PropsStore, PropsRenderSlots, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from './mount.ts'
import css from './GenesisPage.module.css'

const pages = [
  { id: 'overview', label: 'title' }, { id: 'tasks', label: 'tasksTitle' },
  { id: 'memories', label: 'memoryPageTitle' }, { id: 'personality', label: 'personalityTitle' },
  { id: 'emotion', label: 'emotionTitle' }, { id: 'relationship', label: 'peopleTitle' },
  { id: 'agency', label: 'agencyTitle' }, { id: 'records', label: 'recordsTitle' },
  { id: 'contacts', label: 'contactsTitle' }, { id: 'mail', label: 'mailTitle' },
  { id: 'outbox', label: 'outboxTitle' }, { id: 'thoughts', label: 'thoughtsTitle' },
] as const
type Page = typeof pages[number]['id']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Daily-use Genesis section; closing returns to the current conversation. */
    'genesis.page': { kind: 'keyed'; scope: 'root'; owner: { close: () => void } }
  }
}

/** Create registration-owned section selection, retained across main-panel navigation.
 * @returns Navigation state and explicit selection action. */
export function createGenesisNavigationStore() {
  return defineStore({ init: () => ({ page: 'overview' as Page }),
    actions: { select: (draft, page: Page) => { draft.page = page } } })
}

/** Render the library's decorative glyph; the sidebar owns its accessible label.
 * @param props - Existing sidebar icon sizing.
 * @returns The Genesis navigation icon. */
export function GenesisIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <IconSparkleRegular size={size} /> }

/** Render daily-use sections through their own keyed seat.
 * @param props - Framework navigation store, section renderer, locale and conversation return action.
 * @returns A wrapping main page with independently scrollable content. */
export function GenesisPage({ useStore, actions, renderSlot, close, t }: PropsRuntime<'main'> & PropsLocale<'genesis'> &
  PropsStore<ReturnType<typeof createGenesisNavigationStore>> & PropsRenderSlots<'genesis.page'> & InjectFace<{ close: () => void }>) {
  const id = useId()
  const page = useStore(state => state.page)
  return <main className={css.page} aria-labelledby={id}>
    <div className={css.content}>
      <header className={css.heading}><h1 id={id}>{t('homeTitle')}</h1><p>{t('homeDescription')}</p></header>
      <nav className={css.navigation} aria-label={t('homeSections')}>
        {pages.map(item => <Button key={item.id} variant={page === item.id ? 'outline' : 'ghost'} size="sm"
          aria-current={page === item.id ? 'page' : undefined} onClick={() => { actions.select(item.id) }}>{t(item.label)}</Button>)}
      </nav>
      <div className={css.section}>{renderSlot('genesis.page', { close }, { entryKey: page })}</div>
    </div>
  </main>
}
