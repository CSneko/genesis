// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ManagedTaskCatalog } from '@deepseek-ai/dsh-experimental-genesis/types'
import { TasksPanel } from '../src/client/TasksPanel.tsx'
import { en } from '../src/client/locales.ts'
import { globalProps } from './global-props.client.ts'

afterEach(cleanup)

it('separates persisted delivery from running background work, opens the original Session and retains failed samples', () => {
  const task: ManagedTaskCatalog['items'][number] = {
    id: brandString('task-one'), workspaceId: brandString('workspace-one'), workspaceTitle: 'My project', mode: 'standard',
    delivery: 'delivered', state: 'completed', executionState: 'background', turn: 2, attempts: 2, activeWork: 1,
    readable: true, confirmed: true,
  }
  const catalog: ManagedTaskCatalog = { sampledAt: '2026-11-03T10:00:00.000Z', items: [task], nextOffset: 1 }
  const openSession = vi.fn()
  const refresh = vi.fn()
  const dictionary: Readonly<Record<string, string>> = en
  let failed = false
  const props: ComponentProps<typeof TasksPanel> = { ...globalProps, close: vi.fn(), openSession, refresh, t: key => dictionary[key] ?? key,
    useResource: ((address: string) => ({ status: failed ? 'failed' : 'live',
      value: address.endsWith('offset=0') ? catalog : { ...catalog, items: [], nextOffset: null },
      failure: failed ? { code: 'FAILED', message: 'Unavailable' } : undefined })) as ComponentProps<typeof TasksPanel>['useResource'] }
  const page = render(<TasksPanel {...props} />)
  expect(screen.getByText(en['taskState.background'])).toBeTruthy()
  expect(screen.getByText(en['taskDelivery.delivered'])).toBeTruthy()
  expect(screen.queryByText(en['taskState.completed'])).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.taskOpen }))
  expect(openSession).toHaveBeenCalledWith(task.id)
  fireEvent.click(screen.getByRole('button', { name: en.taskNext }))
  expect(screen.getByText(en.tasksEmpty)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.taskPrevious }))
  failed = true
  page.rerender(<TasksPanel {...props} />)
  expect(screen.getByText('My project')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe(en.failed)
  fireEvent.click(screen.getByRole('button', { name: en.refresh }))
  expect(refresh).toHaveBeenCalledOnce()
})
