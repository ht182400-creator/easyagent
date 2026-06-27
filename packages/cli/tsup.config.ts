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
    // CLI 源码中的 .js 文件实际包含 JSX，需要 loader 覆盖
    options.loader = { ...options.loader, '.js': 'jsx' };
  },
});
