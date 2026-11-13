/** Source-workspace optional bundles with restart-durable operator selections. @module */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadProfile, readProfileManifest, resolveProfileDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

/**
 * Initialize optional bundle defaults once before profile configuration is composed.
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
    // The marker and selection share one manifest write; later launches preserve disabled bundles.
    if ('genesisProfileDefaults' in manifest) {
      if (manifest.genesisProfileDefaults !== 1) throw new Error('Unsupported Genesis profile defaults version')
      const builtin = '@deepseek-ai/dsh-experimental-genesis-mcp'
      if (!bundles.includes(builtin))
        writeProfileManifest(dir, {
          ...manifest,
          dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, builtin] } },
        })
      return
    }
    const required = [
      '@deepseek-ai/dsh-experimental-genesis-mcp',
      '@deepseek-ai/dsh-experimental-genesis-speech',
      '@deepseek-ai/dsh-genesis-weather',
      '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp',
    ]
    const updated = {
      ...manifest,
      genesisProfileDefaults: 1,
      dsh: {
        ...manifest.dsh,
        profile: { ...manifest.dsh?.profile, bundles: [...bundles, ...required.filter(bundle => !bundles.includes(bundle))] },
      },
    }
    writeProfileManifest(dir, updated)
  })
}
