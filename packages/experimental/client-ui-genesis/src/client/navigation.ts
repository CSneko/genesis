/** Reversible Genesis daily-use workspaces and sidebar registrations. @module */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import {
  IconSparkleRegular,
  IconLayersOutlineRegular,
  IconChecklistOutlineRegular,
  IconUsersOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { GenesisPage, GenesisWorkspace, createGenesisNavigationStore, genesisWorkspaces } from './GenesisPage.tsx'

const destinations = [
  { workspace: 'genesis', id: 'genesis', icon: IconSparkleRegular },
  { workspace: 'memories', id: 'genesis-memories', icon: IconLayersOutlineRegular },
  { workspace: 'actions', id: 'genesis-actions', icon: IconChecklistOutlineRegular },
  { workspace: 'people', id: 'genesis-people', icon: IconUsersOutlineRegular },
] as const

/**
 * Seat four daily-use workspaces beside existing global panels, sharing section providers.
 * @param ctx - Locale, layout and slot owner; all registrations follow its lifetime.
 */
export function mountNavigation(ctx: Context): void {
  ctx.slots.registerFactory(
    {
      name: 'genesis.workspace',
      scope: 'root',
      locale: 'genesis',
      store: createGenesisNavigationStore(),
      inject: () => ({
        hooks: {
          mailAvailable: {
            getSnapshot: () => ctx.slots.entries('genesis.page').some(entry => entry.options.key === 'mail'),
            subscribe: (listener: () => void) => ctx.slots.subscribe('genesis.page', listener),
          },
        },
      }),
      children: { 'genesis.page': { kind: 'keyed', scope: 'root' } },
    },
    GenesisPage,
  )
  for (const [index, destination] of destinations.entries()) {
    const panelId = brandString<MainPanelId>(destination.id)
    ctx.slots.inject('main', () =>
      ctx.slots.register(
        {
          name: 'main',
          key: panelId,
          inject: () => ({
            workspace: destination.workspace,
            close: () => {
              ctx.layout.selectPanel(null)
            },
          }),
        },
        GenesisWorkspace,
      ),
    )
    ctx.slots.inject('sidebar.panellist', () =>
      ctx.slots.register(
        {
          name: 'sidebar.panellist',
          id: panelId,
          order: 15 + index,
          locale: 'genesis',
          label: () => ctx.locale.bind('genesis')(genesisWorkspaces[destination.workspace].title),
        },
        destination.icon,
      ),
    )
  }
}
