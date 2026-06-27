/**
 * Vitest 配置 - Frontend 共享包测试
 * 覆盖 request/config/api/events/mountApp 等核心模块
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    testTimeout: 10000,
    reporters: ['default', 'json'],
    outputFile: {
      json: '../../docs/pipeline/_vitest-frontend.json',
    },
    css: false,
    // 去重 React 实例: pnpm workspace 中 frontend 依赖 React + vitest 自带的 jsdom
    // 确保测试时只有一个 React 副本，否则 useLayoutEffect 等 hooks 会报 null
    server: {
      deps: {
        inline: ['react', 'react-dom', 'react-dom/client'],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.d.ts',
        'src/components/**',
        'src/pages/**',
        'src/stores/**',
      ],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 35,
        lines: 40,
      },
    },
  },
  // 确保 vite 只用一个 React 副本
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      // frontend 内部 @/ 应指向自己的 src/
      '@': resolve(__dirname, 'src'),
    },
  },
});
