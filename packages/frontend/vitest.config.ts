/**
 * Vitest 配置 - Frontend 共享包测试
 * 覆盖 request/config/api/events/mountApp/langGraphStore 等核心模块
 * 
 * v0.6.22+ 使用 happy-dom 替代 jsdom，解决 pnpm workspace 中 React hooks
 * 模块重复实例问题（jsdom 下 render() 和组件使用不同 React 实例）。
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    globals: true,
    testTimeout: 10000,
    reporters: ['default', 'json'],
    outputFile: {
      json: '../../docs/pipeline/_vitest-frontend.json',
    },
    css: false,
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
  // pnpm workspace 中确保 React 单例
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
