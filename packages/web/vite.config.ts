import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, '../frontend/src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // 开发模式下代理 API 请求到后端（端口可通过 API_PORT 环境变量覆盖）
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
