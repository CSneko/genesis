// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type {} from '../src/client/GenesisPage.tsx'
import { mountNavigation } from '../src/client/navigation.ts'
import { en, zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')
let runtime: SlotTestRuntime | undefined
afterEach(async () => { await runtime?.dispose(); runtime = undefined })

it('seats Genesis beside global panels, switches daily-use sections and withdraws both registrations', async () => {
  runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  runtime.ctx.provide('layout', { selectPanel: vi.fn() } as never)
  await runtime.declare({ main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' } })
  const feature = await runtime.mount({ inject: ['slots', 'locale', 'layout'], apply(ctx) {
    ctx.effect(() => ctx.locale.register('genesis', { en, zh }))
    mountNavigation(ctx)
    ctx.slots.inject('genesis.page', () => ctx.slots.register({ name: 'genesis.page', key: 'tasks' }, () => <p>Task content</p>))
  } })
  const page = runtime.renderSlot('main', {}, { entryKey: 'genesis' }).view
  expect(page.getByRole('heading', { name: zh.homeTitle })).toBeTruthy()
  expect(runtime.slots.entriesOfSlot('sidebar.panellist').some(entry => entry.options.id === 'genesis')).toBe(true)
  fireEvent.click(page.getByRole('button', { name: zh.tasksTitle }))
  await waitFor(() => { expect(page.getByText('Task content')).toBeTruthy() })
  expect(page.getByRole('button', { name: zh.tasksTitle }).getAttribute('aria-current')).toBe('page')
  await feature.dispose()
  expect(runtime.slots.entriesOfSlot('main')).toHaveLength(0)
  expect(runtime.slots.entriesOfSlot('sidebar.panellist')).toHaveLength(0)
})
