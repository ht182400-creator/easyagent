/**
 * SWE-Bench CLI 入口
 * 命令行运行 EasyAgent 代码质量评测
 *
 * 用法:
 *   node scripts/swe-bench/run-benchmark.mjs --dry-run          # 检查环境 (无需编译)
 *   node scripts/swe-bench/run-benchmark.mjs --provider deepseek --model deepseek-v4
 *   node scripts/swe-bench/run-benchmark.mjs --generate-readme  # 查看最新评测结果
 *
 * 参考: docs/09_EasyAgent项目Review与优化建议报告.md P0-2
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'benchmark-results');

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    provider: 'deepseek',
    model: 'deepseek-v4',
    k: 1,
    dryRun: false,
    generateReadme: false,
    datasetPath: '',
    maxProblems: 0,
    difficulty: '',
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
        opts.k = parseInt(args[++i]) || opts.k;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--generate-readme':
        opts.generateReadme = true;
        break;
      case '--dataset':
        opts.datasetPath = args[++i] || '';
        break;
      case '--max-problems':
        opts.maxProblems = parseInt(args[++i]) || 0;
        break;
      case '--difficulty':
        opts.difficulty = args[++i] || '';
        break;
      case '--help':
      case '-h':
        opts.help = true;
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
  --dry-run            检查评测环境和数据集，不实际运行
  --generate-readme    查看最新评测结果摘要
  --help, -h           显示此帮助

示例:
  # 快速环境检查
  node scripts/swe-bench/run-benchmark.mjs --dry-run

  # 评测前 3 道 easy 题
  node scripts/swe-bench/run-benchmark.mjs --max-problems 3 --difficulty easy

  # pass@3 评测
  node scripts/swe-bench/run-benchmark.mjs --k 3 --provider qwen --model qwen3-max
`);
}

/**
 * 读取 JSON/JSONL 数据集并统计题目 (无需编译核心包)
 */
function loadDatasetStats(datasetPath) {
  if (!fs.existsSync(datasetPath)) {
    return { ok: false, error: '文件不存在', problemCount: 0, diffCount: {} };
  }

  const problems = [];
  try {
    const stat = fs.statSync(datasetPath);
    if (stat.isDirectory()) {
      const files = fs
        .readdirSync(datasetPath)
        .filter((f) => f.endsWith('.jsonl') || f.endsWith('.json'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(datasetPath, file), 'utf-8');
        for (const line of content.split('\n').filter((l) => l.trim())) {
          try {
            problems.push(JSON.parse(line));
          } catch {
            /* skip */
          }
        }
      }
    } else if (datasetPath.endsWith('.jsonl')) {
      const content = fs.readFileSync(datasetPath, 'utf-8');
      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          problems.push(JSON.parse(line));
        } catch {
          /* skip */
        }
      }
    } else if (datasetPath.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
      problems.push(...(Array.isArray(data) ? data : [data]));
    }
  } catch (error) {
    return { ok: false, error: `读取失败: ${error.message}`, problemCount: 0, diffCount: {} };
  }

  const diffCount = {};
  for (const p of problems) {
    const d = p.difficulty || 'unknown';
    diffCount[d] = (diffCount[d] || 0) + 1;
  }

  return { ok: true, problemCount: problems.length, diffCount };
}

/**
 * Dry-run：检查环境 (无需编译核心包)
 */
async function doDryRun(datasetPath) {
  console.log('\n-- EasyAgent SWE-Bench 环境检查 --\n');

  // 1. Node.js 版本
  console.log(`  Node.js:   ${process.version}`);
  const major = parseInt(process.version.replace(/^v/, '').split('.')[0]);
  if (major < 18) {
    console.log('  X Node.js 版本过低，需要 >= 18.0.0');
  } else if (major >= 24) {
    console.log('  ! Node.js 24.x 当前不受完整支持 (better-sqlite3)');
    console.log('    开发者可设置 EASYAGENT_SKIP_NODE_CHECK=1 继续');
  } else {
    console.log('  OK Node.js 版本兼容');
  }

  // 2. 检查数据集
  const dataPath =
    datasetPath ||
    path.join(PROJECT_ROOT, 'packages', 'core', 'src', 'benchmark', 'benchmark-tasks.json');
  console.log(`  数据集:   ${path.basename(dataPath)}`);

  const stats = loadDatasetStats(dataPath);
  if (!stats.ok) {
    console.log(`  X ${stats.error}`);
    return { ok: false };
  }

  console.log(`  题目数:   ${stats.problemCount}`);
  console.log(`  OK 数据集加载成功`);

  // 3. 按难度分布
  if (Object.keys(stats.diffCount).length > 0) {
    console.log('  难度分布:');
    for (const [diff, count] of Object.entries(stats.diffCount)) {
      console.log(`    - ${diff}: ${count} 题`);
    }
  }

  // 4. 检查核心包编译状态
  const distPath = path.join(PROJECT_ROOT, 'packages', 'core', 'dist', 'index.js');
  if (fs.existsSync(distPath)) {
    console.log('  OK 核心包已编译');
  } else {
    console.log('  ! 核心包未编译 (运行评测前需 pnpm build:core)');
  }

  // 5. 检查输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  console.log(`  OK 输出目录就绪: benchmark-results/`);

  console.log('\n  OK 环境检查通过！');
  console.log('  运行评测: pnpm benchmark --provider deepseek --model deepseek-v4');
  console.log('  快速测试: pnpm benchmark --max-problems 3 --difficulty easy\n');
  return { ok: true };
}

/**
 * 生成 README 摘要
 */
function generateReadmeBadge() {
  const summaryPath = path.join(OUTPUT_DIR, 'latest-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.log('  ! 未找到评测结果，请先运行: pnpm benchmark');
    return;
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  console.log('\n-- 最新评测结果 --');
  console.log(`  模型:     ${summary.provider}/${summary.model}`);
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
  console.log('');
}

/**
 * 实际运行评测 (需要编译后的核心包)
 */
async function runActualBenchmark(opts) {
  // 延迟加载：只在需要时导入编译产物
  const distPath = path.join(
    PROJECT_ROOT,
    'packages',
    'core',
    'dist',
    'benchmark',
    'BenchmarkRunner.js',
  );
  if (!fs.existsSync(distPath)) {
    console.error('X 错误: 核心包未编译。请先运行: pnpm build:core');
    process.exit(1);
  }

  const { BenchmarkRunner } = await import(distPath);

  const datasetPath =
    opts.datasetPath ||
    path.join(PROJECT_ROOT, 'packages', 'core', 'src', 'benchmark', 'benchmark-tasks.json');

  const config = {
    provider: opts.provider,
    model: opts.model,
    k: opts.k,
    timeoutPerProblem: 120000,
    datasetPath,
    outputDir: OUTPUT_DIR,
    maxProblems: opts.maxProblems || undefined,
    filterDifficulty: opts.difficulty || undefined,
    verbose: true,
  };

  console.log(`  模型:     ${config.provider}/${config.model}`);
  console.log(`  Pass@${config.k}:  ${config.k} 次尝试`);
  console.log(`  数据集:   ${path.basename(datasetPath)}\n`);

  const runner = new BenchmarkRunner(config);

  try {
    const report = await runner.run();

    // 保存 JSON 摘要
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
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log('\n===========================================');
    console.log('  评测完成');
    console.log('===========================================');
    console.log(`  通过率:   ${(report.scores.overallPassRate * 100).toFixed(1)}%`);
    console.log(`  结果目录: benchmark-results/`);
    console.log('===========================================\n');
  } catch (error) {
    console.error(`\nX 评测失败: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 主函数
 */
async function main() {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    return;
  }

  console.log('===========================================');
  console.log('  EasyAgent SWE-Bench Agent 代码质量评测');
  console.log('===========================================\n');

  if (opts.dryRun) {
    await doDryRun(opts.datasetPath);
    return;
  }

  if (opts.generateReadme) {
    generateReadmeBadge();
    return;
  }

  await runActualBenchmark(opts);
}

main();
