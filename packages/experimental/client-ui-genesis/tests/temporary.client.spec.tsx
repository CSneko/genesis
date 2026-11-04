// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { TemporaryStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { TemporaryMemoryPanel } from '../src/client/TemporaryMemoryPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'

afterEach(cleanup)
const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key]
  .replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? ''))
it('saves an independent small model, retains rejected drafts and reloads conflicting settings', async () => {
  const sample: TemporaryStatus = { revision: 0, failure: null, settings: { enabled: false, idleMs: 1800000,
    summary: { kind: 'provider', provider: 'fixture', model: 'old' } }, count: 0, memories: [], omitted: 0, failures: [] }
  const save = vi.fn().mockResolvedValueOnce({ ok: false, error: new Error('failed') }).mockResolvedValue({ ok: true, value: 2 })
  const props = { ...globalProps, t, save, forget: vi.fn(), retry: vi.fn(), setKey: vi.fn(), refresh: vi.fn(),
    useResource: () => ({ status: 'live', value: sample }),
  } as ComponentProps<typeof TemporaryMemoryPanel>
  const view = render(<TemporaryMemoryPanel {...props} />)
  fireEvent.change(screen.getByLabelText(en.modelId), { target: { value: 'cheap-small-model' } })
  fireEvent.click(screen.getByLabelText(en.temporaryEnabled))
  fireEvent.click(screen.getByRole('button', { name: en.temporarySave }))
  await waitFor(() => { expect(save).toHaveBeenCalledWith({ ...sample.settings, enabled: true,
    summary: { kind: 'provider', provider: 'fixture', model: 'cheap-small-model' } }, 0, expect.any(AbortSignal)) })
  await waitFor(() => { expect(screen.getByRole('alert')).toBeTruthy() })
  expect(screen.getByLabelText(en.modelId)).toHaveProperty('value', 'cheap-small-model')
  sample.revision = 1
  view.rerender(<TemporaryMemoryPanel {...props} />)
  expect(screen.getByRole('button', { name: en.temporarySave })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: en.reloadConfiguration }))
  expect(screen.getByLabelText(en.modelId)).toHaveProperty('value', 'old')
  fireEvent.click(screen.getByRole('button', { name: en.temporarySave }))
  await waitFor(() => { expect(save).toHaveBeenLastCalledWith(sample.settings, 1, expect.any(AbortSignal)) })
})
