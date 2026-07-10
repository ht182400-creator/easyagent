import { defineConfig } from 'tsup';

/** Worker 入口文件 - 必须是顶层 dist 文件，因为 PluginSandbox 通过 __dirname 解析 */
const WORKER_ENTRY = 'src/plugins/PluginWorkerEntry.ts';

export default defineConfig({
  entry: {
    // 主入口 - 包含全部 core API（tools/adapters/...）
    index: 'src/index.ts',
    adapters: 'src/adapters/index.ts',
    tools: 'src/tools/index.ts',
    // 插件沙箱 worker 入口 - 必须**独立**输出到 dist/PluginWorkerEntry.js，
    // 而不是被 tsup 内联到 dist/index.js 中。
    // 原因：PluginSandbox.ts:125 通过 `resolve(__dirname, 'PluginWorkerEntry.js')`
    // 加载 worker 入口，而 PluginSandbox 被打包进 dist/index.js（__dirname=dist/），
    // 因此 worker 入口必须存在于 dist/PluginWorkerEntry.js 才能被找到。
    // 历史：曾输出到 dist/plugins/PluginWorkerEntry.js，但 tsup splitting=false
    // 会把整个 plugins 目录内联到 dist/index.js，__dirname 解析会失败。
    'PluginWorkerEntry': WORKER_ENTRY,
  },
  format: ['esm'],
  // dts 仅对主入口和子模块入口生成；worker 入口不需要 dts（其使用 dynamic property
  // access 模式，dts 推导会把所有属性类型推断为 {} 导致类型错误），且外部不引用它
  dts: { entry: { index: 'src/index.ts', adapters: 'src/adapters/index.ts', tools: 'src/tools/index.ts' } },
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: false, // 必须关闭，否则 ToolRegistry.setEnabled 等外部调用的方法会被移除
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  // 保持 CJS/原生模块为外部依赖，避免 ESM 打包兼容性问题
  external: ['better-sqlite3', 'pino', 'pino-pretty', 'openai'],
});
