/** Purpose-based Genesis workspaces sharing one reversible section registry. @module */
import { useId } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type {
  HostObservable,
  FactoryComponentPropsOf,
  PropsRuntime,
  PropsRenderFactories,
  InjectFace,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './mount.ts'
import css from './GenesisPage.module.css'

/** Daily-use destinations and their localized page navigation. */
export const genesisWorkspaces = {
  genesis: {
    title: 'homeTitle',
    description: 'homeDescription',
    pages: [
      { id: 'overview', label: 'title' },
      { id: 'emotion', label: 'emotionTitle' },
      { id: 'thoughts', label: 'thoughtsTitle' },
    ],
  },
  memories: {
    title: 'memoryPageTitle',
    description: 'memoriesWorkspaceDescription',
    pages: [
      { id: 'memories', label: 'memoryPageTitle' },
      { id: 'personality', label: 'personalityTitle' },
      { id: 'records', label: 'recordsTitle' },
    ],
  },
  actions: {
    title: 'actionsWorkspaceTitle',
    description: 'actionsWorkspaceDescription',
    pages: [
      { id: 'tasks', label: 'tasksTitle' },
      { id: 'agency', label: 'agencyTitle' },
      { id: 'outbox', label: 'outboxTitle' },
    ],
  },
  people: {
    title: 'peopleWorkspaceTitle',
    description: 'peopleWorkspaceDescription',
    pages: [
      { id: 'contacts', label: 'contactsTitle' },
      { id: 'relationship', label: 'peopleTitle' },
      { id: 'mail', label: 'mailTitle' },
    ],
  },
} as const
type Workspace = keyof typeof genesisWorkspaces
type Page = (typeof genesisWorkspaces)[Workspace]['pages'][number]['id']
type WorkspaceInput = { workspace: Workspace; close: () => void }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotFactoryMap {
    /** Shared section renderer with independent retained navigation per workspace. */
    'genesis.workspace': {
      scope: 'root'
      props: WorkspaceInput
      locale: 'genesis'
      inject: { hooks: { mailAvailable: HostObservable<boolean> } }
      store: ReturnType<typeof createGenesisNavigationStore>
      children: { 'genesis.page': { kind: 'keyed'; scope: 'root' } }
    }
  }
  interface SlotMap {
    /** Daily-use Genesis section; closing returns to the current conversation. */
    'genesis.page': { kind: 'keyed'; scope: 'root'; owner: { close: () => void } }
  }
}

/** Create section selections retained independently across workspace changes.
 * @returns Registration-owned navigation store and selection action. */
export function createGenesisNavigationStore() {
  return defineStore({
    init: (): { pages: Record<Workspace, Page> } => ({
      pages: {
        genesis: 'overview',
        memories: 'memories',
        actions: 'tasks',
        people: 'contacts',
      },
    }),
    actions: {
      select: (draft, workspace: Workspace, page: Page) => {
        draft.pages[workspace] = page
      },
    },
  })
}

/** Render one sidebar destination through the shared workspace factory.
 * @param props - Workspace identity, conversation return action and factory renderer.
 * @returns The selected workspace. */
export function GenesisWorkspace({
  workspace,
  close,
  renderFactorySlot,
}: PropsRuntime<'main'> & PropsRenderFactories & InjectFace<WorkspaceInput>) {
  return renderFactorySlot('genesis.workspace', { workspace, close })
}

/** Render only the sections belonging to the selected daily-use workspace.
 * @param props - Framework navigation store, section renderer, locale and workspace input.
 * @returns A wrapping page with a bounded set of section choices. */
export function GenesisPage({
  workspace,
  useStore,
  useMailAvailable,
  actions,
  renderSlot,
  close,
  t,
}: FactoryComponentPropsOf<'genesis.workspace'>) {
  const id = useId()
  const selected = useStore(state => state.pages[workspace])
  const mailAvailable = useMailAvailable(value => value)
  const page = selected === 'mail' && !mailAvailable ? 'contacts' : selected
  const destination = genesisWorkspaces[workspace]
  return (
    <main className={css.page} aria-labelledby={id}>
      <div className={css.content}>
        <header className={css.heading}>
          <h1 id={id}>{t(destination.title)}</h1>
          <p>{t(destination.description)}</p>
        </header>
        <nav className={css.navigation} aria-label={t('homeSections')}>
          {destination.pages
            .filter(item => item.id !== 'mail' || mailAvailable)
            .map(item => (
              <Button
                key={item.id}
                variant={page === item.id ? 'outline' : 'ghost'}
                size="sm"
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => {
                  actions.select(workspace, item.id)
                }}
              >
                {t(item.label)}
              </Button>
            ))}
        </nav>
        <div className={css.section}>{renderSlot('genesis.page', { close }, { entryKey: page })}</div>
      </div>
    </main>
  )
}
