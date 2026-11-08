/** Source-workspace preload; the supported apps/cli/src/bin.ts remains the application entry. @module */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { parseDshArgs } from '../apps/cli/src/args.ts'
import { ensureGenesisProfileBundles } from './genesis-profile.ts'
import { genesisLaunch } from './genesis-launch.ts'

const launch = genesisLaunch(process.argv.slice(2), getDshRuntimeVersion(), fileURLToPath(new URL('..', import.meta.url)))
process.argv.splice(2, process.argv.length - 2, ...launch.args)
if (launch.genesisHome) {
  const home = process.env.DSH_HOME ??= join(homedir(), '.genesis-harness')
  const invocation = parseDshArgs(launch.args, getDshRuntimeVersion())
  if (invocation.mode !== 'plugin' && !(invocation.mode === 'dump-config' && invocation.defaultOnly)) {
    await ensureGenesisProfileBundles(home, fileURLToPath(new URL('../package.json', import.meta.url)))
  }
}
