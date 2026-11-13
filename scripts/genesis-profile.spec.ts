/** Optional defaults are initialized once without overwriting later operator choices. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { readProfileManifest, resolveProfileDir, writeProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { ensureGenesisProfileBundles } from './genesis-profile.ts'

it('retains disabled bundles across startup and rejects an incompatible defaults marker', async () => {
  const home = await mkdtemp(join(tmpdir(), 'genesis-profile-'))
  const anchor = resolve(import.meta.dirname, '../apps/cli/package.json')
  try {
    await ensureGenesisProfileBundles(home, anchor)
    const dir = resolveProfileDir('web', home)
    const manifest = readProfileManifest('dsh', dir)
    const bundles = manifest.dsh?.profile?.bundles ?? []
    expect(bundles).toContain('@deepseek-ai/dsh-genesis-weather')
    for (const name of ['qq', 'mail', 'minecraft', 'wallet', 'companion']) {
      expect(bundles).not.toContain(`@deepseek-ai/dsh-experimental-genesis-${name}`)
    }
    const selected = bundles.filter(name => name !== '@deepseek-ai/dsh-genesis-weather')
    writeProfileManifest(dir, { ...manifest, dsh: { ...manifest.dsh, profile: { bundles: selected } } })
    await ensureGenesisProfileBundles(home, anchor)
    expect(readProfileManifest('dsh', dir).dsh?.profile?.bundles).toEqual(selected)
    const withoutMcp = selected.filter(name => name !== '@deepseek-ai/dsh-experimental-genesis-mcp')
    writeProfileManifest(dir, { ...manifest, dsh: { ...manifest.dsh, profile: { bundles: withoutMcp } } })
    await ensureGenesisProfileBundles(home, anchor)
    expect(readProfileManifest('dsh', dir).dsh?.profile?.bundles).toEqual([...withoutMcp, '@deepseek-ai/dsh-experimental-genesis-mcp'])
    const incompatible = { ...readProfileManifest('dsh', dir), genesisProfileDefaults: 2 }
    writeProfileManifest(dir, incompatible)
    await expect(ensureGenesisProfileBundles(home, anchor)).rejects.toThrow('Unsupported Genesis profile defaults version')
    expect(readProfileManifest('dsh', dir)).toEqual(incompatible)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
