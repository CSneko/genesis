// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import { GenesisPlugins } from '../src/client/plugins-mount.tsx'
import { globalProps } from './global-props.client.ts'
afterEach(cleanup)

it('configures enabled capabilities, retains off switches on failures and reports saved restart requirements', async () => {
  const bundles: BundleInfo[] = ['weather', 'im'].map(id => ({
    name: id === 'weather' ? '@deepseek-ai/dsh-genesis-weather' : '@deepseek-ai/dsh-experimental-genesis-qq',
    availability: 'installation',
    enabled: id === 'weather',
    installed: false,
    official: false,
    optional: false,
    removable: false,
    updatable: false,
    rows: [],
    overrides: [],
  }))
  const setEnabled = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, value: { application: 'restart-required' } })
    .mockRejectedValueOnce(new Error('Offline'))
  const renderSlot = vi.fn(() => null)
  const props: ComponentProps<typeof GenesisPlugins> = {
    ...globalProps,
    t: key => key,
    install: vi.fn(),
    openPackage: vi.fn(),
    renderSlot,
    refresh: vi.fn(),
    setEnabled,
    setShockEnabled: vi.fn(async () => true),
    useShockConfig: selector => selector({ status: 'ready', value: { enabled: false }, base: {}, user: {}, revision: 1, writable: true }),
    setPunishmentEnabled: vi.fn(async () => true),
    usePunishmentConfig: selector => selector({ status: 'ready', value: { enabled: false }, base: {}, user: {}, revision: 1, writable: true }),
    useSettings: selector => selector('genesis-weather\0genesis-punishment'),
    useResource: (() => ({ status: 'live', value: bundles, failure: undefined })) as ComponentProps<typeof GenesisPlugins>['useResource'],
  }
  render(<GenesisPlugins {...props} />)
  expect(screen.getByRole('switch', { name: 'weather' }).getAttribute('aria-checked')).toBe('true')
  fireEvent.click(screen.getByRole('switch', { name: 'shock' }))
  await waitFor(() => expect(props.setShockEnabled).toHaveBeenCalledWith(true))
  await waitFor(() => expect((screen.getByRole('switch', { name: 'shock' }) as HTMLButtonElement).disabled).toBe(false))
  const punishment = screen.getByRole('switch', { name: 'punishment' })
  expect(punishment.getAttribute('aria-checked')).toBe('false')
  const punishmentCard = punishment.closest('li')!
  fireEvent.click(within(punishmentCard).getByRole('button', { name: 'configure' }))
  expect(renderSlot).toHaveBeenCalledWith('genesis.plugin.settings', {}, { entryKey: 'genesis-punishment' })
  fireEvent.click(screen.getByRole('button', { name: 'back' }))
  fireEvent.click(screen.getByRole('switch', { name: 'punishment' }))
  await waitFor(() => expect(props.setPunishmentEnabled).toHaveBeenCalledWith(true))
  const im = screen.getByRole('switch', { name: 'im' })
  expect(im.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(im)
  await screen.findByText('restart')
  expect(setEnabled).toHaveBeenCalledWith(bundles[1]!.name, true)
  fireEvent.click(im)
  await screen.findByRole('alert')
  expect(im.getAttribute('aria-checked')).toBe('false')
  const weatherCard = screen.getByRole('switch', { name: 'weather' }).closest('li')!
  fireEvent.click(within(weatherCard).getByRole('button', { name: 'configure' }))
  await waitFor(() => expect(renderSlot).toHaveBeenCalledWith('genesis.plugin.settings', {}, { entryKey: 'genesis-weather' }))
  fireEvent.click(screen.getByRole('button', { name: 'back' }))
  const imCard = screen.getByRole('switch', { name: 'im' }).closest('li')!
  fireEvent.click(within(imCard).getByRole('button', { name: 'configure' }))
  expect(screen.getByText('enableFirst')).toBeTruthy()
})
