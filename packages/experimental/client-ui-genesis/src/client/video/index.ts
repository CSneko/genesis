/** Genesis-owned compound file renderer; loading and navigation remain with the shared sidebar. @module */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { RemotionPreview } from './RemotionPreview.tsx'
import { en, zh } from './locales.ts'

/**
 * Register isolated Remotion preview files and their keyed body, with reversible effects.
 * @param ctx - Existing document registry, slot and locale owners.
 */
export function mountRemotionPreview(ctx: Context): void {
  const id = '@deepseek-ai/dsh-experimental-client-ui-genesis/remotion'
  const namespace = 'genesisRemotionPreview'
  const t = ctx.locale.bind(namespace)
  ctx.effect(() => ctx.locale.register(namespace, { en, zh }))
  ctx.effect(() => ctx.documentPreviews.register({ id, extensions: ['genesis-remotion.html'], priority: 'extension',
    title: () => t('title'), loading: 'bytes-complete', wrap: false }))
  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
    name: 'sidebar.right.tab.document', key: id, locale: namespace,
  }, RemotionPreview)))
}
