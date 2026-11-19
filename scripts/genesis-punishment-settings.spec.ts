/** Persisted UI edits must override the built-in punishment bundle and survive restart. @module */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { composeEntries, loadProfileDirectory, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { Config } from '../packages/experimental/genesis-punishment/src/index.ts'
import { configurationFixture } from '../packages/settings/settings/tests/configuration-fixture.ts'
import { ensureGenesisProfileBundles } from './genesis-profile.ts'
import { genesisLaunch } from './genesis-launch.ts'

it('applies persisted punishment settings after the built-in profile layer', async () => {
  const home = await mkdtemp(join(tmpdir(), 'genesis-punishment-profile-'))
  const root = resolve(import.meta.dirname, '..')
  const anchor = join(root, 'apps/cli/package.json')
  try {
    await ensureGenesisProfileBundles(home, anchor)
    const dir = join(home, 'profiles/web')
    const patchPath = join(dir, 'cordis.patch.yml')
    const config = { enabled: true, webhookUrl: 'https://receiver.example/punishment' }
    await writeFile(patchPath, JSON.stringify([{ id: 'genesis-punishment', config }]))
    const loaded = loadProfileDirectory('dsh', dir, anchor)
    expect(loaded.skippedBundles.some(bundle => bundle.packageName === '@deepseek-ai/dsh-genesis-punishment')).toBe(false)
    const context: ProfileContext = {
      name: 'web', dir, patchPath, home, installAnchor: anchor, cwd: root,
      startedBundles: loaded.layers.map(layer => layer.packageName), overlays: [], telemetryDisabledEnv: undefined,
    }
    const rows = composeEntries([readProfilePatches('dsh', context, loaded)])
    expect(rows.filter(row => row.id === 'genesis-punishment')).toHaveLength(1)
    expect(rows.find(row => row.id === 'genesis-punishment')?.config).toEqual(config)
    expect(genesisLaunch(['web'], 'test', root).args).not.toContain(join(root, 'packages/experimental/genesis-punishment/cordis.patch.yml'))
  } finally { await rm(home, { recursive: true, force: true }) }
})

it('saves enabled and webhook fields through Settings and restores them on restart', async () => {
  const { ctx, start } = await configurationFixture({ schema: Config, hmr: false })
  const descriptor = ctx.settings.describe().find(row => row.ns === 'first')
  if (!descriptor) throw new Error('Missing punishment settings form')
  await ctx.settings.mutate('first', [
    { op: 'set', path: ['enabled'], value: true },
    { op: 'set', path: ['webhookUrl'], value: 'https://receiver.example/punishment' },
    { op: 'set', path: ['description'], value: 'Operator rules' },
  ], descriptor.revision)
  expect(ctx.settings.describe().find(row => row.ns === 'first')?.value).toMatchObject({
    enabled: true, webhookUrl: 'https://receiver.example/punishment', description: 'Operator rules',
  })
  await ctx.fiber.dispose()
  const restarted = await start()
  expect(restarted.settings.describe().find(row => row.ns === 'first')?.value).toMatchObject({
    enabled: true, webhookUrl: 'https://receiver.example/punishment', description: 'Operator rules',
  })
})
