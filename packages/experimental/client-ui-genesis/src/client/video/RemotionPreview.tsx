/** Interactive Remotion composition in the existing sidebar document pane. @module */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { remotionDocument } from './document.ts'
import type {} from './locales.ts'
import css from './RemotionPreview.module.css'

/** Existing file/tab lifecycle plus the preview's locale-owned copy. */
export type RemotionPreviewProps = DocumentPreviewProps & PropsLocale<'genesisRemotionPreview'>
type Source = { data: Uint8Array<ArrayBuffer>; url: string | undefined }

/**
 * Acquire one isolated Player document per byte revision and release it when the view closes.
 * @param props - Complete document bytes, shared reload controls, tab visibility and locale.
 * @returns Player with native playback controls and explicit browser/download links.
 */
export function RemotionPreview({ content, useTabInfo, t }: RemotionPreviewProps): ReactNode {
  const data = content.kind === 'bytes' ? content.data : undefined
  const { tab } = useTabInfo()
  const frame = useRef<HTMLIFrameElement>(null)
  const [source, setSource] = useState<Source>()
  useEffect(() => {
    if (data === undefined) return
    let url: string | undefined
    try {
      url = URL.createObjectURL(new Blob([remotionDocument(data)], { type: 'text/html' }))
      setSource({ data, url })
    } catch (_error) { setSource({ data, url: undefined }) }
    return () => { if (url !== undefined) URL.revokeObjectURL(url) }
  }, [data])
  useEffect(() => {
    if (!tab.visible) frame.current?.contentWindow?.postMessage({ type: 'genesis-remotion:pause' }, '*')
  }, [tab.visible, source?.url])
  if (data === undefined || source?.data !== data) return <p className={css.status} role="status">{t('loading')}</p>
  if (source.url === undefined) return <p className={css.status} role="alert">{t('failed')}</p>
  return <div className={css.preview} data-remotion-preview>
    <iframe key={source.url} ref={frame} className={css.frame} src={source.url} sandbox="allow-scripts" allow="fullscreen"
      allowFullScreen title={t('frame')} />
    <div className={css.actions}>
      <a href={source.url} target="_blank" rel="noopener noreferrer">{t('openBrowser')}</a>
      <a href={source.url} download="preview.genesis-remotion.html">{t('download')}</a>
    </div>
  </div>
}
