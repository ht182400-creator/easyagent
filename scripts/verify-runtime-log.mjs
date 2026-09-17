#!/usr/bin/env node
/**
 * verify-runtime-log.mjs — 验证「运行日志是否真的落盘」
 *
 * ── 为什么需要它 ──
 * 2026-09-18 审核发现 `packages/core/src/utils/logger.ts` **没有任何文件输出**，
 * 所有 `logger.debug()` 只存在于当时的终端窗口，进程一退即永久丢失。
 * 修完之后必须有一个可重复执行的验证手段，否则"修好了"只是口头结论。
 * 本脚本就是那个验证手段：
 *   1. 以 DEBUG 文件级别启动真实 server；
 *   2. 等它起来后真实请求几个 API（触发鉴权中间件的 DEBUG 日志）；
 *   3. 终止 server，检查 `logs/runtime/easyagent-YYYY-MM-DD.log` 是否生成、
 *      是否包含 DEBUG 行、时间戳是否到毫秒。
 *
 * ── 用法 ──
 *   node scripts/verify-runtime-log.mjs            # 完整验证（约 15 秒）
 *   node scripts/verify-runtime-log.mjs --keep     # 保留 server 运行（调试用）
 *
 * 退出码：0 = 日志链路正常；1 = 未落盘 / 无 DEBUG 明细 / 校验失败
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 运行日志目录 */
const LOG_DIR = join(PROJECT_ROOT, 'logs', 'runtime');

/** 被验证的 server 入口 */
const SERVER_ENTRY = 'packages/server/dist/index.js';

/** 健康检查之外再打几个端点，用于触发鉴权中间件的 DEBUG 日志 */
const PROBE_ENDPOINTS = ['/api/health', '/api/status', '/api/version'];

/** 等待 server 就绪的时间（毫秒） */
const BOOT_WAIT_MS = 6_000;

/** 收到终止信号后等待落盘的时间（毫秒） */
const FLUSH_WAIT_MS = 800;

/** server 监听端口与地址 */
const PROBE_BASE_URL = 'http://127.0.0.1:3456';

// ===================== 工具 =====================

/** 本地日期 YYYY-MM-DD（与 logger 的命名口径一致） */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===================== 主流程 =====================

async function main() {
  const keepRunning = process.argv.includes('--keep');

  if (!existsSync(join(PROJECT_ROOT, SERVER_ENTRY))) {
    console.error(`❌ 未找到 ${SERVER_ENTRY}，请先构建：pnpm --filter @easyagent/server build`);
    return 1;
  }

  console.log('[verify-runtime-log] 启动 server（文件日志级别=debug）...');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, EASYAGENT_LOG_FILE_LEVEL: 'debug' },
  });

  child.on('error', (err) => console.error('[verify-runtime-log] 启动失败:', err.message));

  await sleep(BOOT_WAIT_MS);

  // 真实请求，触发鉴权中间件的 DEBUG 分支
  for (const ep of PROBE_ENDPOINTS) {
    try {
      const res = await fetch(`${PROBE_BASE_URL}${ep}`);
      console.log(`[verify-runtime-log] GET ${ep} → ${res.status}`);
    } catch (err) {
      console.error(`[verify-runtime-log] GET ${ep} 失败: ${err.message}`);
    }
  }

  if (!keepRunning) {
    console.log('[verify-runtime-log] 终止 server ...');
    child.kill();
  }
  await sleep(FLUSH_WAIT_MS);

  try {
    // ── 检查目录与文件 ──
    if (!existsSync(LOG_DIR)) {
      console.error(`❌ 日志目录不存在，文件日志未生效: ${LOG_DIR}`);
      return 1;
    }
    console.log('\n[verify-runtime-log] logs/runtime 内容:');
    for (const f of readdirSync(LOG_DIR)) {
      console.log(`  ${f}  ${statSync(join(LOG_DIR, f)).size} bytes`);
    }

    const logFile = join(LOG_DIR, `easyagent-${today()}.log`);
    if (!existsSync(logFile)) {
      console.error(`❌ 未找到当天日志文件: ${logFile}`);
      return 1;
    }

    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    const debugLines = lines.filter((l) => l.includes('"level":"debug"'));
    const errorLines = lines.filter((l) => l.includes('"level":"error"'));

    // ── 校验时间戳毫秒精度（ISO 8601 含 .SSS） ──
    const hasMsTimestamp = lines.some((l) => /"time":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/.test(l));

    console.log(`\n[verify-runtime-log] ${logFile} 共 ${lines.length} 行`);
    console.log(`  debug 行: ${debugLines.length}`);
    console.log(`  error 行: ${errorLines.length}`);
    console.log(`  毫秒级时间戳: ${hasMsTimestamp ? '✅' : '❌'}`);
    if (debugLines.length > 0) {
      console.log('  debug 样例:');
      debugLines.slice(0, 3).forEach((l) => console.log(`    ${l.slice(0, 180)}`));
    }

    // ── 结论 ──
    const problems = [];
    if (lines.length === 0) problems.push('日志文件为空');
    if (debugLines.length === 0) problems.push('未捕获到 DEBUG 行（文件级别应默认为 debug）');
    if (!hasMsTimestamp) problems.push('时间戳缺少毫秒精度');

    console.log('\n' + '='.repeat(70));
    if (problems.length === 0) {
      console.log('✅ 运行日志链路正常：已落盘、含 DEBUG 明细、时间戳精确到毫秒');
      return 0;
    }
    console.error(`❌ 运行日志链路异常，共 ${problems.length} 项：`);
    problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`));
    return 1;
  } catch (err) {
    console.error('[verify-runtime-log] 校验失败:', err.message);
    return 1;
  }
}

process.exitCode = await main();
