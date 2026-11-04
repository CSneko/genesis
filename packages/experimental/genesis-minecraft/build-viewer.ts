/** Build the pinned renderer's browser assets with its upstream webpack configuration. @module */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import webpack from 'webpack'
import type { Configuration } from 'webpack'

/** Build browser and worker assets without modifying dependency files. @returns After both compilers close successfully. */
export async function buildViewer(): Promise<void> {
  const require = createRequire(import.meta.url)
  const upstream = dirname(require.resolve('prismarine-viewer/package.json'))
  const configs: Configuration[] = require(join(upstream, 'webpack.config.js'))
  for (const config of configs) {
    config.context = upstream
    config.output = { ...config.output, path: join(import.meta.dirname, 'lib/viewer') }
    config.resolve = { ...config.resolve, fallback: { ...config.resolve?.fallback, assert: require.resolve('assert/'), util: require.resolve('util/') }, alias: { ...config.resolve?.alias,
      'process/browser': require.resolve('process/browser'), buffer: require.resolve('buffer/'), events: require.resolve('events/') } }
  }
  const compiler = webpack(configs)
  if (compiler === null) throw new Error('Minecraft browser compiler is unavailable')
  try {
    await new Promise<void>((resolve, reject) => {
      compiler.run((error, stats) => {
        if (error) reject(error)
        else if (stats?.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })))
        else resolve()
      })
    })
  } finally { await new Promise<void>((resolve, reject) => { compiler.close((error) => { if (error) reject(error); else resolve() }) }) }
}
