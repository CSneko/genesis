// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import { GenesisPlugins } from '../src/client/plugins-mount.tsx'
import { globalProps } from './global-props.client.ts'
afterEach(cleanup)

it('configures enabled capabilities, retains off switches on failures and reports saved restart requirements', async () => {
  const bundles: BundleInfo[] = ['weather', 'qq'].map(id => ({
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
    useSettings: selector => selector('genesis-weather'),
    useResource: (() => ({ status: 'live', value: bundles, failure: undefined })) as ComponentProps<typeof GenesisPlugins>['useResource'],
  }
  render(<GenesisPlugins {...props} />)
  expect(screen.getByRole('switch', { name: 'weather' }).getAttribute('aria-checked')).toBe('true')
  const qq = screen.getByRole('switch', { name: 'qq' })
  expect(qq.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(qq)
  await screen.findByText('restart')
  expect(setEnabled).toHaveBeenCalledWith(bundles[1]!.name, true)
  fireEvent.click(qq)
  await screen.findByRole('alert')
  expect(qq.getAttribute('aria-checked')).toBe('false')
  const weatherCard = screen.getByRole('switch', { name: 'weather' }).closest('li')!
  fireEvent.click(within(weatherCard).getByRole('button', { name: 'configure' }))
  await waitFor(() => expect(renderSlot).toHaveBeenCalledWith('genesis.plugin.settings', {}, { entryKey: 'genesis-weather' }))
  fireEvent.click(screen.getByRole('button', { name: 'back' }))
  const qqCard = screen.getByRole('switch', { name: 'qq' }).closest('li')!
  fireEvent.click(within(qqCard).getByRole('button', { name: 'configure' }))
  expect(screen.getByText('enableFirst')).toBeTruthy()
})
