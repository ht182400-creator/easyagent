/**
 * 轻量压力测试（P2 补充：零新依赖，fetch + 并发池）
 *
 * ── 用法 ──
 *   node scripts/load-test.mjs          # 需先构建 server（cd packages/server && npx tsup）
 *
 * ── 场景 ──
 *   1. health-throughput   /api/health 并发吞吐基线（限流关闭实例）
 *   2. sessions-read       /api/sessions 并发读（SQLite 读取路径）
 *   3. semantic-blocking   ⭐ 事件循环阻塞量化：1 个慢请求（semantic/map 同步全仓扫描）
 *                          在飞期间，其他请求（health）的延迟劣化幅度
 *   4. rate-limit-burst    突发 POST /api/chat ×40（costly 限流 30/min）→ 验证 429 正确触发
 *
 * ── 已知边界 ──
 *   LLM 端点（chat 真实调用）瓶颈在上游模型 API，压本地无意义 —— 本脚本只压非 LLM 路径；
 *   chat 突发场景中业务处理器可能报错（无 provider），我们只统计 429 状态，不关心业务结果。
 *
 * 产物：控制台报告 + benchmarks/load-latest.json（诊断用，不入库）。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('load-test');

// ===================== 常量 =====================

/** 服务端入口（dist 产物） */
const SERVER_ENTRY = join(process.cwd(), 'packages', 'server', 'dist', 'index.js');

/** 场景 1/2 的并发数与总请求数 */
const THROUGHPUT_CONCURRENCY = 20;
const THROUGHPUT_TOTAL = 200;

/** 场景 3：慢请求发出后的等待（让请求进入处理器）与阻塞期采样数 */
const BLOCKING_WAIT_MS = 150;
const BLOCKING_SAMPLES = 10;

/** 场景 4：chat 突发请求数（costly 限流 30/min → 第 31 个起应 429） */
const BURST_TOTAL = 40;
/** costly 限流配额（apiSecurity.ts COSTLY_MAX_REQUESTS，只读对照） */
const COSTLY_MAX = 30;

/** 单请求超时 */
const REQ_TIMEOUT_MS = 10_000;

/** 结果文件（诊断用，不入库） */
const RESULT_FILE = join(process.cwd(), 'benchmarks', 'load-latest.json');

// ===================== 工具函数 =====================

/** 获取随机空闲端口 */
function getRandomPort() {
  const require = createRequire(import.meta.url);
  const net = require('node:net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** 启动服务端实例（调用方负责 kill） */
function spawnServer(port, disableRateLimit) {
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1' };
  if (disableRateLimit) env.EASYAGENT_DISABLE_RATE_LIMIT = '1';
  return spawn(process.execPath, [SERVER_ENTRY], { env, stdio: 'ignore' });
}

/** 等待 /api/health 就绪 */
async function waitHealthy(baseUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('健康检查超时');
}

/** 单次请求并返回延迟与状态码 */
async function timedRequest(url, options = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQ_TIMEOUT_MS), ...options });
    // 消费响应体（否则连接不复用，测量失真）
    await res.arrayBuffer().catch(() => {});
    return { latencyMs: performance.now() - t0, status: res.status };
  } catch (err) {
    return { latencyMs: performance.now() - t0, status: 0, error: err.message };
  }
}

/** 并发池：以固定并发执行 total 个任务 */
async function runPool(total, concurrency, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (next < total) {
      const i = next++;
      await worker(i);
    }
  });
  await Promise.all(runners);
}

/** 百分位数 */
function percentile(sortedLatencies, p) {
  if (sortedLatencies.length === 0) return 0;
  const idx = Math.min(
    sortedLatencies.length - 1,
    Math.ceil((p / 100) * sortedLatencies.length) - 1,
  );
  return Math.round(sortedLatencies[Math.max(0, idx)]);
}

/**
 * 吞吐场景：并发请求 total 次，返回 req/s 与延迟分位数
 */
async function throughputScenario(name, url, concurrency, total) {
  const latencies = [];
  const errors = [];
  const startedAt = performance.now();

  await runPool(total, concurrency, async () => {
    const r = await timedRequest(url);
    if (r.status === 200) latencies.push(r.latencyMs);
    else errors.push({ status: r.status, error: r.error });
  });

  const elapsedSec = (performance.now() - startedAt) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    name,
    total,
    concurrency,
    ok: latencies.length,
    errors: errors.length,
    rps: Math.round(total / elapsedSec),
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
  };
}

// ===================== 场景实现 =====================

/** 场景 3：事件循环阻塞量化 */
async function blockingScenario(baseUrl) {
  // 稳态 RTT（10 次顺序请求取中位数）
  const steady = [];
  for (let i = 0; i < 10; i++) {
    const r = await timedRequest(`${baseUrl}/api/health`);
    if (r.status === 200) steady.push(r.latencyMs);
  }
  steady.sort((a, b) => a - b);
  const steadyMedian = Math.round(steady[Math.floor(steady.length / 2)]);

  // 发出慢请求（refresh=true 强制绕过缓存 → 同步全仓扫描 1~3s），不等待
  const slowUrl = `${baseUrl}/api/semantic/map?refresh=true`;
  const slowPromise = timedRequest(slowUrl);

  // 等 150ms（确保请求已进入同步扫描阶段），再测阻塞期的 health 延迟
  await new Promise((r) => setTimeout(r, BLOCKING_WAIT_MS));
  const during = [];
  for (let i = 0; i < BLOCKING_SAMPLES; i++) {
    const r = await timedRequest(`${baseUrl}/api/health`);
    during.push(r.latencyMs);
  }

  const slowResult = await slowPromise;
  during.sort((a, b) => a - b);

  return {
    steadyMedianMs: steadyMedian,
    /** 阻塞期间最差延迟（health 本应 ~1ms） */
    blockedMaxMs: Math.round(during[during.length - 1] || 0),
    /** 慢请求总耗时 */
    slowRequestMs: Math.round(slowResult.latencyMs),
  };
}

/** 场景 4：限流突发（独立实例，限流开启） */
async function rateLimitBurstScenario(baseUrl) {
  const results = [];
  // 顺序快速发 40 个 POST /api/chat（空 body，业务结果不重要，只看状态码）
  for (let i = 0; i < BURST_TOTAL; i++) {
    const r = await timedRequest(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'load-test' }),
    });
    results.push(r.status);
  }
  const count429 = results.filter((s) => s === 429).length;
  return {
    burst: BURST_TOTAL,
    count429,
    /** 限流配额（预期 429 数量 ≈ burst - costly 配额） */
    costlyMax: COSTLY_MAX,
    statusSummary: results.reduce((acc, s) => {
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {}),
  };
}

// ===================== 主流程 =====================

async function main() {
  if (!existsServer()) {
    log.error('server dist 不存在 —— 请先构建：cd packages/server && npx tsup');
    process.exit(1);
  }

  const report = { startedAt: new Date().toISOString(), scenarios: {} };

  // ── 实例 A：限流关闭（吞吐与阻塞场景）──
  const portA = await getRandomPort();
  const baseUrlA = `http://127.0.0.1:${portA}`;
  log.info(`启动实例 A（限流关闭）端口 ${portA} ...`);
  const serverA = spawnServer(portA, true);
  try {
    await waitHealthy(baseUrlA);

    log.info('▶ 场景 1/4：health 吞吐基线 ...');
    report.scenarios.healthThroughput = await throughputScenario(
      'health-throughput',
      `${baseUrlA}/api/health`,
      THROUGHPUT_CONCURRENCY,
      THROUGHPUT_TOTAL,
    );

    log.info('▶ 场景 2/4：sessions 并发读（SQLite 路径）...');
    report.scenarios.sessionsRead = await throughputScenario(
      'sessions-read',
      `${baseUrlA}/api/sessions`,
      THROUGHPUT_CONCURRENCY,
      THROUGHPUT_TOTAL,
    );

    log.info('▶ 场景 3/4：semantic/map 事件循环阻塞量化 ...');
    report.scenarios.semanticBlocking = await blockingScenario(baseUrlA);
  } finally {
    serverA.kill();
  }
  await new Promise((r) => setTimeout(r, 500));

  // ── 实例 B：限流开启（突发场景）──
  const portB = await getRandomPort();
  const baseUrlB = `http://127.0.0.1:${portB}`;
  log.info(`启动实例 B（限流开启）端口 ${portB} ...`);
  const serverB = spawnServer(portB, false);
  try {
    await waitHealthy(baseUrlB);
    log.info('▶ 场景 4/4：chat 突发限流验证 ...');
    report.scenarios.rateLimitBurst = await rateLimitBurstScenario(baseUrlB);
  } finally {
    serverB.kill();
  }

  // ── 报告 ──
  printReport(report);

  // 结果落盘（诊断用）
  mkdirSync(join(process.cwd(), 'benchmarks'), { recursive: true });
  writeFileSync(RESULT_FILE, JSON.stringify(report, null, 2) + '\n', 'utf8');
  log.info(`结果已写入 ${RESULT_FILE}`);
}

/** 判断 server dist 是否存在 */
function existsServer() {
  return existsSync(SERVER_ENTRY);
}

/** 打印人类可读报告与判定 */
function printReport(report) {
  const s = report.scenarios;
  const line = '─'.repeat(70);

  console.log(`\n${'═'.repeat(70)}`);
  console.log('EasyAgent 轻量压力测试报告');
  console.log('═'.repeat(70));

  const h = s.healthThroughput;
  console.log(`\n[1] health 吞吐（并发${h.concurrency}×${h.total}）`);
  console.log(
    `    ${h.rps} req/s · p50=${h.p50}ms p95=${h.p95}ms p99=${h.p99}ms · 错误 ${h.errors}`,
  );

  const ss = s.sessionsRead;
  console.log(`\n[2] sessions 并发读（SQLite 路径）`);
  console.log(
    `    ${ss.rps} req/s · p50=${ss.p50}ms p95=${ss.p95}ms p99=${ss.p99}ms · 错误 ${ss.errors}`,
  );

  const b = s.semanticBlocking;
  const blockedRatio = b.steadyMedianMs > 0 ? (b.blockedMaxMs / b.steadyMedianMs).toFixed(0) : '∞';
  console.log(`\n[3] semantic/map 事件循环阻塞量化`);
  console.log(`    稳态 health 中位 ${b.steadyMedianMs}ms · 慢请求耗时 ${b.slowRequestMs}ms`);
  console.log(`    慢请求在飞期间 health 最差延迟 ${b.blockedMaxMs}ms（${blockedRatio}× 稳态）`);
  if (b.blockedMaxMs > 1000) {
    console.log(
      '    ⚠️ 判定：存在明显事件循环阻塞 —— 1 个 semantic/map 请求会冻结所有并发请求。\n' +
        '       建议：改为「202 + 后台计算」或迁移 worker 线程（当前 60s 路由缓存已缓解重复请求）',
    );
  } else {
    console.log('    ✅ 判定：阻塞可接受（<1s）');
  }

  const r = s.rateLimitBurst;
  const expected429 = Math.max(0, r.burst - r.costlyMax);
  console.log(`\n[4] chat 突发限流（${r.burst} 发，costly 配额 ${r.costlyMax}/min）`);
  console.log(`    状态分布: ${JSON.stringify(r.statusSummary)}`);
  if (r.count429 >= expected429 * 0.8) {
    console.log(
      `    ✅ 判定：429 正确触发（${r.count429} 次，预期 ≥${Math.floor(expected429 * 0.8)}）`,
    );
  } else {
    console.log(
      `    ❌ 判定：429 未按预期触发（${r.count429} 次，预期 ≥${Math.floor(expected429 * 0.8)}）—— 限流器可能失效`,
    );
  }

  console.log(`\n${'═'.repeat(70)}\n`);
}

main().catch((err) => {
  log.error(`压测脚本异常: ${err.message}\n${err.stack}`);
  process.exit(1);
});
