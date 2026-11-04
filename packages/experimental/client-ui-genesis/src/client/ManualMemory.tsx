/** Operator memory generation and whole-conversation organization with retained diagnostics. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { MessageId } from '@deepseek-ai/dsh-api-remotes/client'
import type { MemoryKind, MemoryOrganizationId } from '@deepseek-ai/dsh-experimental-genesis/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

/** Authenticated reply and conversation operations; evidence comes from Host projections. */
export interface ManualMemoryActions {
  generate(this: void, messageId: MessageId, kind: MemoryKind, signal: AbortSignal): Promise<RemoteResult<boolean>>
  overview(this: void, id: MemoryOrganizationId, signal: AbortSignal): Promise<RemoteResult<boolean>>
}

/**
 * Choose reply generation or whole-conversation organization without sending another chat message.
 * @param props - Durable reply identity, localized copy and cancellable generation.
 * @returns A compact action and a dismissible modal retaining its scope, layer and retry identity after failure.
 */
export function ManualMemory({ sessionId, messageId, generate, overview, t, useResource, useSessions }: PropsRuntime<'conversation.chat.assistant-actions'> &
  PropsLocale<'genesis'> & InjectFace<ManualMemoryActions>) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<MemoryKind>('declarative')
  const [scope, setScope] = useState<'reply' | 'conversation'>('reply')
  const [requestId, setRequestId] = useState(() => brandString<MemoryOrganizationId>(randomUUID()))
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'manualSaved' | 'manualEmpty'>()
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const life = useResource<'genesis'>('dsh-resource://genesis/status').value
  const preset = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
  if (life === undefined || (life.lifePreset !== undefined && preset !== life.lifePreset)) return null
  return <>
    <Button size="sm" variant="ghost" onClick={() => { setOpen(true) }}>
      {t(pending ? 'manualPending' : failure !== undefined ? 'manualFailedLabel' : outcome === 'manualSaved' ? 'manualSaved' : 'manualMemory')}
    </Button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={t('manualTitle')} closeLabel={t('close')}>
      <div className={css.actions}>{(['reply', 'conversation'] as const).map(value => <Button key={value} variant="outline"
        disabled={pending} aria-pressed={scope === value} onClick={() => { setScope(value); setOutcome(undefined); setFailure(undefined) }}>
        {t(value === 'reply' ? 'manualReplyScope' : 'manualConversationScope')}
      </Button>)}</div>
      <p>{t(scope === 'reply' ? 'manualDescription' : 'manualConversationDescription')}</p>
      {scope === 'conversation' ? null : <>
        <div className={css.actions}>
          {(['declarative', 'non-declarative'] as const).map(value => <Button key={value} variant="outline" disabled={pending}
            aria-pressed={kind === value} onClick={() => { setKind(value); setOutcome(undefined); setFailure(undefined) }}>
            {t(`kind.${value}`)}
          </Button>)}
        </div>
        <p className={css.secondary}>{t(kind === 'declarative' ? 'declarativeHint' : 'implicitHint')}</p>
      </>}
      <Button disabled={pending} onClick={() => {
        if (operation.current !== undefined) return
        const owned = new AbortController()
        operation.current = owned; setPending(true); setOutcome(undefined); setFailure(undefined)
        void (scope === 'conversation' ? overview(requestId, owned.signal) : generate(messageId, kind, owned.signal)).then((result) => {
          if (owned.signal.aborted) return
          if (result.ok) {
            setOutcome(result.value ? 'manualSaved' : 'manualEmpty')
            if (scope === 'conversation') setRequestId(brandString<MemoryOrganizationId>(randomUUID()))
          }
          else setFailure(operationFailure(result.error, [], t('unknownError')))
        }).catch((error: unknown) => {
          if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
        }).finally(() => {
          operation.current = undefined; if (!owned.signal.aborted) setPending(false)
        })
      }}>{t(pending ? 'manualPending' : scope === 'conversation' ? 'manualConversationGenerate' : 'manualGenerate')}</Button>
      {outcome === undefined ? null : <p role="status">{t(outcome)}</p>}
      {failure === undefined ? null : <p role="alert">{t('manualFailed', { reason: failure })}</p>}
    </Modal>
  </>
}
