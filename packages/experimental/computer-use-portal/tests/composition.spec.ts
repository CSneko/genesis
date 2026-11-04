/** Real Loader and Session image admission with only the external Python worker replaced. */
import { fileURLToPath } from 'node:url'
import { afterEach, it, vi } from 'vitest'
import { check } from './composition.ts'

afterEach(() => { vi.unstubAllEnvs() })
it.skipIf(process.platform !== 'linux')('logs the screenshot before the next model request and removes tools on unload', async ({ signal }) => {
  vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
  await check(true, signal, fileURLToPath(new URL('./fixtures/python.mjs', import.meta.url)))
})

for (const consent of ['allow', 'deny', 'missing', 'automatic'] as const) {
  it.skipIf(process.platform !== 'linux')(`enforces ${consent} application consent through the logged semantic tool`, async ({ signal }) => {
    vi.stubEnv('XDG_SESSION_TYPE', 'wayland')
    await check(false, signal, fileURLToPath(new URL('./fixtures/python.mjs', import.meta.url)), consent)
  })
}
