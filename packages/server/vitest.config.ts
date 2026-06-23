import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // 服务端测试需要更长超时
    testTimeout: 15000,
    hookTimeout: 10000,
    // 输出 JSON 报告供管线自动采集
    reporters: ['default', 'json'],
    outputFile: {
      json: '../../docs/pipeline/_vitest-server.json',
    },
  },
  resolve: {
    alias: {
      // 复用 core 包的 mock
      'better-sqlite3': resolve(__dirname, '..', 'core', 'src', '__mocks__', 'better-sqlite3.ts'),
    },
  },
});
