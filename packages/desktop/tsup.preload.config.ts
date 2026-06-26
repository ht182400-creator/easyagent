/**
 * Preload 脚本专用构建配置
 * 
 * Electron 的 preload 脚本必须为 CommonJS（运行在独立的 Node.js 沙箱中，不支持 ESM require）
 * 将输出文件设为 .cjs 以强制 CJS 解释，即使在 "type": "module" 项目中
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    preload: 'src/preload.ts',
  },
  format: ['cjs'],
  dts: false,
  sourcemap: true,
  clean: false,
  splitting: false,
  treeshake: true,
  outDir: 'dist',
  // CJS 输出扩展名设为 .cjs，确保在 "type":"module" 项目中被正确识别为 CommonJS
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js',
    };
  },
  // electron 作为 external（Electron 运行时提供）
  external: ['electron'],
  esbuildOptions(options) {
    options.platform = 'node';
    options.target = 'node20';
  },
});
