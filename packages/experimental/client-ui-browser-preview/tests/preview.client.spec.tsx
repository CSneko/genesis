// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { PreviewBody } from '../src/client/PreviewBody.tsx'
import { zh } from '../src/client/locales.ts'
import type { BrowserActionId, BrowserPreviewFrame, BrowserTabId } from '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp/types'

afterEach(cleanup)

it('sends scaled clicks, scrolling, keyboard and IME text to the captured page', async () => {
  const id = 'captured-page' as BrowserTabId
  const input = vi.fn(async () => true)
  const frame: BrowserPreviewFrame = { started: true, actions: [], following: true, omittedTabs: 0, tabs: [],
    image: 'data:image/jpeg;base64,/9j/', imageTabId: id }
  const props = { select: vi.fn(), control: vi.fn(), input, t: (key: keyof typeof zh) => zh[key],
    useResource: () => ({ status: 'live', value: frame, failure: undefined }),
  } as ComponentProps<typeof PreviewBody>
  const view = render(<PreviewBody {...props} />)
  const viewport = screen.getByRole('group', { name: zh.interactivePage })
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 100 } as DOMRect)
  fireEvent.click(viewport, { clientX: 60, clientY: 70 })
  expect(input).toHaveBeenCalledWith(id, { kind: 'click', x: 0.25, y: 0.5 })
  fireEvent.wheel(viewport, { clientX: 60, clientY: 70, deltaY: 120, deltaX: 0 })
  expect(input).toHaveBeenCalledWith(id, { kind: 'scroll', x: 0.25, y: 0.5, deltaX: 0, deltaY: 120 })
  fireEvent.keyDown(viewport, { key: 'a' })
  fireEvent.keyDown(viewport, { key: 'b' })
  expect(input).toHaveBeenCalledWith(id, { kind: 'text', text: 'a' })
  expect(input).toHaveBeenCalledWith(id, { kind: 'text', text: 'b' })
  fireEvent.keyDown(viewport, { key: 'Enter' })
  expect(input).toHaveBeenCalledWith(id, { kind: 'key', key: 'Enter' })
  const beforeTab = input.mock.calls.length
  fireEvent.keyDown(viewport, { key: 'Tab' })
  expect(input).toHaveBeenCalledTimes(beforeTab)
  await waitFor(() => { expect(screen.getByRole('textbox', { name: zh.textInput }).hasAttribute('disabled')).toBe(false) })
  fireEvent.change(screen.getByRole('textbox', { name: zh.textInput }), { target: { value: '你好' } })
  fireEvent.click(screen.getByRole('button', { name: zh.sendText }))
  await waitFor(() => { expect(input).toHaveBeenCalledWith(id, { kind: 'text', text: '你好' }) })
  await waitFor(() => { expect((screen.getByRole('textbox', { name: zh.textInput }) as HTMLInputElement).value).toBe('') })
  input.mockClear()
  frame.error = 'capture-failed'
  view.rerender(<PreviewBody {...props} />)
  fireEvent.click(viewport, { clientX: 60, clientY: 70 })
  fireEvent.keyDown(viewport, { key: 'Enter' })
  expect(input).not.toHaveBeenCalled()
})

it('retains unsent text when browser input fails', async () => {
  const frame: BrowserPreviewFrame = { started: true, actions: [], following: true, omittedTabs: 0, tabs: [],
    image: 'data:image/jpeg;base64,/9j/', imageTabId: 'page' as BrowserTabId }
  const props = { select: vi.fn(), control: vi.fn(), input: vi.fn(async () => false), t: (key: keyof typeof zh) => zh[key],
    useResource: () => ({ status: 'live', value: frame, failure: undefined }),
  } as ComponentProps<typeof PreviewBody>
  render(<PreviewBody {...props} />)
  fireEvent.change(screen.getByRole('textbox', { name: zh.textInput }), { target: { value: '保留草稿' } })
  fireEvent.click(screen.getByRole('button', { name: zh.sendText }))
  await waitFor(() => { expect(screen.getByRole('button', { name: zh.sendText }).hasAttribute('disabled')).toBe(false) })
  expect((screen.getByRole('textbox', { name: zh.textInput }) as HTMLInputElement).value).toBe('保留草稿')
})

it('retains a stale page with a visible failure and localized action status', () => {
  const frame: BrowserPreviewFrame = { started: true, tabs: [], omittedTabs: 0, following: true, url: 'https://example.test/current', title: 'Current page',
    image: 'data:image/jpeg;base64,/9j/', capturedAt: '2026-10-30T00:00:00Z', error: 'capture-failed',
    actions: [{ id: '1' as BrowserActionId, tool: 'browser_click', origin: 'ai', startedAt: '2026-10-30T00:00:00Z', status: 'failed' }] }
  const props = { input: vi.fn(async () => true), select: vi.fn(async () => {}), control: vi.fn(async () => {}), t: (key: keyof typeof zh) => zh[key],
    useResource: () => ({ status: 'live', value: frame, failure: undefined }),
  } as ComponentProps<typeof PreviewBody>
  render(<PreviewBody {...props} />)
  expect(screen.getByRole('img', { name: zh.screenshot }).getAttribute('src')).toBe(frame.image)
  expect(screen.getByText(frame.url!)).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe(zh.stale)
  expect(screen.getByText(zh['action.browser_click'])).toBeTruthy()
  expect(screen.getByText(zh.failed)).toBeTruthy()
})

it('controls the page identity shown in each row and can follow the AI again', async () => {
  const first = 'first-page' as BrowserTabId
  const second = 'second-page' as BrowserTabId
  const frame: BrowserPreviewFrame = { started: true, actions: [], following: true, omittedTabs: 0,
    tabs: [{ id: first, title: 'First', url: 'https://example.test/first', active: true, selected: true },
      { id: second, title: 'Second', url: 'https://example.test/second', active: false, selected: false }] }
  const select = vi.fn(async () => {})
  const control = vi.fn(async () => {})
  const props = { select, control, input: vi.fn(async () => true),
    t: (key: keyof typeof zh, params?: Record<string, string | number>) => {
      let text = zh[key]
      for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value))
      return text
    },
    useResource: () => ({ status: 'live', value: frame, failure: undefined }),
  } as ComponentProps<typeof PreviewBody>
  render(<PreviewBody {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /^Second/u }))
  await waitFor(() => { expect(select).toHaveBeenCalledWith(second) })
  await waitFor(() => { expect(screen.getByRole('button', { name: '刷新 Second' }).hasAttribute('disabled')).toBe(false) })
  fireEvent.click(screen.getByRole('button', { name: '刷新 Second' }))
  await waitFor(() => { expect(control).toHaveBeenCalledWith(second, 'reload') })
  await waitFor(() => { expect(screen.getByRole('button', { name: '关闭 First' }).hasAttribute('disabled')).toBe(false) })
  fireEvent.click(screen.getByRole('button', { name: '关闭 First' }))
  await waitFor(() => { expect(control).toHaveBeenCalledWith(first, 'close') })
  await waitFor(() => { expect(screen.getByRole('button', { name: zh.follow }).hasAttribute('disabled')).toBe(false) })
  fireEvent.click(screen.getByRole('button', { name: zh.follow }))
  await waitFor(() => { expect(select).toHaveBeenCalledWith(null) })
})
