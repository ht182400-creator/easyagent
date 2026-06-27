import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // CI Windows runner 上首次动态 import 大型模块可能超 5s 默认值
    testTimeout: 30_000,
    hookTimeout: 15_000,
    // 输出 JSON 报告供管线自动采集
    reporters: ['default', 'json'],
    outputFile: {
      json: '../../docs/pipeline/_vitest-core.json',
    },
    // 覆盖率配置 — DV-05 覆盖率门禁
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/__mocks__/**', 'src/**/*.d.ts', 'src/**/*.bench.ts'],
      thresholds: {
        statements: 35,
        branches: 25,
        functions: 30,
        lines: 35,
      },
    },
  },
  resolve: {
    alias: {
      // 测试环境下用内存 mock 替代 better-sqlite3 原生模块
      'better-sqlite3': resolve(__dirname, 'src/__mocks__/better-sqlite3.ts'),
    },
  },
});
