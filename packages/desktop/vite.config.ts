import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
    // Electron 使用 file:// 协议，需要确保资源路径正确
    assetsInlineLimit: 0,
  },
  resolve: {
    alias: [
      /** 统一前端 @/ → packages/frontend/src */
      { find: /^@\//, replacement: resolve(__dirname, '../frontend/src/') },
    ],
  },
  // 允许 renderer 代码通过 __API_PORT__ 获取端口（Vite define 注入）
  define: {
    __API_PORT__: JSON.stringify(process.env.API_PORT || '3456'),
  },
  server: {
    port: 5183,
    strictPort: true,
    // 开发模式下代理 API 请求到内嵌后端（端口可通过 API_PORT 环境变量覆盖）
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || '3456'}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${process.env.API_PORT || '3456'}`,
        ws: true,
      },
    },
  },
});
