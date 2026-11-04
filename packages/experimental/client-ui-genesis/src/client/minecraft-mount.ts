/** Minecraft uses the existing settings, resources and shell notification owners. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-experimental-genesis-minecraft/remote'
import type { MinecraftStatus } from '@deepseek-ai/dsh-experimental-genesis-minecraft/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MemoryNoticeState } from './MemoryNotice.tsx'
import { MinecraftPanel, type MinecraftActions } from './MinecraftPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface ResourceProtocolMap { 'genesis-minecraft': MinecraftStatus } }
/**
 * Mount the generated Minecraft Remote and settings without starting game activity.
 * @param ctx - Existing Genesis browser scope and locale.
 * @param contribution - Generated Host-owned Remote definitions.
 * @param notice - Shell-owned outcome store.
 * @returns A disposer removing UI before Remote definitions.
 */
export async function mountMinecraft(ctx: Context, contribution: TypertRemoteContribution, notice: SnapshotStore<MemoryNoticeState>): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisMinecraft'], (scope) => {
    scope.effect(() => scope.resources.register<'genesis-minecraft'>({ protocol: 'genesis-minecraft',
      async *open(_address, { signal }) {
        for await (const value of scope.remote.genesisMinecraft.watch(signal)) yield { ok: true, value }
      },
    }))
    const perform = async <T>(run: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T>> => {
      const report = (ok: boolean) => notice.update((state) => {
        state.sequence++; state.outcome = ok ? { ok: true, kind: 'minecraft' }
          : { ok: false, kind: 'minecraft', reason: scope.locale.bind('genesis')('minecraftOperationHint') }
      })
      try { const result = await run(); report(result.ok); return result }
      catch (error) { report(false); throw error }
    }
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section', id: 'genesis-minecraft', order: 23, locale: 'genesis',
      label: () => scope.locale.bind('genesis')('minecraftTitle'), inject: (): MinecraftActions => ({
        save: (...args) => perform(() => scope.remote.genesisMinecraft.save(...args)),
        disconnect: (...args) => perform(() => scope.remote.genesisMinecraft.disconnect(...args)),
        stop: (...args) => perform(() => scope.remote.genesisMinecraft.stop(...args)),
        credential: (ref, value) => perform(() => value === undefined ? scope.remote.credentials.unset(ref) : scope.remote.credentials.set(ref, value)),
      }),
    }, MinecraftPanel))
  })
  try { await ui } catch (error) { await ui.dispose(); await unmount(); throw error }
  return async () => { await ui.dispose(); await unmount() }
}
