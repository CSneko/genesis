import { defineConfig } from 'tsdown'

/** Ship the patched transport without requiring consumers to apply workspace pnpm patches. */
export default defineConfig({
  entry: ['lib/types/index.js'], outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false, noExternal: ['dsh-qq-onebot-bridge'],
})
