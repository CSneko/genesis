/** Responsive text mailbox; operator previews never mutate character attention. @module */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { MailId } from '@deepseek-ai/dsh-experimental-genesis-mail/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './StatusPanel.module.css'
import mailCss from './MailPanel.module.css'

type Remote = TypertClientRemote['genesisMail']
/** Generated account and local-mail operations; no client-side SMTP execution exists. */
export interface MailActions {
  save: Remote['save']; setPassword: Remote['setPassword']; sync: Remote['sync']; erase: Remote['erase']; organize: Remote['organize']
  refresh(this: void): void
  openSession(this: void, id: SessionId): void
}
const folders = ['inbox', 'blocked', 'drafts', 'sent', 'archive', 'trash', 'all'] as const
/** Browse bounded metadata and an independently loaded text detail.
 * @param props - Framework resources, locale and explicit operator callbacks.
 * @returns Mail list and selectable detail with stable attention semantics.
 */
export function MailPanel({ useResource, t, ...actions }: PropsRuntime<'genesis.page'> & PropsLocale<'genesis.mail'> & InjectFace<MailActions>) {
  const [folder, setFolder] = useState<typeof folders[number]>('inbox'), [query, setQuery] = useState(''), [search, setSearch] = useState('')
  const [pages, setPages] = useState([0]), [selected, setSelected] = useState<MailId>()
  const lastOpened = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (selected === undefined && lastOpened.current?.isConnected) lastOpened.current.focus() }, [selected])
  const params = new URLSearchParams({ folder, query: search, offset: String(pages.at(-1)!) })
  const resource = useResource<'genesis-mail'>(`dsh-resource://genesis-mail/catalog?${params}`)
  const sample = resource.value
  const [busy, setBusy] = useState(false)
  const receive = () => { if (busy) return; setBusy(true); void actions.sync().catch((_error: unknown) => { /* Shell feedback owns the failure. */ }).finally(() => { setBusy(false) }) }
  return <section className={css.panel}>
    <header className={css.header}><h3>{t('title')}</h3><div className={css.actions}>
      <Button disabled={busy || sample?.settings.enabled !== true} onClick={receive}>{t('sync')}</Button>
    </div></header>
    <p className={css.secondary}>{t('description')}</p>
    {resource.status === 'failed' ? <p role="alert">{t('unavailable')}</p> : null}
    {sample === undefined ? <div className={css.loading} role="status" aria-label={t('title')}><StateDot state="ongoing" /></div> : <>
      <p role="status">{t(sample.settings.enabled ? sample.awake ? 'awake' : 'asleep' : 'disabled')} · {t('pending', { count: sample.pending, uncertain: sample.uncertain })}{sample.active ? ` · ${t('active')}` : ''}</p>
      {sample.failure !== null ? <p role="alert">{t('failure')}</p> : null}
      <nav className={css.actions} aria-label={t('title')}>{folders.map(value => <Button key={value} size="sm" variant={folder === value ? 'outline' : 'ghost'} aria-current={folder === value ? 'page' : undefined}
        onClick={() => { setFolder(value); setPages([0]); setSelected(undefined) }}>{t(`folder.${value}`)}</Button>)}</nav>
      <form className={css.search} onSubmit={(event) => { event.preventDefault(); setSearch(query); setPages([0]); setSelected(undefined) }}>
        <label htmlFor="genesis-mail-query">{t('query')}</label><Input id="genesis-mail-query" value={query} maxLength={500} onChange={(event) => { setQuery(event.target.value) }} /><Button type="submit">{t('search')}</Button>
      </form>
      <p className={css.secondary}>{t('total', { count: sample.total })}</p>
      <div className={mailCss.columns} data-selected={selected !== undefined}>
        <div className={mailCss.list}>
          {sample.messages.length === 0 ? <p>{t('empty')}</p> : <ul className={css.records}>{sample.messages.map(mail => <li key={mail.id}>
            <Button variant={selected === mail.id ? 'outline' : 'ghost'} className={mailCss.row} aria-pressed={selected === mail.id} onClick={(event) => { lastOpened.current = event.currentTarget; setSelected(mail.id) }}>
              <span>{mail.subject || t('noSubject')}</span><span className={css.secondary}>{mail.direction === 'incoming' ? mail.from : mail.to}</span>
              <span className={css.secondary}>{new Date(mail.at).toLocaleString()} · {t(mail.direction === 'incoming' ? `attention.${mail.attention}` : `delivery.${mail.delivery}`)}</span>
            </Button>
          </li>)}</ul>}
          <div className={css.actions}><Button variant="outline" disabled={pages.length === 1} onClick={() => { setPages(value => value.slice(0, -1)); setSelected(undefined) }}>{t('previous')}</Button>
            <Button variant="outline" disabled={sample.nextOffset === null} onClick={() => { if (sample.nextOffset !== null) setPages(value => [...value, sample.nextOffset!]); setSelected(undefined) }}>{t('next')}</Button></div>
        </div>
        <div className={mailCss.detail}>{selected === undefined ? <p className={css.secondary}>{t('preview')}</p> : <MailDetail key={selected} id={selected} {...{ useResource, t, ...actions }} back={() => { setSelected(undefined) }} />}</div>
      </div>
      <p className={css.secondary}>{t('privacy')}</p>
    </>}
  </section>
}
function MailDetail({ id, useResource, t, back, ...actions }: Pick<PropsRuntime<'genesis.page'>, 'useResource'> & PropsLocale<'genesis.mail'> & MailActions & { id: MailId; back: () => void }) {
  const resource = useResource<'genesis-mail-detail'>(`dsh-resource://genesis-mail-detail/${encodeURIComponent(id)}`)
  const mail = resource.value?.id === id ? resource.value : undefined
  const [busy, setBusy] = useState(false), [confirmErase, setConfirmErase] = useState(false)
  const move = (action: 'archive' | 'trash' | 'restore') => { if (busy) return; setBusy(true); void actions.organize(id, action).catch((_error: unknown) => { /* Shell feedback owns the failure. */ }).finally(() => { setBusy(false) }) }
  const article = useRef<HTMLElement | null>(null)
  useEffect(() => { article.current?.focus() }, [])
  return <article ref={article} tabIndex={-1}>
    <Button variant="ghost" onClick={back}>{t('close')}</Button>
    {resource.status === 'failed' ? <p role="alert">{t('unavailable')}</p> : null}
    {mail === undefined ? <StateDot state="ongoing" /> : <>
      <h4>{mail.subject || t('noSubject')}</h4>
      <dl className={css.facts}><dt>{t('from')}</dt><dd>{mail.from}</dd><dt>{t('to')}</dt><dd>{mail.to}</dd><dt>{t('received')}</dt><dd>{new Date(mail.at).toLocaleString()}</dd></dl>
      <p>{mail.direction === 'incoming' && mail.readAt === null ? `${t('unread')} · ` : ''}{t(`attention.${mail.attention}`)} · {t(`delivery.${mail.delivery}`)}{mail.direction === 'incoming' ? ` · ${t(mail.operator ? 'operator' : 'external')}` : ''}</p>
      {mail.review === 'blocked' ? <p role="status">{t('blockedHint')}</p> : null}
      <div className={mailCss.body}>{mail.text}</div>
      {mail.reason ? <p>{t('reason')}: {mail.reason}</p> : null}
      {mail.deferUntil !== null ? <p>{t('attention.deferred')}: {new Date(mail.deferUntil).toLocaleString()}</p> : null}
      {confirmErase ? <div role="group" aria-label={t('erase')}><p>{t('eraseHint')}</p><div className={css.actions}><Button disabled={busy} onClick={() => { setBusy(true); void actions.erase(id).then((result) => { if (result.ok) back() }).catch((_error: unknown) => { /* Shell feedback owns failure. */ }).finally(() => { setBusy(false) }) }}>{t('confirmErase')}</Button><Button variant="outline" onClick={() => { setConfirmErase(false) }}>{t('cancel')}</Button></div></div> : null}
      <div className={css.actions}>{mail.folder === 'trash' ? <Button variant="outline" disabled={busy} onClick={() => { setConfirmErase(true) }}>{t('erase')}</Button> : null}<Button variant="outline" disabled={busy || mail.folder === 'blocked'} onClick={() => { move(mail.folder === 'trash' || mail.folder === 'archive' ? 'restore' : 'archive') }}>{t(mail.folder === 'trash' || mail.folder === 'archive' ? 'restore' : 'archive')}</Button>
        <Button variant="outline" disabled={busy || mail.folder === 'trash'} onClick={() => { move('trash') }}>{t('trash')}</Button>
        {mail.sessionId === null ? null : <Button variant="outline" onClick={() => { actions.openSession(mail.sessionId!) }}>{t('openSession')}</Button>}</div>
    </>}
  </article>
}
