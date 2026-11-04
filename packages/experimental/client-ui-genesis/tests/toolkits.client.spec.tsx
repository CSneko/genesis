// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolkitStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import { ToolkitsPanel } from '../src/client/ToolkitsPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'

afterEach(cleanup)
const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key]
  .replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? ''))
it('edits toolkit members, retains rejected drafts and fences stale saves until explicit reload', async () => {
  const sample: ToolkitStatus = { revision: 1, entries: [{ id: brandString('computer-operation'), name: '电脑操作',
    description: 'Browser and desktop', tools: ['computer', 'mcp__playwright-mcp__*'] }],
  learned: ['computer'], available: ['computer', 'mcp__playwright-mcp__browser_navigate'] }
  const save = vi.fn().mockResolvedValueOnce({ ok: false, error: new Error('Conflict') }).mockResolvedValue({ ok: true, value: 2 })
  const props = { ...globalProps, t, save, refresh: vi.fn(),
    useResource: () => ({ status: 'live', value: sample, failure: undefined }),
  } as ComponentProps<typeof ToolkitsPanel>
  const view = render(<ToolkitsPanel {...props} />)
  expect(screen.getByText(t('toolkitVisible', { count: 1 }))).toBeTruthy()
  fireEvent.change(screen.getByLabelText(en.toolkitName), { target: { value: '桌面与网页' } })
  fireEvent.change(screen.getByLabelText(en.toolkitMembers), { target: { value: 'computer, mcp__playwright-mcp__*, computer' } })
  fireEvent.click(screen.getByLabelText(en.toolkitQqEnabled))
  fireEvent.click(screen.getByLabelText(en.toolkitQqOperator))
  fireEvent.click(screen.getByRole('button', { name: en.toolkitsSave }))
  await waitFor(() => { expect(save).toHaveBeenCalledTimes(1) })
  expect(save).toHaveBeenCalledWith([expect.objectContaining({ qqAccess: 'anyone' })], 1, expect.any(AbortSignal))
  await waitFor(() => { expect(screen.getByRole('button', { name: en.toolkitsSave })).toHaveProperty('disabled', false) })
  expect(screen.getByLabelText(en.toolkitName)).toHaveProperty('value', '桌面与网页')
  sample.revision = 2
  view.rerender(<ToolkitsPanel {...props} />)
  expect(screen.getByRole('alert').textContent).toBe(en.toolkitsConflict)
  expect(screen.getByRole('button', { name: en.toolkitsSave })).toHaveProperty('disabled', true)
  expect(screen.getByLabelText(en.toolkitName)).toHaveProperty('value', '桌面与网页')
  fireEvent.click(screen.getByRole('button', { name: en.toolkitsReload }))
  expect(screen.getByLabelText(en.toolkitName)).toHaveProperty('value', '电脑操作')
  fireEvent.click(screen.getByRole('button', { name: en.toolkitsAdd }))
  expect(screen.getByText(en.toolkitHidden)).toBeTruthy()
  const names = screen.getAllByLabelText(en.toolkitName)
  fireEvent.change(names[1]!, { target: { value: '写作' } })
  fireEvent.change(screen.getAllByLabelText(en.toolkitMembers)[1]!, { target: { value: 'genesis_write, genesis_write' } })
  fireEvent.click(screen.getAllByRole('button', { name: en.toolkitRemove })[0]!)
  fireEvent.click(screen.getByRole('button', { name: en.toolkitsSave }))
  await waitFor(() => { expect(save).toHaveBeenCalledTimes(2) })
  expect(save).toHaveBeenLastCalledWith([expect.objectContaining({ name: '写作', tools: ['genesis_write'] })], 2, expect.any(AbortSignal))
})
