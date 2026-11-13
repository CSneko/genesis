// @vitest-environment jsdom
/** Installation needs one action when no input is required, and protects key drafts when it is. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { McpProduct } from '@deepseek-ai/dsh-experimental-genesis-mcp/types'
import { McpPanel } from '../src/client/McpPanel.tsx'
import { zh } from '../src/client/mcp-locales.ts'
import { globalProps } from './global-props.client.ts'
import type {} from '../src/client/mcp-mount.tsx'
afterEach(cleanup)
function fixture(secret: boolean) {
  const product: McpProduct = {
    name: 'io.example/fixture',
    title: 'Fixture',
    description: 'Fixture description',
    version: '1.0.0',
    website: '',
    recipes: [
      {
        id: 'remote-0',
        label: 'https://example.com/mcp',
        local: false,
        fingerprint: 'a'.repeat(64),
        inputs: secret
          ? [{ id: 'key', label: 'API_KEY', description: '', secret: true, required: true, defaultValue: '', choices: [] }]
          : [],
      },
    ],
  }
  const install = vi.fn().mockResolvedValue({ ok: true, value: 'fixture' })
  const labels: Record<string, string> = zh
  const props: ComponentProps<typeof McpPanel> = {
    ...globalProps,
    close() {},
    t: key => labels[key] ?? key,
    install,
    addCustom: vi.fn(),
    control: vi.fn(),
    refresh: vi.fn(),
    useResource: ((address: string) => ({
      status: 'live',
      failure: undefined,
      value: address.includes('inventory')
        ? { revision: 7, uncertain: false, servers: [], pollMs: 3000 }
        : { products: [product], cursor: null },
    })) as ComponentProps<typeof McpPanel>['useResource'],
  }
  return { product, install, props }
}
it('installs directly from the product page without a configuration step when no values are required', async () => {
  const { props, install, product } = fixture(false)
  render(<McpPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: zh.details }))
  fireEvent.click(screen.getByRole('button', { name: zh.install }))
  await waitFor(() =>
    expect(install).toHaveBeenCalledWith({
      name: product.name,
      version: product.version,
      recipe: 'remote-0',
      fingerprint: 'a'.repeat(64),
      values: {},
      revision: 7,
    }),
  )
  await waitFor(() => expect(screen.getByText(zh.toolHint)).toBeTruthy())
})
it('requests a required key in a password field and retains the draft after an installation rejection', async () => {
  const { props, install } = fixture(true)
  install.mockResolvedValue({ ok: false, error: { details: { reason: 'stale' } } })
  render(<McpPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: zh.details }))
  expect((screen.getByRole('button', { name: zh.install }) as HTMLButtonElement).disabled).toBe(true)
  const key = screen.getByLabelText(`API_KEY · ${zh.required}`) as HTMLInputElement
  expect(key.type).toBe('password')
  fireEvent.change(key, { target: { value: 'fixture-secret' } })
  fireEvent.click(screen.getByRole('button', { name: zh.install }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(zh.stale))
  expect(key.value).toBe('fixture-secret')
  expect(screen.queryByText('fixture-secret')).toBeNull()
})
