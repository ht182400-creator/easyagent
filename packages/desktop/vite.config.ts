import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

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
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5183,
    strictPort: true,
    // 开发模式下代理 API 请求到内嵌后端
    proxy: {
      '/api': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3456',
        ws: true,
      },
    },
  },
});
