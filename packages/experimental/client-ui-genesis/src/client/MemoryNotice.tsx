/** Shell-owned mutation feedback survives settings panels and editor dismissal. @module */
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** One completed mutation outcome with a sequence for independently timed toasts. */
export interface MemoryNoticeState {
  sequence: number
  outcome: { ok: true; kind?: 'contacts' | 'mail' | 'companion' | 'rhythm' | 'qq' | 'person' | 'minecraft' | 'toolkits' | 'agency' | 'agency-started' | 'emotion-settings' | 'emotion-adjustment' | 'relationship-adjustment' | 'organization' | 'operator-identity' | 'records' | 'memory-summary' } | { ok: false; reason: string; kind?: 'contacts' | 'mail' | 'companion' | 'rhythm' | 'qq' | 'person' | 'minecraft' | 'toolkits' | 'agency' | 'emotion' | 'organization' | 'operator-identity' | 'records' | 'memory-summary' } | null
}
/** Observable shell feedback supplied by the plugin owner. */
export interface MemoryNoticeActions {
  hooks: { notice: ObservableSnapshot<MemoryNoticeState> }
  dismiss(this: void, sequence: number): void
}
/**
 * Display mutation feedback independently of the requesting settings surface.
 * @param props - Localized copy, observable outcome and sequence-fenced dismissal.
 * @returns A timed shell toast, or nothing before an operation completes.
 */
export function MemoryNotice({ useNotice, dismiss, t }: PropsRuntime<'shell.overlay'> & PropsLocale<'genesis'> & InjectFace<MemoryNoticeActions>) {
  const state = useNotice(value => value)
  if (state.outcome === null) return null
  const text = state.outcome.ok
    ? t(state.outcome.kind === 'contacts' ? 'contactsUpdated' : state.outcome.kind === 'mail' ? 'mailUpdated' : state.outcome.kind === 'companion' ? 'companionUpdated' : state.outcome.kind === 'rhythm' ? 'rhythmSaved' : state.outcome.kind === 'qq' ? 'qqSaved' : state.outcome.kind === 'person' ? 'peopleForgotten' : state.outcome.kind === 'minecraft' ? 'minecraftUpdated' : state.outcome.kind === 'toolkits' ? 'toolkitsSaved' : state.outcome.kind === 'memory-summary' ? 'memorySummarySaved' : state.outcome.kind === 'agency' ? 'agencySaved' : state.outcome.kind === 'agency-started' ? 'agencyStarted' : state.outcome.kind === 'records' ? 'recordsSaved' : state.outcome.kind === 'emotion-settings' ? 'emotionSettingsSaved' : state.outcome.kind === 'emotion-adjustment' ? 'emotionAdjustmentSaved' : state.outcome.kind === 'relationship-adjustment' ? 'relationshipAdjustmentSaved' : state.outcome.kind === 'organization' ? 'organizationSaved' : state.outcome.kind === 'operator-identity' ? 'operatorIdentitySaved' : 'memoryDeleted')
    : t(state.outcome.kind === 'contacts' ? 'contactsFailed' : state.outcome.kind === 'mail' ? 'mailFailed' : state.outcome.kind === 'companion' ? 'companionFailed' : state.outcome.kind === 'rhythm' ? 'rhythmFailed' : state.outcome.kind === 'qq' ? 'qqOperationFailed' : state.outcome.kind === 'person' ? 'peopleOperationFailed' : state.outcome.kind === 'minecraft' ? 'minecraftOperationFailed' : state.outcome.kind === 'toolkits' ? 'toolkitsFailed' : state.outcome.kind === 'agency' ? 'agencyFailed' : state.outcome.kind === 'records' ? 'recordsOperationFailed' : state.outcome.kind === 'emotion' ? 'genesisOperationFailed' : state.outcome.kind === 'organization' ? 'organizationFailed' : state.outcome.kind === 'operator-identity' ? 'operatorIdentityFailed' : 'memoryEditFailed', { reason: state.outcome.reason })
  return <Toast key={state.sequence} text={text}
    {...state.outcome.ok ? { tone: 'success' as const } : {}} onDone={() => { dismiss(state.sequence) }} />
}
