/** On-demand record queries, chunk assembly and shell-owned operation feedback. @module */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { WritingCatalog, WritingEntry, WritingId, WritingQuery, WritingSearch, WritingTypeId } from '@deepseek-ai/dsh-experimental-genesis/types'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MemoryNoticeState } from './MemoryNotice.tsx'
import { StatusResource } from './resource.ts'
import { RecordsPanel, type RecordsActions } from './RecordsPanel.tsx'
import { operationFailure } from './operation-failure.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap {
    'genesis-records': WritingCatalog | null
    'genesis-record-search': WritingSearch
    'genesis-record': WritingEntry
  }
}

/**
 * Mount shared queries and revision-fenced mutations; no polling or inference is performed.
 * @param ctx - Scope injecting the generated records Remote, resources, slots and locale.
 * @param notice - Existing shell-owned feedback, surviving panel dismissal.
 */
export function mountRecords(ctx: Context, notice: SnapshotStore<MemoryNoticeState>): void {
  const resource = new StatusResource()
  ctx.on('connection/reset', () => { resource.refresh() })
  ctx.effect(() => ctx.remote.$on('api-session/status', () => { resource.refresh() }))
  ctx.effect(() => ctx.resources.register<'genesis-records'>({ protocol: 'genesis-records',
    open: (_address, { signal }) => resource.open(owned => ctx.remote.genesisRecords.catalog(owned), signal),
  }))
  ctx.effect(() => ctx.resources.register<'genesis-record-search'>({ protocol: 'genesis-record-search',
    open: (address, { signal }) => resource.open((owned) => {
      const params = new URL(address).searchParams
      const query: WritingQuery = { text: params.get('text') ?? '', offset: Number(params.get('offset') ?? 0),
        ...(params.has('type') ? { typeId: brandString<WritingTypeId>(params.get('type')!) } : {}),
        ...(params.has('after') ? { after: params.get('after')! } : {}), ...(params.has('before') ? { before: params.get('before')! } : {}) }
      return ctx.remote.genesisRecords.search(query, owned)
    }, signal),
  }))
  ctx.effect(() => ctx.resources.register<'genesis-record'>({ protocol: 'genesis-record',
    open: (address, { signal }) => resource.open(async (owned) => {
      const id = brandString<WritingId>(new URL(address).pathname.slice(1))
      const first = await ctx.remote.genesisRecords.read(id, 0, owned)
      if (!first.ok) return first
      const { offset: _offset, nextOffset, ...entry } = first.value
      let position = nextOffset
      while (position !== null) {
        const next = await ctx.remote.genesisRecords.read(id, position, owned)
        if (!next.ok) return next
        if (next.value.revision !== entry.revision) return { ok: false, error: new RemoteError('genesis/operation',
          ctx.locale.bind('genesis')('recordChanged'), { reason: 'configuration-conflict' }) }
        entry.content += next.value.content
        position = next.value.nextOffset
      }
      return { ok: true, value: entry }
    }, signal),
  }))
  const mutation = async <T>(work: Promise<RemoteResult<T>>) => {
    try {
      const result = await work
      notice.update((state) => { state.sequence++; state.outcome = result.ok ? { ok: true, kind: 'records' }
        : { ok: false, kind: 'records', reason: operationFailure(result.error, [], ctx.locale.bind('genesis')('unknownError')) } })
      return result
    } catch (error) {
      notice.update((state) => { state.sequence++; state.outcome = { ok: false, kind: 'records',
        reason: operationFailure(error, [], ctx.locale.bind('genesis')('unknownError')) } })
      throw error
    } finally { resource.refresh() }
  }
  ctx.slots.inject('genesis.page', () => ctx.slots.register({
    name: 'genesis.page', key: 'records', locale: 'genesis',
    inject: (): RecordsActions => ({
      refresh: () => { resource.refresh() },
      edit: (...args) => mutation(ctx.remote.genesisRecords.edit(...args)),
      remove: (...args) => mutation(ctx.remote.genesisRecords.deleteRecord(...args)),
      saveType: (...args) => mutation(ctx.remote.genesisRecords.saveType(...args)),
    }),
  }, RecordsPanel))
}
