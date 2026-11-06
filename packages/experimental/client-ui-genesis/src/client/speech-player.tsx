/** Logged speech results with authenticated native Web audio controls. @module */
import { useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { fileMediaUrl } from '@deepseek-ai/dsh-util-workspace-path'
import css from './speech-player.module.css'

const en = { title: 'Speech', generating: 'Generating audio…', failed: 'Speech generation failed',
  unavailable: 'Inline playback is unavailable for this result. Generate a new audio clip or inspect the attachment.',
  playbackFailed: 'Could not play this audio. Try the download link or check your connection.',
  download: 'Download audio', inspect: 'Details' }
type Key = keyof typeof en
const zh: Record<Key, string> = { title: '语音试听', generating: '正在生成语音…', failed: '语音生成失败',
  unavailable: '此记录暂不支持直接试听，请重新生成语音或查看附件',
  playbackFailed: '音频无法播放，请尝试下载或检查网络连接', download: '下载音频', inspect: '查看详情' }
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { genesisSpeechPlayer: Key } }

type Props = ToolCallViewProps & PropsLocale<'genesisSpeechPlayer'>
function playback(props: Props): { src: string; name: string } | undefined {
  if (props.phase !== 'result' || props.block.isError) return undefined
  const file = props.block.content.find(block => block.type === 'file')
  if (file?.type !== 'file') return undefined
  for (const block of props.block.content) {
    if (block.type !== 'text') continue
    let value: unknown
    try { value = JSON.parse(block.text) } catch (_error) { continue }
    if (typeof value !== 'object' || value === null) continue
    const result = value as Record<string, unknown>
    if (typeof result.path !== 'string' || typeof result.attachment !== 'object' || result.attachment === null) continue
    const attachment = result.attachment as Record<string, unknown>
    if (attachment.attachmentId !== file.attachment.attachmentId) continue
    const src = fileMediaUrl(document.baseURI, result.path)
    if (src !== undefined) return { src, name: file.attachment.name }
  }
  return undefined
}

/** Render playback from persisted result data; media controls initiate authenticated reads.
 * @param props - Tool phase, logged result, locale and optional inspector callback.
 * @returns Native audio, download and error feedback in the conversation.
 */
export function SpeechPlayer(props: Props) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const { t } = props
  const audio = playback(props)
  const text = props.block.args.text('text')
  const failed = props.phase === 'result' && props.block.isError
  return <section className={css.card} aria-label={t('title')}>
    <div className={css.header}><span>{t('title')}</span>
      {props.inspect !== undefined && <button type="button" onClick={props.inspect}>{t('inspect')}</button>}
    </div>
    {text && <p className={css.text}>{text}</p>}
    {props.phase !== 'result' ? <p role="status">{t('generating')}</p>
      : failed ? <div role="alert">{t('failed')}<p className={css.text}>{props.block.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')}</p></div>
        : audio === undefined ? <p role="status">{t('unavailable')}</p> : <>
          <audio key={audio.src} className={css.audio} controls preload="none" src={audio.src}
            aria-label={t('title')} onError={() => { setFailedSource(audio.src) }} />
          {failedSource === audio.src && <p role="alert">{t('playbackFailed')}</p>}
          <a href={audio.src} download={audio.name}>{t('download')}</a>
        </>}
  </section>
}

/** Register the speech tool view without changing shared Tool or attachment renderers.
 * @param ctx - Genesis locale and effect-owned slot registry.
 */
export function mountSpeechPlayer(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('genesisSpeechPlayer', { en, zh }))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'genesis_speech',
    locale: 'genesisSpeechPlayer',
  }, SpeechPlayer))
}
