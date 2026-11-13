/** Companion controls share the Genesis locale, resource and shell-feedback lifecycle. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TypertRemoteContribution, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-experimental-genesis-companion/remote'
import type { CompanionStatus } from '@deepseek-ai/dsh-experimental-genesis-companion/types'
import type { MemoryNoticeState } from './MemoryNotice.tsx'
import { CompanionPanel, type CompanionActions } from './CompanionPanel.tsx'
import { CompanionContinueAction, type CompanionContinueInjected } from './CompanionContinueAction.tsx'
import { StatusResource } from './resource.ts'
import { en, zh, type CompanionKey } from './companion-locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.companion': CompanionKey
  }
  interface ResourceProtocolMap {
    'genesis-companion': CompanionStatus
  }
}
/** Mount generated partner controls without connecting a socket or triggering a model.
 * @param ctx - Existing browser infrastructure.
 * @param contribution - Host-generated Remote definitions.
 * @param notice - Shell-owned mutation feedback.
 * @returns Disposer removing UI before Remote definitions.
 */
export async function mountCompanion(
  ctx: Context,
  contribution: TypertRemoteContribution,
  notice: SnapshotStore<MemoryNoticeState>,
): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisCompanion'], (scope) => {
    const resource = new StatusResource()
    scope.effect(() => scope.locale.register('genesis.companion', { en, zh }))
    scope.effect(() =>
      scope.resources.register<'genesis-companion'>({
        protocol: 'genesis-companion',
        open: (_address, { signal }) => resource.open(owned => scope.remote.genesisCompanion.inspect(owned), signal),
      }),
    )
    scope.on('connection/reset', () => {
      resource.refresh()
    })
    const perform = async <T>(run: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T>> => {
      const report = (ok: boolean) =>
        notice.update((state) => {
          state.sequence++
          state.outcome = ok
            ? { ok: true, kind: 'companion' }
            : { ok: false, kind: 'companion', reason: scope.locale.bind('genesis.companion')('failure') }
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
          key: 'genesis-companion',
          locale: 'genesis.companion',
          inject: (): CompanionActions => ({
            save: (...args) => perform(() => scope.remote.genesisCompanion.save(...args)),
            setToken: (...args) => perform(() => scope.remote.genesisCompanion.setToken(...args)),
            begin: (...args) => perform(() => scope.remote.genesisCompanion.begin(...args)),
            continueExchange: (...args) => perform(() => scope.remote.genesisCompanion.continueExchange(...args)),
            wake: (...args) => perform(() => scope.remote.genesisCompanion.wake(...args)),
            stop: (...args) => perform(() => scope.remote.genesisCompanion.stop(...args)),
            refresh: () => {
              resource.refresh()
            },
            openSession: (id) => {
              scope.uiWorkspace.openSession(id)
            },
          }),
        },
        CompanionPanel,
      ),
    )
    scope.slots.inject('conversation.session.header.actions', () =>
      scope.slots.register(
        {
          name: 'conversation.session.header.actions',
          id: 'genesis-companion-continue',
          order: 40,
          locale: 'genesis.companion',
          inject: (): CompanionContinueInjected => ({
            continueExchange: (sessionId) => {
              void perform(() => scope.remote.genesisCompanion.continueExchange(sessionId))
            },
          }),
        },
        CompanionContinueAction,
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
