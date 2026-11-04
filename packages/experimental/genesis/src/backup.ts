/** Independent record backup with an atomically replaced commit manifest. @module */
import { randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, stat, readFile, readdir } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { stateSchema, type LifeState } from './model.ts'
import { manifestSchema, recordTableSchema, type LifeManifest, type LifeRecordReference, type LifeRecord } from './storage-layout.ts'
import { joinState } from './storage-state.ts'
import { GenesisError } from './error.ts'

/**
 * Resolve one backup location before opening life storage.
 * @param leasePath - Configured writer lease.
 * @param configured - Explicit backup override.
 * @returns Absolute backup filename; rejects relative paths or lease collisions.
 */
export function backupPath(leasePath: string, configured?: string): string {
  const path = configured ?? `${leasePath}.backup.json`
  if (!isAbsolute(path) || path === leasePath) {
    throw new GenesisError('invalid-state', 'Genesis backupPath must be absolute and different from leasePath.')
  }
  return path
}

/**
 * Refuse accidental rebirth when only the primary storage has disappeared.
 * @param path - Resolved backup file.
 * @returns Whether any backup exists; other filesystem errors propagate.
 */
export async function hasBackup(path: string): Promise<boolean> {
  try { await stat(path) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      try { await stat(`${path}.d`) } catch (directoryError) {
        if (directoryError instanceof Error && 'code' in directoryError && directoryError.code === 'ENOENT') return false
        throw directoryError
      }
      return true
    }
    throw error
  }
  return true
}

/**
 * Publish independent components before replacing the backup manifest; then remove unreachable records.
 * @param path - Resolved destination, independent of the primary storage backend.
 * @param snapshot - Encoded committed life, including text, evidence and vector cache.
 * @param previous - Complete record references verified by this writer; omission verifies existing component files before reuse.
 * @returns After component fsync, manifest replacement and unreachable-record cleanup; failures may follow a committed manifest.
 */
export async function writeBackup(path: string, snapshot: { manifest: LifeManifest; records: LifeRecord[] },
  previous?: readonly LifeRecordReference[]): Promise<void> {
  const { manifest, records } = snapshot
  const root = `${path}.d`
  const verified = new Set(previous?.map(record => `${record.table}/${record.key}.json`))
  for (const { table, key, value } of records) {
    if (verified.has(`${table}/${key}.json`)) continue
    const destination = join(root, table, `${key}.json`)
    const text = JSON.stringify(value) + '\n'
    let existing: string | undefined
    try { existing = await readFile(destination, 'utf8') } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
    }
    if (existing === undefined) await writeAtomicText(destination, text)
    else if (existing !== text) throw new GenesisError('storage', 'Genesis backup contains a damaged life record. Restore a verified backup before retrying.')
  }
  await writeAtomicText(path, JSON.stringify(manifest) + '\n')
  const retained = new Set(records.map(record => `${record.table}/${record.key}.json`))
  if (previous !== undefined) {
    for (const { table, key } of previous) {
      if (!retained.has(`${table}/${key}.json`)) await rm(join(root, table, `${key}.json`))
    }
    return
  }
  for (const table of recordTableSchema.options) {
    let entries: string[]
    try { entries = await readdir(join(root, table)) } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
      throw error
    }
    for (const entry of entries) {
      if (/^[a-f0-9]{64}\.json$/.test(entry) && !retained.has(`${table}/${entry}`)) await rm(join(root, table, entry))
    }
  }
}

/**
 * Read either a legacy complete backup or the independently stored record tree.
 * @param path - Backup manifest filename; its components live in the sibling `.d` directory.
 * @returns Complete validated life; missing or corrupt records reject without modifying storage.
 */
export async function readBackup(path: string): Promise<LifeState> {
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  const manifest = manifestSchema.safeParse(value)
  return manifest.success
    ? joinState(manifest.data, async (table, key) => JSON.parse(await readFile(join(`${path}.d`, table, `${key}.json`), 'utf8')))
    : stateSchema.parse(value)
}

async function writeAtomicText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(text, 'utf8')
      await file.sync()
    } finally { await file.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
