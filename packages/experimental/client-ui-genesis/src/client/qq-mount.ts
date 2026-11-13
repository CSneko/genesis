/** Optional QQ settings use generated Remotes, shared resources and shell-owned outcome feedback. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-experimental-genesis-qq/remote'
import type { QqStatus } from '@deepseek-ai/dsh-experimental-genesis-qq/types'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MemoryNoticeState } from './MemoryNotice.tsx'
import { StatusResource } from './resource.ts'
import { QqPanel, type QqActions } from './QqPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    'genesis-qq': QqStatus
  }
}
/**
 * Mount diagnostics and editable policy without opening an additional QQ connection.
 * @param ctx - Existing locale, resource and operator navigation owner.
 * @param contribution - Generated QQ Host-owned Remote definitions.
 * @param notice - Shell-owned feedback that outlives the settings page.
 * @returns Disposer removing UI before Remote definitions.
 */
export async function mountQq(
  ctx: Context,
  contribution: TypertRemoteContribution,
  notice: SnapshotStore<MemoryNoticeState>,
): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisQqSettings'], (scope) => {
    const resource = new StatusResource()
    scope.effect(() =>
      scope.resources.register<'genesis-qq'>({
        protocol: 'genesis-qq',
        open: (_address, { signal }) => resource.open(owned => scope.remote.genesisQqSettings.inspect(owned), signal),
      }),
    )
    scope.on('connection/reset', () => {
      resource.refresh()
    })
    const perform = async <T>(run: () => Promise<RemoteResult<T>>, signal?: AbortSignal): Promise<RemoteResult<T>> => {
      const report = (ok: boolean) =>
        notice.update((state) => {
          if (signal?.aborted) return
          state.sequence++
          state.outcome = ok ? { ok: true, kind: 'qq' } : { ok: false, kind: 'qq', reason: scope.locale.bind('genesis')('qqOperationHint') }
        })
      try {
        const result = await run()
        report(result.ok)
        return result
      } catch (error) {
        report(false)
        throw error
      } finally {
        resource.refresh()
      }
    }
    scope.slots.inject('genesis.plugin.settings', () =>
      scope.slots.register(
        {
          name: 'genesis.plugin.settings',
          key: 'genesis-qq',
          locale: 'genesis',
          inject: (): QqActions => ({
            saveConnection: (...args) => perform(() => scope.remote.genesisQqSettings.saveConnection(...args), args[2]),
            setToken: (...args) => perform(() => scope.remote.genesisQqSettings.setToken(...args), args[1]),
            saveDecision: (...args) => perform(() => scope.remote.genesisQqSettings.saveDecision(...args), args[2]),
            setDecisionKey: (...args) => perform(() => scope.remote.genesisQqSettings.setDecisionKey(...args), args[1]),
            saveQq: (...args) => perform(() => scope.remote.genesisQqSettings.save(...args), args[2]),
            refresh: () => {
              resource.refresh()
            },
            openSession: (id) => {
              scope.uiWorkspace.openSession(id)
            },
          }),
        },
        QqPanel,
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
