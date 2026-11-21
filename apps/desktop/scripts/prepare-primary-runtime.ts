/** Desktop resource locations and signing-aware verification for the shared runtime builder. */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import {
  preparePrimaryRuntime as preparePayload,
  primaryRuntimePayloadDigest,
  smokePrimaryRuntime as smokePayload,
} from '../../../scripts/primary-runtime/prepare.ts'
import runtimeLock from '../../../scripts/primary-runtime/lock.json' with { type: 'json' }
import {
  parsePrimaryRuntime, readPrimaryRuntime, resolvePrimaryRuntime, workspaceDependencyPaths,
} from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { inventoryDesktopRuntime } from '../src/runtime-tree.ts'
import { desktopTargetBuildPaths, desktopTargetPlatform, resolveDesktopBuildTarget, resolveDesktopTargetBuildPaths,
  type DesktopBuildTarget } from './desktop-build-paths.mjs'
import { scrubWindowsSigningEnvironment } from './windows-sign.mjs'

/**
 * Prepare Desktop resources for its selected packaging target.
 * @param options - Signed Windows packaging defers execution until its supervised signing stage.
 * @returns Resolves after preparation and, unless deferred, native-target execution checks.
 */
export async function preparePrimaryRuntime(options: { deferSmoke?: boolean } = {}): Promise<void> {
  const paths = resolveDesktopTargetBuildPaths()
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  await preparePayload({ target: resolveDesktopBuildTarget(), output: paths.runtime, cache: paths.downloads, version })
  if (!options.deferSmoke) smokePrimaryRuntime(join(paths.runtime, 'primary-runtime'))
}

/**
 * Use a development payload published after native smoke checks of its exact locked inputs.
 * @param cache - Development-owned cache directory.
 * @param target - Desktop interpreter target.
 * @param version - Desktop release recorded in the payload.
 * @param pnpmVersion - Version of the workspace package manager copied into the payload.
 * @returns Primary runtime directory with the matching Office assets beside it.
 */
export async function prepareDevelopmentPrimaryRuntime(
  cache: string,
  target: DesktopBuildTarget,
  version: string,
  pnpmVersion: string,
): Promise<string> {
  const { platform, arch } = desktopTargetPlatform(target)
  const paths = desktopTargetBuildPaths(target)
  if (platform !== process.platform || arch !== process.arch) {
    await preparePayload({ target, output: paths.runtime, cache: paths.downloads, version })
    return join(paths.runtime, 'primary-runtime')
  }
  const skillSource = fileURLToPath(new URL('../../../packages/skill/skill-office/assets', import.meta.url))
  const assets = JSON.stringify(inventoryDesktopRuntime(skillSource))
  const digest = primaryRuntimePayloadDigest(target, runtimeLock, pnpmVersion)
  const key = createHash('sha256').update(JSON.stringify([version, digest, assets])).digest('hex')
  const destination = join(cache, target, key)
  const root = join(destination, 'primary-runtime')
  const matches = async (directory: string): Promise<boolean> => {
    try {
      const payload = join(directory, 'primary-runtime')
      const manifest = await readPrimaryRuntime(payload)
      if (manifest.desktopVersion !== version || manifest.payloadDigest !== digest) return false
      await resolvePrimaryRuntime(payload)
      return JSON.stringify(inventoryDesktopRuntime(join(directory, 'office-skills'))) === assets
    } catch (error) {
      if (error instanceof Error && (!('code' in error) || error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false
      throw error
    }
  }
  await mkdir(join(cache, target), { recursive: true })
  return withFileLock(destination, async () => {
    if (await matches(destination)) return root
    const staging = await mkdtemp(join(cache, target, '.preparing-'))
    try {
      await preparePayload({ target, output: staging, cache: paths.downloads, version, skillSource })
      smokePrimaryRuntime(join(staging, 'primary-runtime'))
      if (!(await matches(staging))) throw new Error('desktop development: prepared runtime does not match its workspace inputs')
      await rm(destination, { recursive: true, force: true })
      await rename(staging, destination)
      return root
    } finally {
      await rm(staging, { recursive: true, force: true })
    }
  }, { waitMs: 120_000 })
}

/**
 * Verify Desktop's complete payload after preparation or platform signing.
 * @param root - Final payload directory, including any platform signatures.
 */
export function smokePrimaryRuntime(root: string): void {
  const manifest = parsePrimaryRuntime(JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')))
  if (manifest.platform !== process.platform || manifest.arch !== process.arch) return
  if (Object.keys(manifest.pythonPackages).length === 0) throw new Error('primary runtime: missing Python distribution versions; prepare the payload before running its smoke checks.')
  const entries = workspaceDependencyPaths(root, manifest)
  if (entries.node === undefined || entries.pnpm === undefined) throw new Error('primary runtime: the Desktop payload must declare node and pnpm components.')
  smokePayload(root, scrubWindowsSigningEnvironment(process.env))
}

if (import.meta.main) await preparePrimaryRuntime()
