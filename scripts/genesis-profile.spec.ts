/** Optional defaults are initialized once without overwriting later operator choices. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import {
  composeEntries, initProfile, loadProfileDirectory, readProfileManifest, resolveProfileDir, writeProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
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
    expect(bundles).toContain('@deepseek-ai/dsh-genesis-punishment')
    const profile = loadProfileDirectory('dsh', dir, anchor)
    const entries = composeEntries(profile.layers.map(layer => layer.patches))
    expect(entries.filter(row => row.name === 'dsh-any-background')).toEqual([
      { id: 'dsh-any-background', name: 'dsh-any-background' },
    ])
    expect(entries.some(row => row.name === 'dsh-pet-lite')).toBe(false)
    for (const name of ['qq', 'mail', 'wallet', 'companion']) {
      expect(bundles).not.toContain(`@deepseek-ai/dsh-experimental-genesis-${name}`)
    }
    const selected = bundles.filter(name => name !== '@deepseek-ai/dsh-genesis-weather' && name !== 'dsh-any-background')
    const retiredMinecraft = '@deepseek-ai/dsh-experimental-genesis-minecraft'
    writeProfileManifest(dir, { ...manifest, dsh: { ...manifest.dsh, profile: { bundles: [...selected, retiredMinecraft] } } })
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

it.each([
  { installed: false, selected: false, expectedCount: 1 },
  { installed: true, selected: true, expectedCount: 1 },
  { installed: true, selected: false, expectedCount: 0 },
])('adds the theme default once for existing profiles ($installed, $selected)', async ({ installed, selected, expectedCount }) => {
  const home = await mkdtemp(join(tmpdir(), 'genesis-appearance-'))
  const anchor = resolve(import.meta.dirname, '../apps/cli/package.json')
  try {
    const dir = resolveProfileDir('web', home)
    const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
    if (selected) bundles.push('dsh-any-background')
    initProfile(dir, bundles)
    const manifest = readProfileManifest('dsh', dir)
    const previous = {
      ...manifest,
      genesisProfileDefaults: 1,
      ...(installed ? { dependencies: { 'dsh-any-background': '0.4.5' } } : {}),
    }
    writeProfileManifest(dir, previous)
    await ensureGenesisProfileBundles(home, anchor)
    const upgraded = readProfileManifest('dsh', dir)
    expect(upgraded.dsh?.profile?.bundles?.filter(name => name === 'dsh-any-background')).toHaveLength(expectedCount)
    expect(upgraded.dependencies).toEqual(installed ? { 'dsh-any-background': '0.4.5' } : manifest.dependencies)
    await ensureGenesisProfileBundles(home, anchor)
    expect(readProfileManifest('dsh', dir)).toEqual(upgraded)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
