import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // CI Windows runner 上首次动态 import 大型模块可能超 5s 默认值
    testTimeout: 30_000,
    hookTimeout: 15_000,

    /**
     * 串行执行测试文件（不并发）
     *
     * ── 为什么 ──
     * 2026-09-18 全量回归时，`plugin-sandbox.test.ts` / `plugin-manager.test.ts`
     * 出现 **11 条间歇性失败**（失败项集中在"重复加载同一沙箱插件应先关闭旧沙箱"
     * 这类**依赖全局插件/沙箱状态**的用例），而单独运行这两个文件时 96/96 全过，
     * 紧接的全量重跑也 1689/1689 全过。
     *
     * 判据：**只在全量并行的负载下失败，单独跑必过** —— 典型的跨文件状态干扰。
     * 插件管理系统持有进程级单例（PluginManager / PluginSandbox / ToolRegistry），
     * 多个测试文件并发时会互相覆盖彼此的前置状态。
     *
     * ⚠️ 这是一处**预防性**修复：由于问题是间歇性的，无法稳定复现，
     *    因此用时间代价换取确定性 —— 测试结果不可信比跑得慢更糟。
     *
     * **实测代价**（2026-09-18）：core 包 **约 15s → 35.9s（约 +140%）**，
     *    全量回归 **约 60s → 90s**。这是真实成本，不是可以忽略的开销。
     *
     * 若日后想收回这部分时间，正确做法是**定位并修掉真正的跨文件状态干扰**
     * （让插件测试各自使用独立的临时目录与隔离的 PluginManager 实例），
     * 而不是把本开关关掉 —— 关掉会让间歇性假失败回来。
     */
    fileParallelism: false,

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
