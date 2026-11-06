/** Workspace defaults retain ordinary dsh parsing and explicit user overrides. */
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { parseDshArgs } from '../apps/cli/src/args.ts'
import { genesisLaunch } from './genesis-launch.ts'

const root = resolve(import.meta.dirname, '..')

it('starts Genesis Web without arguments and retains explicit Web options', () => {
  const bare = genesisLaunch([], 'test', root)
  expect(bare.genesisHome).toBe(true)
  const invocation = parseDshArgs(bare.args, 'test')
  expect(invocation).toMatchObject({ mode: 'profile', profile: 'web', args: [] })
  if (invocation.mode !== 'profile') throw new Error('Expected a profile launch')
  expect(invocation.patches).toEqual([
    resolve(root, 'packages/experimental/genesis/cordis.patch.yml'),
    resolve(root, 'packages/experimental/genesis/cordis.life.patch.yml'),
    resolve(root, 'packages/experimental/genesis-bili-humanism/cordis.patch.yml'),
    resolve(root, 'packages/experimental/genesis-minecraft/cordis.patch.yml'),
    resolve(root, 'packages/experimental/genesis-video/cordis.patch.yml'),
    resolve(root, 'packages/experimental/genesis-qq/cordis.patch.yml'),
    resolve(root, 'packages/experimental/genesis-companion/cordis.patch.yml'),
    resolve(root, 'packages/experimental/client-ui-genesis/cordis.patch.yml'),
    resolve(root, 'config/genesis-browser.patch.yml'),
    resolve(root, 'config/genesis-computer.patch.yml'),
    resolve(root, 'config/genesis-web.patch.yml'),
  ])
  const explicit = genesisLaunch(['web', '--patch', 'custom.yml', '--port', '4010', '--no-open'], 'test', root)
  expect(parseDshArgs(explicit.args, 'test')).toMatchObject({ args: ['--port', '4010', '--no-open'],
    patches: [...invocation.patches, 'custom.yml'] })
})

it('applies explicit copies of default patches once and keeps config dumps consistent', () => {
  const dump = genesisLaunch(['web', '--patch', 'packages/experimental/genesis/cordis.patch.yml',
    '--patch', 'packages/experimental/genesis-bili-humanism/cordis.patch.yml', '--dump-config'], 'test', root)
  expect(parseDshArgs(dump.args, 'test')).toMatchObject({ mode: 'dump-config', defaultOnly: false })
  expect(dump.args.filter(arg => arg === '--patch')).toHaveLength(11)
  const schema = genesisLaunch(['--profile', 'web', '--dump-config-schema'], 'test', root)
  expect(parseDshArgs(schema.args, 'test')).toMatchObject({ mode: 'dump-config-schema', profile: 'web' })
  const defaults = ['web', '--dump-default-config']
  expect(genesisLaunch(defaults, 'test', root).args).toEqual(defaults)
})

it('preserves other profiles and supports explicit ordinary Harness launches', () => {
  const headless = ['headless', 'task']
  expect(genesisLaunch(headless, 'test', root)).toEqual({ args: headless, genesisHome: false })
  expect(genesisLaunch(['--no-genesis', 'web'], 'test', root)).toEqual({ args: ['web'], genesisHome: false })
  const plugin = ['plugin', '--profile', 'web', 'list']
  expect(genesisLaunch(plugin, 'test', root)).toEqual({ args: plugin, genesisHome: true })
})

it('selects loopback launch-token testing after caller patches and consumes only the workspace flag', () => {
  const launch = genesisLaunch(['web', '--patch', 'custom.yml', '--patch', 'config/genesis-web-test.patch.yml',
    '--test-no-login', '--port', '0', '--no-open'], 'test', root)
  const invocation = parseDshArgs(launch.args, 'test')
  expect(invocation).toMatchObject({ mode: 'profile', profile: 'web', args: ['--port', '0', '--no-open'] })
  if (invocation.mode !== 'profile') throw new Error('Expected a profile launch')
  const testPatch = resolve(root, 'config/genesis-web-test.patch.yml')
  expect(invocation.patches.at(-1)).toBe(testPatch)
  expect(invocation.patches.filter(path => resolve(path) === testPatch)).toHaveLength(1)
  expect(invocation.patches.at(-2)).toBe('custom.yml')
  expect(genesisLaunch(['web'], 'test', root).args).not.toContain(testPatch)
})
