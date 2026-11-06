/** Interactive browser viewport and bounded action history from the shared resource. @module */
import { useState } from 'react'
import { Button, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { actionKey } from './locales.ts'
import css from './Preview.module.css'
import type {} from './index.ts'
import type { BrowserTabId } from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/types'
import type { BrowserInput } from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/types'
import { Viewport } from './Viewport.tsx'

/** Explicit operator commands supplied by the plugin registration. */
export interface PreviewActions {
  /**
   * Change the shared preview selection while leaving the AI's active page alone.
   * @param id - Observed page identity, or null to follow the AI.
   * @returns After the request settles; command feedback reports any failure.
   */
  select: (id: BrowserTabId | null) => Promise<void>
  /**
   * Request one explicit action against an observed browser page.
   * @param id - Stable page identity; an already closed page is refused.
   * @param action - Reload or close the real shared browser page.
   * @returns After the request settles; command feedback reports any failure.
   */
  control: (id: BrowserTabId, action: 'reload' | 'close') => Promise<void>
  /**
   * Deliver one operator gesture to the page in the displayed capture.
   * @param id - Exact captured page identity.
   * @param input - Browser gesture, literal text or navigation request.
   * @returns Whether the operation succeeded; failures are reported by shell feedback.
   */
  input: (id: BrowserTabId, input: BrowserInput) => Promise<boolean>
}

type Props = Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useResource'> & PropsLocale<'aiBrowser'> & InjectFace<PreviewActions>

/**
 * Render the latest browser observation without running page code in the application.
 * @param props - Framework-bound resource hook and localized copy.
 * @returns The interactive viewport, capture notice and recent actions.
 */
export function PreviewBody({ useResource, select, control, input, t }: Props) {
  const resource = useResource<'ai-browser'>('dsh-resource://ai-browser/current')
  const frame = resource.value
  const [pending, setPending] = useState(false)
  const run = (operation: () => Promise<void>) => {
    setPending(true)
    void operation().finally(() => { setPending(false) })
  }
  return <section className={css.root} aria-label={t('title')}>
    <header className={css.header}>
      <p className={css.hint}>{t('shared')}</p>
      {frame?.title && <p className={css.title}>{frame.title}</p>}
      {frame?.url && <p className={css.url}>{frame.url}</p>}
    </header>
    {(resource.status === 'failed' || resource.status === 'none') && <p className={css.notice} role="alert">{t('unavailable')}</p>}
    {frame?.error && <p className={css.notice} role="status">{t(frame.error === 'image-too-large' ? 'oversized' : 'stale')}</p>}
    <div className={css.tabHeading}>
      <h3 className={css.title}>{t('tabs')}</h3>
      <Button size="sm" variant="outline" disabled={pending || resource.status !== 'live'}
        onClick={() => { run(() => select(null)) }} aria-pressed={frame?.following ?? true}>{t('follow')}</Button>
    </div>
    {frame?.tabs.length ? <ul className={css.tabs} aria-label={t('tabs')} aria-busy={pending}>
      {frame.tabs.map(tab => <li key={tab.id} className={css.tab} data-selected={tab.selected}>
        <button type="button" className={css.tabSelect} aria-pressed={tab.selected} disabled={pending}
          onClick={() => { run(() => select(tab.id)) }}>
          <span className={css.title}>{tab.title || t('untitled')}</span>
          <span className={css.url}>{tab.url}</span>
          {tab.active && <span className={css.hint}>{t('aiActive')}</span>}
          {tab.selected && <span className={css.hint}>{t('previewSelected')}</span>}
        </button>
        <div className={css.tabControls}>
          <Button size="sm" variant="outline" disabled={pending} aria-label={t('reloadTab', { title: tab.title || tab.url })}
            onClick={() => { run(() => control(tab.id, 'reload')) }}>{t('reload')}</Button>
          <Button size="sm" variant="outline" disabled={pending} aria-label={t('closeTab', { title: tab.title || tab.url })}
            onClick={() => { run(() => control(tab.id, 'close')) }}>{t('close')}</Button>
        </div>
      </li>)}
    </ul> : <p className={css.hint}>{t('noTabs')}</p>}
    {frame !== undefined && frame.omittedTabs > 0 && <p className={css.notice}>{t('omittedTabs', { count: frame.omittedTabs })}</p>}
    {frame?.image && frame.imageTabId
      ? <Viewport key={frame.imageTabId} frame={frame} input={input} t={t}
        disabled={pending || resource.status !== 'live' || frame.error !== undefined} />
      : <div className={css.viewport}>
        {frame?.image
          ? <img className={css.image} src={frame.image} alt={t('screenshot')} />
          : resource.status === 'loading' || Boolean(frame?.started && frame.tabs.length)
            ? <span className={css.empty} role="status" aria-label={t('loading')}><StateDot state="ongoing" size={28} /></span>
            : <p className={css.empty}>{t('empty')}</p>}
      </div>}
    {frame?.capturedAt && <p className={css.hint}>{t('captured')} <time dateTime={frame.capturedAt}>{new Date(frame.capturedAt).toLocaleTimeString()}</time></p>}
    <h3 className={css.title}>{t('actions')}</h3>
    {frame?.actions.length ? <ol className={css.actions}>
      {frame.actions.map((action) => {
        const label = actionKey(action.tool)
        return <li key={action.id} className={css.action}>
          <span className={css.tool}>{label === undefined ? action.tool : t(label)}</span>
          <span className={css.hint}>{t(action.origin === 'operator' ? 'operator' : 'ai')}</span>
          <span className={css.status} data-status={action.status}>{t(action.status)}</span>
          <time className={css.time} dateTime={action.startedAt}>{new Date(action.startedAt).toLocaleTimeString()}</time>
        </li>
      })}
    </ol> : <p className={css.hint}>{t('noActions')}</p>}
  </section>
}
