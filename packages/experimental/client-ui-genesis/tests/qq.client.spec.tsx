import type { QqDecisionEditor } from '../src/client/QqDecisionEditor.tsx'
import type { SessionId } from '@deepseek-ai/dsh-session'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { QqStatus } from '@deepseek-ai/dsh-experimental-genesis-qq/types'
import { QqPanel } from '../src/client/QqPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'

afterEach(cleanup)
const dictionary: Readonly<Record<string, string>> = en
const t: ComponentProps<typeof QqDecisionEditor>['t'] = (key, params) => (dictionary[key] ?? key)
  .replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? ''))
it('shows unknown delivery, saves explicit access rules and retains failed or stale drafts', async () => {
  const sample: QqStatus = { revision: 0, connectionRevision: 0, connection: { enabled: true, wsUrl: 'ws://127.0.0.1:3001', port: 6700, botQq: '11111', operatorQq: '12345' }, botQq: '11111', operatorQq: '12345', endpoint: 'ws://127.0.0.1:3001', tokenConfigured: true,
    mode: 'connected', failure: null, pending: 0, liveSessions: 1, omitted: 0,
    settings: { enabled: true, allowGroups: ['67890'], allowUsers: ['12345'], acceptPrivateFromAnyone: false, groupAutoReply: true, replyOnlyWhenMentioned: true, extraPrompt: '', privateContextTokens: 200000, groupContextTokens: 400000, operatorContextTokens: 500000 },
    deliveries: [{ sessionId: brandString<SessionId>('qq-private'), seq: 10, timestamp: '2026-11-04T00:00:00.000Z', status: 'uncertain', parts: 2, acknowledged: 1 }] }
  const saveQq = vi.fn().mockResolvedValueOnce({ ok: false, error: new Error('conflict') }).mockResolvedValue({ ok: true, value: 2 })
  const saveConnection = vi.fn().mockResolvedValue({ ok: true, value: 1 })
  const setToken = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  const props = { ...globalProps, t, saveQq, saveConnection, setToken, refresh: vi.fn(), openSession: vi.fn(),
    useResource: () => ({ status: 'live', value: sample }),
  } as ComponentProps<typeof QqPanel>
  const view = render(<QqPanel {...props} />)
  sample.failure = 'archived'
  view.rerender(<QqPanel {...props} />)
  expect(screen.getByRole('alert').textContent).toBe(en['qqFailure.archived'])
  sample.failure = null
  view.rerender(<QqPanel {...props} />)
  expect(screen.getByText(en['qqDelivery.uncertain'])).toBeTruthy()
  expect(screen.getByText(en.qqTokenPresent)).toBeTruthy()
  fireEvent.change(screen.getByLabelText(en.qqEndpoint), { target: { value: 'ws://127.0.0.1:3002' } })
  fireEvent.click(screen.getByRole('button', { name: en.qqConnectSave }))
  await waitFor(() => { expect(saveConnection).toHaveBeenCalledWith({ ...sample.connection, wsUrl: 'ws://127.0.0.1:3002' }, 0, expect.any(AbortSignal)) })
  await waitFor(() => { expect(screen.getByRole('button', { name: en.qqSaveToken })).toHaveProperty('disabled', true) })
  fireEvent.change(screen.getByLabelText(en.qqToken), { target: { value: 'write-only-fixture-token' } })
  fireEvent.click(screen.getByRole('button', { name: en.qqSaveToken }))
  await waitFor(() => { expect(setToken).toHaveBeenCalledWith('write-only-fixture-token', expect.any(AbortSignal)) })
  await waitFor(() => { expect(screen.getByLabelText(en.qqToken)).toHaveProperty('value', '') })
  fireEvent.change(screen.getByLabelText(en.qqGroups), { target: { value: '67890, 77777, 77777' } })
  fireEvent.change(screen.getByLabelText(en.qqExtraPrompt), { target: { value: '回复简短自然。' } })
  fireEvent.change(screen.getByLabelText(en['qqContext.privateContextTokens']), { target: { value: '210000' } })
  fireEvent.click(screen.getByRole('button', { name: en.qqSave }))
  await waitFor(() => { expect(saveQq).toHaveBeenCalledWith({ ...sample.settings, allowGroups: ['67890', '77777'], extraPrompt: '回复简短自然。', privateContextTokens: 210000 }, 0, expect.any(AbortSignal)) })
  await waitFor(() => { expect(screen.getByRole('button', { name: en.qqSave })).toHaveProperty('disabled', false) })
  expect(screen.getByLabelText(en.qqGroups)).toHaveProperty('value', '67890, 77777, 77777')
  sample.revision = 1
  view.rerender(<QqPanel {...props} />)
  expect(screen.getByRole('button', { name: en.qqSave })).toHaveProperty('disabled', true)
  expect(screen.getByRole('alert').textContent).toBe(en.qqConflict)
  fireEvent.click(screen.getByRole('button', { name: en.reloadConfiguration }))
  fireEvent.click(screen.getByLabelText(en.qqEnabled))
  fireEvent.click(screen.getByLabelText(en.qqAutoReply))
  fireEvent.click(screen.getByRole('button', { name: en.qqSave }))
  await waitFor(() => { expect(saveQq).toHaveBeenCalledTimes(2) })
  expect(saveQq).toHaveBeenLastCalledWith({ ...sample.settings, enabled: false, groupAutoReply: false }, 1, expect.any(AbortSignal))
})

it('edits a QQ-only decision route and distinguishes real probability, boolean and failure receipts', async () => {
  const { QqDecisionEditor } = await import('../src/client/QqDecisionEditor.tsx')
  const saveDecision = vi.fn().mockResolvedValue({ ok: true, value: 2 })
  const setDecisionKey = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  const sample: NonNullable<QqStatus['decision']> = { revision: 1, settings: { kind: 'inherit' }, keyConfigured: false,
    recent: [
      { sessionId: brandString<SessionId>('qq-group'), messageId: '1', target: '67890', timestamp: '2026-11-04T09:30:00.000Z', outcome: 'reply', decision: { probability: 0.73, threshold: 0.6 } },
      { sessionId: brandString<SessionId>('qq-group'), messageId: '2', target: '67890', timestamp: '2026-11-04T09:30:01.000Z', outcome: 'skip', decision: null },
      { sessionId: brandString<SessionId>('qq-group'), messageId: '3', target: '67890', timestamp: '2026-11-04T09:30:02.000Z', outcome: 'failed', decision: null },
    ] }
  render(<QqDecisionEditor sample={sample} writable saveDecision={saveDecision} setDecisionKey={setDecisionKey} refresh={vi.fn()} t={t} />)
  expect(screen.getByText(t('qqDecisionProbability', { probability: 73, threshold: 60 }))).toBeTruthy()
  expect(screen.getAllByText(en.qqDecisionNoProbability)).toHaveLength(2)
  expect(screen.queryByText(/100%/u)).toBeNull()
  fireEvent.click(screen.getByLabelText(en.qqDecisionInherit))
  fireEvent.click(screen.getByLabelText(en.useProvider))
  fireEvent.change(screen.getByLabelText(en.modelEndpoint), { target: { value: 'http://127.0.0.1:9876/typesafe' } })
  fireEvent.change(screen.getByLabelText(en.modelId), { target: { value: 'fixture-judge' } })
  fireEvent.change(screen.getByLabelText(en.qqDecisionThreshold), { target: { value: '0.6' } })
  fireEvent.click(screen.getByRole('button', { name: en.qqDecisionSave }))
  await waitFor(() => { expect(saveDecision).toHaveBeenCalledWith({ kind: 'jev', url: 'http://127.0.0.1:9876/typesafe', model: 'fixture-judge', threshold: 0.6, useKey: false }, 1, expect.any(AbortSignal)) })
})
