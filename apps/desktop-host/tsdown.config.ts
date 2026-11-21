import { defineConfig } from 'tsdown'

const genesisPatches = [
  ['../../packages/experimental/genesis/cordis.patch.yml', 'core.patch.yml'],
  ['../../packages/experimental/genesis/cordis.life.patch.yml', 'life.patch.yml'],
  ['../../packages/experimental/genesis-bili-humanism/cordis.patch.yml', 'bilibili.patch.yml'],
  ['../../packages/experimental/genesis-video/cordis.patch.yml', 'video.patch.yml'],
  ['../../packages/experimental/genesis-see-now/cordis.patch.yml', 'screen.patch.yml'],
  ['../../packages/experimental/client-ui-genesis/cordis.patch.yml', 'ui.patch.yml'],
  ['../../config/genesis-computer.patch.yml', 'computer.patch.yml'],
  ['./genesis-desktop.patch.yml', 'desktop.patch.yml'],
  ['./web-access.patch.yml', 'web-access.patch.yml'],
] as const

export default defineConfig(['index', 'cli'].map(name => ({
  entry: ['lib/types/' + name + '.js'],
  outDir: 'lib',
  format: ['esm'] as const,
  outputOptions: { codeSplitting: false },
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  ...(name === 'index' ? {
    copy: genesisPatches.map(([from, file]) => ({ from, to: 'lib/genesis', rename: file })),
  } : {}),
})))
