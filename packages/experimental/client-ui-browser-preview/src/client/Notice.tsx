/** Mutation feedback remains visible after the preview panel closes. @module */
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserPreviewKey } from './locales.ts'

/** One settled operator command; no page content is copied into feedback. */
export interface NoticeState { sequence: number; key: BrowserPreviewKey | null; ok: boolean }

/** Shell-owned command feedback and sequence-fenced dismissal. */
export interface NoticeActions {
  hooks: { notice: ObservableSnapshot<NoticeState> }
  /** @param sequence - Notice identity; a newer outcome remains visible. */
  dismiss(sequence: number): void
}

/**
 * Display the last settled browser command independently of its requesting panel.
 * @param props - Framework-bound notice hook, localized copy and dismissal.
 * @returns A transient outcome toast, or nothing before a command completes.
 */
export function Notice({ useNotice, dismiss, t }: PropsRuntime<'shell.overlay'> & PropsLocale<'aiBrowser'> & InjectFace<NoticeActions>) {
  const state = useNotice(value => value)
  if (state.key === null) return null
  return <Toast key={state.sequence} text={t(state.key)} {...state.ok ? { tone: 'success' as const } : {}}
    onDone={() => { dismiss(state.sequence) }} />
}
