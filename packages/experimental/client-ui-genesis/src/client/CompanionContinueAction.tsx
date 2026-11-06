/** Conversation-page action that continues the internal partner exchange. @module */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Operator callback injected by the mount; the shell reports the outcome. */
export interface CompanionContinueInjected {
  continueExchange(this: void, sessionId: string): void
}

/**
 * Render one continue control inside the partner conversation only, never in settings.
 * @param props - Session and resource hooks, typed copy and the injected action.
 * @returns The button, or nothing for other conversations.
 */
export function CompanionContinueAction({ useResource, useSession, t, continueExchange }:
PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'genesis.companion'> & InjectFace<CompanionContinueInjected>) {
  const sessionId = useSession(snapshot => snapshot.sessionId)
  const resource = useResource<'genesis-companion'>('dsh-resource://genesis-companion/status')
  const sample = resource.value
  if (sample === undefined || !sample.sessions.includes(sessionId)) return null
  return <Button variant="outline" disabled={sample.active !== null || sample.blocked !== null}
    onClick={() => { continueExchange(sessionId) }}>{t('continue')}</Button>
}
