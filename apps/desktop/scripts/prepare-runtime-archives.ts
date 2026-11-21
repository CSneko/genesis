/** Materialize pinned Genesis plugin archives as direct local overrides. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import yaml from 'js-yaml'

const plugins = ['dsh-bili-humanism', 'dsh-see-now', 'dsh-qq-onebot-bridge', 'prismarine-viewer', 'xlsx'] as const

/**
 * Copy the registry-external plugins with the integrity pinned in the workspace lock.
 * @param project Disposable Desktop install project.
 * @param lockfile Workspace dependency lock.
 * @returns Local overrides that keep pnpm's exotic-subdependency policy enabled.
 */
export async function prepareRuntimeArchives(project: string, lockfile: string): Promise<Record<string, string>> {
  const lock = yaml.load(await readFile(lockfile, 'utf8')) as { packages: Record<string, { resolution: { tarball?: string; integrity?: string } }> }
  const directory = 'genesis-archives'
  await mkdir(join(project, directory))
  const overrides: Record<string, string> = {}
  for (const name of plugins) {
    const matches = Object.entries(lock.packages).filter(([specifier]) => specifier.startsWith(`${name}@https://`))
    const resolution = matches[0]?.[1].resolution
    if (matches.length !== 1 || resolution?.tarball === undefined || !resolution.integrity?.startsWith('sha512-')) {
      throw new Error(`desktop runtime: expected one integrity-pinned archive for ${name}`)
    }
    const response = await fetch(resolution.tarball, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`desktop runtime: download failed for ${name} (HTTP ${String(response.status)})`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== resolution.integrity) {
      throw new Error(`desktop runtime: archive integrity mismatch for ${name}`)
    }
    const filename = `${directory}/${name}.tgz`
    await writeFile(join(project, filename), bytes, { flag: 'wx' })
    overrides[name] = `file:./${filename}`
  }
  return overrides
}
