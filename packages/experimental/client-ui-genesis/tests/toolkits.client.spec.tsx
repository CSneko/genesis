// @vitest-environment jsdom
/** Single-entry saves retain unrelated rules and failed drafts. @module */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ToolkitStatus, ToolkitId } from '@deepseek-ai/dsh-experimental-genesis/types'
import { ToolkitsPanel } from '../src/client/ToolkitsPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'
afterEach(cleanup)
const t = (key: keyof typeof en, params?: Record<string, unknown>) =>
  en[key].replace(/\{(\w+)\}/gu, (_match: string, name: string) => String(params?.[name] ?? ''))
function fixture() {
  const sample: ToolkitStatus = {
    qqPermissions: {
      revision: 0,
      rules: [
        { scope: 'person', target: '12345', tool: 'computer', effect: 'deny' },
        { scope: 'group', target: '67890', tool: 'mcp__fixture__*', effect: 'allow' },
      ],
    },
    revision: 1,
    entries: [
      { id: brandString<ToolkitId>('desktop'), name: 'Desktop', description: 'Browser and desktop', tools: ['computer'] },
      { id: brandString<ToolkitId>('writing'), name: 'Writing', description: '', tools: ['genesis_write'] },
    ],
    learned: ['computer'],
    available: ['computer'],
    managed: [{ id: brandString<ToolkitId>('mcp-fixture'), name: 'MCP · fixture', description: '', tools: ['mcp__fixture__*'] }],
  }
  const save = vi.fn().mockResolvedValue({ ok: true, value: 2 })
  const savePermissions = vi.fn().mockResolvedValue({ ok: true, value: 1 })
  const props = {
    ...globalProps,
    t,
    save,
    savePermissions,
    refresh: vi.fn(),
    useResource: () => ({ status: 'live', value: sample, failure: undefined }),
  } as ComponentProps<typeof ToolkitsPanel>
  return { sample, props, save, savePermissions }
}
it('lists separated summaries without input fields and saves only the chosen toolkit change', async () => {
  const { sample, props, save } = fixture()
  render(<ToolkitsPanel {...props} />)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByText(en.toolkitsManaged)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Edit MCP · fixture' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Edit Desktop' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByLabelText(en.toolkitName), { target: { value: 'Desktop tools' } })
  fireEvent.change(dialog.getByLabelText(en.toolkitMembers), { target: { value: 'computer, computer' } })
  fireEvent.click(dialog.getByRole('button', { name: en.toolkitsSave }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(save).toHaveBeenCalledWith([{ ...sample.entries[0], name: 'Desktop tools' }, sample.entries[1]], 1, expect.any(AbortSignal))
})
it('retains a rejected toolkit draft and requires explicit reload after a concurrent edit', async () => {
  const { sample, props, save } = fixture()
  save.mockResolvedValue({ ok: false, error: new Error('Conflict') })
  const view = render(<ToolkitsPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Desktop' }))
  fireEvent.change(screen.getByLabelText(en.toolkitName), { target: { value: 'Unsent draft' } })
  fireEvent.click(screen.getByRole('button', { name: en.toolkitsSave }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText(en.toolkitName)).toHaveProperty('value', 'Unsent draft')
  sample.revision = 2
  view.rerender(<ToolkitsPanel {...props} />)
  expect(screen.getByRole('button', { name: en.toolkitsSave })).toHaveProperty('disabled', true)
  fireEvent.click(screen.getByRole('button', { name: en.toolkitsReload }))
  expect(screen.getByLabelText(en.toolkitName)).toHaveProperty('value', 'Desktop')
})
it('edits one QQ rule without changing the other rule and fences concurrent permission edits', async () => {
  const { sample, props, savePermissions } = fixture()
  savePermissions.mockResolvedValueOnce({ ok: false, error: new Error('Conflict') })
  const view = render(<ToolkitsPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit 12345: computer' }))
  fireEvent.click(screen.getByLabelText(en.qqPermissionAllow))
  fireEvent.click(screen.getByRole('button', { name: en.qqPermissionsSave }))
  await screen.findByRole('alert')
  expect(savePermissions).toHaveBeenCalledWith(
    [{ ...sample.qqPermissions.rules[0], effect: 'allow' }, sample.qqPermissions.rules[1]],
    0,
    expect.any(AbortSignal),
  )
  sample.qqPermissions.revision = 2
  view.rerender(<ToolkitsPanel {...props} />)
  expect(screen.getByRole('button', { name: en.qqPermissionsSave })).toHaveProperty('disabled', true)
  expect(screen.getByLabelText(en.qqPermissionPerson)).toHaveProperty('value', '12345')
  fireEvent.click(screen.getByRole('button', { name: en.qqPermissionsReload }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
})
