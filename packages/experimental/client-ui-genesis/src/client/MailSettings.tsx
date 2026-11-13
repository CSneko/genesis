/** Revision-fenced account and sending policy editor; credentials have a separate write path. @module */
import { useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MailStatus } from '@deepseek-ai/dsh-experimental-genesis-mail/types'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { MailActions } from './MailPanel.tsx'
import css from './StatusPanel.module.css'
import mailCss from './MailPanel.module.css'

/** Configure TLS routes, operator recognition and explicitly unlimited recipient policy.
 * @param props - Framework resources, localized labels and generated mutations.
 * @returns Secret-free settings plus a write-only password form.
 */
export function MailSettings({
  useResource,
  t,
  ...actions
}: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.mail'> & InjectFace<MailActions>) {
  const resource = useResource<'genesis-mail'>('dsh-resource://genesis-mail/catalog?folder=inbox&offset=0')
  return (
    <section className={css.panel}>
      <header className={css.header}>
        <h3>{t('title')}</h3>
        <Button variant="outline" onClick={actions.refresh}>
          {t('refresh')}
        </Button>
      </header>
      <p className={css.secondary}>{t('settingsDescription')}</p>
      {resource.status === 'failed' ? <p role="alert">{t('unavailable')}</p> : null}
      {resource.value === undefined ? (
        <div className={css.loading} role="status" aria-label={t('title')}>
          <StateDot state="ongoing" />
        </div>
      ) : (
        <Editor sample={resource.value} writable={resource.status === 'live'} t={t} {...actions} />
      )}
    </section>
  )
}
function Editor({
  sample,
  writable,
  t,
  ...actions
}: PropsLocale<'genesis.mail'> & MailActions & { sample: MailStatus; writable: boolean }) {
  const [draft, setDraft] = useState(() => structuredClone(sample.settings)),
    [revision, setRevision] = useState(sample.revision)
  const [recipients, setRecipients] = useState(sample.settings.recipients.join('\n')),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false)
  const stale = sample.revision !== revision,
    disabled = busy || !writable
  const run = (work: () => Promise<RemoteResult<unknown>>) => {
    if (busy) return
    setBusy(true)
    void work()
      .catch((_error: unknown) => {
        /* Shell-owned feedback retains the failed mutation. */
      })
      .finally(() => {
        setBusy(false)
      })
  }
  const fields = ['address', 'user', 'imapHost', 'smtpHost', 'credentialRef', 'trustedAuthservId'] as const
  return (
    <div className={css.editor}>
      <form
        className={css.naming}
        onSubmit={(event) => {
          event.preventDefault()
          if (!stale)
            run(async () => {
              const result = await actions.save(
                {
                  ...draft,
                  recipients: recipients
                    .split(/\r?\n/u)
                    .map(value => value.trim())
                    .filter(Boolean),
                },
                revision,
              )
              if (result.ok) setRevision(result.value)
              return result
            })
        }}
      >
        <fieldset className={css.modelFields} disabled={disabled}>
          <Checkbox
            label={t('enabled')}
            checked={draft.enabled}
            onChange={(enabled) => {
              setDraft(value => ({ ...value, enabled }))
            }}
          />
          {fields.map(field => (
            <label className={css.minecraftField} key={field}>
              {t(field)}
              <Input
                value={draft[field]}
                maxLength={field === 'address' || field === 'user' ? 320 : 253}
                type={field === 'address' ? 'email' : 'text'}
                onChange={(event) => {
                  const text = event.target.value
                  setDraft(value => ({ ...value, [field]: text }))
                }}
              />
            </label>
          ))}
          <p className={css.secondary}>{t('operatorHint')}</p>
          {(['imapPort', 'smtpPort', 'dailySendLimit'] as const).map(field => (
            <label className={css.minecraftField} key={field}>
              {t(field)}
              <Input
                type="number"
                min={field === 'dailySendLimit' ? 0 : 1}
                max={field === 'dailySendLimit' ? 100000 : 65535}
                step={1}
                required
                value={draft[field]}
                onChange={(event) => {
                  const number = Number(event.target.value)
                  setDraft(value => ({ ...value, [field]: number }))
                }}
              />
            </label>
          ))}
          <Checkbox
            label={t('smtpSecure')}
            checked={draft.smtpSecure}
            onChange={(smtpSecure) => {
              setDraft(value => ({ ...value, smtpSecure }))
            }}
          />
          <label className={css.minecraftField}>
            {t('recipientMode')}
            <select
              className={mailCss.select}
              value={draft.recipientMode}
              onChange={(event) => {
                const selected = event.target.value
                if (selected === 'unlimited' || selected === 'addresses' || selected === 'domains')
                  setDraft(value => ({ ...value, recipientMode: selected }))
              }}
            >
              {(['unlimited', 'addresses', 'domains'] as const).map(value => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </label>
          {draft.recipientMode === 'unlimited' ? null : (
            <label className={css.minecraftField}>
              {t('recipients')}
              <textarea
                className={mailCss.textarea}
                value={recipients}
                onChange={(event) => {
                  setRecipients(event.target.value)
                }}
              />
            </label>
          )}
          <Checkbox
            label={t('allowProactive')}
            checked={draft.allowProactive}
            onChange={(allowProactive) => {
              setDraft(value => ({ ...value, allowProactive }))
            }}
          />
        </fieldset>
        {stale ? (
          <p role="alert">
            {t('stale')}{' '}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(structuredClone(sample.settings))
                setRevision(sample.revision)
                setRecipients(sample.settings.recipients.join('\n'))
              }}
            >
              {t('reload')}
            </Button>
          </p>
        ) : null}
        <div className={css.actions}>
          <Button type="submit" disabled={disabled || stale}>
            {t('save')}
          </Button>
        </div>
      </form>
      <form
        className={css.naming}
        onSubmit={(event) => {
          event.preventDefault()
          run(async () => {
            const result = await actions.setPassword(password, revision)
            if (result.ok) setPassword('')
            return result
          })
        }}
      >
        <label className={css.minecraftField}>
          {t('password')}
          <Input
            type="password"
            autoComplete="new-password"
            required
            maxLength={4096}
            disabled={disabled || stale}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
            }}
          />
        </label>
        <p className={css.secondary}>{t(sample.credentialPresent ? 'passwordSaved' : 'passwordMissing')}</p>
        <div className={css.actions}>
          <Button type="submit" disabled={disabled || stale || !password}>
            {t('savePassword')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || stale}
            onClick={() => {
              run(() => actions.setPassword(undefined, revision))
            }}
          >
            {t('removePassword')}
          </Button>
        </div>
      </form>
    </div>
  )
}
