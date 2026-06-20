import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    preload: 'src/preload.ts',
  },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: false, // 不清理 dist，避免删除 Vite 输出的 renderer
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  // electron 必须 external（Electron 运行时提供）
  // better-sqlite3 必须 external（原生模块，不可 bundle）
  // pino / pino-pretty 必须 external（内部使用 CJS require，ESM bundle 会炸）
  external: [
    'electron',
    'better-sqlite3',
    'pino',
    'pino-pretty',
    // Express 生态系统保持 external（Native/CJS 模块，由 node_modules 提供）
    'express',
    'cors',
    'ws',
    'multer',
    // electron 相关包保持 external
    'electron-updater',
    'electron-store',
  ],
  // 将 @easyagent/core 和 @easyagent/server 打包进 main.js
  // 避免 pnpm workspace symlink 在 asar 中失效
  noExternal: ['@easyagent/core', '@easyagent/server'],
  // esbuild 选项
  esbuildOptions(options) {
    // 设置平台为 node，支持 Node.js 内置模块
    options.platform = 'node';
    // 支持顶层 await (Electron 30+ Node.js 20)
    options.target = 'node20';
  },
});
