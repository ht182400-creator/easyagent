import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.tsx'],
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
