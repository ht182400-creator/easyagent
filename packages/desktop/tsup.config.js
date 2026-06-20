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
    external: ['electron', 'better-sqlite3', 'pino', 'pino-pretty'],
    // 将 @easyagent/core 打包进 main.js，避免 pnpm workspace symlink 在 asar 中失效
    // 注意: core 中 import 的 pino 等外部依赖会在 tsup 处理 core 时被标记为 external，
    // desktop 打包时需要 pino 在 node_modules 中可用
    noExternal: ['@easyagent/core'],
});
//# sourceMappingURL=tsup.config.js.map