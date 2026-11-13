/** Optional generated MCP Remote and settings registration, with polling only while status is observed. @module */
import type { Context } from '@deepseek-ai/cordis'
import contribution from '@deepseek-ai/dsh-experimental-genesis-mcp/remote'
import type { McpInventory, McpCatalogPage } from '@deepseek-ai/dsh-experimental-genesis-mcp/types'
import { McpPanel, type McpActions } from './McpPanel.tsx'
import { en, zh, type McpKey } from './mcp-locales.ts'
import { StatusResource } from './resource.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.mcp': McpKey
  }
  interface ResourceProtocolMap {
    'genesis-mcp-inventory': McpInventory
    'genesis-mcp-catalog': McpCatalogPage
  }
}
/** Mount the MCP catalog only where its Host service exists.
 * @param ctx - Existing Genesis browser owner.
 * @returns Disposer releasing controls before generated Remote metadata.
 */
export async function mountMcp(ctx: Context): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisMcp'], (scope) => {
    const inventory = new StatusResource(),
      catalog = new StatusResource()
    scope.effect(() => scope.locale.register('genesis.mcp', { en, zh }))
    scope.effect(() =>
      scope.resources.register<'genesis-mcp-inventory'>({
        protocol: 'genesis-mcp-inventory',
        async *open(_address, { signal }) {
          let timer: ReturnType<typeof setInterval> | undefined
          try {
            yield* inventory.open(async (owned) => {
              const result = await scope.remote.genesisMcp.inspect(owned)
              if (result.ok && timer === undefined)
                timer = setInterval(() => {
                  inventory.refresh()
                }, result.value.pollMs)
              return result
            }, signal)
          } finally {
            clearInterval(timer)
          }
        },
      }),
    )
    scope.effect(() =>
      scope.resources.register<'genesis-mcp-catalog'>({
        protocol: 'genesis-mcp-catalog',
        open: (address, { signal }) =>
          catalog.open((owned) => {
            const params = new URL(address).searchParams
            return scope.remote.genesisMcp.search(params.get('query') ?? '', params.get('cursor') || null, owned)
          }, signal),
      }),
    )
    scope.on('connection/reset', () => {
      inventory.refresh()
      catalog.refresh()
    })
    scope.slots.inject('settings.section', () =>
      scope.slots.register(
        {
          name: 'settings.section',
          id: 'genesis-mcp',
          order: 23,
          label: () => scope.locale.bind('genesis.mcp')('title'),
          locale: 'genesis.mcp',
          inject: (): McpActions => ({
            install: (...args) => scope.remote.genesisMcp.installService(...args),
            addCustom: (...args) => scope.remote.genesisMcp.addCustom(...args),
            control: (...args) => scope.remote.genesisMcp.control(...args),
            refresh: () => {
              inventory.refresh()
              catalog.refresh()
            },
          }),
        },
        McpPanel,
      ),
    )
  })
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmount()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmount()
  }
}
