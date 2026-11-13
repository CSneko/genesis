// @vitest-environment jsdom
/** Sleep banners avoid the full life inspection when selecting conversations. @module */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RhythmPanel, SleepBanner } from '../src/client/RhythmPanel.tsx'
import type { SpontaneityStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'

afterEach(cleanup)
it('uses only lightweight rhythm status and hides controls outside the Life preset', () => {
  const useResource = vi.fn(() => ({ value: { lifePreset: 'life', sleep: { mode: 'asleep', current: null } } }))
  const props = {
    sessionId: 'test-sleep-banner',
    useResource,
    useSessions: () => 'life',
    t: (key: string) => key,
    wake: vi.fn(),
  } as Parameters<typeof SleepBanner>[0]
  const view = render(<SleepBanner {...props} />)
  expect(screen.getByRole('button', { name: 'sleepWake' })).toBeDefined()
  view.rerender(<SleepBanner {...props} useSessions={(() => 'ordinary') as typeof props.useSessions} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(useResource.mock.calls).toEqual([['dsh-resource://genesis-rhythm/status'], ['dsh-resource://genesis-rhythm/status']])
})

it('edits large cognition budgets in millions of tokens and omits retired execution caps', async () => {
  const sample: SpontaneityStatus = {
    enabled: true,
    working: false,
    failure: null,
    revision: 0,
    settings: { enabled: true, idleMs: 60000, maxDurationMs: 180000, maxOutputTokens: 50000000, maxPer24Hours: 6 },
    thoughts: 0,
    items: [],
    itemsOmitted: 0,
    runs: [],
    runsOmitted: 0,
  }
  const save = vi.fn().mockResolvedValue({ ok: true, value: 1 })
  const props = {
    ...globalProps,
    view: 'thoughts',
    useResource: () => ({ status: 'live', value: { lifePreset: 'life', sleep: null, spontaneity: sample } }),
    t: (key: keyof typeof en) => en[key],
    saveSpontaneity: save,
    saveSleep: vi.fn(),
    wake: vi.fn(),
    stop: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
  } as Parameters<typeof RhythmPanel>[0]
  render(<RhythmPanel {...props} />)
  const budget = screen.getByRole('spinbutton', { name: en.thoughtTokens })
  expect((budget as HTMLInputElement).value).toBe('50')
  expect(screen.getAllByRole('spinbutton')).toHaveLength(4)
  fireEvent.change(budget, { target: { value: '1000000.5' } })
  fireEvent.click(screen.getByRole('button', { name: en.thoughtSave }))
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith({ ...sample.settings, maxOutputTokens: 1000000500000 }, 0, expect.any(AbortSignal)),
  )
})
