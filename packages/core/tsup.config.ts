import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/adapters/index.ts', 'src/tools/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: false, // 必须关闭，否则 ToolRegistry.setEnabled 等外部调用的方法会被移除
  outDir: 'dist',
  // 保持 CJS/原生模块为外部依赖，避免 ESM 打包兼容性问题
  external: ['better-sqlite3', 'pino', 'pino-pretty', 'openai'],
});
