/** Operator-triggered synthesis of a frozen, versioned memory selection. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Checkbox, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { LifeMemory, MemoryOrganizationId } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { MemoryActions } from './MemoryPanel.tsx'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

/**
 * Select an output count and integrate the displayed source versions.
 * @param props - Frozen selection, deployment limit and authenticated mutation.
 * @returns A dismissible dialog retaining selection and count after failure.
 */
export function MemoryOrganizer({ sources, maxResults, organize, saved, close, t }: PropsLocale<'genesis'> & Pick<MemoryActions, 'organize'> & {
  sources: LifeMemory[]; maxResults: number; saved: (memories: LifeMemory[]) => void; close: () => void
}) {
  const field = useId()
  const [id] = useState(() => brandString<MemoryOrganizationId>(randomUUID()))
  const [count, setCount] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  return <Modal open title={t('organizeMemories')} closeLabel={t('close')} onClose={close}>
    <form className={css.editor} onSubmit={(event) => {
      event.preventDefault()
      if (operation.current !== undefined) return
      const owned = new AbortController()
      operation.current = owned; setPending(true); setFailure(undefined)
      void organize({ id, sources: sources.map(({ id, updatedAt }) => ({ id, updatedAt })), targetCount: count }, owned.signal).then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) saved(result.value)
        else setFailure(operationFailure(result.error, [], t('unknownError')))
      }).catch((error: unknown) => {
        if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('unknownError')))
      }).finally(() => { operation.current = undefined; if (!owned.signal.aborted) setPending(false) })
    }}>
      <p className={css.secondary}>{t('organizationHint')}</p>
      <details><summary>{t('selectedMemories', { count: sources.length })}</summary>
        <ol className={css.records}>{sources.map(memory => <li key={memory.id}>
          <p>{memory.summary ?? memory.content}</p>
          {memory.summary === undefined ? null : <details><summary>{t('viewMemoryContent')}</summary><p>{memory.content}</p></details>}
        </li>)}</ol>
      </details>
      <Checkbox label={t('organizationAutomaticCount')} checked={count === null} disabled={pending}
        onChange={(checked) => { setCount(checked ? null : 1) }} />
      {count === null ? null : <div className={css.editor}>
        <label htmlFor={`${field}-count`}>{t('organizationCount')}</label>
        <Input id={`${field}-count`} type="number" min={1} max={Math.min(maxResults, sources.length)} step={1}
          required value={count} disabled={pending} onChange={(event) => { setCount(Number(event.target.value)) }} />
      </div>}
      {failure === undefined ? null : <p role="alert">{t('organizationFailed', { reason: failure })}</p>}
      <div className={css.actions}>
        <Button type="submit" disabled={pending}>{t(pending ? 'organizingMemories' : 'startOrganization')}</Button>
        <Button type="button" variant="outline" onClick={close}>{t('cancel')}</Button>
      </div>
    </form>
  </Modal>
}
