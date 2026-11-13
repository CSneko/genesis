// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/react'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../src/client/GenesisPage.tsx'
import { mountNavigation } from '../src/client/navigation.ts'
import { en, zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')
let runtime: SlotTestRuntime | undefined
afterEach(async () => {
  await runtime?.dispose()
  runtime = undefined
})

function Section({ close }: PropsRuntime<'genesis.page'>) {
  return <button onClick={close}>Return to conversation</button>
}

it('groups daily-use sections into four sidebar destinations, retains selections and withdraws registrations', async () => {
  runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  const selectPanel = vi.fn()
  runtime.ctx.provide('layout', { selectPanel } as never)
  await runtime.declare({ main: { kind: 'keyed', scope: 'root' }, 'sidebar.panellist': { kind: 'list', scope: 'root' } })
  const feature = await runtime.mount({
    inject: ['slots', 'locale', 'layout'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register('genesis', { en, zh }))
      mountNavigation(ctx)
      ctx.slots.inject('genesis.page', () => ctx.slots.register({ name: 'genesis.page', key: 'mail' }, Section))
    },
  })
  expect(runtime.slots.entriesOfSlot('sidebar.panellist').map(entry => entry.options.id)).toEqual([
    'genesis',
    'genesis-memories',
    'genesis-actions',
    'genesis-people',
  ])
  const cases = [
    { id: 'genesis', title: zh.homeTitle, sections: [zh.title, zh.emotionTitle, zh.thoughtsTitle] },
    { id: 'genesis-memories', title: zh.memoryPageTitle, sections: [zh.memoryPageTitle, zh.personalityTitle, zh.recordsTitle] },
    { id: 'genesis-actions', title: zh.actionsWorkspaceTitle, sections: [zh.tasksTitle, zh.agencyTitle, zh.outboxTitle] },
    { id: 'genesis-people', title: zh.peopleWorkspaceTitle, sections: [zh.contactsTitle, zh.peopleTitle, zh.mailTitle] },
  ]
  const slot = runtime.renderSlot('main', {}, { entryKey: 'genesis' })
  const page = slot.view
  for (const destination of cases) {
    slot.update({}, { entryKey: destination.id })
    expect(page.getByRole('heading', { name: destination.title })).toBeTruthy()
    const navigation = page.getByRole('navigation', { name: zh.homeSections })
    expect(Array.from(navigation.querySelectorAll('button'), button => button.textContent)).toEqual(destination.sections)
    const last = destination.sections.at(-1)!
    fireEvent.click(page.getByRole('button', { name: last }))
    await waitFor(() => {
      expect(page.getByRole('button', { name: last }).getAttribute('aria-current')).toBe('page')
    })
    if (destination.id === 'genesis-people') {
      fireEvent.click(page.getByRole('button', { name: 'Return to conversation' }))
      expect(selectPanel).toHaveBeenCalledWith(null)
    }
  }
  slot.update({}, { entryKey: 'genesis-actions' })
  expect(page.getByRole('button', { name: zh.outboxTitle }).getAttribute('aria-current')).toBe('page')
  await feature.dispose()
  expect(runtime.slots.entriesOfSlot('main')).toHaveLength(0)
  expect(runtime.slots.entriesOfSlot('sidebar.panellist')).toHaveLength(0)
  expect(runtime.slots.spec('genesis.page')).toBeUndefined()
})
