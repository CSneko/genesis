/** Kernel-owned writer lease; process death releases ownership without deleting the file. @module */
import { mkdir, open, stat } from 'node:fs/promises'
import { dirname, isAbsolute, toNamespacedPath } from 'node:path'
import { tryLockExclusive } from '@deepseek-ai/node-addon-system/flock'
import { GenesisError } from './error.ts'

/**
 * Exclude concurrent processes before opening the cached Storage Domain.
 * All writers must use this kernel-lock protocol. Never remove or replace the lock file.
 * @param path - Absolute lease filename shared by users of the same life data.
 * @returns Idempotent release function; a live holder is never displaced, and process death releases the lock.
 * @throws {GenesisError} when the lock is held, unavailable, or its file changes during acquisition.
 */
export async function acquireLease(path: string): Promise<() => Promise<void>> {
  if (!isAbsolute(path)) throw new GenesisError('locked', 'Genesis leasePath must be absolute.')
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    const close = process.platform === 'win32' ? await acquireWindows(path) : await acquirePosix(path)
    let closing: Promise<void> | undefined
    return () => closing ??= close()
  } catch (error) {
    throw new GenesisError('locked', `Genesis cannot acquire its writer lease at ${path}. Stop any other Genesis writer; if none is running, inspect the path permissions and underlying lock error. Do not remove the lock file.`, { cause: error })
  }
}

async function acquirePosix(path: string): Promise<() => Promise<void>> {
  const handle = await open(path, 'a+', 0o600)
  try {
    await tryLockExclusive(handle.fd)
    const held = await handle.stat({ bigint: true })
    const current = await stat(path, { bigint: true })
    if (held.ino !== current.ino || held.dev !== current.dev) {
      throw new Error('Genesis lease file changed during acquisition. Stop all writers and inspect the lease path before restarting.')
    }
    return () => handle.close()
  } catch (error) {
    await handle.close()
    throw error
  }
}

/** Windows denies other opens of the same file until the owning handle closes, including on crash. */
async function acquireWindows(path: string): Promise<() => Promise<void>> {
  const koffi = (await import('koffi')).default
  const kernel32 = koffi.load('kernel32.dll')
  const createFile = kernel32.func('__stdcall', 'CreateFileW', 'intptr', ['str16', 'uint', 'uint', 'void*', 'uint', 'uint', 'intptr']) as
    (path: string, access: number, share: number, security: null, creation: number, flags: number, template: number) => number
  const closeHandle = kernel32.func('__stdcall', 'CloseHandle', 'int', ['intptr']) as (handle: number) => number
  const getLastError = kernel32.func('__stdcall', 'GetLastError', 'uint', []) as () => number
  // OPEN_ALWAYS preserves the stable file; share=0 excludes every other writer handle.
  const handle = createFile(toNamespacedPath(path), 0xc0000000, 0, null, 4, 0x80, 0)
  if (handle === -1) throw new Error(`CreateFileW failed for the Genesis lease (Win32 ${getLastError()}).`)
  return () => Promise.resolve().then(() => {
    if (closeHandle(handle) === 0) throw new GenesisError('locked', `Genesis cannot release its writer lease (Win32 ${getLastError()}). Stop the process before restarting.`)
  })
}
