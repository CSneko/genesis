// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { MinecraftPanel } from '../src/client/MinecraftPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'
import type { MinecraftStatus } from '@deepseek-ai/dsh-experimental-genesis-minecraft/types'
import { brandString } from '@deepseek-ai/dsh-brand'

afterEach(cleanup)
it('retains an independent Jev model draft while keeping stop available during a pending save', async () => {
  const sample: MinecraftStatus = { task: null, sessionId: brandString<NonNullable<MinecraftStatus['sessionId']>>('minecraft-owned-session'), revision: 0, connection: 'connected', monitor: 'running', failure: null, image: null,
    observation: null, lastNotice: null, settings: { enabled: true, reuseKnowledge: true, jevEnabled: true,
      jevUrl: 'https://api.typesafe.ai/v1/systemone', jevModel: 'jev-1.14.0', jevKeyRef: 'MINECRAFT_KEY',
      intervalMs: 1000, timeoutMs: 10000, threshold: 0.8, notificationIntervalMs: 10000, vision: true,
      lowHealth: 6, skillTimeoutMs: 30000 } }
  let finish!: (value: { ok: true; value: number }) => void
  const save = vi.fn(() => new Promise<{ ok: true; value: number }>((resolve) => { finish = resolve }))
  const stop = vi.fn().mockResolvedValue({ ok: true, value: undefined })
  const props = { ...globalProps, t: (key: keyof typeof en) => en[key], save, stop,
    disconnect: vi.fn(), credential: vi.fn(),
    useResource: () => ({ status: 'live', value: sample, failure: undefined }),
  } as ComponentProps<typeof MinecraftPanel>
  render(<MinecraftPanel {...props} />)
  expect(screen.getByText('minecraft-owned-session')).toBeTruthy()
  expect(screen.getByText(en.minecraftConnectionHint)).toBeTruthy()
  fireEvent.change(screen.getByLabelText(en.modelId), { target: { value: 'different-jev-model' } })
  fireEvent.click(screen.getByRole('button', { name: en.minecraftSave }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ jevModel: 'different-jev-model', reuseKnowledge: true }), 0, expect.any(AbortSignal))
  expect(screen.getByRole('button', { name: en.minecraftStop })).toHaveProperty('disabled', false)
  fireEvent.click(screen.getByRole('button', { name: en.minecraftStop }))
  expect(stop).toHaveBeenCalledTimes(1)
  finish({ ok: true, value: 1 })
  await waitFor(() => { expect(screen.getByRole('button', { name: en.minecraftSave })).toHaveProperty('disabled', false) })
  expect(screen.queryByText(en.minecraftConflict)).toBeNull()
  expect(screen.getByLabelText(en.modelId)).toHaveProperty('value', 'different-jev-model')
})
