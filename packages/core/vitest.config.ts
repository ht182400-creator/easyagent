import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * 是否以"并行跑 core 测试"的**快速模式**运行
 *
 * 由 `pnpm test:core:fast` 设置（见下方 `fileParallelism` 说明）。
 * 快速模式下同时**不产出 JSON 报告**，避免把"可重跑的临时结果"写进管线权威数据。
 */
const isParallelRun = process.env.EASYAGENT_CORE_PARALLEL === '1';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // CI Windows runner 上首次动态 import 大型模块可能超 5s 默认值
    testTimeout: 30_000,
    hookTimeout: 15_000,

    /**
     * 测试文件并行执行：**默认关闭**，用环境变量按需开启（2026-09-19 复核）
     *
     * ── 为什么默认关闭 ──
     * 2026-09-18 全量回归时，`plugin-sandbox.test.ts` / `plugin-manager.test.ts`
     * 出现 **11 条间歇性失败**（失败项集中在"重复加载同一沙箱插件应先关闭旧沙箱"
     * 这类**依赖全局插件/沙箱状态**的用例），而单独运行这两个文件时全过。
     * 当时用串行换取确定性：core **约 15s → 35.9s**。
     * 原则：**测试结果不可信比跑得慢更糟**。
     *
     * ── 2026-09-19 复核（先补基准，再决定，不凭直觉）──
     * · 基准：core 43 文件串行**墙上 61.7s**（其中 tests 35.94s）；并行后 **13~26s
     *   （均值 ≈21s，省 60%+）**。文件级耗时 Top：`exec-tools-security` 7.6s ·
     *   `benchmark-runner` 6.46s · `git-advanced-tools` 3.64s（前 3 名占 55%）。
     * · 排查：本仓 `pool` 默认 threads 且 `isolate` 默认 true ⇒ **跨文件不共享模块单例**，
     *   故历史失败更像是并发**资源争用**（插件沙箱 RPC / exec / 嵌套 vitest 在满载下变慢），
     *   而不是"单例串味"；`src/plugins/**` 也未发现固定临时路径。
     * · 实验：默认 worker 数并行跑 **17 轮 → 16 轮 43/43 全绿、1 轮 1 个文件失败（≈6%）**。
     *   该次失败的完整日志未留存，未能定位到具体文件与用例。
     * · 横向：`desktop` / `server` / `frontend` / `langgraph` 一直默认并行，未见此类问题。
     *
     * ── 结论 ──
     * 6% 的间歇失败率**不足以**作为默认值放开（与上面那条原则直接冲突），但它在
     * **本地快速迭代**（要秒级反馈、失败可重跑）场景很有价值，故做成显式开关：
     *
     * ```powershell
     * pnpm test:core:fast     # = EASYAGENT_CORE_PARALLEL=1 + vitest run（不写管线 JSON）
     * ```
     *
     * ⚠️ 想让并行成为默认，正确路径仍然是**先定位那 6% 的真实原因**：
     * 反复 `pnpm test:core:fast`，失败时把该轮完整日志留下来（`--reporter=default`
     * 会打印失败文件与用例名），判断是"共享资源冲突"还是"超时过紧"，修掉后再翻默认值。
     */
    fileParallelism: isParallelRun,

    // 输出 JSON 报告供管线自动采集（快速模式不产出，避免污染权威数据）
    reporters: isParallelRun ? ['default'] : ['default', 'json'],
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
