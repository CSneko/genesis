// @vitest-environment jsdom
/** A denied file read remains visible and can be retried from its attachment card. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { ResourceProtocolMap, ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import { ReferencedFile } from '../src/client/ReferencedFiles.tsx'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const sessionId = SessionId('attachment-test')
const file = { absolutePath: '/workspace/report.pdf', version: 'v1', bytes: 12 }
const live = { status: 'live', value: file, failure: undefined } as const
const resourceHook = () => vi.fn<(address: string) => ResourceSnapshot<ResourceProtocolMap['file']>>().mockReturnValue(live)

it('hides unverified files and removes a stale card when its file disappears', () => {
  const useResource = resourceHook()
  const props = {
    path: 'report.pdf', sessionId, useResource: useResource as GlobalStandardProps['useResource'],
    download: vi.fn(), preview: vi.fn(), t: makeTranslate(en),
  }
  const view = render(<ReferencedFile {...props} />)
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
  expect(useResource).toHaveBeenCalledWith(sessionFileAddress(sessionId, 'report.pdf'))
  for (const snapshot of [
    { status: 'loading', value: undefined, failure: undefined } as const,
    { status: 'none', value: undefined, failure: undefined } as const,
    ...[
      new RemoteError('workspace-file/not-found', 'File unavailable', { path: file.absolutePath }),
      new RemoteError('workspace-file/not-regular-file', 'File unavailable', { path: file.absolutePath, kind: 'directory' }),
      new RemoteError('workspace-file/outside-workspace', 'File unavailable', { path: file.absolutePath }),
    ].map(failure => ({
      status: 'failed', value: file, failure,
    } as const)),
  ]) {
    useResource.mockReturnValue(snapshot)
    view.rerender(<ReferencedFile {...props} />)
    expect(view.container.querySelector('[data-referenced-file]')).toBeNull()
  }
  useResource.mockReturnValue(live)
  view.rerender(<ReferencedFile {...props} />)
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
  expect(props.download).not.toHaveBeenCalled()
})

it('shows download failure without losing preview or retry access', async () => {
  const download = vi.fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('FS_SANDBOX_DENIED'))
    .mockResolvedValueOnce(undefined)
  const preview = vi.fn()
  const useResource = resourceHook() as GlobalStandardProps['useResource']
  render(<ReferencedFile sessionId={sessionId} useResource={useResource} path={file.absolutePath}
    download={download} preview={preview} t={makeTranslate(en)} />)
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(screen.getByRole('button', { name: 'Downloading…' })).toHaveProperty('disabled', true)
  await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('Download failed') })
  fireEvent.click(screen.getByRole('button', { name: 'Preview /workspace/report.pdf in sidebar' }))
  expect(preview).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('Download requested') })
  expect(download).toHaveBeenCalledTimes(2)
})
