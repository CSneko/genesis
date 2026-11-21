/** Source-workspace optional bundles with restart-durable operator selections. @module */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadProfile, readProfileManifest, resolveProfileDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

/**
 * Initialize each optional bundle default once before profile configuration is composed.
 * @param home - Explicit Genesis home; ordinary Harness homes are not modified.
 * @param installAnchor - Source installation manifest used to resolve workspace bundles.
 * @returns After one atomic manifest write; existing selections, patches and dependencies are preserved.
 */
export async function ensureGenesisProfileBundles(home: string, installAnchor: string): Promise<void> {
  const dir = resolveProfileDir('web', home)
  await mkdir(dir, { recursive: true })
  await withFileLock(join(dir, 'package.json'), async () => {
    loadProfile('dsh', 'web', installAnchor, home)
    const manifest = readProfileManifest('dsh', dir)
    const bundles = manifest.dsh?.profile?.bundles ?? []
    const initialized = 'genesisProfileDefaults' in manifest
    if (initialized && manifest.genesisProfileDefaults !== 1) throw new Error('Unsupported Genesis profile defaults version')
    const appearanceInitialized = 'genesisAppearanceDefaults' in manifest
    if (appearanceInitialized && manifest.genesisAppearanceDefaults !== 1) throw new Error('Unsupported Genesis appearance defaults version')
    const required = [
      '@deepseek-ai/dsh-experimental-genesis-mcp',
      '@deepseek-ai/dsh-genesis-punishment',
      '@deepseek-ai/dsh-genesis-shock',
    ]
    if (!initialized) {
      required.push(
        '@deepseek-ai/dsh-experimental-genesis-speech',
        '@deepseek-ai/dsh-genesis-weather',
        '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
      )
    }
    // A profile-local install missing from the bundle list is disabled by the operator.
    if (!appearanceInitialized && !Object.hasOwn(manifest.dependencies ?? {}, 'dsh-any-background')) required.push('dsh-any-background')
    const missing = required.filter(bundle => !bundles.includes(bundle))
    if (initialized && appearanceInitialized && missing.length === 0) return
    const updated = {
      ...manifest,
      genesisProfileDefaults: 1,
      genesisAppearanceDefaults: 1,
      dsh: {
        ...manifest.dsh,
        profile: { ...manifest.dsh?.profile, bundles: [...bundles, ...missing] },
      },
    }
    writeProfileManifest(dir, updated)
  })
}
