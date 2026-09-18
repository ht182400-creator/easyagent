#!/usr/bin/env node
/**
 * verify-server-routes.mjs — 服务端「路由注册顺序 + 静态托管」运行时验证
 *
 * ── 为什么需要它 ──
 * 有些约束**单元测试覆盖不到**，只有在真实启动后发请求才能验证：
 *   ① `/api/*` 的 404 兜底必须早于 SPA fallback ——
 *      否则未匹配的 API 请求会返回 `200 + index.html`，
 *      前端把 HTML 当 JSON 解析，报出与根因毫无关系的错误（极难排查）；
 *   ② `/doc-viewer` 的静态托管路径基准来自 `__dirname` ——
 *      它取决于**构建产物布局**，纯代码搬迁时很容易被无意改变；
 *   ③ SPA fallback `app.get('*')` 必须存在，否则刷新前端路由页面会 404。
 *
 * `__tests__/route-inventory.test.ts` 保证"路由集合不缺不多"，
 * 本脚本进一步保证"行为与顺序正确"，两者互补。
 *
 * ── 用法 ──
 *   node scripts/verify-server-routes.mjs
 *   （需先构建：pnpm --filter @easyagent/server build && pnpm --filter @easyagent/web build）
 *
 * 退出码：0 = 全部通过；1 = 存在失败项或产物缺失
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 被验证的 server 入口（构建产物） */
const SERVER_ENTRY = 'packages/server/dist/index.js';

/** 探针端口（避免与本机在跑的实例冲突时可改） */
const PORT = Number(process.env.PROBE_PORT || 3457);

/** 探针访问基址 */
const BASE = `http://127.0.0.1:${PORT}`;

/** 等待服务就绪的时间（毫秒） */
const BOOT_WAIT_MS = 7_000;

/** 终止后等待落盘的时间（毫秒） */
const FLUSH_WAIT_MS = 500;

// ===================== 工具 =====================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===================== 主流程 =====================

async function main() {
  if (!existsSync(join(PROJECT_ROOT, SERVER_ENTRY))) {
    console.error(`❌ 未找到 ${SERVER_ENTRY}`);
    console.error('   请先构建：pnpm --filter @easyagent/server build');
    return 1;
  }

  console.log('[verify-server-routes] 启动服务端探针...');
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // 固定端口。注意**不能**设 LOG_LEVEL=silent：
    // 最后一项检查要读启动日志中的「文档浏览器静态文件已托管 / 未找到」，
    // 静默日志会让该检查永远失败（自相矛盾）。
    // 子进程输出只被累积、不转发到控制台，因此不会污染验证结果。
    env: { ...process.env, PORT: String(PORT), LOG_LEVEL: 'info' },
  });

  let serverOutput = '';
  child.stdout.on('data', (d) => (serverOutput += d.toString()));
  child.stderr.on('data', (d) => (serverOutput += d.toString()));
  child.on('error', (err) => console.error('[verify-server-routes] 启动失败:', err.message));

  await sleep(BOOT_WAIT_MS);

  /** 单项检查 */
  async function check(name, path, validate) {
    try {
      const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
      const ct = res.headers.get('content-type') || '';
      const body = await res.text();
      const ok = validate(res.status, ct, body);
      console.log(
        `${ok ? '✅' : '❌'} ${name.padEnd(30)} ${path.padEnd(30)} → ${res.status}  ${ct.split(';')[0]}`,
      );
      if (!ok) console.log(`     body: ${body.slice(0, 120).replace(/\s+/g, ' ')}`);
      return ok;
    } catch (err) {
      console.log(`❌ ${name.padEnd(30)} ${path.padEnd(30)} → 请求失败: ${err.message}`);
      return false;
    }
  }

  const results = [];

  // ① 基础 API 仍可用
  results.push(await check('API 健康检查', '/api/health', (s) => s === 200));

  // ② 关键不变量：未匹配的 API 必须返回 404 JSON，**不能被 SPA fallback 吞掉**
  results.push(
    await check(
      '未匹配 API → 404 JSON',
      '/api/definitely-not-exist-probe',
      (s, ct, b) => s === 404 && ct.includes('json') && b.includes('API端点不存在'),
    ),
  );

  // ③ SPA fallback 存在（刷新前端路由不会 404）
  results.push(
    await check('SPA fallback → HTML', '/', (s, ct) => s === 200 && ct.includes('html')),
  );

  // ④ 文档浏览器静态托管（未装插件时应为 404，但绝不能 500）
  results.push(await check('文档浏览器不报 500', '/doc-viewer/', (s) => s !== 500));

  // ⑤ 未知静态路径应被兜底（200 或 404，不能 500）
  results.push(await check('未知静态路径可兜底', '/probe-fake-page', (s) => s !== 500));

  // ⑥ 静态文件处理逻辑确实执行过（托管成功或明确告警，二者必有其一）
  const staticHandled =
    serverOutput.includes('文档浏览器静态文件已托管') || serverOutput.includes('文档浏览器 dist/ 未找到');
  console.log(`${staticHandled ? '✅' : '❌'} 启动日志含静态文件处理结果`);
  results.push(staticHandled);

  child.kill();
  await sleep(FLUSH_WAIT_MS);

  const failed = results.filter((r) => !r).length;
  console.log('\n' + '='.repeat(64));
  if (failed === 0) {
    console.log('✅ 路由注册顺序与静态托管验证全部通过');
    return 0;
  }
  console.error(`❌ 验证失败 ${failed} 项（详见上方 ❌ 标记）`);
  return 1;
}

// 统一状态标记：供 scripts/verify-all.mjs 汇总判定（详见该文件头部注释）。
// 注意：产物缺失时返回 1（FAIL 而非 SKIP）—— 需要先构建是**真实的前置条件**，
// 若算作跳过，CI 里"从没构建过"也会被当成通过。
const __exitCode = await main();
console.log(`__VERIFY_STATUS__=${__exitCode === 0 ? 'PASS' : 'FAIL'}`);
process.exitCode = __exitCode;
