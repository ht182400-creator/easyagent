#!/usr/bin/env node
/**
 * SWE-Bench CLI 入口 —— EasyAgent 代码质量评测
 *
 * 用法:
 *   node scripts/swe-bench/run-benchmark.mjs --dry-run              # 环境 + 数据集检查（不调模型）
 *   node scripts/swe-bench/run-benchmark.mjs --offline              # 离线自测（不调模型，验证全流程）
 *   node scripts/swe-bench/run-benchmark.mjs --provider deepseek --model deepseek-v4   # 真实评测
 *   node scripts/swe-bench/run-benchmark.mjs --generate-readme      # 查看最新一次结果摘要
 *
 * ── 2026-09-19 修复的四处硬伤（真评测此前根本跑不起来）──
 *   ① 动态导入路径错误：曾 import `dist/benchmark/BenchmarkRunner.js`，而 tsup 的 entry
 *      里没有 benchmark → 该路径**永不存在**（Runner 实际被内联进 `dist/index.js` 并导出）
 *   ② Windows 下 `import('D:\\...')` 会被当作 `c:` 协议 → 必须 `pathToFileURL()`
 *   ③ `--dry-run` 是假通过：只检查 `dist/index.js` 是否存在、且用自己的宽松解析器读数据集，
 *      于是"环境检查通过（10 题）"与"真跑 0 题"长期并存。现在改为**真实加载核心包 + 真实引擎读数据**
 *   ④ 退出码恒为 0：环境不满足也静默成功。现在失败即 exit 1
 *
 * ── 口径声明（勿删）──
 *   当前评测的评分是**结构化启发式**（代码块非空 + 括号配对 + 含 export/function/class），
 *   **不执行测试用例**，因此 pass@k 不等于"通过测试"。对外**不得**声称 SWE-bench Verified 分数。
 *   详见 docs/77_SWE-bench评测现状与离线自测方案.md
 *
 * 约定：诊断/状态走 `scripts/lib/logger.mjs`；报告正文与表格用 console.log 直接输出
 *      （与 perf-baseline.mjs / load-test.mjs 保持一致）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createLogger } from '../lib/logger.mjs';

const log = createLogger('swe-bench');

// 核心包加载后会用它自己的日志器（pino）输出，默认 info 级别会把 JSON 日志行
// 混进本 CLI 的报告输出里。这里仅在用户**未显式设置**时降级为 warn：
// 需要看核心包细节日志时用 `LOG_LEVEL=info pnpm benchmark ...` 即可恢复。
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'warn';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ===================== 常量 =====================

/** 评测入口：core 的**唯一产物入口**（BenchmarkRunner 由 tsup 内联进 dist/index.js 并导出） */
const CORE_DIST_ENTRY = path.join(PROJECT_ROOT, 'packages', 'core', 'dist', 'index.js');

/** 结果输出目录 */
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'benchmark-results');

/** 单题超时（毫秒） */
const TIMEOUT_PER_PROBLEM_MS = 120_000;

/** Node 主版本要求 */
const MIN_NODE_MAJOR = 18;
/** 已知未获完整支持的 Node 主版本（better-sqlite3 原生模块） */
const UNSUPPORTED_NODE_MAJOR = 24;

/** 默认难度过滤（空 = 全部） */
const DEFAULT_DIFFICULTY = '';

/** agentic 模式的默认轮次上限（够"读文件 → 改 → 复验"跑几轮） */
const AGENTIC_MAX_TURNS = 10;

/** 非 agentic 的轮次上限（与 core 默认一致） */
const NON_AGENTIC_MAX_TURNS = 3;

/** 单题真实测试超时（毫秒） */
const TEST_TIMEOUT_MS = 60_000;

// ===================== 参数解析 =====================

/**
 * 解析命令行参数
 *
 * @returns {{
 *   provider: string, model: string, k: number, dryRun: boolean, offline: boolean,
 *   mockAgent: boolean, allowTools: boolean, maxTurns: number, realTests: boolean,
 *   heuristic: boolean, generateReadme: boolean, datasetPath: string,
 *   maxProblems: number, difficulty: string, help: boolean
 * }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    provider: 'deepseek',
    model: 'deepseek-v4',
    k: 1,
    dryRun: false,
    offline: false,
    mockAgent: false,
    allowTools: false,
    maxTurns: 0, // 0 = 按 agentic / 非 agentic 自动选
    realTests: false,
    heuristic: false,
    keepWorkspace: false,
    generateReadme: false,
    datasetPath: '',
    maxProblems: 0,
    difficulty: DEFAULT_DIFFICULTY,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--provider':
        opts.provider = args[++i] || opts.provider;
        break;
      case '--model':
        opts.model = args[++i] || opts.model;
        break;
      case '--k':
        opts.k = parseInt(args[++i], 10) || opts.k;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--offline':
        opts.offline = true;
        break;
      case '--mock-agent':
        opts.mockAgent = true;
        break;
      case '--allow-tools':
        opts.allowTools = true;
        break;
      case '--max-turns':
        opts.maxTurns = parseInt(args[++i], 10) || 0;
        break;
      case '--real-tests':
        opts.realTests = true;
        break;
      case '--heuristic':
        opts.heuristic = true;
        break;
      case '--keep-workspace':
        opts.keepWorkspace = true;
        break;
      case '--generate-readme':
        opts.generateReadme = true;
        break;
      case '--dataset':
        opts.datasetPath = args[++i] || '';
        break;
      case '--max-problems':
        opts.maxProblems = parseInt(args[++i], 10) || 0;
        break;
      case '--difficulty':
        opts.difficulty = args[++i] || '';
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        break;
    }
  }

  return opts;
}

/**
 * 显示帮助
 */
function showHelp() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         EasyAgent SWE-Bench 评测 CLI                        ║
╚══════════════════════════════════════════════════════════════╝

用法:
  node scripts/swe-bench/run-benchmark.mjs [选项]

选项:
  --provider <name>    模型提供商 (默认: deepseek)
  --model <name>       模型名称 (默认: deepseek-v4)
  --k <number>         pass@k 的 k 值 (默认: 1)
  --dataset <path>     自定义数据集路径 (默认: 内置 benchmark-tasks.json)
  --max-problems <n>   最大评测题数 (用于快速测试)
  --difficulty <level> 按难度过滤: easy | medium | hard
  --offline            离线自测：Runner 层桩，不调用任何模型（结果不代表模型能力）
  --mock-agent         离线自测升级版：把桩下沉到 adapter 层，真实跑通 agent 轨迹
  --allow-tools        agentic 模式：允许模型调用工具（配合 --max-turns）
  --max-turns <n>      轮次上限 (默认 3；agentic 建议 10)
  --real-tests         强制真实执行：解法与 test_patch 落盘，用 vitest 实跑并核对 FAIL_TO_PASS
  --heuristic          强制启发式判定（不跑测试，仅结构检查；对照用）
  --keep-workspace     保留每题的真实执行工作区（默认"通过即清、失败保留"）
  --dry-run            检查评测环境与数据集，不实际运行
  --generate-readme    查看最新评测结果摘要
  --help, -h           显示此帮助

判定档（默认 auto）：能解析到 vitest 就真实执行，否则回退启发式并在报告中如实标注。
注意：--offline 默认走启发式判定（保持"链路自测"语义）；要跑"桩 + 真实执行"的负向对照，加 --real-tests。

示例:
  # 无 API Key 也能做
  node scripts/swe-bench/run-benchmark.mjs --dry-run                    # 环境 + 数据集检查
  node scripts/swe-bench/run-benchmark.mjs --offline                    # 链路自测（启发式判定，约 7/10）
  node scripts/swe-bench/run-benchmark.mjs --offline --real-tests        # 负向对照（预期 0 通过）
  node scripts/swe-bench/run-benchmark.mjs --mock-agent --allow-tools    # 跑通 agent 轨迹（工具 + 多轮）

  # 真实评测（需 API Key：DEEPSEEK_API_KEY / DASHSCOPE_API_KEY / ZHIPU_API_KEY，或应用内配置）
  $env:DEEPSEEK_API_KEY='sk-...'
  node scripts/swe-bench/run-benchmark.mjs --max-problems 3 --difficulty easy
  node scripts/swe-bench/run-benchmark.mjs --allow-tools --max-turns 10  # agentic 评测

⚠️ 口径：真实执行让判分变成"是否通过测试"；但提示词仍把 test_patch 作为"参考"给了模型（开卷），
   分数天然偏乐观；且它衡量的是"厂商模型 + EasyAgent 编排"的**端到端**结果，不是厂商的裸模型分数。
   详见 docs/77_SWE-bench评测现状与离线自测方案.md。
`);
}

// ===================== 核心包加载 =====================

/**
 * 加载核心包（评测的**真实**前置条件）
 *
 * 旧实现只在 CLI 里 `fs.existsSync(dist/index.js)` 判断"已编译"，并另外 import 一个
 * 不存在的 `dist/benchmark/BenchmarkRunner.js` —— 检查与使用**不是同一条路径**，
 * 于是"检查通过、真跑立刻失败"。这里改为检查即加载、加载即校验导出。
 *
 * @returns {Promise<{ok: boolean, mod?: object, error?: string}>}
 */
async function loadCore() {
  if (!fs.existsSync(CORE_DIST_ENTRY)) {
    return {
      ok: false,
      error: `核心包未编译：缺少 ${path.relative(PROJECT_ROOT, CORE_DIST_ENTRY)}，请先运行 pnpm build:core`,
    };
  }

  try {
    // ⚠️ Windows 下 import('D:\\path') 会被解析成 c: 协议（ERR_UNSUPPORTED_ESM_URL_SCHEME）
    const mod = await import(pathToFileURL(CORE_DIST_ENTRY).href);
    if (typeof mod.BenchmarkRunner !== 'function') {
      return {
        ok: false,
        error: '核心包已加载，但未导出 BenchmarkRunner（产物与 CLI 约定不一致）',
      };
    }
    return { ok: true, mod };
  } catch (err) {
    return { ok: false, error: `加载核心包失败: ${err.message}` };
  }
}

// ===================== Dry-run =====================

/**
 * Dry-run：环境 + 数据集检查（不调用任何模型）
 *
 * 三个检查项都走**真实路径**：Node 版本 / 真实加载核心包并校验导出 / 用真实引擎加载数据集。
 *
 * @param {{datasetPath: string}} opts 命令行选项
 * @param {{mod: object}} core 已加载的核心包
 * @returns {Promise<boolean>} true = 全部通过
 */
async function doDryRun(opts, core) {
  console.log('\n-- EasyAgent SWE-Bench 环境检查 --\n');
  let failed = false;

  // 1) Node 版本
  const major = parseInt(process.version.replace(/^v/, '').split('.')[0], 10);
  console.log(`  Node.js:   ${process.version}`);
  if (major < MIN_NODE_MAJOR) {
    console.log(`  X Node.js 版本过低，需要 >= ${MIN_NODE_MAJOR}.0.0`);
    failed = true;
  } else if (major >= UNSUPPORTED_NODE_MAJOR) {
    console.log(`  ! Node.js ${major}.x 当前未获完整支持（better-sqlite3 原生模块）`);
    console.log('    开发者可设置 EASYAGENT_SKIP_NODE_CHECK=1 继续');
  } else {
    console.log('  OK Node.js 版本兼容');
  }

  // 2) 核心包：真实加载 + 导出校验
  const { SWEBenchEngine, loadBuiltinDataset } = core.mod;
  console.log(`  核心包:   ${path.relative(PROJECT_ROOT, CORE_DIST_ENTRY)}`);
  if (typeof SWEBenchEngine !== 'function' || typeof loadBuiltinDataset !== 'function') {
    console.log('  X 核心包导出的评测 API 不完整（SWEBenchEngine / loadBuiltinDataset 缺失）');
    failed = true;
  } else {
    console.log('  OK 核心包已编译并导出 BenchmarkRunner / SWEBenchEngine');
  }

  // 3) 数据集：用与评测**完全同一条**加载链路（旧实现用自己的宽松解析器 → 假通过）
  const datasetPath = opts.datasetPath ? path.resolve(opts.datasetPath) : loadBuiltinDataset();
  console.log(`  数据集:   ${path.basename(datasetPath)}`);
  console.log(`  路径:     ${datasetPath}`);

  if (!fs.existsSync(datasetPath)) {
    console.log('  X 数据集文件不存在');
    failed = true;
  } else {
    const engine = new SWEBenchEngine({
      dataDir: datasetPath,
      resultsDir: OUTPUT_DIR,
      maxProblems: 0, // 0 = 不截断，统计全量
    });
    const problems = engine.loadProblems();

    if (problems.length === 0) {
      console.log('  X 数据集解析后**0 道题**（格式与加载器不匹配？见 docs/77）');
      failed = true;
    } else {
      console.log(`  题目数:   ${problems.length}`);
      console.log('  OK 数据集加载成功（经真实引擎加载，与评测同一口径）');
      const diffCount = {};
      for (const p of problems) {
        const d = p.difficulty || 'unknown';
        diffCount[d] = (diffCount[d] || 0) + 1;
      }
      console.log('  难度分布:');
      for (const [diff, count] of Object.entries(diffCount)) {
        console.log(`    - ${diff}: ${count} 题`);
      }
    }
  }

  // 4) 输出目录
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`  OK 输出目录就绪: ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}/`);

  if (failed) {
    console.log('\n  X 环境检查未通过（见上方 X 项）\n');
    return false;
  }

  console.log('\n  OK 环境检查通过！');
  console.log('  真实评测: pnpm benchmark --provider <provider> --model <model>');
  console.log('  离线自测: pnpm benchmark --offline                     # 无需 API Key');
  console.log('  轨迹自测: pnpm benchmark --mock-agent --allow-tools     # 跑通工具 + 多轮');
  console.log('  真实执行: pnpm benchmark --real-tests                   # 落盘 + vitest 判定');
  console.log('  快速测试: pnpm benchmark --max-problems 3 --difficulty easy\n');
  return true;
}

// ===================== 结果摘要 =====================

/**
 * 打印最新一次评测结果摘要（读 benchmark-results/latest-summary.json）
 */
function generateReadmeBadge() {
  const summaryPath = path.join(OUTPUT_DIR, 'latest-summary.json');
  if (!fs.existsSync(summaryPath)) {
    log.warn('未找到评测结果（benchmark-results/latest-summary.json 不存在），请先运行评测');
    return;
  }

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  } catch (err) {
    log.error(`结果文件解析失败: ${err.message}`);
    return;
  }

  console.log('\n-- 最新评测结果 --');
  console.log(`  模型:     ${summary.provider}/${summary.model}`);
  console.log(`  运行模式: ${summary.mode || '未知'}`);
  console.log(`  Pass@${summary.passAtK}:  ${(summary.passRate * 100).toFixed(1)}%`);
  console.log(`  解决率:   ${(summary.resolvedRate * 100).toFixed(1)}%`);
  console.log(`  题数:     ${summary.totalProblems}`);
  console.log(`  时间:     ${summary.timestamp}`);
  if (summary.byDifficulty) {
    console.log('  按难度:');
    for (const [diff, stats] of Object.entries(summary.byDifficulty)) {
      console.log(
        `    - ${diff}: ${stats.passed}/${stats.total} (${(stats.rate * 100).toFixed(1)}%)`,
      );
    }
  }
  if (summary.scoring) {
    console.log(`  评分口径: ${summary.scoring}（非 SWE-bench 官方 harness）`);
  }
  if (summary.limitation) {
    console.log(`  ⚠️ 限制:   ${summary.limitation}`);
  }
  if (summary.mode === 'offline-mock') {
    console.log('  ⚠️ 注意:   这是**离线自测**结果，不代表任何模型的真实代码能力');
  }
  console.log('');
}

// ===================== 实际评测 =====================

/**
 * 运行真实/离线评测（需已编译核心包）
 *
 * @param {object} opts 命令行选项
 * @param {{mod: object}} core 已加载的核心包
 * @returns {Promise<boolean>} true = 成功
 */
async function runActualBenchmark(opts, core) {
  const { BenchmarkRunner, loadBuiltinDataset, createBenchmarkMockAdapter } = core.mod;
  const datasetPath = opts.datasetPath ? path.resolve(opts.datasetPath) : loadBuiltinDataset();

  // ── 判定档 ──
  // --real-tests → 强制真实执行；--heuristic / --offline → 强制启发式；否则 auto（能解析 vitest 就真跑）
  const testExecution = opts.realTests ? 'vitest' : opts.heuristic || opts.offline ? 'off' : 'auto';

  // ── 运行姿态 ──
  const agentic = Boolean(opts.allowTools);
  const maxTurns = opts.maxTurns || (agentic ? AGENTIC_MAX_TURNS : NON_AGENTIC_MAX_TURNS);

  const config = {
    provider: opts.provider,
    model: opts.model,
    k: opts.k,
    timeoutPerProblem: TIMEOUT_PER_PROBLEM_MS,
    datasetPath,
    outputDir: OUTPUT_DIR,
    maxProblems: opts.maxProblems || undefined,
    filterDifficulty: opts.difficulty || undefined,
    verbose: true,
    offline: opts.offline,
    // --mock-agent：把桩下沉到 adapter 层，真实跑通 agent 轨迹（工具 / 多轮）
    adapter: opts.mockAgent
      ? createBenchmarkMockAdapter({ withToolCall: Boolean(opts.allowTools) })
      : undefined,
    allowTools: agentic,
    maxTurns,
    testExecution,
    workDir: path.join(PROJECT_ROOT, 'temp', 'benchmark-run'),
    testTimeoutMs: TEST_TIMEOUT_MS,
    keepWorkspace: opts.keepWorkspace,
  };

  console.log(`  模型:     ${config.provider}/${config.model}`);
  console.log(`  Pass@${config.k}:  ${config.k} 次尝试`);
  console.log(`  数据集:   ${path.basename(datasetPath)}`);
  if (opts.offline) {
    console.log('  运行模式: offline-mock（Runner 层桩，不调用任何模型）');
    console.log('  ⚠️ 结果不代表任何模型的真实代码能力，仅用于验证评测流程与聚合口径');
  } else if (opts.mockAgent) {
    console.log('  运行模式: offline-mock（Mock 适配器：桩下沉到 adapter 层，不调用真实模型）');
    console.log('  ⚠️ 意义在于"真实跑通 agent 轨迹"（工具注册 → 工具执行 → 消息回灌 → 多轮）');
  } else {
    console.log('  运行模式: live（调用真实模型 API，会产生费用）');
  }
  console.log(
    `  运行姿态: ${agentic ? `agentic（允许工具，最多 ${maxTurns} 轮）` : '非 agentic（仅一次性输出代码）'}`,
  );
  console.log(
    `  判定档:   ${testExecution}${
      testExecution === 'off'
        ? '（结构化启发式，不跑测试）'
        : '（落盘 + vitest + FAIL_TO_PASS 核对）'
    }`,
  );
  console.log('');

  const runner = new BenchmarkRunner(config);

  try {
    const report = await runner.run();

    // 保存 JSON 摘要（带上模式与口径，避免数字被单独摘引）
    const summaryPath = path.join(OUTPUT_DIR, 'latest-summary.json');
    const summary = {
      provider: report.meta.provider,
      model: report.meta.model,
      passAtK: report.meta.k,
      passRate: report.scores.overallPassRate,
      resolvedRate: report.scores.overallResolvedRate,
      totalProblems: report.meta.totalProblems,
      byDifficulty: report.scores.byDifficulty,
      timestamp: report.meta.timestamp,
      mode: report.meta.mode,
      scoring: report.meta.scoring,
      limitation: report.meta.limitation,
      agentic: report.meta.agentic,
      testExecutionAvailable: report.meta.testExecutionAvailable,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log('\n===========================================');
    console.log('  评测完成');
    console.log('===========================================');
    console.log(`  运行模式: ${report.meta.mode}`);
    console.log(`  运行姿态: ${report.meta.agentic ? 'agentic（工具 + 多轮）' : '非 agentic'}`);
    console.log(`  通过率:   ${(report.scores.overallPassRate * 100).toFixed(1)}%`);
    console.log(
      `  评分口径: ${report.meta.scoring}${
        report.meta.testExecutionAvailable ? '（已真实执行测试）' : '（未执行测试）'
      }`,
    );
    if (!report.meta.testExecutionAvailable && report.meta.testExecutionReason) {
      console.log(`  回退原因: ${report.meta.testExecutionReason}`);
    }
    console.log(`  结果目录: ${path.relative(PROJECT_ROOT, OUTPUT_DIR)}/`);
    if (report.meta.mode === 'offline-mock') {
      console.log('  ⚠️ 离线/Mock 结果，不代表模型能力');
    }
    console.log('===========================================\n');
    return true;
  } catch (error) {
    // 常见可操作错误给出明确指引（而不是只抛堆栈）
    if (/未配置/.test(error.message)) {
      log.fail(`模型未配置：${error.message}`);
      log.info('三种配置方式（任选其一）：');
      log.info('  1) 环境变量: DEEPSEEK_API_KEY / DASHSCOPE_API_KEY / ZHIPU_API_KEY');
      log.info('  2) 应用界面「设置 → 模型」中填入 Key（加密存于 ~/.easyagent/providers.json）');
      log.info('  3) 无 Key 只做流程自测: pnpm benchmark --offline / --mock-agent');
    } else {
      log.fail(`评测失败: ${error.message}`);
    }
    log.error(error.stack || String(error));
    return false;
  }
}

// ===================== 主流程 =====================

/**
 * 主函数
 *
 * @returns {Promise<number>} 进程退出码（0 = 成功）
 */
async function main() {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    return 0;
  }

  console.log('===========================================');
  console.log('  EasyAgent SWE-Bench Agent 代码质量评测');
  console.log('===========================================\n');

  if (opts.generateReadme) {
    generateReadmeBadge();
    return 0;
  }

  const core = await loadCore();
  if (!core.ok) {
    log.fail(core.error);
    return 1;
  }

  if (opts.dryRun) {
    const ok = await doDryRun(opts, core);
    return ok ? 0 : 1;
  }

  const ok = await runActualBenchmark(opts, core);
  return ok ? 0 : 1;
}

process.exitCode = await main();
