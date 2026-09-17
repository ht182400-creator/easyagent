#!/usr/bin/env node
/**
 * verify-data-consistency.mjs — 测试数据「单一真源」一致性门禁
 *
 * ── 为什么需要它 ──
 * 2026-09-18 审核实测发现：测试用例数在 **6 个地方被各自维护**，且互不一致：
 *   · docs/03_测试案例文档.md          → 1273
 *   · .codebuddy/memory/MEMORY.md      → 1195
 *   · docs/pipeline/test-case-mapping.json → 1514（机器生成）
 *   · docs/pipeline/pipeline-data.json → 1514（但其中 254 个用例未被执行覆盖）
 *   · docs/pipeline/project-progress-data.json
 *   · CHANGELOG.md
 * 项目自己的《测试数据同步约束》要求六处一致，实际六处全不一致。
 * 后果：任何人（含贡献者与用户）第一眼看到的数字就是错的，严重损害可信度；
 * 更糟的是，31 个真实失败被"100% 通过"的引用数字掩盖了数月。
 *
 * ── 设计原则 ──
 *   · **单一真源**：`docs/pipeline/test-case-mapping.json`（由 scan-test-cases 生成）
 *     与各包 vitest JSON 报告（由测试运行产生）是仅有的两个权威输入；
 *   · 本脚本只做**校验与提示**，不修改任何文件（避免"钩子改文件导致提交不收敛"的旧问题）；
 *   · 失败即退出码 1，可直接作为 CI 门禁与本地提交前检查。
 *
 * ── 校验项 ──
 *   ① mapping 的 totalTestCases 必须等于各模块 totalCases 之和
 *   ② pipeline-data.json 的 KPI 必须与 mapping + vitest 报告自洽
 *   ③ MEMORY.md / docs/03 中出现的用例数声明必须与真源一致（允许显式标注为历史值）
 *
 * ── 用法 ──
 *   node scripts/verify-data-consistency.mjs            # 校验
 *   node scripts/verify-data-consistency.mjs --fix-hint # 额外打印修复命令
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ===================== 常量 =====================

/** 项目根目录 */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 管线数据目录 */
const PIPELINE_DIR = join(PROJECT_ROOT, 'docs', 'pipeline');

/** 真源文件 1：模块→测试文件→用例数映射（机器生成） */
const MAPPING_FILE = join(PIPELINE_DIR, 'test-case-mapping.json');

/** 真源文件 2：KPI 与看板数据 */
const PIPELINE_DATA_FILE = join(PIPELINE_DIR, 'pipeline-data.json');

/** 需要核对数字声明的文档（路径 → 说明） */
const CLAIM_DOCS = [
  { file: join(PROJECT_ROOT, '.codebuddy', 'memory', 'MEMORY.md'), label: 'MEMORY.md' },
  { file: join(PROJECT_ROOT, 'docs', '03_测试案例文档.md'), label: 'docs/03_测试案例文档.md' },
];

/** 允许的用例数偏差（0 = 必须精确一致） */
const ALLOWED_DRIFT = 0;

// ===================== 工具 =====================

const problems = [];
const INFO_PREFIX = '  ';

/** 打印普通信息 */
function info(msg) {
  console.log(msg);
}

/** 记录问题 */
function problem(msg) {
  problems.push(msg);
}

/** 安全读取 JSON */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    problem(`无法解析 ${file}: ${err.message}`);
    return null;
  }
}

/**
 * 从文本中提取"用例数声明"
 *
 * 覆盖常见写法：`1514 用例`、`总用例数: 1514`、`(1514 tests)`、`1195 tests` 等。
 * 返回去重后的数字集合。
 */
function extractTestNumberClaims(text) {
  const found = new Set();
  const patterns = [
    /(\d{3,5})\s*(?:个)?\s*用例/g,
    // 表格形态：`| 测试用例总数 | 1633 (…) |`、`用例总数: 1514`
    /用例[总]?数[^\d\n]{0,12}?(\d{3,5})/g,
    /(\d{3,5})\s*tests?\b/gi,
    /totalTestCases["'\s:]+(\d{3,5})/g,
    /(\d{3,5})\s*定义用例/g,
    // "定义用例：1561" / "定义用例 **1561**"（数字在后）
    /定义用例[^\d\n]{0,12}?(\d{3,5})/g,
    // 常见组合写法："Vitest 1561"、"Vitest执行: 1561"、"Vitest 已执行 1572"
    /Vitest[^\d\n]{0,12}?(\d{3,5})/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) found.add(Number(m[1]));
  }
  return found;
}

/** 统计 vitest 报告的真实执行数 */
function collectVitestTotals() {
  const totals = { files: 0, executed: 0, passed: 0, failed: 0, skipped: 0 };
  let reportsFound = 0;
  try {
    for (const f of readdirSync(PIPELINE_DIR)) {
      if (!/^_vitest-.*\.json$/.test(f)) continue;
      try {
        const j = JSON.parse(readFileSync(join(PIPELINE_DIR, f), 'utf8'));
        reportsFound += 1;
        totals.files += (j.testResults || []).length;
        totals.executed += j.numTotalTests || 0;
        totals.passed += j.numPassedTests || 0;
        totals.failed += j.numFailedTests || 0;
        totals.skipped += j.numPendingTests || 0;
      } catch {
        problem(`vitest 报告解析失败: docs/pipeline/${f}`);
      }
    }
  } catch (err) {
    problem(`无法读取管线目录: ${err.message}`);
  }
  return { totals, reportsFound };
}

// ===================== 主流程 =====================

function main() {
  const showFixHint = process.argv.includes('--fix-hint');

  info('测试数据一致性校验');
  info('='.repeat(72));

  if (!existsSync(MAPPING_FILE)) {
    problem(`真源文件缺失: ${MAPPING_FILE}\n    修复: node scripts/scan-test-cases.mjs`);
    return 1;
  }

  // ── 真源值 ──
  const mapping = readJson(MAPPING_FILE);
  if (!mapping) return 1;
  const mappingTotal = mapping._meta?.totalTestCases;
  const mappingFiles = mapping._meta?.totalTestFiles;
  info(`真源 test-case-mapping.json: ${mappingTotal} 用例 / ${mappingFiles} 文件`);

  // ── 校验项 ①：mapping 自身自洽（totalTestCases == 各模块之和）──
  const modules = mapping.modules || mapping.mapping || {};
  const moduleKeys = Object.keys(modules);
  let sumCases = 0;
  let moduleCaseField = 'totalCases';
  for (const key of moduleKeys) {
    const mod = modules[key];
    const value = mod?.totalCases ?? mod?.cases ?? mod?.testCases;
    if (typeof value === 'number') sumCases += value;
    else if (Array.isArray(mod?.testFiles)) {
      // 退化：模块只登记了文件列表，用例数累加不了，跳过求和
      moduleCaseField = '(module.testFiles only)';
    }
  }
  if (moduleCaseField !== '(module.testFiles only)') {
    if (Math.abs(sumCases - mappingTotal) > ALLOWED_DRIFT) {
      problem(
        `[mapping 不自洽] _meta.totalTestCases=${mappingTotal}，但 ${moduleKeys.length} 个模块 ` +
          `${moduleCaseField} 之和=${sumCases}（差 ${sumCases - mappingTotal}）\n` +
          `    修复: node scripts/scan-test-cases.mjs`,
      );
    } else {
      info(`${INFO_PREFIX}✓ mapping 自洽（${moduleKeys.length} 个模块用例数之和 = ${sumCases}）`);
    }
  } else {
    info(`${INFO_PREFIX}· mapping 模块未登记用例数字段，跳过自洽求和校验`);
  }

  // ── vitest 实测 ──
  const { totals, reportsFound } = collectVitestTotals();
  info(
    `实测 vitest 报告: ${reportsFound} 份 → 执行 ${totals.executed} / 通过 ${totals.passed} / ` +
      `失败 ${totals.failed} / 跳过 ${totals.skipped}`,
  );
  if (reportsFound === 0) {
    problem('未找到任何 _vitest-*.json 报告\n    修复: pnpm test:log（或 node scripts/run-tests-log.mjs）');
  }

  // ── 校验项 ②：pipeline-data.json 的 KPI 必须与真源自洽 ──
  if (existsSync(PIPELINE_DATA_FILE)) {
    const pd = readJson(PIPELINE_DATA_FILE);
    const kpi = pd?.kpi;
    if (!kpi) {
      problem('pipeline-data.json 缺少 kpi 字段');
    } else {
      if (typeof kpi.testCases === 'number' && Math.abs(kpi.testCases - mappingTotal) > ALLOWED_DRIFT) {
        problem(
          `[KPI 与真源不一致] pipeline-data.json kpi.testCases=${kpi.testCases}，` +
            `真源 mapping.totalTestCases=${mappingTotal}\n` +
            `    修复: node scripts/unified-sync.mjs`,
        );
      } else {
        info(`${INFO_PREFIX}✓ kpi.testCases 与真源一致（${kpi.testCases}）`);
      }

      if (typeof kpi.testPassed === 'number' && totals.executed > 0) {
        if (kpi.testPassed !== totals.passed) {
          problem(
            `[KPI 与实测不一致] kpi.testPassed=${kpi.testPassed}，` +
              `vitest 实测通过=${totals.passed}\n` +
              `    修复: pnpm test:log && node scripts/unified-sync.mjs`,
          );
        } else {
          info(`${INFO_PREFIX}✓ kpi.testPassed 与实测一致（${kpi.testPassed}）`);
        }
      }

      if (totals.failed > 0) {
        problem(
          `[存在失败用例] vitest 实测 ${totals.failed} 个用例失败\n` +
            `    这不是数据一致性问题，但必须修复后才可发布：\n` +
            `    查看 logs/test-logs/ 下最新一次运行的「回归测试.log」`,
        );
      }

      if (kpi._stale === true) {
        problem(
          '[管线数据过期] pipeline-data.json 标记 _stale=true（vitest 报告早于数据生成）\n' +
            '    修复: pnpm test:log && node scripts/unified-sync.mjs',
        );
      }
    }
  } else {
    problem(`缺少 ${PIPELINE_DATA_FILE}`);
  }

  // ── 校验项 ③：文档必须声明"当前"权威数字 ──
  //
  // 设计取舍：**要求存在，而不禁止其它数字**。
  // 原因：文档中还会出现大量合法数字（各模块用例数、各包用例数、历史版本数字），
  // 若一把抓会制造大量误报，门禁很快就会被人忽略（"狼来了"）。
  // 真正的失效模式是"文档忘记同步权威数字"，因此只校验权威数字是否出现。
  const requiredNumbers = [
    { value: mappingTotal, label: '定义用例（模块映射口径）' },
    { value: totals.executed, label: 'Vitest 已执行用例数' },
  ];

  for (const { file, label } of CLAIM_DOCS) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const claims = extractTestNumberClaims(text);
    const missing = requiredNumbers.filter((r) => r.value > 0 && !claims.has(r.value));

    if (missing.length) {
      const seen = [...claims].filter((n) => n >= 200 && n <= 20000).sort((a, b) => a - b);
      problem(
        `[文档数字过期] ${label} 未声明当前权威数字：` +
          missing.map((m) => `${m.label}=${m.value}`).join('、') +
          `\n    该文件中出现的三位以上数字为：${seen.join(', ') || '(无)'}` +
          `\n    请更新文档中的对应声明（历史值请显式标注，如"历史：1195"）`,
      );
    } else {
      info(`${INFO_PREFIX}✓ ${label} 已声明当前权威数字（${requiredNumbers.map((r) => r.value).join(' / ')}）`);
    }
  }

  // ── 结论 ──
  info('='.repeat(72));
  if (problems.length === 0) {
    console.log('✅ 测试数据一致性校验通过');
    return 0;
  }
  console.error(`❌ 测试数据一致性校验失败，共 ${problems.length} 项：\n`);
  problems.forEach((p, i) => console.error(`${i + 1}. ${p}\n`));
  if (showFixHint) {
    console.error('一键修复提示：');
    console.error('  pnpm test:log                    # 重新跑测试并刷新 vitest 报告与测试日志');
    console.error('  node scripts/unified-sync.mjs    # 依据报告重建映射与看板数据');
    console.error('  然后手工更正文档中过期的数字声明');
  }
  return 1;
}

process.exit(main());
