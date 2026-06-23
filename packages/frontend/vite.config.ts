/**
 * EasyAgent 统一前端 - Vite 构建配置
 * 支持环境变量注入 API_BASE / WS_BASE
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  define: {
    __EASYAGENT_API_BASE__: JSON.stringify(process.env.EASYAGENT_API_BASE || ''),
    __EASYAGENT_WS_BASE__: JSON.stringify(process.env.EASYAGENT_WS_BASE || ''),
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3456',
      '/ws': {
        target: 'ws://127.0.0.1:3456',
        ws: true,
      },
    },
  },
});
