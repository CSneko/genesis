// @vitest-environment jsdom
/** Isolated composition playback, Blob ownership and reversible document registration. @module */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DocumentPreviewDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/client'
import { RemotionPreview, type RemotionPreviewProps } from '../src/client/video/RemotionPreview.tsx'
import { remotionDocument } from '../src/client/video/document.ts'
import { mountRemotionPreview } from '../src/client/video/index.ts'
import { en } from '../src/client/video/locales.ts'

let createDescriptor: PropertyDescriptor | undefined
let revokeDescriptor: PropertyDescriptor | undefined
const create = vi.fn<(blob: Blob) => string>()
const revoke = vi.fn<(url: string) => void>()
beforeEach(() => {
  createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
  revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
  create.mockReset().mockImplementation(() => `blob:https://preview.invalid/${create.mock.calls.length}`)
  revoke.mockReset()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
})
afterEach(() => {
  try { cleanup() } finally {
    if (createDescriptor === undefined) Reflect.deleteProperty(URL, 'createObjectURL')
    else Object.defineProperty(URL, 'createObjectURL', createDescriptor)
    if (revokeDescriptor === undefined) Reflect.deleteProperty(URL, 'revokeObjectURL')
    else Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor)
    vi.restoreAllMocks()
  }
})
function props(data = new TextEncoder().encode('<div>Scene</div>'), visible = true): RemotionPreviewProps {
  // Only byte content, visibility and translation are consumed by this leaf.
  return { content: { kind: 'bytes', data }, useTabInfo: () => ({ tab: { visible } }), t: (key: keyof typeof en) => en[key] } as RemotionPreviewProps
}

it('isolates authored markup behind two opaque frames and restricts HTTP navigation and data access', () => {
  const document = remotionDocument(new TextEncoder().encode('<base href="https://other.invalid"><meta http-equiv="refresh" content="0;url=https://other.invalid"><script>window.parent.privateData</script>'))
  const outer = new DOMParser().parseFromString(document, 'text/html')
  expect(outer.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts')
  expect(outer.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain('frame-src blob:')
  const encoded = /atob\('([^']+)'\)/u.exec(document)?.[1]
  expect(encoded).toBeDefined()
  const inner = new DOMParser().parseFromString(new TextDecoder().decode(Uint8Array.from(atob(encoded!), char => char.charCodeAt(0))), 'text/html')
  expect(inner.querySelector('base')).toBeNull()
  expect(inner.querySelector('meta[http-equiv="refresh"]')).toBeNull()
  expect(inner.head.firstElementChild?.getAttribute('content')).toContain('connect-src data: blob:')
  expect(inner.head.firstElementChild?.getAttribute('content')).toContain("frame-src 'none'")
  expect(inner.querySelector('script')?.textContent).toContain('window.parent.privateData')
  expect(outer.querySelector('script')?.textContent).not.toContain('window.parent.privateData')
})

it('shows the Player with browser access, pauses a hidden tab and releases replaced source URLs', async () => {
  const initial = props()
  const view = render(<RemotionPreview {...initial} />)
  const frame = await screen.findByTitle(en.frame) as HTMLIFrameElement
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
  expect(frame.getAttribute('src')).toBe('blob:https://preview.invalid/1')
  expect(frame.getAttribute('allow')).toBe('fullscreen')
  expect(screen.getByRole('link', { name: en.openBrowser }).getAttribute('rel')).toBe('noopener noreferrer')
  expect(screen.getByRole('link', { name: en.download }).getAttribute('download')).toBe('preview.genesis-remotion.html')
  const send = vi.spyOn(frame.contentWindow!, 'postMessage')
  view.rerender(<RemotionPreview {...props(initial.content.kind === 'bytes' ? initial.content.data : undefined, false)} />)
  expect(send).toHaveBeenCalledWith({ type: 'genesis-remotion:pause' }, '*')
  view.rerender(<RemotionPreview {...props(new TextEncoder().encode('<div>New revision</div>'))} />)
  expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/1')
  view.unmount()
  expect(revoke).toHaveBeenCalledWith('blob:https://preview.invalid/2')
})

it('keeps a visible error when preview document creation fails', async () => {
  create.mockImplementationOnce(() => { throw new Error('Blob unavailable') })
  render(<RemotionPreview {...props()} />)
  expect((await screen.findByRole('alert')).textContent).toBe(en.failed)
})

it('withdraws its renderer, body and dictionaries when the owning plugin unloads', async () => {
  const ctx = new Context()
  const renderers = new Map<string, DocumentPreviewDefinition>()
  const bodies = new Set<string>()
  const dictionaries = new Set<string>()
  ctx.provide('documentPreviews', { register: (definition: DocumentPreviewDefinition) => {
    renderers.set(definition.id, definition); return () => { renderers.delete(definition.id) }
  } } as never)
  ctx.provide('slots', { inject: (_name: string, register: () => () => void) => register(),
    register: (options: { key: string }) => { bodies.add(options.key); return () => { bodies.delete(options.key) } },
  } as never)
  ctx.provide('locale', { bind: () => (key: keyof typeof en) => en[key],
    register: (namespace: string) => { dictionaries.add(namespace); return () => { dictionaries.delete(namespace) } },
  } as never)
  try {
    const fiber = ctx.plugin({ apply: mountRemotionPreview })
    await fiber.await()
    expect([...renderers.values()][0]).toMatchObject({ extensions: ['genesis-remotion.html'], priority: 'extension', loading: 'bytes-complete' })
    expect(bodies.size).toBe(1)
    await fiber.dispose()
    expect(renderers.size).toBe(0); expect(bodies.size).toBe(0); expect(dictionaries.size).toBe(0)
  } finally { await ctx.fiber.dispose() }
})
