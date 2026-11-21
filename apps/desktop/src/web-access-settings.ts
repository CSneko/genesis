/** Desktop-owned Web listener preferences and private startup key. */

import { readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { DesktopWebAccessUpdate, DesktopWebAccessState } from '@deepseek-ai/dsh-client-ui-settings-general/types'

interface Preferences extends DesktopWebAccessUpdate {
  readonly key: string
}

const defaults: Preferences = { enabled: false, port: 4004, key: '' }

function readPreferences(value: unknown): Preferences {
  if (typeof value !== 'object' || value === null || !('enabled' in value) || !('port' in value)
    || typeof value.enabled !== 'boolean' || typeof value.port !== 'number'
    || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535
    || ('key' in value && typeof value.key !== 'string')) {
    throw new Error('Desktop Web access requires a valid port and settings')
  }
  const key = 'key' in value && typeof value.key === 'string' ? value.key.trim() : ''
  return { enabled: value.enabled, port: value.port, key }
}

function validKey(key: string): boolean {
  const size = Buffer.byteLength(key)
  return size >= 16 && size <= 1024 && !key.includes('\0')
}

async function available(port: number): Promise<boolean> {
  const probe = createServer()
  return new Promise((resolve) => {
    probe.once('error', () => resolve(false))
    probe.listen({ host: '0.0.0.0', port, exclusive: true }, () => probe.close(error => resolve(error === undefined)))
  })
}

/** Own settings saved by the trusted Desktop renderer and loaded on the next app start. */
export class DesktopWebAccessSettings {
  private readonly preferencesPath: string
  private readonly keyFile: string
  private active: Preferences | undefined
  private portUnavailable = false

  /** @param directory Electron's private user data directory. */
  constructor(directory: string) {
    this.preferencesPath = join(directory, 'web-access.json')
    this.keyFile = join(directory, 'web-access-active.key')
  }

  private async read(): Promise<Preferences> {
    try {
      const saved = readPreferences(JSON.parse(await readFile(this.preferencesPath, 'utf8')))
      if ((saved.enabled || saved.key !== '') && !validKey(saved.key)) throw new Error('Invalid saved Desktop Web access key')
      return saved
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return defaults
      throw error
    }
  }

  /** @returns Host launch values for the configured listener, or undefined for the private listener. */
  async prepare(): Promise<{ port: number; keyFile: string; key: string } | undefined> {
    const saved = await this.read()
    if (saved.enabled && await available(saved.port)) {
      await writeFileAtomic(this.keyFile, saved.key + '\n', { mode: 0o600 })
      this.active = saved
      return { port: saved.port, keyFile: this.keyFile, key: saved.key }
    }
    await rm(this.keyFile, { force: true })
    this.portUnavailable = saved.enabled
    return undefined
  }

  /** @returns The persisted intent and active port, without an access key. */
  async status(): Promise<DesktopWebAccessState> {
    const saved = await this.read()
    return {
      enabled: saved.enabled, port: saved.port, hasKey: saved.key !== '',
      activePort: this.active?.port,
      restartRequired: saved.enabled !== (this.active !== undefined)
        || (this.active !== undefined && (this.active.port !== saved.port || this.active.key !== saved.key)),
      portUnavailable: this.portUnavailable,
    }
  }

  /**
   * Validate and save an update. A blank key retains the stored key.
   * @param input Untrusted IPC payload from the Settings row.
   * @returns The saved state or a classified validation failure.
   */
  async save(input: unknown): Promise<DesktopWebAccessState | 'port' | 'key'> {
    let update: Preferences
    try { update = readPreferences(input) } catch { return 'port' }
    return withFileLock(this.preferencesPath, async () => {
      const saved = await this.read()
      const key = update.key || saved.key
      if ((update.enabled || key !== '') && !validKey(key)) return 'key'
      if (update.enabled && update.port !== this.active?.port && !await available(update.port)) return 'port'
      await writeFileAtomic(this.preferencesPath, JSON.stringify({ ...update, key }) + '\n', { mode: 0o600 })
      this.portUnavailable = false
      return await this.status()
    })
  }
}
