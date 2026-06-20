import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/adapters/index.ts', 'src/tools/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  // 保持 CJS/原生模块为外部依赖，避免 ESM 打包兼容性问题
  external: [
    'better-sqlite3',
    'pino',
    'pino-pretty',
    'openai',
  ],
});
