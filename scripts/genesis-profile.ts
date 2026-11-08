/** Source-workspace mail, browser and speech composition below editable profile settings. @module */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadProfile, readProfileManifest, resolveProfileDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

/**
 * Select the installed mail, browser and speech bundles before profile configuration is composed.
 * @param home - Explicit Genesis home; ordinary Harness homes are not modified.
 * @param installAnchor - Source installation manifest used to resolve workspace bundles.
 * @returns After the profile manifest includes the workspace bundles; existing patches and dependencies are preserved.
 */
export async function ensureGenesisProfileBundles(home: string, installAnchor: string): Promise<void> {
  const dir = resolveProfileDir('web', home)
  await mkdir(dir, { recursive: true })
  await withFileLock(join(dir, 'package.json'), async () => {
    loadProfile('dsh', 'web', installAnchor, home)
    const manifest = readProfileManifest('dsh', dir)
    const bundles = manifest.dsh?.profile?.bundles ?? []
    const required = ['@deepseek-ai/dsh-experimental-genesis-mail', '@deepseek-ai/dsh-experimental-genesis-speech', '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp']
    const missing = required.filter(bundle => !bundles.includes(bundle))
    if (missing.length === 0) return
    writeProfileManifest(dir, { ...manifest, dsh: { ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles: [...bundles, ...missing] },
    } })
  })
}
