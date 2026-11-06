// @vitest-environment jsdom
/** Speech controls use the authenticated file endpoint and preserve download access on playback failure. @module */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SpeechPlayer } from '../src/client/speech-player.tsx'

afterEach(cleanup)
it('plays a logged speech result through the file API and keeps download available on errors', () => {
  const attachment = { attachmentId: 'speech-fixture', name: 'speech.wav', bytes: 48 }
  const path = '/private/attachments/speech.wav'
  const props = { phase: 'result', block: { args: { text: () => '你好' }, isError: false, content: [
    { type: 'text', text: JSON.stringify({ attachment, path, format: 'wav', rate: 0.85, instruction: '温柔开心' }) },
    { type: 'file', attachment },
  ] }, t: (key: string) => key } as Parameters<typeof SpeechPlayer>[0]
  const view = render(<SpeechPlayer {...props} />)
  const audio = screen.getByLabelText('title', { selector: 'audio' }) as HTMLAudioElement
  expect(audio.hasAttribute('controls')).toBe(true)
  expect(audio.preload).toBe('none')
  const source = new URL(audio.src)
  expect(source.origin).toBe(window.location.origin)
  expect(source.pathname).toBe('/api/file')
  expect(source.searchParams.get('path')).toBe(path)
  const download = screen.getByRole('link', { name: 'download' })
  expect(download.getAttribute('download')).toBe('speech.wav')
  fireEvent.error(audio)
  expect(screen.getByRole('alert').textContent).toBe('playbackFailed')
  expect(screen.getByRole('link', { name: 'download' })).toBe(download)
  view.rerender(<SpeechPlayer {...props} phase="result" block={{ ...props.block, content: [
    { type: 'text', text: JSON.stringify({ attachment, path: 'https://other.invalid/voice.wav' }) },
    { type: 'file', attachment },
  ] } as Extract<typeof props, { phase: 'result' }>['block']} />)
  expect(view.container.querySelector('audio')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('unavailable')
})
