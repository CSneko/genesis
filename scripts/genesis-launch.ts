/** Genesis defaults for this source workspace's ordinary dsh profile launcher. @module */
import { resolve } from 'node:path'
import { parseDshArgs } from '../apps/cli/src/args.ts'

/**
 * Add the Genesis Web composition without changing explicitly selected application arguments.
 * A leading --no-genesis uses ordinary Harness defaults, and explicit copies of default patches are applied once.
 * Web --test-no-login selects loopback-only launch-token login and applies its overlay after caller patches.
 * @param argv - Workspace CLI arguments, before the normal dsh parser runs.
 * @param version - CLI version used for ordinary help and version output.
 * @param root - Source workspace root containing the default patches.
 * @returns Arguments for the supported dsh launcher and whether to select the Genesis home by default.
 */
export function genesisLaunch(argv: readonly string[], version: string, root: string): { args: string[]; genesisHome: boolean } {
  const disabled = argv[0] === '--no-genesis'
  const supplied = disabled ? argv.slice(1) : [...argv]
  const args = supplied.length === 0 ? ['web'] : supplied
  if (disabled) return { args, genesisHome: false }
  const invocation = parseDshArgs(args, version)
  if (invocation.profile !== 'web') return { args, genesisHome: false }
  if (invocation.mode === 'plugin' || (invocation.mode === 'dump-config' && invocation.defaultOnly)) {
    return { args, genesisHome: true }
  }
  const defaults = [
    'packages/experimental/genesis/cordis.patch.yml',
    'packages/experimental/genesis/cordis.life.patch.yml',
    'packages/experimental/genesis-bili-humanism/cordis.patch.yml',
    'packages/experimental/genesis-minecraft/cordis.patch.yml',
    'packages/experimental/genesis-video/cordis.patch.yml',
    'packages/experimental/genesis-qq/cordis.patch.yml',
    'packages/experimental/genesis-companion/cordis.patch.yml',
    'packages/experimental/client-ui-genesis/cordis.patch.yml',
    'config/genesis-browser.patch.yml',
    'config/genesis-computer.patch.yml',
    'config/genesis-web.patch.yml',
  ].map(path => resolve(root, path))
  const testNoLogin = invocation.mode === 'profile' && invocation.args.includes('--test-no-login')
  const testPatch = resolve(root, 'config/genesis-web-test.patch.yml')
  const defaultPaths = new Set([...defaults, resolve(root, 'packages/experimental/genesis-speech/cordis.patch.yml'), ...(testNoLogin ? [testPatch] : [])])
  const patches = [...defaults, ...invocation.patches.filter(path => !defaultPaths.has(resolve(path))),
    ...(testNoLogin ? [testPatch] : [])]
  return { genesisHome: true, args: [
    '--profile', invocation.profile,
    ...(invocation.fromDefaultProfile === undefined ? [] : ['--from-default-profile', invocation.fromDefaultProfile]),
    ...patches.flatMap(path => ['--patch', path]),
    ...(invocation.mode === 'profile' ? invocation.args.filter(arg => arg !== '--test-no-login')
      : [invocation.mode === 'dump-config-schema' ? '--dump-config-schema' : '--dump-config']),
  ] }
}
