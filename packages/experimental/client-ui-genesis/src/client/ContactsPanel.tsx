/** Searchable contacts with one relationship identity and multiple addresses. @module */
import { useState } from 'react'
import { Button, Checkbox, Input, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { LifeContact } from '@deepseek-ai/dsh-experimental-genesis/types'
import css from './StatusPanel.module.css'
import contactCss from './ContactsPanel.module.css'

/** Generated contact mutations and shared query refresh. */
export interface ContactActions {
  save: TypertClientRemote['genesisContacts']['save']
  erase: TypertClientRemote['genesisContacts']['erase']
  refresh(this: void): void
}
type Props = PropsRuntime<'genesis.page'> & PropsLocale<'genesis'> & InjectFace<ContactActions>
/** Render bounded address search and explicit contact editing.
 * @param props - Shared resources, localized copy and authenticated mutations.
 * @returns Contact catalogue and an optional editor.
 */
export function ContactsPanel({ useResource, t, ...actions }: Props) {
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<LifeContact | 'new'>()
  const resource = useResource<'genesis-contacts'>(`dsh-resource://genesis-contacts/catalog?query=${encodeURIComponent(query)}&offset=${offset}`)
  const value = resource.value
  return <section className={css.panel}>
    <header className={css.header}><h3>{t('contactsTitle')}</h3><div className={css.actions}>
      <Button variant="outline" onClick={actions.refresh}>{t('refresh')}</Button>
      <Button disabled={resource.status !== 'live'} onClick={() => { setEditing('new') }}>{t('contactsAdd')}</Button>
    </div></header>
    <p className={css.secondary}>{t('contactsDescription')}</p>
    <form className={css.search} onSubmit={(event) => { event.preventDefault(); setQuery(search); setOffset(0) }}>
      <Input aria-label={t('contactsSearch')} value={search} maxLength={500} onChange={(event) => { setSearch(event.target.value) }} />
      <Button variant="outline" type="submit">{t('contactsSearch')}</Button>
    </form>
    {resource.status === 'failed' ? <p role="alert">{t('contactsLoadFailed')}</p> : null}
    {value === undefined && resource.status === 'loading' ? <div className={css.loading} role="status" aria-label={t('contactsTitle')}><StateDot state="ongoing" /></div> : null}
    {value === undefined ? null : <>
      {value.items.length === 0 ? <p>{t('contactsEmpty')}</p> : <ul className={css.records}>{value.items.map(contact => <li key={contact.personId}>
        <div className={css.header}><span>{contact.name}{contact.operator ? ` · ${t('contactsOperator')}` : ''}</span><Button variant="outline" disabled={resource.status !== 'live'} onClick={() => { setEditing(contact) }}>{t('contactsEdit')}</Button></div>
        <p>{t('contactsQq')}: {contact.qq}</p>
        {contact.emails.map(email => <p key={email}>{email}</p>)}
        {contact.handles.map((handle, index) => <p key={index}>{handle.kind}: {handle.value}</p>)}
        {contact.notes ? <p className={css.secondary}>{contact.notes}</p> : null}
        <details><summary>{t('peopleIdentity')}</summary><p className={css.secondary}>{contact.personId}</p></details>
      </li>)}</ul>}
      <div className={css.actions}><Button variant="outline" disabled={offset === 0} onClick={() => { setOffset(0) }}>{t('peopleFirst')}</Button>
        <Button variant="outline" disabled={value.nextOffset === null} onClick={() => { if (value.nextOffset !== null) setOffset(value.nextOffset) }}>{t('peopleNext')}</Button></div>
    </>}
    {editing === undefined ? null : <ContactEditor key={editing === 'new' ? 'new' : editing.personId} contact={editing === 'new' ? undefined : editing}
      writable={resource.status === 'live'} close={() => { setEditing(undefined) }} t={t} save={actions.save} erase={actions.erase} refresh={actions.refresh} />}
  </section>
}
function ContactEditor({ contact, writable, close, save, erase, t }: PropsLocale<'genesis'> & ContactActions & {
  contact: LifeContact | undefined; writable: boolean; close: () => void
}) {
  const [name, setName] = useState(contact?.name ?? ''), [qq, setQq] = useState(contact?.qq ?? '')
  const [emails, setEmails] = useState(contact?.emails.join('\n') ?? ''), [notes, setNotes] = useState(contact?.notes ?? '')
  const [handles, setHandles] = useState(contact?.handles.map(item => `${item.kind}=${item.value}`).join('\n') ?? '')
  const [operator, setOperator] = useState(contact?.operator ?? false)
  const [busy, setBusy] = useState(false), [confirmDelete, setConfirmDelete] = useState(false)
  const run = async (work: () => ReturnType<ContactActions['save']>) => {
    if (busy || !writable) return
    setBusy(true)
    try { const result = await work(); if (result.ok) close() }
    catch (_error: unknown) { /* Shell feedback owns the failed mutation; the draft remains open. */ }
    finally { setBusy(false) }
  }
  return <Modal open title={t(contact === undefined ? 'contactsAdd' : 'contactsEdit')} closeLabel={t('close')} onClose={close} className={css.dialog!}>
    <form className={css.naming} onSubmit={(event) => { event.preventDefault(); void run(() => save({ name, qq, notes,
      ...(contact === undefined ? {} : { personId: contact.personId }),
      emails: emails.split(/[\s,;]+/u).filter(Boolean),
      handles: handles.split(/\r?\n/u).filter(line => line.trim()).map((line) => {
        const separator = line.indexOf('=')
        return { kind: separator < 0 ? line : line.slice(0, separator), value: separator < 0 ? '' : line.slice(separator + 1) }
      }),
    }, operator)) }}>
      <fieldset className={css.modelFields} disabled={busy || !writable}>
        <Checkbox label={t('contactsOperatorChoice')} checked={operator} onChange={setOperator} />
        <label className={css.minecraftField}>{t('name')}<Input required maxLength={200} value={name} onChange={(event) => { setName(event.target.value) }} /></label>
        <label className={css.minecraftField}>{t('contactsQq')}<Input required inputMode="numeric" pattern="[1-9][0-9]*" readOnly={contact !== undefined} value={qq} onChange={(event) => { setQq(event.target.value) }} /></label>
        <p className={css.secondary}>{t('contactsIdentityHint')}</p>
        <label className={css.minecraftField}>{t('contactsEmails')}<textarea className={contactCss.textarea} rows={3} value={emails} onChange={(event) => { setEmails(event.target.value) }} /></label>
        <label className={css.minecraftField}>{t('contactsHandles')}<textarea className={contactCss.textarea} rows={3} value={handles} onChange={(event) => { setHandles(event.target.value) }} /></label>
        <label className={css.minecraftField}>{t('contactsNotes')}<textarea className={contactCss.textarea} rows={3} maxLength={2000} value={notes} onChange={(event) => { setNotes(event.target.value) }} /></label>
      </fieldset>
      <div className={css.actions}><Button type="submit" disabled={busy || !writable}>{t('contactsSave')}</Button><Button variant="outline" disabled={busy} onClick={close}>{t('cancel')}</Button></div>
      {contact === undefined ? null : confirmDelete ? <>
        <p role="alert">{t('contactsDeleteConfirm')}</p>
        <div className={css.actions}><Button disabled={busy || !writable} onClick={() => { void run(() => erase(contact.personId)) }}>{t('contactsDelete')}</Button>
          <Button variant="outline" disabled={busy} onClick={() => { setConfirmDelete(false) }}>{t('cancel')}</Button></div>
      </> : <Button variant="outline" disabled={busy || !writable} onClick={() => { setConfirmDelete(true) }}>{t('contactsDelete')}</Button>}
    </form>
  </Modal>
}
