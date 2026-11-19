/** Reply-derived attachments using the shared file cards and authorized download action. */
import { useState } from 'react'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { Button, extractMarkdownFilePaths, FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GlobalStandardProps, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { resolveWorkspacePath, sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { basename } from '../presented.ts'
import type { NS } from './locales.ts'
import css from './Deliverables.module.css'

/** Download callback captured from the composed file-action and Session file services. */
export interface ReferencedFilesInjected {
  downloadReference: (sessionId: SessionId, path: string) => Promise<void>
}

/**
 * Read only finalized assistant text, excluding reasoning and tool output.
 * @param owner - completed turn and its durable assistant projections.
 * @returns local references in reply order.
 */
export function referencedForClosing(owner: TurnTailOwnerProps): string[] {
  return [...new Set(owner.turn.steps.flatMap((step) => {
    const assistant = step.data.get('assistant-step')
    return assistant?.finalNode === undefined ? [] : assistant.blocks.flatMap(block =>
      block.kind === 'text' ? extractMarkdownFilePaths(block.text) : [])
  }))]
}

/**
 * Render reply references as attachments with preview and direct download actions.
 * @param props - completed turn, Session workspace, localized labels and authorized downloader.
 * @returns attachment cards when the reply references local files.
 */
export function ReferencedFiles(props: PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<typeof NS> & InjectFace<ReferencedFilesInjected>) {
  const cwd = props.useSessions(state => state.byId[props.sessionId]?.cwd)
  const paths = [...new Set(referencedForClosing(props).map(path => resolveWorkspacePath(cwd, path)))]
  return paths.length === 0 ? null : <div className={`${css.root} ${css.referenceAttachments}`} aria-label={props.t('references.title')}>
    <div className={css.presented} data-single={paths.length === 1 || undefined}>
      {paths.map(path => <ReferencedFile key={path} path={path} t={props.t} sessionId={props.sessionId} useResource={props.useResource}
        preview={() => { props.openFile(path) }}
        download={() => props.downloadReference(props.sessionId, path)} />)}
    </div>
  </div>
}

/**
 * Show a referenced file only while its Session file resource confirms a regular file.
 * Loading, missing, inaccessible and stale failed resources render no card.
 * @param props - file identity, preview and download callbacks, and localized copy.
 * @returns the file card and download status.
 */
export function ReferencedFile({ path, sessionId, useResource, preview, download, t }: {
  sessionId: SessionId
  path: string
  preview: () => void
  download: () => Promise<void>
} & PropsLocale<typeof NS> & Pick<GlobalStandardProps, 'useResource'>) {
  const resource = useResource<'file'>(sessionFileAddress(sessionId, path))
  const [phase, setPhase] = useState<'idle' | 'pending' | 'error' | 'requested'>('idle')
  if (resource.status !== 'live' || resource.value === undefined) return null
  return <div className={css.file} data-referenced-file>
    <button type="button" className={css.cardPreview} title={path}
      aria-label={t('presented.previewCard', { name: path })} onClick={preview} />
    <span className={css.fileIcon}><FileTypeIcon path={path} size={20} /></span>
    <div className={css.fileBody}>
      <div className={css.details}>
        <span className={css.fileName}>{basename(path)}</span>
        <span className={css.description} title={phase === 'error' ? t('references.error') : path} role="status" data-error={phase === 'error' || undefined}>
          {t(phase === 'error' ? 'references.error' : phase === 'requested' ? 'references.requested' : 'references.title')}
        </span>
      </div>
      <div className={css.actions}><Button size="sm" disabled={phase === 'pending'} onClick={() => {
        setPhase('pending')
        void download().then(() => { setPhase('requested') }, () => { setPhase('error') })
      }}>{t(phase === 'pending' ? 'references.pending' : 'references.download')}</Button></div>
    </div>
  </div>
}
