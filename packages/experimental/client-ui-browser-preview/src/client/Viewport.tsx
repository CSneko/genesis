/** Operator gestures against the exact page in the displayed capture. @module */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserPreviewFrame } from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/types'
import type { PreviewActions } from './PreviewBody.tsx'
import css from './Preview.module.css'

type Props = PropsLocale<'aiBrowser'> & Pick<PreviewActions, 'input'> & {
  frame: BrowserPreviewFrame
  disabled: boolean
}

/**
 * Map scaled screenshot gestures to the real browser; drafts stay local until explicitly sent.
 * @param props - Captured page, admitted input callback and localized copy.
 * @returns Focusable viewport, navigation and a text insertion form supporting IME input.
 */
export function Viewport({ frame, disabled, input, t }: Props) {
  const [text, setText] = useState('')
  const [address, setAddress] = useState('')
  const [pending, setPending] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const id = frame.imageTabId
  const blocked = disabled || id === undefined
  const send = useCallback(async (command: Parameters<PreviewActions['input']>[1]) => {
    if (disabled || id === undefined) return false
    setPending(count => count + 1)
    try { return await input(id, command) }
    finally { setPending(count => count - 1) }
  }, [disabled, id, input])
  const point = (event: MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }
  const key = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing || blocked) return
    // Tab retains local keyboard navigation; remote Tab has its own explicit button.
    if (event.key === 'Tab') return
    const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
    const named = /^(?:Enter|Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/u.test(event.key)
    if (!printable && !named && !/^[a-zA-Z0-9]$/u.test(event.key)) return
    event.preventDefault()
    if (printable) void send({ kind: 'text', text: event.key })
    else void send({ kind: 'key', key: `${event.ctrlKey || event.metaKey ? 'ControlOrMeta+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key}` })
  }
  useEffect(() => {
    const element = viewport.current
    if (element === null) return
    const wheel = (event: WheelEvent) => {
      if (blocked) return
      event.preventDefault()
      const bounds = element.getBoundingClientRect()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1
      void send({ kind: 'scroll', x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
        deltaX: event.deltaX * unit, deltaY: event.deltaY * unit })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { element.removeEventListener('wheel', wheel) }
  }, [blocked, send])
  return <>
    <form className={css.inputRow} onSubmit={(event) => { event.preventDefault(); void send({ kind: 'navigate', url: address }) }}>
      <Button size="sm" variant="outline" disabled={blocked || pending > 0} onClick={() => { void send({ kind: 'back' }) }}>{t('back')}</Button>
      <Input aria-label={t('address')} type="url" required value={address} placeholder={frame.url}
        disabled={blocked || pending > 0} onChange={(event) => { setAddress(event.target.value) }} />
      <Button size="sm" variant="outline" type="submit" disabled={blocked || pending > 0 || !address}>{t('go')}</Button>
    </form>
    <p className={css.hint}>{t('interactionHint')}</p>
    <div className={css.viewport}>
      <div ref={viewport} className={css.interactive} role="group" aria-label={t('interactivePage')} aria-disabled={blocked}
        tabIndex={0} onKeyDown={key}
        onClick={(event) => { event.currentTarget.focus(); void send({ kind: 'click', ...point(event) }) }}>
        <img className={css.image} src={frame.image} alt={t('screenshot')} draggable={false} />
      </div>
    </div>
    <form className={css.inputRow} onSubmit={(event) => {
      event.preventDefault()
      void send({ kind: 'text', text }).then((ok) => { if (ok) setText('') })
    }}>
      <Input aria-label={t('textInput')} value={text} disabled={blocked || pending > 0} autoComplete="off"
        onChange={(event) => { setText(event.target.value) }} />
      <Button size="sm" variant="outline" type="submit" disabled={blocked || pending > 0 || !text}>{t('sendText')}</Button>
      <Button size="sm" variant="outline" disabled={blocked || pending > 0} onClick={() => { void send({ kind: 'key', key: 'Enter' }) }}>{t('enter')}</Button>
      <Button size="sm" variant="outline" disabled={blocked || pending > 0} onClick={() => { void send({ kind: 'key', key: 'Tab' }) }}>{t('tabKey')}</Button>
    </form>
  </>
}
