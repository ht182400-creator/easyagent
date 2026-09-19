#!/usr/bin/env node
/**
 * 并行跑 core 测试（`pnpm test:core:fast`）—— 面向**本地快速迭代**
 *
 * ── 为什么是显式开关而不是默认 ──
 * 见 `packages/core/vitest.config.ts` 中 `fileParallelism` 的说明：
 * core 默认串行（约 50~60s）以保证确定性；并行可降到 13~26s（省 60%+），
 * 但 2026-09-19 复核实测 **17 轮里有 1 轮出现 1 个文件失败（≈6%）**，根因未定位。
 * 因此并行只作为"失败可重跑"场景下的加速手段，**不采信为发布/门禁依据**。
 *
 * ⚠️ 如果这一模式反复失败，请把失败输出留下来（`--reporter=default` 会打印文件与用例名）
 *    并按上面配置注释里的路径去定位根因，而不是把它当成"偶发、忽略"。
 *
 * 说明：本脚本**用 node 直接启动 vitest.mjs**（不经 shell）。为什么不 `npx`：
 * Node 20+/24 起 `spawn` 一个 `.cmd/.bat` 必须 `shell: true`（否则 `EINVAL`），
 * 而 `shell: true` + argv 又会触发 DEP0190 —— 两条路都不好，见
 * `scripts/run-tests-log.mjs` 的 `resolveVitestEntry`（同一处理）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = join(PROJECT_ROOT, 'packages', 'core');

/** 解析 vitest 的 JS 入口（core 内优先，其次仓库根） */
function resolveVitestEntry() {
  for (const base of [CORE_DIR, PROJECT_ROOT]) {
    try {
      const require = createRequire(join(base, 'noop.js'));
      const entry = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
      if (existsSync(entry)) return entry;
    } catch {
      // 换下一个候选目录
    }
  }
  return '';
}

const vitestEntry = resolveVitestEntry();
if (!vitestEntry) {
  console.error('[test:core:fast] 无法解析 vitest 入口，请先安装依赖（pnpm install）');
  process.exit(1);
}

console.log(
  '[test:core:fast] 并行模式（EASYAGENT_CORE_PARALLEL=1）：快，但结果只在"可重跑"场景下采信；不写管线 JSON',
);

const startedAt = Date.now();
const result = spawnSync(process.execPath, [vitestEntry, 'run'], {
  cwd: CORE_DIR,
  stdio: 'inherit',
  env: { ...process.env, EASYAGENT_CORE_PARALLEL: '1' },
});

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`[test:core:fast] 退出码=${result.status ?? 'null'} 耗时=${elapsed}s`);
if (result.error) {
  console.error(`[test:core:fast] 启动失败: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
