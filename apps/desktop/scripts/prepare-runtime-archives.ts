/** Materialize pinned external Desktop dependencies as direct local overrides. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

const archiveNames = ['dsh-bili-humanism', 'dsh-see-now', 'dsh-qq-onebot-bridge', 'xlsx'] as const

/**
 * Validate all required archive pins before downloading, then copy only SHA-512-verified bytes.
 * @param project Disposable Desktop install project.
 * @param lockfile Workspace dependency lock.
 * @returns Local overrides that keep pnpm's exotic-subdependency policy enabled.
 */
export async function prepareRuntimeArchives(project: string, lockfile: string): Promise<Record<string, string>> {
  const lock = yaml.load(await readFile(lockfile, 'utf8')) as { packages: Record<string, { resolution: { tarball?: string; integrity?: string } }> }
  const archives = archiveNames.map((name) => {
    const matches = Object.entries(lock.packages).filter(([specifier]) => specifier.startsWith(`${name}@https://`))
    const resolution = matches[0]?.[1].resolution
    if (matches.length !== 1 || resolution?.tarball === undefined || !resolution.integrity?.startsWith('sha512-')) {
      throw new Error(`desktop runtime: expected one integrity-pinned archive for ${name} in ${lockfile}`)
    }
    return { name, tarball: resolution.tarball, integrity: resolution.integrity }
  })
  const directory = 'genesis-archives'
  await mkdir(join(project, directory))
  const overrides: Record<string, string> = {}
  for (const { name, tarball, integrity } of archives) {
    const response = await fetch(tarball, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`desktop runtime: download failed for ${name} (HTTP ${String(response.status)})`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) {
      throw new Error(`desktop runtime: archive integrity mismatch for ${name}`)
    }
    const filename = `${directory}/${name}.tgz`
    await writeFile(join(project, filename), bytes, { flag: 'wx' })
    overrides[name] = `file:./${filename}`
  }
  return overrides
}
