/**
 * Vitest 基准测试配置 (PT-01)
 * 运行方式: pnpm bench 或 npx vitest bench --config vitest.bench.config.ts
 */
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.bench.ts'],
    // bench 专用配置
    benchmark: {
      // 每个用例的输出中包含吞吐量 (ops/sec) 和平均时间
      outputJson: '../../docs/pipeline/_bench-core.json',
    },
    environment: 'node',
    // 性能基准通常比单元测试耗时更长
    testTimeout: 60000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      'better-sqlite3': resolve(__dirname, 'src/__mocks__/better-sqlite3.ts'),
    },
  },
});
