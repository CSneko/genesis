/** Summary-only editing preserves the full memory and its source metadata. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LifeMemory } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { MemoryActions } from './MemoryPanel.tsx'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

/**
 * Edit or clear a description under the displayed memory version.
 * @param props - Current memory, authenticated save and owning list callbacks.
 * @returns A dismissible form retaining the draft after rejected writes.
 */
export function MemorySummaryEditor({ memory, saveSummary, saved, close, t }: PropsLocale<'genesis'> & Pick<MemoryActions, 'saveSummary'> & {
  memory: LifeMemory
  saved: (memory: LifeMemory) => void
  close: () => void
}) {
  const id = useId()
  const [summary, setSummary] = useState(memory.summary ?? '')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const count = Array.from(summary.trim()).length
  const valid = count <= 40
  return <Modal open title={t('editMemorySummary')} closeLabel={t('close')} onClose={close}>
    <form className={css.naming} onSubmit={(event) => {
      event.preventDefault()
      if (operation.current !== undefined || !valid) return
      const owned = new AbortController()
      operation.current = owned; setPending(true); setFailure(undefined)
      void saveSummary(memory.id, summary.trim() || null, memory.updatedAt, owned.signal).then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) saved(result.value)
        else setFailure(operationFailure(result.error, [], t('unknownError')))
      }).catch((error: unknown) => {
        if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
      }).finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
    }}>
      <label htmlFor={id}>{t('memorySummary')}</label>
      <Input id={id} value={summary} disabled={pending} aria-invalid={!valid} aria-describedby={`${id}-hint`}
        onChange={(event) => { setSummary(event.target.value) }} />
      <p id={`${id}-hint`} className={css.secondary}>{t('memorySummaryHint', { count })}</p>
      <Button type="submit" disabled={pending || !valid}>{t(pending ? 'working' : 'saveMemorySummary')}</Button>
      {failure === undefined ? null : <p role="alert">{t('memoryEditFailed', { reason: failure })}</p>}
    </form>
  </Modal>
}
