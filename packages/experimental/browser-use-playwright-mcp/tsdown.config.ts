import { defineConfig } from 'tsdown'

export default defineConfig(({ env }) => env?.DSH_BUILD_FACE === 'client' ? { entry: '' } : {
  entry: ['lib/types/index.js', 'lib/types/connection.js'], outDir: 'lib', format: ['esm'], platform: 'node',
  target: 'es2024', fixedExtension: false, dts: false, clean: false,
  outputOptions: { chunkFileNames: 'chunks/[name]-[hash].js' },
})
