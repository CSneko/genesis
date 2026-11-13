/** Restart-durable optional speech bundle selection for the Genesis Web profile. @module */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadProfile, readProfileManifest, resolveProfileDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'

/**
 * Add the speech bundle to an existing Web profile without changing its other selections.
 * @param home - Explicit Genesis home.
 * @param installAnchor - Source installation manifest used to resolve workspace bundles.
 * @returns After one atomic profile manifest update.
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
    writeProfileManifest(dir, {
      ...manifest,
      dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, speech] } },
    })
  })
}
