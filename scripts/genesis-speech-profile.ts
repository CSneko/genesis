/** Source-workspace speech composition below editable profile settings. @module */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadProfile, readProfileManifest, resolveProfileDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

/**
 * Select the already installed speech bundle before profile configuration is composed.
 * @param home - Explicit Genesis home; ordinary Harness homes are not modified.
 * @param installAnchor - Source installation manifest used to resolve workspace bundles.
 * @returns After the profile manifest includes speech; existing patches and dependencies are preserved.
 */
export async function ensureGenesisSpeechProfile(home: string, installAnchor: string): Promise<void> {
  const dir = resolveProfileDir('web', home)
  await mkdir(dir, { recursive: true })
  await withFileLock(join(dir, 'package.json'), async () => {
    loadProfile('dsh', 'web', installAnchor, home)
    const manifest = readProfileManifest('dsh', dir)
    const bundles = manifest.dsh?.profile?.bundles ?? []
    const speech = '@deepseek-ai/dsh-experimental-genesis-speech'
    if (bundles.includes(speech)) return
    writeProfileManifest(dir, { ...manifest, dsh: { ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles: [...bundles, speech] },
    } })
  })
}
