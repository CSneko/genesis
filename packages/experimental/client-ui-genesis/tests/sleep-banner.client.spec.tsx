// @vitest-environment jsdom
/** Sleep banners avoid the full life inspection when selecting conversations. @module */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SleepBanner } from '../src/client/RhythmPanel.tsx'

afterEach(cleanup)
it('uses only lightweight rhythm status and hides controls outside the Life preset', () => {
  const useResource = vi.fn(() => ({ value: { lifePreset: 'life', sleep: { mode: 'asleep', current: null } } }))
  const props = { sessionId: 'test-sleep-banner', useResource, useSessions: () => 'life', t: (key: string) => key,
    wake: vi.fn() } as Parameters<typeof SleepBanner>[0]
  const view = render(<SleepBanner {...props} />)
  expect(screen.getByRole('button', { name: 'sleepWake' })).toBeDefined()
  view.rerender(<SleepBanner {...props} useSessions={(() => 'ordinary') as typeof props.useSessions} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(useResource.mock.calls).toEqual([
    ['dsh-resource://genesis-rhythm/status'], ['dsh-resource://genesis-rhythm/status'],
  ])
})
