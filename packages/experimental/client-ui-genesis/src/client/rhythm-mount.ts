/** Shared operator rhythm resource, shell feedback and responsive settings seats. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RhythmStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import type {} from '@deepseek-ai/dsh-experimental-genesis/remote'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { MemoryNoticeState } from './MemoryNotice.tsx'
import { StatusResource } from './resource.ts'
import { RhythmPanel, SleepBanner, type RhythmActions } from './RhythmPanel.tsx'
import { operationFailure } from './operation-failure.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface ResourceProtocolMap { 'genesis-rhythm': RhythmStatus } }
/** Mount owner controls; subscriptions and refresh timers end with the held resource.
 * @param ctx - Existing generated Remote and slot owner.
 * @param notice - Shell-owned feedback surviving panel dismissal.
 */
export function mountRhythm(ctx: Context, notice: SnapshotStore<MemoryNoticeState>): void {
  ctx.inject(['remote.genesisRhythm'], scope => {
    const resource = new StatusResource()
    scope.effect(() => scope.resources.register<'genesis-rhythm'>({ protocol: 'genesis-rhythm',
      open: async function* (_address, { signal }) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          yield* resource.open(async owned => {
            const result = await scope.remote.genesisRhythm.inspect(owned)
            if (timer !== undefined) clearTimeout(timer)
            if (result.ok && result.value.sleep !== null) timer = setTimeout(() => { resource.refresh() }, result.value.sleep.pollMs)
            return result
          }, signal)
        } finally { if (timer !== undefined) clearTimeout(timer) }
      },
    }))
    scope.on('connection/reset', () => { resource.refresh() })
    const mutate = async <T>(work: Promise<RemoteResult<T>>): Promise<RemoteResult<T>> => {
      try {
        const result = await work
        notice.update(state => { state.sequence++; state.outcome = result.ok ? { ok: true, kind: 'rhythm' }
          : { ok: false, kind: 'rhythm', reason: operationFailure(result.error, [], scope.locale.bind('genesis')('unknownError')) } })
        return result
      } catch (error) {
        notice.update(state => { state.sequence++; state.outcome = { ok: false, kind: 'rhythm', reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) } })
        throw error
      } finally { resource.refresh() }
    }
    const actions: RhythmActions = {
      saveSleep: (...args) => mutate(scope.remote.genesisRhythm.saveSleep(...args)),
      wake: (...args) => mutate(scope.remote.genesisRhythm.wake(...args)),
      saveSpontaneity: (...args) => mutate(scope.remote.genesisRhythm.saveSpontaneity(...args)),
      stop: (...args) => mutate(scope.remote.genesisRhythm.stop(...args)),
      retry: (...args) => mutate(scope.remote.genesisRhythm.retry(...args)), refresh: () => { resource.refresh() },
    }
    scope.slots.inject('settings.section', () => scope.slots.register({ name: 'settings.section', id: 'genesis-sleep', order: 24,
      locale: 'genesis', label: () => scope.locale.bind('genesis')('sleepTitle'), inject: () => ({ ...actions, view: 'sleep' as const }),
    }, RhythmPanel))
    scope.slots.inject('genesis.page', () => scope.slots.register({ name: 'genesis.page', key: 'thoughts', locale: 'genesis',
      inject: () => ({ ...actions, view: 'thoughts' as const }),
    }, RhythmPanel))
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({ name: 'conversation.input.dock', id: 'genesis-sleep',
      order: 5, locale: 'genesis', inject: () => actions,
    }, SleepBanner))
  })
}
