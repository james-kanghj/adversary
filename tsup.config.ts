import { defineConfig } from 'tsup'

// Type declarations are emitted by `tsc` (see tsconfig.build.json) instead of
// tsup's bundled rollup-plugin-dts, which does not yet support TypeScript 7.
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: false,
    clean: true,
    sourcemap: true,
    treeshake: true,
  },
  {
    // The CLI ships as an ESM-only binary: it uses import.meta and a shebang.
    entry: ['src/bin.ts'],
    format: ['esm'],
    dts: false,
    clean: false,
    sourcemap: true,
    treeshake: true,
  },
])
