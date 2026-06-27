/**
 * Vitest 配置 - Desktop 包测试
 * 覆盖 stores、components、IPC 桥接
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom 模拟浏览器环境
    environment: 'jsdom',
    // 全局 setup
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    // 测试超时
    testTimeout: 10000,
    // 输出 JSON 报告供管线自动采集
    reporters: ['default', 'json'],
    outputFile: {
      json: '../../docs/pipeline/_vitest-desktop.json',
    },
    // 路径别名 - 匹配 tsconfig
    alias: {
      // 与 tsconfig.json 中 paths 保持一致，指向共享前端包
      '@': path.resolve(__dirname, '../frontend/src'),
    },
    // CSS/Less/静态资源 mock
    css: false,
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**/*.{ts,tsx}', 'src/preload.ts'],
      exclude: ['src/renderer/main.tsx', 'src/renderer/**/*.d.ts'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 55,
        lines: 60,
      },
    },
    // 排除 Electron 原生模块
    // React 实例去重：pnpm workspace 中 desktop + frontend 各自依赖 React，
    // 通过 @/ alias 引入 frontend 组件时可能产生双重实例，导致 hooks 为 null
    server: {
      deps: {
        inline: ['react', 'react-dom', 'react-dom/client'],
      },
    },
  },
  // 确保 vitest 只使用一个 React 副本
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
