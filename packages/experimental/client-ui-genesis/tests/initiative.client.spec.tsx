// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { DecisionId, InteractionId, LifeEventId } from '@deepseek-ai/dsh-experimental-genesis'
import type { InitiativeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { InitiativePanel } from '../src/client/InitiativePanel.tsx'
import { en, zh } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'
import type {} from '../src/client/mount.ts'

afterEach(cleanup)
function fixture(chinese = false) {
  const sample: InitiativeStatus = { available: true, revision: 3, sampledAt: '2026-10-27T06:00:00.000Z', mode: 'waiting-channel',
    nextCheckAt: '2026-10-27T06:30:00.000Z', lastCheckAt: '2026-10-27T06:00:00.000Z', failure: null,
    lastMessage: null, lastMessageTruncated: false,
    settings: { enabled: true, intervalMs: 1800000, minSendIntervalMs: 1800000, maxPer24Hours: 6, userIdleMs: 60000,
      eventImportance: 0.8, maxPending: 20, maxPendingAgeMs: 86400000 },
    channels: [], counts: { pending: 1, dispatching: 0, sent: 0, skipped: 0, uncertain: 0 },
    records: [{ record: { id: brandString<InteractionId>('ed0f424a-ce8f-49dd-bd2d-d7f1b6672780'), key: 'timer:1',
      sourceEventId: brandString<LifeEventId>('ed0f424a-ce8f-49dd-bd2d-d7f1b6672781'), createdAt: '2026-10-27T06:00:00.000Z',
      status: 'pending', reason: 'A recorded finding is worth sharing.', note: 'No idle conversation; not sent.' },
    triggerType: 'memory.created', choice: 'accept', messageTruncated: false }], omitted: 0, channelsOmitted: 0 }
  const saveSettings = vi.fn().mockResolvedValue({ ok: true, value: 4 })
  const refresh = vi.fn()
  const dictionary: Readonly<Record<string, string>> = chinese ? zh : en
  const props: ComponentProps<typeof InitiativePanel> = { ...globalProps, close: vi.fn(), saveSettings, refresh,
    t: (key, params) => (dictionary[key] ?? key).replace(/\{(\w+)\}/gu, (_match: string, name: string) => {
      const value = params?.[name]
      return typeof value === 'number' || typeof value === 'string' ? String(value) : ''
    }),
    useResource: (() => ({ status: 'live', value: sample, failure: undefined })) as ComponentProps<typeof InitiativePanel>['useResource'],
  }
  return { sample, props, saveSettings, refresh }
}

it('shows localized pending reasons and actual samples without presenting a missing receipt as sent', () => {
  const { props } = fixture(true)
  render(<InitiativePanel {...props} />)
  expect(screen.getByRole('heading', { name: zh.initiativeTitle })).toBeTruthy()
  expect(screen.getByText(zh['initiativeMode.waiting-channel'])).toBeTruthy()
  expect(screen.getByText('A recorded finding is worth sharing.')).toBeTruthy()
  expect(screen.getByText(/No idle conversation; not sent/)).toBeTruthy()
  expect(screen.queryByText(zh.initiativeSentAt)).toBeNull()
})

it('separates delivery records from the persisted proactive policy editor', () => {
  const { props } = fixture()
  const page = render(<InitiativePanel {...props} view="activity" />)
  expect(screen.getByRole('heading', { name: en.outboxTitle })).toBeTruthy()
  expect(screen.queryByRole('switch', { name: en.initiativeEnabled })).toBeNull()
  expect(screen.getByText('A recorded finding is worth sharing.')).toBeTruthy()
  page.rerender(<InitiativePanel {...props} view="settings" />)
  expect(screen.getByRole('switch', { name: en.initiativeEnabled })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: en.initiativeHistory })).toBeNull()
})

it('saves pause, channel and interval through the generated action with milliseconds and settings revision', async () => {
  const { props, sample, saveSettings, refresh } = fixture()
  render(<InitiativePanel {...props} />)
  fireEvent.click(screen.getByRole('switch', { name: en.initiativeEnabled }))
  fireEvent.change(screen.getByLabelText(en['initiativeSetting.intervalMs']), { target: { value: '90' } })
  fireEvent.change(screen.getByLabelText(en.initiativeTarget), { target: { value: 'life-conversation' } })
  fireEvent.click(screen.getByRole('button', { name: en.initiativeSave }))
  await vi.waitFor(() => { expect(screen.getByText(en.initiativeSaved)).toBeTruthy() })
  expect(saveSettings).toHaveBeenCalledWith({ ...sample.settings, enabled: false, intervalMs: 90000, sessionId: 'life-conversation' },
    3, expect.any(AbortSignal))
  expect(refresh).toHaveBeenCalled()
})

it('keeps failed settings drafts across refreshes and replaces them only on explicit reload', async () => {
  const { props, sample, saveSettings } = fixture()
  saveSettings.mockResolvedValue({ ok: false, error: new RemoteError('genesis/operation', 'Reload before saving.', { reason: 'configuration-conflict' }) })
  const view = render(<InitiativePanel {...props} />)
  const interval = screen.getByLabelText<HTMLInputElement>(en['initiativeSetting.intervalMs'])
  fireEvent.change(interval, { target: { value: '123' } })
  fireEvent.click(screen.getByRole('button', { name: en.initiativeSave }))
  await vi.waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Reload before saving.') })
  sample.revision++
  sample.settings!.intervalMs = 300000
  view.rerender(<InitiativePanel {...props} />)
  expect(interval.value).toBe('123')
  fireEvent.click(screen.getByRole('button', { name: en.emotionReload }))
  expect(interval.value).toBe('300')
})

it('rejects invalid intervals locally and keeps historical receipts visible when the worker is unavailable', () => {
  const { props, sample, saveSettings } = fixture()
  const view = render(<InitiativePanel {...props} />)
  fireEvent.change(screen.getByLabelText(en['initiativeSetting.intervalMs']), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: en.initiativeSave }))
  expect(saveSettings).not.toHaveBeenCalled()
  sample.available = false; sample.mode = 'unavailable'
  view.rerender(<InitiativePanel {...props} />)
  expect(screen.queryByRole('button', { name: en.initiativeSave })).toBeNull()
  expect(screen.getByText('A recorded finding is worth sharing.')).toBeTruthy()
})

it('shows the latest confirmed message even when the recent opportunity list contains only pending work', () => {
  const { props, sample } = fixture()
  sample.lastMessage = { ...sample.records[0]!.record, status: 'sent', message: 'A confirmed earlier message.',
    sessionId: brandString<SessionId>('life-conversation'), messageSeq: 25, sentAt: '2026-10-27T05:00:00.000Z',
    decisionId: brandString<DecisionId>('ed0f424a-ce8f-49dd-bd2d-d7f1b6672782') }
  render(<InitiativePanel {...props} />)
  expect(screen.getByText('A confirmed earlier message.')).toBeTruthy()
  expect(screen.getByText('A recorded finding is worth sharing.')).toBeTruthy()
})
