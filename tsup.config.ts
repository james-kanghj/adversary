import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // Type declarations are emitted by `tsc` (see tsconfig.build.json) instead of
  // tsup's bundled rollup-plugin-dts, which does not yet support TypeScript 7.
  dts: false,
  clean: true,
  sourcemap: true,
  treeshake: true,
})
