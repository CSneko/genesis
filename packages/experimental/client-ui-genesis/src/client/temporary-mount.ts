/** Optional temporary-memory controls share the existing generated Genesis Remote. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { TemporaryStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import type {} from '@deepseek-ai/dsh-experimental-genesis/remote'
import { TemporaryMemoryPanel, type TemporaryActions } from './TemporaryMemoryPanel.tsx'
import { StatusResource } from './resource.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface ResourceProtocolMap { 'genesis-temporary': TemporaryStatus } }
/**
 * Register one sampled, authenticated settings section; older Hosts leave the section absent.
 * @param ctx - Existing resource, locale and generated-Remote owner.
 */
export function mountTemporary(ctx: Context): void {
  ctx.inject(['remote.genesisTemporary'], (scope) => {
    const resource = new StatusResource()
    scope.effect(() => scope.resources.register<'genesis-temporary'>({ protocol: 'genesis-temporary',
      open: (_address, { signal }) => resource.open(owned => scope.remote.genesisTemporary.inspect(owned), signal),
    }))
    scope.on('connection/reset', () => { resource.refresh() })
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section', id: 'genesis-temporary', order: 23, locale: 'genesis',
      label: () => scope.locale.bind('genesis')('temporaryTitle'), inject: (): TemporaryActions => ({
        save: (...args) => scope.remote.genesisTemporary.save(...args),
        forget: (...args) => scope.remote.genesisTemporary.forget(...args),
        retry: (...args) => scope.remote.genesisTemporary.retry(...args),
        setKey: (...args) => scope.remote.genesisTemporary.setKey(...args),
        refresh: () => { resource.refresh() },
      }),
    }, TemporaryMemoryPanel))
  })
}
