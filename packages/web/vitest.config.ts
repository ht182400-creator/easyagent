/**
 * Vitest 配置 - Web 包测试
 * 验证入口点和平台适配器行为
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
      json: '../../docs/pipeline/_vitest-web.json',
    },
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**'],
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 25,
        lines: 30,
      },
    },
  },
});
