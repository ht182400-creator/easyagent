/**
 * SWE-Bench 评测框架测试（2026-09-19 修复回归）
 *
 * ── 覆盖的四类缺陷 ──
 *   ① 数据集格式：引擎旧实现只按行 JSON.parse，遇到 pretty-printed JSON 数组会**全丢**
 *      （内置 10 题 → 0 题，真评测第一步即失败）
 *   ② 难度判定：旧实现忽略数据集声明的 `difficulty`，一律启发式推断
 *      （导致 --difficulty 过滤与按难度统计和数据集声明不一致）
 *   ③ 完全依赖真实模型：无 API Key 时**整条评测链路无法验证**（现支持离线/依赖注入）
 *   ④ 报告不携带口径：数字容易被误当成 SWE-bench 官方指标（现写入 mode/scoring/limitation）
 *
 * ── 测试纪律 ──
 *   · **绝不触网、绝不调用真实模型**：全部走依赖注入的 `solutionGenerator` 或 `offline` 内置桩
 *   · 所有产物写入**仓库内 `temp/`**（.gitignore 已忽略），afterAll 清理，
 *     不碰 `~/.easyagent` 等用户真实数据目录（见 MEMORY「测试写用户真实数据目录」陷阱）
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import {
  BenchmarkRunner,
  buildOfflineStubSolution,
  createBenchmarkMockAdapter,
  loadBuiltinDataset,
  parseCaseNames,
  resolveVitestEntry,
  summarizeVitestReport,
  SWEBenchEngine,
} from '../benchmark/index.js';
import type { AgentBenchmarkConfig, SolutionGenerator } from '../benchmark/index.js';

/** 测试产物根目录（仓库内 temp/，已被 .gitignore 忽略） */
const SCRATCH_ROOT = fileURLToPath(new URL('../../../../temp/benchmark-tests/', import.meta.url));

/** 单题超时（测试用，不涉及真实调用，取小值即可） */
const TEST_TIMEOUT_PER_PROBLEM_MS = 5_000;

/** 保证确定性用的"不存在的提供商"（避免受本机已配置 Key 影响） */
const ABSENT_PROVIDER = 'provider-that-does-not-exist-in-any-preset';

/**
 * 构造一道最小可用题目（只填引擎实际消费的字段）
 *
 * @param id 题目 id
 * @param difficulty 声明难度
 * @param overrides 额外覆盖字段
 */
function makeProblem(
  id: string,
  difficulty: 'easy' | 'medium' | 'hard',
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    repo: 'easyagent/core',
    instance_id: id,
    base_commit: 'HEAD',
    issue_title: `测试题目 ${id}`,
    issue_body: `请实现 ${id} 的功能。`,
    created_at: '2026-09-19',
    version: '0.6.43',
    difficulty,
    ...overrides,
  };
}

/**
 * 在临时目录里写一个数据集文件
 *
 * @param name 文件名
 * @param content 文件内容（由调用方决定 JSON 数组 / JSONL / 单对象）
 * @returns 绝对路径
 */
function writeDataset(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(SCRATCH_ROOT, 'ds-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf-8');
  return file;
}

/**
 * 构造评测配置（默认离线：注入确定性生成器）
 *
 * @param overrides 需要覆盖的配置项
 */
function makeConfig(overrides: Partial<AgentBenchmarkConfig> = {}): AgentBenchmarkConfig {
  return {
    provider: 'deepseek',
    model: 'deepseek-v4',
    k: 1,
    timeoutPerProblem: TEST_TIMEOUT_PER_PROBLEM_MS,
    datasetPath: loadBuiltinDataset(),
    outputDir: fs.mkdtempSync(path.join(SCRATCH_ROOT, 'out-')),
    // 真实执行的工作区也必须落在测试临时根目录内：否则会写进 packages/core/temp
    // 并被静态扫描器当成仓库测试资产（见 docs/77 §七）
    workDir: path.join(SCRATCH_ROOT, 'workspaces'),
    offline: true,
    // 默认关掉真实执行：本文件的多数用例在验证「聚合/分支」而非「vitest 能否跑」，
    // 固定走启发式档可保持断言稳定；真实执行有专门用例（见文末 describe）。
    testExecution: 'off',
    ...overrides,
  };
}

/** 始终产出"结构完整代码块"的生成器 */
const STRUCTURAL_GENERATOR: SolutionGenerator = async () =>
  ['```typescript', 'export function solve(a: unknown): unknown {', '  return a;', '}', '```'].join(
    '\n',
  );

beforeAll(() => {
  fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
});

afterAll(() => {
  // 清理本次测试的全部产物（目录本身就是 .gitignore 内的 temp/）
  fs.rmSync(SCRATCH_ROOT, { recursive: true, force: true });
});

// ==================================================================================
// ① 数据加载：格式兼容与难度声明
// ==================================================================================

describe('SWEBenchEngine 数据加载 - 格式兼容（回归：旧实现只支持 JSONL）', () => {
  it('内置数据集是 pretty-printed JSON 数组，必须能读到全部题目（旧缺陷：0 题）', () => {
    const datasetPath = loadBuiltinDataset();
    const raw = fs.readFileSync(datasetPath, 'utf-8');

    // 前置：确认这确实是"数组 + 缩进"格式（否则本用例失去意义）
    expect(raw.trimStart().startsWith('[')).toBe(true);
    expect(raw.includes('\n  {')).toBe(true);

    const engine = new SWEBenchEngine({ dataDir: datasetPath, resultsDir: SCRATCH_ROOT });
    const problems = engine.loadProblems();

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].id).toBeTruthy();
    expect(problems[0].issue_title).toBeTruthy();
  });

  it('JSONL（每行一个对象）仍可加载', () => {
    const file = writeDataset(
      'tasks.jsonl',
      [JSON.stringify(makeProblem('l1', 'easy')), JSON.stringify(makeProblem('l2', 'hard'))].join(
        '\n',
      ),
    );
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });

    expect(engine.loadProblems().map((p) => p.id)).toEqual(['l1', 'l2']);
  });

  it('单个 JSON 对象也可加载', () => {
    const file = writeDataset('single.json', JSON.stringify(makeProblem('only', 'medium')));
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });

    expect(engine.loadProblems().map((p) => p.id)).toEqual(['only']);
  });

  it('坏行被跳过且不拖累其他行（不静默丢整份数据）', () => {
    const file = writeDataset(
      'mixed.jsonl',
      [
        JSON.stringify(makeProblem('ok1', 'easy')),
        '{ 这不是合法 JSON',
        JSON.stringify(makeProblem('ok2', 'medium')),
      ].join('\n'),
    );
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });

    expect(engine.loadProblems().map((p) => p.id)).toEqual(['ok1', 'ok2']);
  });

  it('数据集声明的 difficulty 优先于启发式推断（长正文但声明 easy 仍为 easy）', () => {
    const longBody = 'x'.repeat(5000); // 启发式会判 hard
    const file = writeDataset(
      'declared.json',
      JSON.stringify([makeProblem('d1', 'easy', { issue_body: longBody })]),
    );
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });

    expect(engine.loadProblems()[0].difficulty).toBe('easy');
  });

  it('未声明 difficulty 时回退启发式推断（长正文 → hard）', () => {
    const problem = makeProblem('d2', 'easy', { issue_body: 'y'.repeat(5000) });
    delete (problem as Record<string, unknown>).difficulty;
    const file = writeDataset('inferred.json', JSON.stringify([problem]));
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });

    expect(engine.loadProblems()[0].difficulty).toBe('hard');
  });

  it('FAIL_TO_PASS 为数组时被完整读取（旧实现 .split 会抛错并静默丢题）', () => {
    const file = writeDataset(
      'f2p.json',
      JSON.stringify([
        makeProblem('f1', 'medium', {
          FAIL_TO_PASS: ['test a', 'test b'],
          PASS_TO_PASS: ['test c'],
        }),
      ]),
    );
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });
    const [problem] = engine.loadProblems();

    expect(problem.fail_to_pass).toEqual(['test a', 'test b']);
    expect(problem.pass_to_pass).toEqual(['test c']);
  });

  it('FAIL_TO_PASS 为换行字符串时同样可读', () => {
    const file = writeDataset(
      'f2p2.json',
      JSON.stringify([makeProblem('f2', 'medium', { FAIL_TO_PASS: 'test a\ntest b\n' })]),
    );
    const engine = new SWEBenchEngine({ dataDir: file, resultsDir: SCRATCH_ROOT });

    expect(engine.loadProblems()[0].fail_to_pass).toEqual(['test a', 'test b']);
  });
});

// ==================================================================================
// ② / ③ 离线运行：pass@k 聚合、判定分支、异常路径
// ==================================================================================

describe('BenchmarkRunner - 离线自测（依赖注入，不触网）', () => {
  it('注入结构化生成器：全部通过，passAtK=1，难度分组正确', async () => {
    const file = writeDataset(
      'agg.json',
      JSON.stringify([makeProblem('a1', 'easy'), makeProblem('a2', 'hard')]),
    );
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, solutionGenerator: STRUCTURAL_GENERATOR }),
    );
    const report = await runner.run();

    expect(report.meta.mode).toBe('offline-mock');
    expect(report.meta.scoring).toBe('heuristic-structural');
    expect(report.meta.limitation.length).toBeGreaterThan(0);
    expect(report.scores.overallPassRate).toBe(1);
    expect(report.problemResults.every((r) => r.passAtK === 1)).toBe(true);
    expect(report.scores.byDifficulty.easy).toEqual({ total: 1, passed: 1, rate: 1 });
    expect(report.scores.byDifficulty.hard).toEqual({ total: 1, passed: 1, rate: 1 });
  });

  it('k=3 且仅第 2 次成功：passCount=1、passAtK=1/3，且"至少一次通过"即算通过', async () => {
    const file = writeDataset('k3.json', JSON.stringify([makeProblem('k1', 'easy')]));
    let call = 0;
    const flaky: SolutionGenerator = async () => {
      call += 1;
      // 第 1、3 次返回空（判定失败），第 2 次返回结构化代码（判定通过）
      return call === 2 ? STRUCTURAL_GENERATOR('', { id: 'k1' } as never) : 'too short';
    };
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, k: 3, solutionGenerator: flaky }),
    );
    const report = await runner.run();
    const [result] = report.problemResults;

    expect(result.totalAttempts).toBe(3);
    expect(result.passCount).toBe(1);
    expect(result.passAtK).toBeCloseTo(1 / 3, 5);
    expect(result.passed).toBe(true);
    expect(result.attempts.map((a) => a.success)).toEqual([false, true, false]);
  });

  it('生成器恒返回空：passCount=0、passAtK=0（失败分支）', async () => {
    const file = writeDataset('empty.json', JSON.stringify([makeProblem('e1', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, solutionGenerator: async () => '' }),
    );
    const report = await runner.run();

    expect(report.problemResults[0].passed).toBe(false);
    expect(report.problemResults[0].passCount).toBe(0);
    expect(report.scores.overallPassRate).toBe(0);
  });

  it('生成器抛错：错误被记录在 attempt 上，且不中断后续题目', async () => {
    const file = writeDataset(
      'throw.json',
      JSON.stringify([makeProblem('t1', 'easy'), makeProblem('t2', 'easy')]),
    );
    let call = 0;
    const sometimesThrows: SolutionGenerator = async () => {
      call += 1;
      if (call === 1) throw new Error('模拟模型调用失败');
      return STRUCTURAL_GENERATOR('', { id: 't2' } as never);
    };
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, solutionGenerator: sometimesThrows }),
    );
    const report = await runner.run();

    expect(report.problemResults[0].attempts[0].error).toContain('模拟模型调用失败');
    expect(report.problemResults[0].passed).toBe(false);
    // 第 2 题仍被正常评测
    expect(report.problemResults[1].passed).toBe(true);
  });

  it('括号严重不匹配的解法被判失败（启发式边界：差值 > 2）', async () => {
    const file = writeDataset('brace.json', JSON.stringify([makeProblem('b1', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        solutionGenerator: async () => 'export function f() { { { {',
      }),
    );
    const report = await runner.run();

    expect(report.problemResults[0].passed).toBe(false);
    expect(report.problemResults[0].attempts[0].testResult).toMatch(/括号不匹配/);
  });

  it('无 export/function/class 的纯语句被判失败（结构分支）', async () => {
    const file = writeDataset('plain.json', JSON.stringify([makeProblem('p1', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, solutionGenerator: async () => 'const a = 1;' }),
    );
    const report = await runner.run();

    expect(report.problemResults[0].passed).toBe(false);
    expect(report.problemResults[0].attempts[0].testResult).toMatch(/未找到关键代码结构/);
  });

  it('围栏代码块被提取：solution 不含围栏残留', async () => {
    const file = writeDataset('fence.json', JSON.stringify([makeProblem('f1', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, solutionGenerator: STRUCTURAL_GENERATOR }),
    );
    const report = await runner.run();
    const solution = report.problemResults[0].attempts[0].solution;

    expect(solution).toContain('export function solve');
    expect(solution).not.toContain('```');
  });

  it('无围栏时回退全文提取', async () => {
    const file = writeDataset('nofence.json', JSON.stringify([makeProblem('n1', 'easy')]));
    const raw = 'export function plain() {\n  return 1;\n}';
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, solutionGenerator: async () => raw }),
    );
    const report = await runner.run();

    expect(report.problemResults[0].attempts[0].solution).toBe(raw);
  });
});

describe('BenchmarkRunner - 内置离线桩（--offline，无生成器）', () => {
  it('easy/medium 通过、hard 不通过，产出确定性的 2/3 通过率', async () => {
    const file = writeDataset(
      'stub.json',
      JSON.stringify([
        makeProblem('s1', 'easy'),
        makeProblem('s2', 'medium'),
        makeProblem('s3', 'hard'),
      ]),
    );
    const runner = new BenchmarkRunner(makeConfig({ datasetPath: file, offline: true }));
    const report = await runner.run();

    expect(report.scores.byDifficulty.easy.passed).toBe(1);
    expect(report.scores.byDifficulty.medium.passed).toBe(1);
    expect(report.scores.byDifficulty.hard.passed).toBe(0);
    expect(report.scores.overallPassRate).toBeCloseTo(2 / 3, 5);
  });

  it('桩产物带 OFFLINE STUB 标记，且报告正文含离线警示与口径说明', async () => {
    const file = writeDataset('stub2.json', JSON.stringify([makeProblem('s4', 'easy')]));
    const runner = new BenchmarkRunner(makeConfig({ datasetPath: file, offline: true }));
    const report = await runner.run();

    expect(report.problemResults[0].attempts[0].solution).toContain('[OFFLINE STUB]');

    const markdown = runner.formatMarkdownReport(report);
    expect(markdown).toContain('offline-mock');
    expect(markdown).toContain('不代表任何模型的真实代码能力');
    expect(markdown).toContain('heuristic-structural');
    expect(markdown).toContain('不执行测试用例');
  });

  it('buildOfflineStubSolution：hard 刻意不产出可判定结构', () => {
    const easy = buildOfflineStubSolution({
      id: 'x',
      difficulty: 'easy',
    } as never);
    const hard = buildOfflineStubSolution({
      id: 'y',
      difficulty: 'hard',
    } as never);

    expect(easy).toContain('export function');
    expect(hard).not.toContain('export function');
    expect(hard).toContain('[OFFLINE STUB]');
  });
});

// ==================================================================================
// ④ 错误路径 / 过滤 / 落盘 / 摘要
// ==================================================================================

describe('BenchmarkRunner - 错误路径与边界', () => {
  it('数据集不存在时应抛出「未找到评测数据」', async () => {
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: path.join(SCRATCH_ROOT, 'not-exist-' + Date.now() + '.json'),
        solutionGenerator: STRUCTURAL_GENERATOR,
      }),
    );

    await expect(runner.run()).rejects.toThrow(/未找到评测数据/);
  });

  it('非离线且提供商不存在时，报「未配置」而不是静默跑空（fail-fast）', async () => {
    const file = writeDataset('nokey.json', JSON.stringify([makeProblem('n1', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, offline: false, provider: ABSENT_PROVIDER }),
    );

    await expect(runner.run()).rejects.toThrow(/未配置/);
    expect(runner.getSummaryJSON).toBeTypeOf('function');
  });

  it('maxProblems 与 filterDifficulty 生效', async () => {
    const file = writeDataset(
      'filter.json',
      JSON.stringify([
        makeProblem('f1', 'easy'),
        makeProblem('f2', 'hard'),
        makeProblem('f3', 'hard'),
      ]),
    );

    const onlyHard = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        filterDifficulty: 'hard',
        solutionGenerator: STRUCTURAL_GENERATOR,
      }),
    );
    const hardReport = await onlyHard.run();
    expect(hardReport.meta.totalProblems).toBe(2);
    expect(Object.keys(hardReport.scores.byDifficulty)).toEqual(['hard']);

    const limited = new BenchmarkRunner(
      makeConfig({ datasetPath: file, maxProblems: 1, solutionGenerator: STRUCTURAL_GENERATOR }),
    );
    const limitedReport = await limited.run();
    expect(limitedReport.meta.totalProblems).toBe(1);
  });

  it('评测报告落盘到 outputDir，且摘要 JSON 携带模式与口径', async () => {
    const file = writeDataset('report.json', JSON.stringify([makeProblem('r1', 'easy')]));
    const outputDir = fs.mkdtempSync(path.join(SCRATCH_ROOT, 'report-out-'));
    const runner = new BenchmarkRunner(
      makeConfig({ datasetPath: file, outputDir, solutionGenerator: STRUCTURAL_GENERATOR }),
    );
    const report = await runner.run();

    const mdFiles = fs.readdirSync(outputDir).filter((f) => f.endsWith('.md'));
    expect(mdFiles.length).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(outputDir, mdFiles[0]), 'utf-8')).toContain('评分口径');

    const summary = JSON.parse(runner.getSummaryJSON(report));
    expect(summary.mode).toBe('offline-mock');
    expect(summary.scoring).toBe('heuristic-structural');
    expect(summary.limitation).toBeTruthy();
    expect(summary.totalProblems).toBe(1);
  });

  it('runner 记录结果到引擎会话：解决率与 byDifficulty 口径一致', async () => {
    const file = writeDataset(
      'session.json',
      JSON.stringify([makeProblem('q1', 'easy'), makeProblem('q2', 'easy')]),
    );
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        solutionGenerator: async (_prompt, problem) =>
          problem.id === 'q1' ? 'const a = 1;' : 'export function f() {\n  return 1;\n}',
      }),
    );
    const report = await runner.run();

    expect(report.scores.byDifficulty.easy).toEqual({ total: 2, passed: 1, rate: 0.5 });
    expect(report.scores.overallPassRate).toBeCloseTo(0.5, 5);
  });
});

// ==================================================================================
// ⑤ 真实测试执行（SWE-bench 式判定：落盘 + vitest + FAIL_TO_PASS 核对）
// ==================================================================================

describe('SolutionRunner - 纯函数（用例名解析与报告汇总）', () => {
  it('parseCaseNames：从 test(...) 包裹形式提取用例名', () => {
    expect(parseCaseNames([`test('add works')`, `test("sub works")`])).toEqual([
      'add works',
      'sub works',
    ]);
  });

  it('parseCaseNames：裸用例名与空值都能处理，且去重', () => {
    expect(parseCaseNames(['plain name', 'plain name', ''])).toEqual(['plain name']);
  });

  it('summarizeVitestReport：期望用例全部通过 → allPassed=true', () => {
    const report = {
      testResults: [
        {
          assertionResults: [
            { title: 'a', status: 'passed' },
            { title: 'b', status: 'passed' },
          ],
        },
      ],
    };
    expect(summarizeVitestReport(report, ['a', 'b'])).toMatchObject({
      passed: 2,
      total: 2,
      allPassed: true,
    });
  });

  it('summarizeVitestReport：有用例失败/缺失 → allPassed=false 且列出缺失项', () => {
    const report = { testResults: [{ assertionResults: [{ title: 'a', status: 'failed' }] }] };
    const result = summarizeVitestReport(report, ['a', 'ghost']);
    expect(result.allPassed).toBe(false);
    expect(result.passed).toBe(0);
    expect(result.missing).toEqual(['a', 'ghost']);
  });

  it('summarizeVitestReport：报告结构异常时不抛错（空报告 → 未通过）', () => {
    expect(summarizeVitestReport(null, ['x']).allPassed).toBe(false);
    expect(summarizeVitestReport({}, []).allPassed).toBe(false);
  });

  it('resolveVitestEntry：本仓装了 vitest，应可解析', () => {
    const resolved = resolveVitestEntry();
    expect(resolved.ok).toBe(true);
    expect(resolved.entry).toMatch(/vitest\.mjs$/);
  });
});

describe('SolutionRunner - 真实执行（嵌套 vitest，正/负对照）', () => {
  /** 构造一道"有标准答案"的迷你题：解法正确即真能通过 */
  function makeMiniProblem(fileName: string, expectLine: string) {
    const file = writeDataset(
      `${fileName}.json`,
      JSON.stringify([
        {
          id: `mini_${fileName}`,
          repo: 'easyagent/core',
          instance_id: `mini_${fileName}`,
          base_commit: 'HEAD',
          issue_title: '实现 add(a,b)',
          issue_body: '实现 add(a: number, b: number): number，返回两数之和。',
          test_patch: [
            `import { add } from './solution';`,
            `test('add works', () => {`,
            `  ${expectLine}`,
            `});`,
          ].join('\n'),
          FAIL_TO_PASS: ["test('add works')"],
          PASS_TO_PASS: [],
          created_at: '2026-09-19',
          version: '0.6.43',
          difficulty: 'easy',
        },
      ]),
    );
    return file;
  }

  it('正确解法 → 真实执行判定为通过（正对照）', async () => {
    const file = makeMiniProblem('pos', 'expect(add(1, 2)).toBe(3);');
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        testExecution: 'vitest',
        testTimeoutMs: 40_000,
        solutionGenerator: async () =>
          'export function add(a: number, b: number): number {\n  return a + b;\n}',
      }),
    );
    const report = await runner.run();
    const [result] = report.problemResults;

    expect(report.meta.scoring).toBe('vitest-executed');
    expect(report.meta.testExecutionAvailable).toBe(true);
    expect(result.attempts[0].execution?.executed).toBe(true);
    expect(result.attempts[0].execution?.failToPassPassed).toBe(1);
    expect(result.passed).toBe(true);

    // 通过 → 工作区被自动清理（生成物不得留在仓库里被扫描器误当测试资产）
    const workspace = result.attempts[0].execution?.workspace as string;
    expect(workspace).toBeTruthy();
    expect(fs.existsSync(workspace)).toBe(false);
  });

  it('离线桩（=错误解法）+ 真实执行 → 判定不通过且保留现场（负对照，证明不是橡皮章）', async () => {
    // ── 合并说明（2026-09-19 提速）──
    // 原「错误解法（注入生成器 → 返回 a-b）」与「离线桩 + 真实执行」是两条负对照，
    // 各自跑一次嵌套 vitest，断言高度重叠（都在证明"真的执行了测试且判为不通过"）。
    // 合并为一条后嵌套运行 **3 次 → 2 次**（该文件 ~7.4s → ~4.6s），覆盖点不减：
    //   ① 判定确实执行了测试（executed=true，而非橡皮章）
    //   ② 未通过口径：failToPassPassed=0 / passed=false / overallPassRate=0
    //   ③ 离线桩口径如实标注：mode=offline-mock + scoring=vitest-executed
    //   ④ 失败现场默认保留（keepOnFailure），便于人工复核
    const file = makeMiniProblem('stub-real', 'expect(add(1, 2)).toBe(3);');
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        offline: true,
        testExecution: 'vitest',
        testTimeoutMs: 40_000,
      }),
    );
    const report = await runner.run();
    const [result] = report.problemResults;

    // ③ 口径如实：离线桩 + 真实执行 → 必须是 vitest-executed，不能退回启发式
    expect(report.meta.mode).toBe('offline-mock');
    expect(report.meta.scoring).toBe('vitest-executed');
    expect(report.meta.testExecutionAvailable).toBe(true);

    // ①② 真跑了测试，且判为不通过（离线桩产不出 add，必然失败）
    expect(result.attempts[0].execution?.executed).toBe(true);
    expect(result.attempts[0].execution?.failToPassPassed).toBe(0);
    expect(result.passed).toBe(false);
    expect(report.scores.overallPassRate).toBe(0);

    // ④ 未通过 → 保留工作区便于复核（断言后立即清掉，避免留下生成物）
    const workspace = result.attempts[0].execution?.workspace as string;
    expect(workspace).toBeTruthy();
    expect(fs.existsSync(workspace)).toBe(true);
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('testExecution=off → 报告口径为启发式且不产生执行详情', async () => {
    const file = makeMiniProblem('off', 'expect(add(1, 2)).toBe(3);');
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        testExecution: 'off',
        solutionGenerator: async () => 'export function add() {\n  return 3;\n}',
      }),
    );
    const report = await runner.run();

    expect(report.meta.scoring).toBe('heuristic-structural');
    expect(report.meta.testExecutionAvailable).toBe(false);
    expect(report.meta.testExecutionReason).toContain('off');
    expect(report.problemResults[0].attempts[0].execution).toBeUndefined();
  });
});

// ==================================================================================
// ⑥ Mock 适配器：把桩下沉到 adapter 层，使 agent 链路（工具/多轮）可离线跑通
// ==================================================================================

describe('BenchmarkMockAdapter - adapter 层离线自测', () => {
  it('非 agentic：模型换成 Mock 适配器后仍能产出可判定的代码（mode=offline-mock）', async () => {
    const file = writeDataset('mock1.json', JSON.stringify([makeProblem('m1', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        offline: false, // 关键：不走 Runner 层桩，而是把适配器交给 AgentEngine
        adapter: createBenchmarkMockAdapter(),
        allowTools: false,
        testExecution: 'off',
      }),
    );
    const report = await runner.run();

    expect(report.meta.mode).toBe('offline-mock');
    expect(report.meta.agentic).toBe(false);
    expect(report.problemResults[0].attempts[0].solution).toContain('mockSolution');
  });

  it('agentic：withToolCall 会真实走一遍工具链路（list_dir），且仍产出最终代码', async () => {
    const file = writeDataset('mock2.json', JSON.stringify([makeProblem('m2', 'easy')]));
    const runner = new BenchmarkRunner(
      makeConfig({
        datasetPath: file,
        offline: false,
        adapter: createBenchmarkMockAdapter({ withToolCall: true }),
        allowTools: true,
        maxTurns: 6,
        testExecution: 'off',
      }),
    );
    const report = await runner.run();

    expect(report.meta.agentic).toBe(true);
    expect(report.problemResults[0].attempts[0].solution).toContain('mockSolution');
  });
});
