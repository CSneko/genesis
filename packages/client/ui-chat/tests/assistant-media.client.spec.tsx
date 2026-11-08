// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantMarkdown } from '../src/client/chat/AssistantMarkdown.tsx'
import { useDetailedPresentation } from './presentation-fixture.client.ts'
import { unusedImageLoader } from './reasoning-component-fixture.tsx'
import { useDisclosure } from '../src/client/chat/use-disclosure.ts'
import { useSearchableHidden } from '../src/client/chat/searchable-hidden.ts'
import type { ChatViewSlotProps } from '../src/client/contract/slots.ts'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('shows reply media after settlement and retains downloads for unsupported or failed previews', () => {
  vi.spyOn(document, 'baseURI', 'get').mockReturnValue('https://harness.example/tools/dsh/')
  const t = ((key: string) => key) as ChatViewSlotProps['t']
  const content = (streaming: boolean) => <AssistantMarkdown renderSlot={() => null}
    useDisclosure={useDisclosure} useGroupAction={useSearchableHidden} usePresentation={useDetailedPresentation}
    blocks={[{ kind: 'text', text: '![图片](</tmp/图%20片.png>)\n\n![录音](</tmp/hello.mp3>)\n\n![视频](</tmp/demo.mp4>)\n\n![压缩包](</tmp/files.zip>)' }]}
    streaming={streaming} loadImage={unusedImageLoader} t={t} />
  const view = render(content(true))
  expect(view.container.querySelector('audio')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
  view.rerender(content(false))
  const audio = view.container.querySelector('audio')!
  expect(audio.controls).toBe(true)
  expect(audio.preload).toBe('none')
  expect(audio.autoplay).toBe(false)
  expect(new URL(audio.src).pathname).toBe('/tools/dsh/api/file')
  expect(new URL(audio.src).searchParams.get('path')).toBe('/tmp/hello.mp3')
  expect(view.container.querySelector('video')?.controls).toBe(true)
  const image = screen.getByRole('img')
  expect(new URL(image.getAttribute('src')!).searchParams.get('path')).toBe('/tmp/图 片.png')
  expect(screen.getAllByRole('link')).toHaveLength(4)
  expect(screen.getByRole('link', { name: /压缩包/u }).getAttribute('download')).toBe('files.zip')
  fireEvent.error(audio)
  expect(screen.getByRole('status').textContent).toBe('message.mediaFailed')
  expect(screen.getByRole('link', { name: /录音/u }).getAttribute('download')).toBe('hello.mp3')
  fireEvent.error(image)
  expect(screen.getByRole('link', { name: /图片/u })).toBeTruthy()
})
