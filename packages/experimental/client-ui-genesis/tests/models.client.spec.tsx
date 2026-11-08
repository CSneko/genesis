// @vitest-environment jsdom
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { LifeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { MemoryModels } from '../src/client/MemoryModels.tsx'
import { FirstConversation } from '../src/client/Awakening.tsx'
import { en } from '../src/client/locales.ts'
import type {} from '../src/client/mount.ts'

afterEach(cleanup)
const dictionary: Readonly<Record<string, string>> = en
const initial: NonNullable<LifeStatus['models']> = {
  maxRetries: 3,
  decision: { kind: 'jev', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-latest', threshold: 0.5, keyRef: 'GENESIS_DECISION_API_KEY' },
  writer: { kind: 'openai', url: 'https://writer.example/v1/chat/completions', model: 'writer', keyRef: 'GENESIS_WRITER_API_KEY' },
  revision: 1, keys: { decision: { configured: false, writable: true }, writer: { configured: true, writable: true } },
}

it('retains rejected memory model edits and saves decision and writer credentials separately', async () => {
  const saveModels = vi.fn().mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'Configuration revision changed; reload before saving.', {}) }).mockResolvedValue({ ok: true, value: 2 })
  const credential = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  const testModel = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  render(<MemoryModels deployLocalDecision={vi.fn()} stopLocalDecision={vi.fn()} initial={initial} writable t={(key, params) => (dictionary[key] ?? key).replace('{reason}', typeof params?.reason === 'string' ? params.reason : '')} refresh={() => {}}
    saveModels={saveModels} credential={credential} testModel={testModel} />)
  expect(screen.getByLabelText(en.auxiliaryMaxRetries)).toHaveProperty('value', '3')
  fireEvent.change(screen.getByLabelText(en.auxiliaryMaxRetries), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: en.cloudDecision }))
  fireEvent.change(screen.getByLabelText(en.decisionThreshold), { target: { value: '0.7' } })
  fireEvent.change(screen.getByLabelText(en.decisionKey, { selector: 'input' }), { target: { value: 'private-key' } })
  fireEvent.click(screen.getByRole('button', { name: en.saveModels }))
  await screen.findByText(/Configuration revision changed; reload before saving/u)
  expect(screen.getByLabelText(en.decisionThreshold)).toHaveProperty('value', '0.7')
  expect(screen.getByLabelText(en.auxiliaryMaxRetries)).toHaveProperty('value', '0')
  fireEvent.click(screen.getByRole('button', { name: en.saveModels }))
  await screen.findByText(en.modelsSaved)
  expect(saveModels).toHaveBeenLastCalledWith({ maxRetries: 0, writerInherit: undefined, localDecision: false, decision: { ...initial.decision, threshold: 0.7 }, writer: initial.writer },
    1, expect.any(AbortSignal))
  expect(JSON.stringify(saveModels.mock.calls)).not.toContain('private-key')
  fireEvent.click(within(screen.getByRole('form', { name: en.decisionKey })).getByRole('button', { name: en.saveKey }))
  await screen.findByText(en.credentialSaved)
  expect(credential).toHaveBeenCalledWith('GENESIS_DECISION_API_KEY', 'private-key')
  expect(screen.getByLabelText(en.decisionKey, { selector: 'input' })).toHaveProperty('value', '')
  fireEvent.click(screen.getAllByRole('button', { name: en.checkSavedModel })[0]!)
  await screen.findByText(en.modelTested)
  expect(testModel).toHaveBeenCalledWith('writer', expect.any(AbortSignal))
})

it('retries entering the first conversation without asking to name the existing life again', async () => {
  const startConversation = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const done = vi.fn()
  render(<FirstConversation t={(key, params) => (dictionary[key] ?? key).replace('{reason}', typeof params?.reason === 'string' ? params.reason : '')} startConversation={startConversation} done={done} />)
  fireEvent.click(screen.getByRole('button', { name: en.enterFirstConversation }))
  await screen.findByText(en.conversationFailed)
  expect(done).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: en.enterFirstConversation }))
  await waitFor(() => { expect(done).toHaveBeenCalledOnce() })
})

it('shows the model HTTP failure and preserves entered keys without echoing them', async () => {
  const testModel = vi.fn().mockResolvedValue({ ok: false,
    error: new RemoteError('gateway/internal', 'Memory endpoint failed (HTTP 401). Check the API key.', {}) })
  const credential = vi.fn().mockRejectedValue(new Error('Could not store private-key'))
  render(<MemoryModels deployLocalDecision={vi.fn()} stopLocalDecision={vi.fn()} initial={initial} writable
    t={(key, params) => (dictionary[key] ?? key).replace('{reason}', typeof params?.reason === 'string' ? params.reason : '')}
    refresh={() => {}} saveModels={vi.fn()} credential={credential} testModel={testModel} />)
  fireEvent.click(screen.getAllByRole('button', { name: en.checkSavedModel })[0]!)
  expect((await screen.findByRole('alert')).textContent).toContain('HTTP 401')
  fireEvent.click(screen.getByRole('button', { name: en.cloudDecision }))
  fireEvent.change(screen.getByLabelText(en.decisionKey, { selector: 'input' }), { target: { value: 'private-key' } })
  fireEvent.click(within(screen.getByRole('form', { name: en.decisionKey })).getByRole('button', { name: en.saveKey }))
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('Could not store [redacted]') })
  expect(screen.getByRole('alert').textContent).not.toContain('private-key')
  expect(screen.getByLabelText(en.decisionKey, { selector: 'input' })).toHaveProperty('value', 'private-key')
})

it('shows inherited LLM and optional embeddings without extra endpoint fields', async () => {
  const saveModels = vi.fn().mockResolvedValue({ ok: true, value: 2 })
  render(<MemoryModels initial={{ ...initial, writerInherit: true }} writable
    t={key => dictionary[key] ?? key} refresh={() => {}} saveModels={saveModels}
    deployLocalDecision={vi.fn()} stopLocalDecision={vi.fn()} credential={vi.fn()} testModel={vi.fn()} />)
  expect(screen.getByRole('checkbox', { name: en.inheritDshLlm })).toHaveProperty('checked', true)
  expect(screen.queryByLabelText(en.modelEndpoint)).toBeNull()
  expect(screen.getByRole('button', { name: en.cloudDecision })).toBeDefined()
  expect(screen.getByRole('button', { name: en.deployLocalDecision })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: en.saveModels }))
  await screen.findByText(en.modelsSaved)
  expect(saveModels.mock.calls[0]?.[0].writerInherit).toBe(true)
})
