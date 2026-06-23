import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // 输出 JSON 报告供管线自动采集
    reporters: ['default', 'json'],
    outputFile: {
      json: '../../docs/pipeline/_vitest-core.json',
    },
  },
  resolve: {
    alias: {
      // 测试环境下用内存 mock 替代 better-sqlite3 原生模块
      'better-sqlite3': resolve(__dirname, 'src/__mocks__/better-sqlite3.ts'),
    },
  },
});
