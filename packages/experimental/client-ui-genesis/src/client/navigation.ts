/** Reversible Genesis main-page and sidebar registrations. @module */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { GenesisPage, GenesisIcon, createGenesisNavigationStore } from './GenesisPage.tsx'

/**
 * Seat the Genesis page beside existing global panels; operational sections occupy its keyed child slot.
 * @param ctx - Locale, layout and slot owner; registrations follow its lifetime.
 */
export function mountNavigation(ctx: Context): void {
  const panelId = brandString<MainPanelId>('genesis')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: panelId, locale: 'genesis', store: createGenesisNavigationStore(),
    children: { 'genesis.page': { kind: 'keyed', scope: 'root' } },
    inject: () => ({ close: () => { ctx.layout.selectPanel(null) } }),
  }, GenesisPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: panelId, order: 15, locale: 'genesis',
    label: () => ctx.locale.bind('genesis')('homeTitle'),
  }, GenesisIcon))
}
