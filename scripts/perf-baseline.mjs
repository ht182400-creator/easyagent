/**
 * 性能基线测量与回归检查（P1-7）
 *
 * ── 用法 ──
 *   node scripts/perf-baseline.mjs --write   # 测量并写入 benchmarks/baseline.json（建基线）
 *   node scripts/perf-baseline.mjs           # 测量并与基线比对（CI 回归检查）
 *
 * ── 指标 ──
 *   1. startupMs        服务端冷启动到 /api/health 首次 200 的耗时（3 次取中位数）
 *   2. healthRttMs      /api/health 稳态往返延迟（5 次取最小值，排除调度噪声）
 *   3. toolSchemaTokens 内置工具全部定义（schema+描述）的 token 估算（复用 core 的估算器）
 *   4. tokenPerTask     一次任务的 token 消耗 —— **需要真实 provider key**，CI 不可得，
 *                       固定记录 null 并注明；由本地 `pnpm benchmark` 跑出后人工补录
 *
 * ── 回归判定（CI 检查模式）──
 *   劣化 >20%  → 告警（GitHub ::warning::，不阻断）
 *   劣化 >50%  → 失败（退出码 1，阻断）
 *   startupMs 波动天然较大（进程调度/磁盘），已用中位数 + 独立宽容档（40%/80%）压噪声。
 *
 * 退出码：0 = 通过/告警/跳过（无基线）；1 = 失败。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('perf-baseline');

// ===================== 常量 =====================

/** 基线文件路径（提交进仓库，作为回归比对基准） */
const BASELINE_FILE = join(process.cwd(), 'benchmarks', 'baseline.json');

/** 服务端入口（dist 产物） */
const SERVER_ENTRY = join(process.cwd(), 'packages', 'server', 'dist', 'index.js');

/** 单次启动测量的健康检查总超时 */
const BOOT_TIMEOUT_MS = 60_000;

/** 启动测量轮询间隔（毫秒，越小测得越准） */
const BOOT_POLL_MS = 50;

/** 启动耗时测量次数（取中位数压噪声） */
const BOOT_TRIALS = 3;

/** 稳态延迟采样次数（取最小值） */
const RTT_SAMPLES = 5;

/** 一般指标告警阈值（劣化百分比） */
const WARN_PCT = 20;

/** 一般指标失败阈值（劣化百分比） */
const FAIL_PCT = 50;

/** startupMs 专用告警阈值（进程调度噪声大，宽容一档） */
const BOOT_WARN_PCT = 40;

/** startupMs 专用失败阈值 */
const BOOT_FAIL_PCT = 80;

/** 各指标的人类可读名 */
const METRIC_LABELS = {
  startupMs: '服务端冷启动耗时',
  healthRttMs: '/api/health 稳态延迟',
  toolSchemaTokens: '工具 schema token 占用',
};

// ===================== 工具函数 =====================

/**
 * 读取当前 git commit 短哈希（失败返回 unknown，不阻塞测量）
 */
function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * 获取随机空闲端口（避免与运行中的服务冲突）
 */
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

/**
 * 启动服务端并测量冷启动耗时（到 /api/health 首次 200）
 *
 * @returns {Promise<{startupMs: number, healthRttMs: number, child: import('node:child_process').ChildProcess}>}
 *          调用方负责 child.kill()
 */
async function measureStartupOnce(port) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', EASYAGENT_DISABLE_RATE_LIMIT: '1' },
    stdio: 'ignore',
  });

  // 子进程提前退出 = 启动失败
  const exitPromise = new Promise((_, reject) => {
    child.on('exit', (code) => reject(new Error(`服务端进程提前退出（code=${code}）`)));
  });

  const startedAt = Date.now();
  try {
    let lastError = '';
    for (;;) {
      if (Date.now() - startedAt > BOOT_TIMEOUT_MS) {
        throw new Error(`健康检查超时（${BOOT_TIMEOUT_MS / 1000}s）${lastError}`);
      }
      const t0 = Date.now();
      try {
        const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const firstOkMs = Date.now() - startedAt;
          // 稳态延迟：紧接着再采样若干次取最小（首测含连接建立，后续趋于稳态）
          let rttMin = Date.now() - t0;
          for (let i = 0; i < RTT_SAMPLES; i++) {
            const s = Date.now();
            const r = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) });
            if (r.ok) rttMin = Math.min(rttMin, Date.now() - s);
          }
          return { startupMs: firstOkMs, healthRttMs: rttMin, child };
        }
        lastError = `（上次状态码 ${res.status}）`;
      } catch (err) {
        lastError = `（${err.message}）`;
      }
      await new Promise((r) => setTimeout(r, BOOT_POLL_MS));
    }
  } catch (err) {
    child.kill();
    throw err;
  } finally {
    // race 掉 exitPromise 的 reject，避免 unhandled rejection
    exitPromise.catch(() => {});
  }
}

/**
 * 测量全部性能指标
 */
async function measureAll() {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error('server dist 不存在 —— 请先构建：cd packages/server && npx tsup');
  }

  // ── 1+2. 启动耗时 / 稳态延迟（多轮取中位数）──
  const startups = [];
  const rtts = [];
  for (let i = 0; i < BOOT_TRIALS; i++) {
    const port = await getRandomPort();
    const { startupMs, healthRttMs, child } = await measureStartupOnce(port);
    startups.push(startupMs);
    rtts.push(healthRttMs);
    child.kill();
    // 给端口释放留一点时间
    await new Promise((r) => setTimeout(r, 300));
    log.info(`启动测量 #${i + 1}: startup=${startupMs}ms rtt=${healthRttMs}ms`);
  }

  // ── 3. 工具 schema token（复用 core 的估算器，与 measure-context 口径一致）──
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
  const coreRequire = createRequire(pathToFileURL(join(process.cwd(), 'packages', 'core', 'dist', 'index.js')).href);
  const core = await import(pathToFileURL(join(process.cwd(), 'packages', 'core', 'dist', 'index.js')).href);
  const registry = new core.ToolRegistry();
  registry.registerAll(core.getAllBuiltinTools());
  const toolDefs = registry.getDefinitions();
  const toolSchemaTokens = core.estimateToolDefinitionsTokens(toolDefs);

  // 中位数（奇数轮直接取中间值）
  const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];

  return {
    updatedAt: new Date().toISOString(),
    commit: readGitCommit(),
    env: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
    },
    metrics: {
      /** 服务端冷启动（3 轮中位数） */
      startupMs: median(startups),
      /** /api/health 稳态 RTT（多轮中位数） */
      healthRttMs: median(rtts),
      /** 内置工具定义 token 估算 */
      toolSchemaTokens,
      /** 单任务 token 消耗：需要真实 provider key，CI 不可得，留待 benchmark 运行补录 */
      tokenPerTask: null,
    },
    notes: {
      tokenPerTask: '需要 provider key；本地 pnpm benchmark 跑出后人工补录',
      method: 'startupMs/healthRttMs 为多次测量中位数；toolSchemaTokens 复用 core estimateToolDefinitionsTokens',
    },
  };
}

// ===================== 回归检查 =====================

/**
 * 比对当前测量与基线
 *
 * @returns {boolean} 是否通过（告警也算通过）
 */
function checkAgainstBaseline(current, baseline) {
  let ok = true;
  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const base = baseline.metrics[key];
    const now = current.metrics[key];
    if (typeof base !== 'number' || typeof now !== 'number') continue; // null（如 tokenPerTask）跳过
    if (base === 0) {
      // 基线为 0（如亚毫秒 RTT）时百分比无意义，仅报告绝对值
      log.info(`✅ ${label}: ${now} vs 基线 0（亚毫秒级，百分比无意义，跳过比对）`);
      continue;
    }

    // startup 用宽容档，其余用标准档
    const [warnPct, failPct] =
      key === 'startupMs' ? [BOOT_WARN_PCT, BOOT_FAIL_PCT] : [WARN_PCT, FAIL_PCT];

    const deltaPct = ((now - base) / base) * 100;
    const line = `${label}: ${now} vs 基线 ${base}（${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%）`;

    if (deltaPct > failPct) {
      log.error(`❌ [FAIL] ${line} — 劣化超过 ${failPct}%，请排查后重建基线`);
      ok = false;
    } else if (deltaPct > warnPct) {
      log.warn(`⚠️ [WARN] ${line} — 劣化超过 ${warnPct}%`);
      // GitHub Actions 注解（windows runner 上无效但无副作用）
      console.log(`::warning::性能回归 ${label} 劣化 ${deltaPct.toFixed(1)}%（基线 ${base} → ${now}）`);
    } else {
      log.info(`✅ ${line}`);
    }
  }
  return ok;
}

// ===================== 入口 =====================

const writeMode = process.argv.includes('--write');

try {
  const current = await measureAll();

  if (writeMode) {
    mkdirSync(join(process.cwd(), 'benchmarks'), { recursive: true });
    writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + '\n', 'utf8');
    log.info(`✅ 基线已写入 ${BASELINE_FILE}`);
    log.info(JSON.stringify(current.metrics));
    process.exit(0);
  }

  if (!existsSync(BASELINE_FILE)) {
    log.warn('基线文件不存在，跳过回归检查（请先运行 pnpm bench:baseline 建立基线）');
    console.log('__VERIFY_STATUS__=SKIP');
    process.exit(0);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  log.info(`与基线比对（基线 commit=${baseline.commit}，当前 commit=${current.commit}）`);
  const ok = checkAgainstBaseline(current, baseline);
  console.log(ok ? '__VERIFY_STATUS__=PASS' : '__VERIFY_STATUS__=FAIL');
  process.exit(ok ? 0 : 1);
} catch (err) {
  log.error(`性能基线脚本异常: ${err.message}\n${err.stack}`);
  console.log('__VERIFY_STATUS__=FAIL');
  process.exit(1);
}
