#!/usr/bin/env node
/**
 * verify-frontend-types.mjs — 前端 TypeScript 类型检查门禁
 *
 * ── 为什么需要它 ──
 * 2026-09-19 用户实报：`Automation.tsx` 里用了未导入的 `<RefreshCw />`，
 * **ESM 下这是运行时 ReferenceError** —— 点击即整页黑屏。而本地三个环节都拦不住：
 *   · esbuild / vite 构建：只转译，不解析标识符
 *   · vitest：默认不做类型检查（当时 149 个用例全绿）
 *   · IDE 诊断：可能滞后（当时报 0 问题）
 * 只有 `tsc --noEmit` 能发现，故固化成门禁。
 *
 * ── 与 CI 的关系 ──
 * CI 已在 `.github/workflows/_test.yml`（test-desktop / build-check）里跑 `npx tsc --noEmit`；
 * 本脚本补的是**本地**这一步（verify:all / 提交前），让问题在推送前暴露。
 *
 * ── 用法 ──
 *   node scripts/verify-frontend-types.mjs          # 校验，失败退出码 1（可作门禁）
 *   node scripts/verify-frontend-types.mjs --quiet  # 仅输出结论
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 前端包目录 */
const FRONTEND_DIR = join(PROJECT_ROOT, 'packages/frontend');

/** 仅输出结论 */
const QUIET = process.argv.includes('--quiet');

/** tsconfig（前端包内） */
const TSCONFIG = 'tsconfig.json';

/**
 * TypeScript 编译器入口候选
 *
 * ⚠️ 直接用本地 `node_modules/typescript/bin/tsc` 而不是 `npx tsc`：
 * npx 在缺依赖时会**偷偷联网下载**，那会掩盖"依赖没装好"这个真实问题。
 */
const TSC_CANDIDATES = [
  join(FRONTEND_DIR, 'node_modules', 'typescript', 'bin', 'tsc'),
  join(PROJECT_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
];

// ===================== 主流程 =====================

async function main() {
  const tsc = TSC_CANDIDATES.find((p) => existsSync(p));
  if (!tsc) {
    console.error('❌ 未找到 TypeScript 编译器（node_modules/typescript 缺失）');
    console.error('   请先执行 pnpm install —— 本脚本不会自动联网下载，以免掩盖依赖问题。');
    return 1;
  }

  if (!QUIET) console.log('前端类型检查（tsc --noEmit）...');

  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', TSCONFIG], {
    cwd: FRONTEND_DIR,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  const errorLines = output.split('\n').filter((line) => /error TS\d+/.test(line));

  if (result.status === 0) {
    console.log('✅ 前端类型检查通过（0 错误）');
    return 0;
  }

  console.error(`❌ 前端类型检查失败：${errorLines.length || '若干'} 个错误`);
  if (!QUIET) {
    console.error('--- 错误明细（最多 30 条）---');
    for (const line of (errorLines.length ? errorLines : output.split('\n')).slice(0, 30)) {
      console.error(`  ${line}`);
    }
    console.error('--- 常见成因 ---');
    console.error('  · 用了未导入的标识符（JSX 里的图标最容易忘）→ 运行时 ReferenceError / 白屏');
    console.error('  · props 类型与 store 实际类型不一致（编译期不报，tsc 立刻暴露）');
    console.error('  · 从错误的模块导入类型（类型定义在别的文件里）');
  }
  return 1;
}

// 统一状态标记：供 scripts/verify-all.mjs 汇总判定（详见该文件头部注释）。
const __exitCode = await main();
console.log(`__VERIFY_STATUS__=${__exitCode === 0 ? 'PASS' : 'FAIL'}`);
process.exit(__exitCode);
