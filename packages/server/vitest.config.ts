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
    // 集成测试会集中打同一端点（如 chat-session-api.test.ts 有 25 个用例都打 /api/chat），
    // 且 supertest 源地址恒为回环，会被限流器聚簇到同一个桶 → 触发 429 造成大量假失败。
    // 因此测试环境关闭限流；限流逻辑本身由
    // src/__tests__/api-security.test.ts 直接构造中间件做模块级测试（精确控制窗口与配额）。
    env: {
      EASYAGENT_DISABLE_RATE_LIMIT: '1',
    },
    // 覆盖率配置 — DV-05 覆盖率门禁
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/**/*.d.ts'],
      thresholds: {
        statements: 30,
        branches: 20,
        functions: 25,
        lines: 30,
      },
    },
  },
  resolve: {
    alias: {
      // 复用 core 包的 mock
      'better-sqlite3': resolve(__dirname, '..', 'core', 'src', '__mocks__', 'better-sqlite3.ts'),
    },
  },
});
