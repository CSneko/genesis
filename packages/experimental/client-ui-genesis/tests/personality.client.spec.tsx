// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { LifeMemory } from '@deepseek-ai/dsh-experimental-genesis/types'
import { PersonalityPanel } from '../src/client/PersonalityPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'
import { statusFixture } from './status-fixture.client.ts'
import type {} from '../src/client/mount.ts'

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const t = (key: string, params?: Record<string, unknown>) => en[key as keyof typeof en]
  .replace(/\{(\w+)\}/gu, (_match: string, key: string) => String(params?.[key] ?? ''))
const personality: LifeMemory = { id: brandString<LifeMemory['id']>('85cb005e-090d-44f0-b527-4ae3be2b7ef4'),
  lifeId: statusFixture().identity.id, category: 'self', kind: 'non-declarative', content: 'Caring and curious, with independent preferences.',
  importance: 0.5, confidence: 1, sourceEventIds: [], createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' }
const style: LifeMemory = { ...personality, id: brandString<LifeMemory['id']>('7fd6e778-b5b7-4077-a3b6-05a697559318'),
  category: 'procedural', content: 'Warm and direct during serious discussions.' }
function fixture() {
  const save = vi.fn().mockResolvedValue({ ok: true, value: personality })
  const refresh = vi.fn()
  const props = { ...globalProps, t, save, refresh, browse: vi.fn(), saveSummary: vi.fn(), summarize: vi.fn(), remove: vi.fn(), convert: vi.fn(),
    useResource: () => ({ status: 'live', value: { entries: [personality, style], omitted: 2 }, failure: undefined }),
  } as ComponentProps<typeof PersonalityPanel>
  return { props, save, refresh }
}

it('groups tendencies and style and preserves failed edit drafts with their original version', async () => {
  const { props, save, refresh } = fixture()
  save.mockResolvedValueOnce({ ok: false, error: new RemoteError('genesis/operation', 'Memory changed; refresh.', { reason: 'configuration-conflict' }) })
    .mockResolvedValueOnce({ ok: true, value: { ...personality, content: 'Curious and willing to reconsider.' } })
  render(<PersonalityPanel {...props} />)
  expect(screen.getByRole('heading', { name: en.personalityTitle })).toBeTruthy()
  expect(screen.getByRole('heading', { name: en.personalityTendencies })).toBeTruthy()
  expect(screen.getByRole('heading', { name: en.personalityStyle })).toBeTruthy()
  expect(screen.getByText(t('omitted', { count: 2 }))).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: en.editMemory })[0]!)
  fireEvent.change(screen.getByLabelText(en.memoryContent), { target: { value: 'Curious and willing to reconsider.' } })
  expect(screen.queryByLabelText(en.memoryImportance)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.saveMemory }))
  expect((await screen.findByRole('alert')).textContent).toContain('Memory changed')
  expect(screen.getByLabelText(en.memoryContent)).toHaveProperty('value', 'Curious and willing to reconsider.')
  fireEvent.click(screen.getByRole('button', { name: en.saveMemory }))
  await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  expect(save).toHaveBeenLastCalledWith(personality.id, expect.objectContaining({ category: 'self', kind: 'non-declarative' }), personality.updatedAt, expect.any(AbortSignal))
  expect(refresh).toHaveBeenCalled()
})

it('creates speaking habits in the non-declarative procedural layer and retains the ID on a failed retry', async () => {
  const { props, save } = fixture()
  save.mockResolvedValue({ ok: false, error: new RemoteError('genesis/operation', 'Storage unavailable', { reason: 'storage' }) })
  render(<PersonalityPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: en.personalityAddStyle }))
  fireEvent.change(screen.getByLabelText(en.memoryContent), { target: { value: 'Usually explain my view concisely during serious discussions.' } })
  fireEvent.click(screen.getByRole('button', { name: en.saveMemory }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: en.saveMemory }))
  await waitFor(() => { expect(save).toHaveBeenCalledTimes(2) })
  expect(save.mock.calls[0]?.[0]).toBe(save.mock.calls[1]?.[0])
  expect(save).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ category: 'procedural', kind: 'non-declarative' }), null, expect.any(AbortSignal))
})
