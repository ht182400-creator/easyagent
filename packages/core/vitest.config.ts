import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // 测试环境下用内存 mock 替代 better-sqlite3 原生模块
      'better-sqlite3': resolve(__dirname, 'src/__mocks__/better-sqlite3.ts'),
    },
  },
});
