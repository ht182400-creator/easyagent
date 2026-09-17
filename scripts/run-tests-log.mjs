#!/usr/bin/env node
/**
 * run-tests-log.mjs — EasyAgent 统一回归测试运行器 + 分级测试日志
 *
 * ── 为什么需要它 ──
 * 此前测试输出被打到 `temp/`（gitignore，等同临时文件）或散落在各包目录
 * （如 `packages/frontend/vitest_*.txt`），导致：
 *   1. 测试日志不是"项目资产"，无法追溯历史回归；
 *   2. 失败用例没有统一的位置可查，只能翻控制台。
 * 本脚本把测试日志作为**项目内的持久资产**产出到 `logs/test-logs/`。
 *
 * ── 产物（每次运行一个时间戳目录，互不覆盖）──
 *   logs/test-logs/<YYYY-MM-DD_HHmmss>_<范围>/
 *     ├── 回归测试.log     分层文本日志（分级 + 失败标注，可 grep）
 *     ├── 回归测试.html    可视化报告（失败标红，浏览器打开）
 *     ├── summary.json     机器可读汇总（供 CI / 管线消费）
 *     └── raw/<包名>.log   各包 vitest 原始输出（完整保留，便于细查）
 *
 * ── 分级规则 ──
 *   [TRACE] 仅 EASYAGENT_DEBUG=1 时输出（逐用例明细）
 *   [DEBUG] 命令、耗时、JSON 报告路径等排障信息
 *   [INFO ] 关键状态变更（包开始/结束、汇总数字）
 *   [WARN ] 可恢复异常（跳过用例、缺失 JSON 报告等）
 *   [ERROR] 不可恢复（失败用例、包执行崩溃）—— 文件名与报告中标红
 *
 * ── 用法 ──
 *   node scripts/run-tests-log.mjs                    # 全量
 *   node scripts/run-tests-log.mjs --only core,server # 指定包
 *   node scripts/run-tests-log.mjs --scope 冒烟       # 自定义范围名（进文件名）
 *   $env:EASYAGENT_DEBUG=1; node scripts/run-tests-log.mjs  # 打开 TRACE/DEBUG
 *
 * 退出码：0 = 全部通过；1 = 存在失败用例或包执行异常（可安全用于 CI 门禁）
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './lib/logger.mjs';

// ===================== 常量（禁止在业务逻辑中裸写） =====================

/** 项目根目录（本脚本位于 <root>/scripts/） */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 测试日志根目录（项目内，不使用系统临时目录） */
const LOG_ROOT = join(PROJECT_ROOT, 'logs', 'test-logs');

/** 管线 JSON 报告输出目录（由各包 vitest.config.ts 约定） */
const PIPELINE_DIR = join(PROJECT_ROOT, 'docs', 'pipeline');

/** 被纳入统一回归的包清单 */
const PACKAGES = [
  { name: 'core', dir: 'packages/core', label: '核心引擎' },
  { name: 'server', dir: 'packages/server', label: '服务端' },
  { name: 'frontend', dir: 'packages/frontend', label: '前端共享包' },
  { name: 'desktop', dir: 'packages/desktop', label: '桌面端' },
  { name: 'langgraph', dir: 'packages/langgraph', label: 'LangGraph 引擎' },
  { name: 'web', dir: 'packages/web', label: 'Web 壳' },
];

/** RAW 输出保留的最多行数（防止单包日志过大；完整内容另存 raw/ 目录） */
const CONSOLE_TAIL_LINES = 120;

/** 子进程输出缓冲上限（core 包输出可达数百 KB） */
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/** 单包测试超时（毫秒）：server 包实测 ~32s，留足余量 */
const PACKAGE_TIMEOUT_MS = 20 * 60 * 1000;

/** ANSI 颜色（控制台标红用） */
const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/** 日志级别定义（与 scripts/lib/logger.mjs 保持一致） */
const LEVELS = { TRACE: 0, DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

// ===================== 日志基础设施 =====================

const consoleLog = createLogger('test-runner');

/** 依据环境变量解析最小日志级别（LOG_LEVEL > EASYAGENT_DEBUG > INFO） */
function resolveMinLevel() {
  const env = (process.env.LOG_LEVEL || '').toLowerCase();
  if (env && env.toUpperCase() in LEVELS) return LEVELS[env.toUpperCase()];
  if (process.env.EASYAGENT_DEBUG === '1' || process.env.EASYAGENT_DEBUG === 'true') {
    return LEVELS.DEBUG;
  }
  return LEVELS.INFO;
}

/** 毫秒级时间戳：YYYY-MM-DD HH:mm:ss.SSS */
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  );
}

/** 文件名用紧凑时间戳：YYYY-MM-DD_HHmmss */
function stampCompact() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/**
 * 双通道日志器：同时写控制台（带颜色）与文件（带毫秒时间戳）
 * 之所以自建而非直接用 logger.mjs：logger.mjs 只输出到控制台，
 * 而测试日志必须**落盘为项目资产**。
 */
function createTeeLogger(scope) {
  const minLevel = resolveMinLevel();
  const lines = [];

  /**
   * 内部写入：level 为 LEVELS 的键
   *
   * ── 关键设计：文件与控制台的过滤级别**故意不同** ──
   * · 文件：记录**全部**级别（含 DEBUG/TRACE），保证事后可完整回溯
   *   （"当时到底发生了什么"必须查得到，这正是此前缺失的能力）；
   * · 控制台：只输出 >= minLevel 的行，保持日常使用清爽不刷屏。
   * 若文件也按 minLevel 过滤，一旦有人不设 EASYAGENT_DEBUG，日志就永久丢细节。
   */
  function write(level, message) {
    lines.push(`[${stamp()}] [${level.padEnd(5)}] [${scope}] ${message}`);

    if (LEVELS[level] < minLevel) return; // 控制台按级别过滤

    // 控制台镜像：ERROR 标红，WARN 标黄
    const colored =
      level === 'ERROR'
        ? `${ANSI.red}${message}${ANSI.reset}`
        : level === 'WARN'
          ? `${ANSI.yellow}${message}${ANSI.reset}`
          : message;
    if (level === 'ERROR') consoleLog.error(colored);
    else if (level === 'WARN') consoleLog.warn(colored);
    else if (level === 'DEBUG' || level === 'TRACE') consoleLog.debug(colored);
    else consoleLog.info(colored);
  }

  return {
    trace: (m) => write('TRACE', m),
    debug: (m) => write('DEBUG', m),
    info: (m) => write('INFO', m),
    warn: (m) => write('WARN', m),
    error: (m) => write('ERROR', m),
    /** 直接追加原始多行文本（不参与级别过滤，用于嵌入 vitest 输出） */
    raw: (text) => {
      for (const line of String(text).split('\n')) lines.push(line);
    },
    /** 取回全部已写入的行 */
    lines: () => lines,
  };
}

// ===================== 命令行参数 =====================

/** 极简参数解析：--only a,b / --scope xxx / --help */
function parseArgs(argv) {
  const opts = { only: null, scope: '全量' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') opts.only = (argv[++i] || '').split(',').map((s) => s.trim());
    else if (a === '--scope') opts.scope = argv[++i] || '自定义';
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

const USAGE = `
EasyAgent 统一回归测试运行器

  node scripts/run-tests-log.mjs [选项]

选项:
  --only <包名,包名>   仅运行指定包（可选: ${PACKAGES.map((p) => p.name).join(', ')}）
  --scope <名称>       自定义范围名，会出现在日志文件名中
  -h, --help           显示本帮助

日志输出目录: logs/test-logs/<日期>_<时间>_<范围>/
  回归测试.log     分层文本日志（失败可 grep "FAIL"）
  回归测试.html    可视化报告（失败标红）
  summary.json     机器可读汇总
  raw/<包名>.log   各包 vitest 原始输出
`.trim();

// ===================== 结果解析 =====================

/**
 * 读取某包的 vitest JSON 报告并归一化为统一结构
 * @param {string} pkgName 包名（对应 docs/pipeline/_vitest-<pkg>.json）
 * @returns {{tests:number,passed:number,failed:number,skipped:number,failures:Array}|null}
 */
function readJsonReport(pkgName) {
  const file = join(PIPELINE_DIR, `_vitest-${pkgName}.json`);
  try {
    if (!existsSync(file)) return null;
    const j = JSON.parse(readFileSync(file, 'utf-8'));
    const failures = [];
    for (const tr of j.testResults || []) {
      for (const a of tr.assertionResults || []) {
        if (a.status === 'failed') {
          failures.push({
            file: tr.name ? tr.name.split(/[\\/]/).slice(-2).join('/') : '(unknown)',
            fullName: a.fullName || a.title || '(未命名用例)',
            messages: (a.failureMessages || []).join('\n').split('\n').slice(0, 12).join('\n'),
          });
        }
      }
    }
    return {
      tests: j.numTotalTests || 0,
      passed: j.numPassedTests || 0,
      failed: j.numFailedTests || 0,
      skipped: j.numPendingTests || 0,
      failures,
    };
  } catch (err) {
    consoleLog.warn(`解析 ${pkgName} 的 JSON 报告失败: ${err.message}`);
    return null;
  }
}

/** 从控制台文本兜底提取统计（JSON 报告缺失时使用） */
function parseStatsFromText(text) {
  const m = text.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(?:(\d+)\s+passed)?/);
  if (!m) return null;
  return { failed: Number(m[1] || 0), passed: Number(m[2] || 0) };
}

// ===================== 主流程 =====================

/**
 * 运行单个包的测试，返回归一化结果
 * @param {{name:string,dir:string,label:string}} pkg
 * @param {ReturnType<createTeeLogger>} log
 * @param {string} runDir 本次运行的产物目录
 */
function runPackage(pkg, log, runDir) {
  const cwd = join(PROJECT_ROOT, pkg.dir);
  const rawFile = join(runDir, 'raw', `${pkg.name}.log`);
  const startedAt = Date.now();

  log.info(`▶ 开始测试 [${pkg.name}] ${pkg.label} — 工作目录 ${pkg.dir}`);
  log.debug(`执行命令: npx vitest run  (timeout=${PACKAGE_TIMEOUT_MS}ms)`);

  let result;
  try {
    result = spawnSync('npx', ['vitest', 'run'], {
      cwd,
      shell: true,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES,
      timeout: PACKAGE_TIMEOUT_MS,
    });
  } catch (err) {
    log.error(`[${pkg.name}] 子进程启动异常: ${err.message}`);
    return { pkg: pkg.name, label: pkg.label, status: 'crash', error: err.message };
  }

  const elapsedMs = Date.now() - startedAt;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const combined = `${stdout}\n${stderr}`;

  // 原始输出完整落盘（这是"可细查"的兜底）
  try {
    mkdirSync(dirname(rawFile), { recursive: true });
    writeFileSync(rawFile, combined, 'utf-8');
  } catch (err) {
    log.warn(`[${pkg.name}] 原始输出落盘失败: ${err.message}`);
  }

  // 优先用 JSON 报告（结构化、可提取失败用例名）
  let stats = readJsonReport(pkg.name);
  let degraded = false;
  if (!stats) {
    const fallback = parseStatsFromText(combined);
    stats = fallback
      ? { tests: fallback.passed + fallback.failed, passed: fallback.passed, failed: fallback.failed, skipped: 0, failures: [] }
      : { tests: 0, passed: 0, failed: 0, skipped: 0, failures: [] };
    degraded = true;
    log.warn(`[${pkg.name}] 未找到可用 JSON 报告，已降级为文本解析（失败用例名可能缺失）`);
  }

  log.debug(
    `[${pkg.name}] exit=${result.status} 耗时=${(elapsedMs / 1000).toFixed(1)}s ` +
      `用例=${stats.tests} 通过=${stats.passed} 失败=${stats.failed} 跳过=${stats.skipped}`,
  );

  // 失败用例逐条按 ERROR 级别输出（控制台标红 + 文件中可 grep）
  if (stats.failed > 0) {
    log.error(`[${pkg.name}] 存在 ${stats.failed} 个失败用例：`);
    for (const f of stats.failures) {
      log.error(`  ✗ ${f.file} :: ${f.fullName}`);
    }
    if (stats.failures.length === 0) {
      log.error('  （失败用例名缺失，请查看 raw/' + pkg.name + '.log）');
    }
  }
  if (stats.skipped > 0) log.warn(`[${pkg.name}] 有 ${stats.skipped} 个用例被跳过（skipped）`);

  const ok = stats.failed === 0 && result.status === 0;
  log.info(
    `${ok ? '✅' : '❌'} 结束测试 [${pkg.name}] 耗时 ${(elapsedMs / 1000).toFixed(1)}s — ` +
      `${stats.passed}/${stats.tests} 通过` + (stats.failed ? `，${stats.failed} 失败` : ''),
  );

  return {
    pkg: pkg.name,
    label: pkg.label,
    status: ok ? 'pass' : stats.failed > 0 ? 'fail' : 'error',
    exitCode: result.status,
    elapsedMs,
    degraded,
    tests: stats.tests,
    passed: stats.passed,
    failed: stats.failed,
    skipped: stats.skipped,
    failures: stats.failures,
    consoleTail: stdout.split('\n').slice(-CONSOLE_TAIL_LINES).join('\n'),
  };
}

/** 生成 HTML 报告（失败标红） */
function renderHtml(meta, results) {
  const esc = (s) =>
    String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const total = results.reduce((a, r) => a + (r.tests || 0), 0);
  const failed = results.reduce((a, r) => a + (r.failed || 0), 0);
  const skipped = results.reduce((a, r) => a + (r.skipped || 0), 0);
  const passed = results.reduce((a, r) => a + (r.passed || 0), 0);
  const allOk = failed === 0 && results.every((r) => r.status === 'pass');

  const rows = results
    .map(
      (r) => `<tr class="${r.status === 'pass' ? 'ok' : 'fail'}">
  <td>${esc(r.pkg)}</td><td>${esc(r.label)}</td>
  <td>${r.status === 'pass' ? '✅ 通过' : '❌ ' + (r.failed ? r.failed + ' 失败' : '执行异常')}</td>
  <td>${r.tests ?? '-'}</td><td>${r.passed ?? '-'}</td>
  <td class="${r.failed ? 'red bold' : ''}">${r.failed ?? '-'}</td>
  <td>${r.skipped ?? '-'}</td>
  <td>${r.elapsedMs ? (r.elapsedMs / 1000).toFixed(1) + 's' : '-'}</td>
</tr>`,
    )
    .join('\n');

  const failureBlocks = results
    .filter((r) => r.failures && r.failures.length)
    .map(
      (r) => `<h3 class="red">❌ ${esc(r.pkg)}（${r.failures.length} 个失败用例）</h3>
${r.failures
  .map(
    (f) => `<div class="case">
  <div class="case-title">${esc(f.file)} :: ${esc(f.fullName)}</div>
  ${f.messages ? `<pre class="msg">${esc(f.messages)}</pre>` : ''}
</div>`,
  )
  .join('\n')}`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>EasyAgent 回归测试报告 — ${esc(meta.timestamp)}</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--bd:#30363d;--fg:#e6edf3;--dim:#8b949e;
      --red:#f85149;--green:#3fb950;--amber:#d29922}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--fg);
     font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
h1{font-size:20px;margin:0 0 4px}
h3{font-size:15px;margin:24px 0 8px}
.meta{color:var(--dim);font-size:12px;margin-bottom:20px}
.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:8px;
      padding:12px 18px;min-width:120px}
.card .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px}
.card .v{font-size:22px;font-weight:600;margin-top:2px}
.card.bad .v{color:var(--red)}
.card.good .v{color:var(--green)}
table{width:100%;border-collapse:collapse;background:var(--card);
      border:1px solid var(--bd);border-radius:8px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--bd);font-size:13px}
th{background:#1c2128;color:var(--dim);font-weight:600}
tr.fail td{background:rgba(248,81,73,.08)}
.red{color:var(--red)}.bold{font-weight:700}.ok td:nth-child(3){color:var(--green)}
.case{background:var(--card);border:1px solid var(--bd);border-left:3px solid var(--red);
      border-radius:6px;padding:10px 14px;margin-bottom:10px}
.case-title{font-weight:600;margin-bottom:6px}
pre.msg{margin:0;padding:8px;background:#0b0f14;border-radius:4px;overflow-x:auto;
        color:#ffa198;font-size:12px;white-space:pre-wrap}
details{margin-top:12px}summary{cursor:pointer;color:var(--dim)}
pre.tail{background:#0b0f14;padding:10px;border-radius:6px;overflow-x:auto;
         font-size:11.5px;color:var(--dim);max-height:320px}
.foot{margin-top:28px;color:var(--dim);font-size:12px}
</style></head><body>
<h1>EasyAgent 回归测试报告</h1>
<div class="meta">
  运行时间：${esc(meta.timestamp)} ・ 范围：${esc(meta.scope)} ・
  Node：${esc(meta.nodeVersion)} ・ 提交：${esc(meta.gitCommit)} ・
  耗时：${(meta.elapsedMs / 1000).toFixed(1)}s ・ 结论：<span class="${allOk ? '' : 'red bold'}">${allOk ? '✅ 全部通过' : '❌ 存在失败'}</span>
</div>

<div class="cards">
  <div class="card"><div class="k">用例总数</div><div class="v">${total}</div></div>
  <div class="card good"><div class="k">通过</div><div class="v">${passed}</div></div>
  <div class="card ${failed ? 'bad' : ''}"><div class="k">失败</div><div class="v">${failed}</div></div>
  <div class="card"><div class="k">跳过</div><div class="v">${skipped}</div></div>
</div>

<table>
<thead><tr><th>包</th><th>说明</th><th>结果</th><th>用例</th><th>通过</th><th>失败</th><th>跳过</th><th>耗时</th></tr></thead>
<tbody>
${rows}
</tbody></table>

${failureBlocks || '<h3 style="color:var(--green)">✅ 无失败用例</h3>'}

<h3>各包控制台输出（尾部 ${CONSOLE_TAIL_LINES} 行）</h3>
${results
  .map(
    (r) => `<details><summary>${esc(r.pkg)} — ${esc(r.label)}</summary>
<pre class="tail">${esc(r.consoleTail || '(无输出)')}</pre></details>`,
  )
  .join('\n')}

<div class="foot">由 <code>scripts/run-tests-log.mjs</code> 生成 ・ 原始输出见同目录 <code>raw/</code></div>
</body></html>`;
}

/** 读取 git 当前短提交（失败则返回 unknown，不影响主流程） */
function readGitCommit() {
  try {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: PROJECT_ROOT,
      shell: true,
      encoding: 'utf8',
    });
    return (r.stdout || '').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/** 入口 */
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const selected = opts.only
    ? PACKAGES.filter((p) => opts.only.includes(p.name))
    : PACKAGES;
  if (selected.length === 0) {
    console.error(`未匹配到任何包，可选: ${PACKAGES.map((p) => p.name).join(', ')}`);
    return 1;
  }

  const compact = stampCompact();
  const runDir = join(LOG_ROOT, `${compact}_${opts.scope}`);
  const log = createTeeLogger('test-runner');
  const startedAt = Date.now();

  try {
    mkdirSync(join(runDir, 'raw'), { recursive: true });
  } catch (err) {
    // 日志目录不可写属于致命错误，但要给出可操作的提示
    console.error(`${ANSI.red}无法创建日志目录 ${runDir}: ${err.message}${ANSI.reset}`);
    return 1;
  }

  const gitCommit = readGitCommit();
  log.info('='.repeat(78));
  log.info(`EasyAgent 回归测试开始 — 范围: ${opts.scope}（${selected.map((p) => p.name).join(', ')}）`);
  log.info(`时间: ${stamp()}  提交: ${gitCommit}  Node: ${process.version}`);
  log.info(`日志目录: ${runDir}`);
  log.info('='.repeat(78));

  const results = [];
  for (const pkg of selected) {
    try {
      results.push(runPackage(pkg, log, runDir));
    } catch (err) {
      // 单包异常不应中断整体回归
      log.error(`[${pkg.name}] 运行过程中抛出未捕获异常: ${err.message}`);
      results.push({ pkg: pkg.name, label: pkg.label, status: 'crash', error: err.message, failures: [] });
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const total = results.reduce((a, r) => a + (r.tests || 0), 0);
  const passed = results.reduce((a, r) => a + (r.passed || 0), 0);
  const failed = results.reduce((a, r) => a + (r.failed || 0), 0);
  const skipped = results.reduce((a, r) => a + (r.skipped || 0), 0);
  const allOk = failed === 0 && results.every((r) => r.status === 'pass');

  log.info('-'.repeat(78));
  log.info(`汇总: ${total} 用例 / ${passed} 通过 / ${failed} 失败 / ${skipped} 跳过 / 耗时 ${(elapsedMs / 1000).toFixed(1)}s`);
  for (const r of results) {
    const line = `${r.pkg.padEnd(10)} ${r.status === 'pass' ? '✅ 通过' : '❌ 失败'}  ${r.passed ?? '-'}/${r.tests ?? '-'}`;
    if (r.status === 'pass') log.info(line);
    else log.error(line);
  }
  log.info(allOk ? '✅ 结论: 全部通过' : '❌ 结论: 存在失败，请查看下方明细与 HTML 报告');
  log.info('-'.repeat(78));

  // ---- 落盘三件套 ----
  const meta = {
    timestamp: stamp(),
    scope: opts.scope,
    packages: selected.map((p) => p.name),
    elapsedMs,
    nodeVersion: process.version,
    gitCommit,
    totals: { tests: total, passed, failed, skipped },
    allOk,
  };

  let logPath = '';
  let htmlPath = '';
  let jsonPath = '';
  try {
    logPath = join(runDir, '回归测试.log');
    writeFileSync(logPath, log.lines().join('\n') + '\n', 'utf-8');

    htmlPath = join(runDir, '回归测试.html');
    writeFileSync(htmlPath, renderHtml(meta, results), 'utf-8');

    jsonPath = join(runDir, 'summary.json');
    writeFileSync(jsonPath, JSON.stringify({ meta, results }, null, 2), 'utf-8');

    log.info(`文本日志: ${logPath}`);
    log.info(`HTML 报告: ${htmlPath}`);
    log.info(`汇总 JSON: ${jsonPath}`);
  } catch (err) {
    console.error(`${ANSI.red}日志落盘失败: ${err.message}${ANSI.reset}`);
    return 1;
  }

  return allOk ? 0 : 1;
}

process.exit(main());
