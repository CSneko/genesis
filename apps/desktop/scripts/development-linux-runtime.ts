/** Prepare the Linux development runtime when the installed Chrome sandbox is needed. */

import { createHash } from 'node:crypto'
import { constants, cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const SANDBOX_FILE = 'chrome-sandbox'
const SYSTEM_SANDBOX = '/opt/google/chrome/chrome-sandbox'

function isSetuidSandbox(path: string): boolean {
  const file = statSync(path, { throwIfNoEntry: false })
  return file !== undefined && file.isFile() && file.uid === 0 && (file.mode & 0o4777) === 0o4755
}

/**
 * Reuse the system Chrome sandbox when the Electron helper lacks its required permissions.
 * The staged executable persists across Electron relaunches.
 * @param electron - Installed Electron executable.
 * @param directory - Desktop development cache.
 * @returns The executable to launch.
 */
export function prepareDevelopmentLinuxRuntime(electron: string, directory: string): string {
  const source = dirname(electron)
  const bundledSandbox = join(source, SANDBOX_FILE)
  if (isSetuidSandbox(bundledSandbox) || !isSetuidSandbox(SYSTEM_SANDBOX)) return electron

  const { size, mtimeNs } = statSync(electron, { bigint: true })
  const identity = createHash('sha256').update(`${electron}\n${size}\n${mtimeNs}`).digest('hex').slice(0, 16)
  const target = join(directory, `electron-${identity}`)
  const executable = join(target, basename(electron))
  if (existsSync(executable)) return executable

  mkdirSync(directory, { recursive: true })
  const staging = mkdtempSync(join(directory, '.electron-'))
  try {
    cpSync(source, staging, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      filter: path => path !== bundledSandbox,
    })
    symlinkSync(SYSTEM_SANDBOX, join(staging, SANDBOX_FILE))
    try {
      renameSync(staging, target)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if ((code !== 'EEXIST' && code !== 'ENOTEMPTY') || !existsSync(executable)) throw error
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
  return executable
}
