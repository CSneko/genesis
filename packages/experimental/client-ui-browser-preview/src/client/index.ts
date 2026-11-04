/** Optional operator browser preview registered in the existing right sidebar. @module */
import type { Context } from '@deepseek-ai/cordis'
import contribution from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/remote'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { remoteErrorOf, RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { GuideArtworkBrowser } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BrowserPreviewFrame } from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Notice, type NoticeState, type NoticeActions } from './Notice.tsx'
import { PreviewBody, type PreviewActions } from './PreviewBody.tsx'
import { isLocalPreviewHost } from './preview-host.ts'
import { en, zh, type BrowserPreviewKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { aiBrowser: BrowserPreviewKey }
  interface ResourceProtocolMap { 'ai-browser': BrowserPreviewFrame }
}

/** Infrastructure needed by the optional viewer. */
export const inject = ['remote', 'resources', 'slots', 'locale', 'sidebarRightTabs']

/**
 * Mount generated RPC, the shared browser resource and operator page controls.
 * @param ctx - Browser plugin lifetime owner.
 * @returns Complete UI and Remote withdrawal.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.browserPreview'], (scope) => {
    const id = '@deepseek-ai/dsh-experimental-client-ui-browser-preview'
    const t = scope.locale.bind('aiBrowser')
    const lifetime = new AbortController()
    scope.effect(() => () => { lifetime.abort() })
    const notice = createSnapshotStore<NoticeState>({ sequence: 0, key: null, ok: true })
    const report = (key: BrowserPreviewKey, ok: boolean) => {
      if (!lifetime.signal.aborted) notice.set({ sequence: notice.getSnapshot().sequence + 1, key, ok })
    }
    const perform = async (operation: () => Promise<RemoteResult<void>>, success: BrowserPreviewKey) => {
      try {
        const result = await operation()
        if (result.ok) report(success, true)
        else report(result.error.code === 'browser-preview/tab-missing' ? 'tabMissing'
          : result.error.code === 'browser-preview/invalid-input' ? 'invalidInput' : 'commandFailed', false)
        return result.ok
      } catch (_error) {
        report('commandFailed', false)
        return false
      }
    }
    const commands: PreviewActions = {
      select: async (id) => { await perform(() => scope.remote.browserPreview.selectTab(id, lifetime.signal), 'selected') },
      control: async (id, action) => { await perform(() => scope.remote.browserPreview.controlTab(id, action, lifetime.signal),
        action === 'reload' ? 'reloaded' : 'closed') },
      input: (id, input) => perform(() => scope.remote.browserPreview.input(id, input, lifetime.signal), 'inputSent'),
    }
    scope.effect(() => scope.locale.register('aiBrowser', { en, zh }))
    scope.effect(() => scope.resources.register<'ai-browser'>({ protocol: 'ai-browser',
      async *open(_address, { signal }) {
        try {
          for await (const frame of scope.remote.browserPreview.watch(isLocalPreviewHost(window.location.hostname), signal)) yield { ok: true, value: frame }
        } catch (error) {
          if (signal.aborted) return
          yield { ok: false, error: remoteErrorOf(error) ?? new RemoteError('gateway/internal', 'Browser preview connection failed', {}) }
        }
      },
    }))
    scope.effect(() => scope.sidebarRightTabs.register({ id, kind: 'ai-browser', priority: 'extension',
      title: () => t('title'), guide: [{ id: 'watch', order: 35, title: () => t('title'),
        description: () => t('description'), icon: GuideArtworkBrowser }],
    }))
    scope.effect(() => scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay', id: id + ':feedback', locale: 'aiBrowser',
      inject: (): NoticeActions => ({ hooks: { notice }, dismiss: (sequence) => {
        if (notice.getSnapshot().sequence === sequence) notice.set({ ...notice.getSnapshot(), key: null })
      } }),
    }, Notice)))
    scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab', key: id, locale: 'aiBrowser', inject: (): PreviewActions => commands,
    }, PreviewBody)))
  })
  return async () => { await ui.dispose(); await unmount() }
}
