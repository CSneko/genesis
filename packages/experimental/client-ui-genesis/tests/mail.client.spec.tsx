// @vitest-environment jsdom
/** Mail browsing distinguishes operator preview from character reads and keeps explicit sending policy. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MailStatus, MailMessage } from '@deepseek-ai/dsh-experimental-genesis-mail/types'
import { MailPanel } from '../src/client/MailPanel.tsx'
import { MailSettings } from '../src/client/MailSettings.tsx'
import { zh } from '../src/client/mail-locales.ts'
import type {} from '../src/client/mail-mount.ts'
import { globalProps } from './global-props.client.ts'
afterEach(cleanup)
function fixture() {
  const mail: MailMessage = {
    id: brandString<MailMessage['id']>('mail-1'),
    threadKey: 'thread-1',
    operator: false,
    authservId: null,
    direction: 'incoming',
    from: 'friend@example.org',
    to: 'life@example.net',
    subject: 'Hello',
    text: '<script>not executable</script>\nA plain text letter.',
    at: 1,
    messageId: '<one@example.org>',
    inReplyTo: null,
    providerKey: '1:1',
    folder: 'inbox',
    review: 'allowed',
    attention: 'pending',
    delivery: 'received',
    readAt: null,
    deferUntil: null,
    reason: '',
    sessionId: null,
    sourceCall: null,
    notifiedSeq: null,
  }
  const sample: MailStatus = {
    settings: {
      enabled: false,
      address: '',
      user: '',
      imapHost: '',
      imapPort: 993,
      smtpHost: '',
      smtpPort: 465,
      smtpSecure: true,
      credentialRef: 'GENESIS_MAIL_PASSWORD',
      recipientMode: 'unlimited',
      recipients: [],
      allowProactive: true,
      dailySendLimit: 0,
      operatorAddress: '',
      trustedAuthservId: '',
    },
    pollMs: 60000,
    revision: 0,
    credentialPresent: false,
    awake: false,
    active: false,
    failure: null,
    lastSyncAt: null,
    pending: 1,
    uncertain: 0,
    messages: [mail],
    total: 1,
    nextOffset: null,
  }
  const labels: Record<string, string> = zh
  const props: ComponentProps<typeof MailPanel> = {
    ...globalProps,
    close() {},
    t: (key, params) => (labels[key] ?? key).replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? '')),
    save: vi.fn().mockResolvedValue({ ok: true, value: 1 }),
    setPassword: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    sync: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    erase: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    organize: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    refresh: vi.fn(),
    openSession: vi.fn(),
    useResource: ((address: string) => ({
      status: 'live',
      value: address.includes('genesis-mail-detail') ? mail : sample,
      failure: undefined,
    })) as ComponentProps<typeof MailPanel>['useResource'],
  }
  return { mail, sample, props }
}
it('previews incoming text without marking it read and organizes only on an explicit action', async () => {
  const { mail, props } = fixture()
  render(<MailPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Hello/u }))
  expect(screen.getByRole('article').textContent).toContain(mail.text)
  expect(document.activeElement).toBe(screen.getByRole('article'))
  expect(screen.getByText(new RegExp(zh.unread, 'u'))).toBeTruthy()
  expect(document.querySelector('script')).toBeNull()
  expect(mail.readAt).toBeNull()
  expect(props.organize).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: zh.archive }).at(-1)!)
  await waitFor(() => {
    expect(props.organize).toHaveBeenCalledWith(mail.id, 'archive')
  })
  fireEvent.click(screen.getByRole('button', { name: zh.close }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /Hello/u }))
})
it('saves unlimited recipients and proactive mail explicitly while keeping the password write separate', async () => {
  const { sample, props } = fixture()
  render(<MailSettings {...props} />)
  expect(screen.getByLabelText(zh.recipientMode)).toHaveProperty('value', 'unlimited')
  expect(screen.getByLabelText(zh.allowProactive)).toHaveProperty('checked', true)
  fireEvent.click(screen.getByRole('button', { name: zh.save }))
  await waitFor(() => {
    expect(props.save).toHaveBeenCalledWith(sample.settings, 0)
  })
  expect(props.setPassword).not.toHaveBeenCalled()
})

it('shows blocked mail only as an operator preview without offering to release it', () => {
  const { mail, props } = fixture()
  mail.review = 'blocked'
  mail.folder = 'blocked'
  render(<MailPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: zh['folder.blocked'] }))
  fireEvent.click(screen.getByRole('button', { name: /Hello/u }))
  expect(screen.getByText(zh.blockedHint)).toBeTruthy()
  expect(screen.getByRole('article').textContent).toContain(mail.text)
  expect(screen.getAllByRole('button', { name: zh.archive }).at(-1)).toHaveProperty('disabled', true)
})
