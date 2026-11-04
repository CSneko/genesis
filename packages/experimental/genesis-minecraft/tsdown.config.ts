import { defineConfig } from 'tsdown'
import { typertPlugin } from '../../typert/generator/lib/types/tsdown-plugin.js'
import { WORKSPACE_TYPERT_FACES } from '../../../scripts/typert-faces.ts'
import { buildViewer } from './build-viewer.ts'

export default defineConfig(({ env }) => env?.DSH_BUILD_FACE === 'client' ? { entry: '' } : {
  entry: ['lib/types/index.js'], outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024', clean: false,
  plugins: [typertPlugin({ mode: 'workspace', faces: WORKSPACE_TYPERT_FACES })],
  hooks: { 'build:done': buildViewer },
})
