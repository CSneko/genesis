/** Reversible mailbox page, settings and on-demand Remote resources. @module */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { TypertRemoteContribution, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-experimental-genesis-mail/remote'
import type { MailStatus, MailMessage, MailId } from '@deepseek-ai/dsh-experimental-genesis-mail/types'
import type { MemoryNoticeState } from './MemoryNotice.tsx'
import { MailPanel, type MailActions } from './MailPanel.tsx'
import { MailSettings } from './MailSettings.tsx'
import { en, zh, type MailKey } from './mail-locales.ts'
import { StatusResource } from './resource.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.mail': MailKey
  }
  interface ResourceProtocolMap {
    'genesis-mail': MailStatus
    'genesis-mail-detail': MailMessage
  }
}
/** Mount mailbox controls without synchronizing mail or invoking the model.
 * @param ctx - Existing browser registration owner.
 * @param contribution - Host-generated Remote metadata.
 * @param notice - Shell feedback retained across panel dismissal.
 * @returns Disposer removing UI before its Remote metadata.
 */
export async function mountMail(
  ctx: Context,
  contribution: TypertRemoteContribution,
  notice: SnapshotStore<MemoryNoticeState>,
): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisMail'], (scope) => {
    const resource = new StatusResource()
    scope.effect(() => scope.locale.register('genesis.mail', { en, zh }))
    scope.effect(() =>
      scope.resources.register<'genesis-mail'>({
        protocol: 'genesis-mail',
        async *open(address, { signal }) {
          let timer: ReturnType<typeof setInterval> | undefined
          try {
            yield* resource.open(async (owned) => {
              const params = new URL(address).searchParams
              const result = await scope.remote.genesisMail.inspect(
                params.get('folder') ?? 'inbox',
                params.get('query') ?? '',
                Number(params.get('offset') ?? 0),
                owned,
              )
              if (result.ok && timer === undefined)
                timer = setInterval(() => {
                  resource.refresh()
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
      scope.resources.register<'genesis-mail-detail'>({
        protocol: 'genesis-mail-detail',
        open: (address, { signal }) =>
          resource.open(
            owned => scope.remote.genesisMail.detail(brandString<MailId>(decodeURIComponent(new URL(address).pathname.slice(1))), owned),
            signal,
          ),
      }),
    )
    scope.on('connection/reset', () => {
      resource.refresh()
    })
    scope.effect(() =>
      scope.remote.$on('api-session/status', () => {
        resource.refresh()
      }),
    )
    const perform = async <T>(work: () => Promise<RemoteResult<T>>): Promise<RemoteResult<T>> => {
      const report = (ok: boolean) =>
        notice.update((state) => {
          state.sequence++
          state.outcome = ok
            ? { ok: true, kind: 'mail' }
            : { ok: false, kind: 'mail', reason: scope.locale.bind('genesis.mail')('failure') }
        })
      try {
        const result = await work()
        report(result.ok)
        return result
      } catch (error) {
        report(false)
        throw error
      } finally {
        resource.refresh()
      }
    }
    const actions = (): MailActions => ({
      save: (...args) => perform(() => scope.remote.genesisMail.save(...args)),
      setPassword: (...args) => perform(() => scope.remote.genesisMail.setPassword(...args)),
      erase: (...args) => perform(() => scope.remote.genesisMail.erase(...args)),
      sync: (...args) => perform(() => scope.remote.genesisMail.sync(...args)),
      organize: (...args) => perform(() => scope.remote.genesisMail.organize(...args)),
      refresh: () => {
        resource.refresh()
      },
      openSession: (id) => {
        scope.uiWorkspace.openSession(id)
      },
    })
    scope.slots.inject('genesis.page', () =>
      scope.slots.register({ name: 'genesis.page', key: 'mail', locale: 'genesis.mail', inject: actions }, MailPanel),
    )
    scope.slots.inject('genesis.plugin.settings', () =>
      scope.slots.register({ name: 'genesis.plugin.settings', key: 'genesis-mail', locale: 'genesis.mail', inject: actions }, MailSettings),
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
