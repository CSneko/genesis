/** Optional UI follows active Host plugins, including plugins with no volatile settings fields. @module */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

type Mount = { packageName: string; mount(ctx: Context): Promise<() => Promise<void>> }
/** Mount and withdraw optional controls from the Host inventory after profile changes.
 * @param ctx - Browser registration and request lifetime owner.
 * @param definitions - Package-owned UI mounts; generated Remote declarations alone are not availability evidence.
 */
export function mountOptionalCapabilities(ctx: Context, definitions: readonly Mount[]): void {
  const lifetime = new AbortController()
  const mounted = new Map<string, { dispose(): Promise<void> }>()
  let dirty = false
  let pending: Promise<void> | undefined
  const reconcile = async () => {
    while (dirty && !lifetime.signal.aborted) {
      dirty = false
      const result = await ctx.remote.pluginInventory.list()
      if (lifetime.signal.aborted) return
      if (!result.ok) throw result.error
      const active = new Set(
        result.value.entries.filter(entry => entry.enabled && entry.fiberPhase === 'active').map(entry => entry.moduleName),
      )
      for (const definition of definitions) {
        if (lifetime.signal.aborted) return
        const previous = mounted.get(definition.packageName)
        if (!active.has(definition.packageName)) {
          if (previous) {
            mounted.delete(definition.packageName)
            await previous.dispose()
          }
        } else if (!previous) {
          const owner = ctx.inject(['slots', 'remote', 'resources', 'locale', 'uiWorkspace'], (child) => {
            child.effect(() => definition.mount(child))
          })
          mounted.set(definition.packageName, owner)
        }
      }
    }
  }
  const refresh = () => {
    dirty = true
    pending ??= reconcile()
      .catch((error) => {
        if (!lifetime.signal.aborted)
          ctx.logger.error(
            'Genesis plugin controls could not refresh. Existing controls are retained; reconnect or refresh the page.',
            error,
          )
      })
      .finally(() => {
        pending = undefined
        if (dirty && !lifetime.signal.aborted) refresh()
      })
  }
  ctx.effect(() => () => {
    lifetime.abort()
    return (pending ?? Promise.resolve()).then(async () => {
      await Promise.all([...mounted.values()].map(owner => owner.dispose()))
      mounted.clear()
    })
  })
  ctx.effect(() => ctx.remote.$on('plugin-manager/changed', refresh))
  ctx.on('connection/reset', refresh)
  refresh()
}
