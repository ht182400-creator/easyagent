/**
 * 解法真实执行器（SWE-bench 式判定）
 *
 * ── 它解决什么问题 ──
 * 旧的 `BenchmarkRunner.runTests()` 只做「代码块非空 + 括号配对 + 含 export/function/class」
 * 的结构化启发式判断，**不执行任何测试** —— 于是 `pass@k` 度量的是"产出结构完整的代码"，
 * 而不是"通过测试"。本模块把解法与数据集自带的 `test_patch` 落盘到临时工作区，
 * 用 **vitest 真实跑一遍**，再按 `FAIL_TO_PASS` / `PASS_TO_PASS` 的名称逐条核对。
 *
 * ── 关键约束 ──
 * ① **绝不经过 shell**：直接用 `process.execPath`(node) + argv 起 vitest（避免引号/元字符陷阱）
 * ② vitest 不可用（如打包后的 Electron 环境）→ 返回 `available: false`，由调用方回退启发式并**如实标注**
 * ③ 工作区落在 `temp/benchmark-run/`（仓库内、已被 .gitignore 忽略），保留现场便于人工复核
 * ④ 判定语义与 SWE-bench 对齐：`FAIL_TO_PASS` 里的用例**必须全部通过**才算解决
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { logger } from '../utils/logger.js';
import type { SWEBenchProblem } from './SWEBenchEngine.js';

// ===================== 常量（禁止散落魔法值） =====================

/** 解法文件名（数据集里的 test_patch 统一 `import ... from './solution'`） */
const SOLUTION_FILE_NAME = 'solution.ts';

/** 测试文件名（每个题目单独一个工作区，名字固定便于排查） */
const TEST_FILE_NAME = 'solution.test.ts';

/** 工作区内联 vitest 配置文件名 */
const VITEST_CONFIG_FILE_NAME = 'vitest.config.mts';

/** vitest JSON 报告文件名 */
const VITEST_RESULT_FILE_NAME = 'vitest-result.json';

/** 默认工作区根目录（相对 cwd；已被 .gitignore 忽略） */
const DEFAULT_WORKSPACE_DIR = path.join('temp', 'benchmark-run');

/** 单题测试执行超时（毫秒）——比模型调用超时短，因为只跑一个测试文件 */
const DEFAULT_TEST_TIMEOUT_MS = 60_000;

/** vitest 断言默认超时（写进内联配置） */
const VITEST_TEST_TIMEOUT_MS = 20_000;

/**
 * 工作区内联配置内容
 *
 * ⚠️ 刻意**不写 `import { defineConfig } from 'vitest/config'`**：
 * 配置文件位于 `temp/benchmark-run/<题目>/`，从那里解析 `vitest/config` 会依赖
 * 该目录到仓库根的 node_modules 链路（pnpm 隔离布局下并不可靠，实测会导致
 * 嵌套 vitest 启动失败、不产出 JSON 报告）。直接导出普通对象即可 ——
 * vitest 支持对象形式的默认导出，`defineConfig` 只提供类型提示。
 */
const VITEST_CONFIG_CONTENT = `export default {
  test: {
    include: ['${TEST_FILE_NAME}'],
    environment: 'node',
    // ⚠️ 必须开 globals：数据集的 test_patch 与内置题目都用裸 test()/expect()（vitest 全局 API），
    // 不开会以 "test is not defined" 失败 → 判定恒为"未通过"，是**假信号**（曾真实踩到）。
    globals: true,
    testTimeout: ${VITEST_TEST_TIMEOUT_MS},
    hookTimeout: ${VITEST_TEST_TIMEOUT_MS},
    reporters: ['json'],
    outputFile: '${VITEST_RESULT_FILE_NAME}',
  },
};
`;

/** 单条测试结果（vitest JSON 报告的最小投影） */
interface VitestAssertion {
  title: string;
  fullName?: string;
  status: string;
}

/** 执行结果 */
export interface ExecutionResult {
  /** 是否真的执行了测试（false = 不可用/被关闭，调用方需回退并标注） */
  executed: boolean;
  /** 是否解决（FAIL_TO_PASS 全部通过，且 PASS_TO_PASS 无回归） */
  passed: boolean;
  /** 人类可读摘要（写进报告） */
  output: string;
  /** FAIL_TO_PASS 通过数 / 总数 */
  failToPassPassed: number;
  failToPassTotal: number;
  /** PASS_TO_PASS 通过数 / 总数 */
  passToPassPassed: number;
  passToPassTotal: number;
  /** 未通过/缺失的用例名（排查用） */
  missing: string[];
  /** 工作区绝对路径（保留现场） */
  workspace?: string;
  /** 未执行原因 */
  error?: string;
}

/** 执行器配置 */
export interface SolutionRunnerOptions {
  /** 工作区根目录（默认 `temp/benchmark-run`） */
  workDir?: string;
  /** 单题测试超时 */
  timeoutMs?: number;
  /**
   * 是否保留**全部**工作区（默认 false）
   *
   * 默认策略是"**仅失败保留**"（见 {@link SolutionRunnerOptions.keepOnFailure}），
   * 因为工作区里的 `solution.test.ts` 会被静态扫描器误当成仓库测试资产
   * （2026-09-19 实测虚增 21 条定义用例，触发 `_stale` 门禁）。
   */
  keepWorkspace?: boolean;
  /** 失败（未通过）时是否保留工作区便于人工复核（默认 true） */
  keepOnFailure?: boolean;
}

/**
 * 从 `FAIL_TO_PASS` / `PASS_TO_PASS` 条目中提取用例名
 *
 * 数据集里既可能是 `test('sanitizeFilename basic')` 这种包裹形式，
 * 也可能直接写用例名，两种都要能取到。
 *
 * @param entries 原始条目列表
 * @returns 规范化后的用例名列表（去重、去空）
 */
export function parseCaseNames(entries: string[]): string[] {
  const names = new Set<string>();
  for (const raw of entries) {
    if (!raw) continue;
    const wrapped = /test(?:\.\w+)?\(\s*['"`](.+?)['"`]\s*\)/.exec(raw);
    const name = (wrapped ? wrapped[1] : raw).trim();
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * 汇总 vitest JSON 报告
 *
 * 纯函数，便于单测：输入报告对象与期望用例名，输出通过情况。
 *
 * @param report vitest JSON 报告（可能为任意对象）
 * @param expectedNames 期望通过的用例名
 * @returns 通过数/总数/缺失列表
 */
export function summarizeVitestReport(
  report: unknown,
  expectedNames: string[],
): { passed: number; total: number; missing: string[]; allPassed: boolean } {
  const assertions: VitestAssertion[] = [];
  const testResults = (report as { testResults?: unknown })?.testResults;

  if (Array.isArray(testResults)) {
    for (const file of testResults) {
      const results = (file as { assertionResults?: unknown })?.assertionResults;
      if (!Array.isArray(results)) continue;
      for (const a of results) {
        const item = a as VitestAssertion;
        if (item && typeof item.title === 'string') assertions.push(item);
      }
    }
  }

  const statusOf = (name: string): string | undefined => {
    const hit = assertions.find((a) => a.title === name || a.fullName === name);
    return hit?.status;
  };

  const missing = expectedNames.filter((name) => statusOf(name) !== 'passed');
  const total = expectedNames.length;
  const passed = total - missing.length;

  // 无期望名单时退化为"整个文件没有失败用例"
  const allPassed =
    total > 0
      ? missing.length === 0
      : assertions.length > 0 && assertions.every((a) => a.status === 'passed');

  return { passed, total, missing, allPassed };
}

/**
 * 定位 vitest 的可执行入口
 *
 * @returns `{ ok, entry, reason }`；打包环境通常 ok=false（vitest 是 devDependency）
 */
export function resolveVitestEntry(): { ok: boolean; entry: string; reason?: string } {
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('vitest/package.json');
    const entry = path.join(path.dirname(pkgPath), 'vitest.mjs');
    if (fs.existsSync(entry)) return { ok: true, entry };
    return { ok: false, entry, reason: `vitest.mjs 不存在: ${entry}` };
  } catch (error) {
    return {
      ok: false,
      entry: '',
      reason: `无法解析 vitest（可能是打包环境未带 devDependencies）: ${(error as Error).message}`,
    };
  }
}

/**
 * 解法真实执行器
 *
 * 每题一个独立工作区：写入 `solution.ts` + `solution.test.ts` + 内联 `vitest.config.mts`，
 * 用 node 直接启动 vitest（不经 shell），再解析 JSON 报告判定。
 */
export class SolutionRunner {
  private readonly workDir: string;
  private readonly timeoutMs: number;
  private readonly keepWorkspace: boolean;
  private readonly keepOnFailure: boolean;

  constructor(options: SolutionRunnerOptions = {}) {
    this.workDir = path.resolve(options.workDir || DEFAULT_WORKSPACE_DIR);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
    // 默认**跑完即清**：工作区里的 solution.test.ts 会被静态扫描器误当仓库测试资产
    this.keepWorkspace = options.keepWorkspace ?? false;
    this.keepOnFailure = options.keepOnFailure ?? true;
  }

  /** 执行器是否可用（vitest 可解析） */
  isAvailable(): { ok: boolean; reason?: string } {
    const v = resolveVitestEntry();
    return v.ok ? { ok: true } : { ok: false, reason: v.reason };
  }

  /**
   * 为一道题创建工作区并写入解法与测试
   *
   * @param problem 题目（提供 id 与 test_patch）
   * @param solution 从模型响应中提取出的解法源码
   * @returns 工作区路径
   */
  prepareWorkspace(problem: SWEBenchProblem, solution: string): string {
    const safeId = (problem.instance_id || problem.id || 'unknown').replace(/[^\w.-]/g, '_');
    const workspace = path.join(this.workDir, `${safeId}-${Date.now()}`);
    fs.mkdirSync(workspace, { recursive: true });

    fs.writeFileSync(path.join(workspace, SOLUTION_FILE_NAME), solution, 'utf-8');
    fs.writeFileSync(path.join(workspace, TEST_FILE_NAME), problem.test_patch || '', 'utf-8');
    fs.writeFileSync(path.join(workspace, VITEST_CONFIG_FILE_NAME), VITEST_CONFIG_CONTENT, 'utf-8');

    return workspace;
  }

  /**
   * 真实执行一道题的测试
   *
   * @param problem 题目
   * @param solution 解法源码
   * @returns 执行结果（含 FAIL_TO_PASS / PASS_TO_PASS 逐条核对）
   */
  async run(problem: SWEBenchProblem, solution: string): Promise<ExecutionResult> {
    const failToPass = parseCaseNames(problem.fail_to_pass || []);
    const passToPass = parseCaseNames(problem.pass_to_pass || []);

    if (!problem.test_patch || !problem.test_patch.trim()) {
      return this.skippedResult(
        '题目未提供 test_patch，无法真实执行',
        failToPass.length,
        passToPass.length,
      );
    }

    const vitest = resolveVitestEntry();
    if (!vitest.ok) {
      return this.skippedResult(
        vitest.reason || 'vitest 不可用',
        failToPass.length,
        passToPass.length,
      );
    }

    let workspace = '';
    try {
      workspace = this.prepareWorkspace(problem, solution);
      const exitCode = await this.spawnVitest(vitest.entry, workspace);
      const reportPath = path.join(workspace, VITEST_RESULT_FILE_NAME);

      if (!fs.existsSync(reportPath)) {
        return {
          ...this.skippedResult(
            `vitest 未产出报告（退出码 ${exitCode}）`,
            failToPass.length,
            passToPass.length,
          ),
          executed: true,
          workspace,
        };
      }

      const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
      const f2p = summarizeVitestReport(report, failToPass);
      const p2p = summarizeVitestReport(report, passToPass);
      const passed = f2p.allPassed && (passToPass.length === 0 || p2p.allPassed);

      const output = [
        `vitest 退出码 ${exitCode}`,
        `FAIL_TO_PASS: ${f2p.passed}/${f2p.total}${f2p.missing.length ? ` 未通过: ${f2p.missing.join(', ')}` : ''}`,
        passToPass.length ? `PASS_TO_PASS: ${p2p.passed}/${p2p.total}` : 'PASS_TO_PASS: 未声明',
      ].join(' | ');

      this.maybeCleanup(workspace, passed);

      return {
        executed: true,
        passed,
        output,
        failToPassPassed: f2p.passed,
        failToPassTotal: f2p.total,
        passToPassPassed: p2p.passed,
        passToPassTotal: p2p.total,
        missing: [...f2p.missing, ...p2p.missing],
        workspace,
      };
    } catch (error) {
      logger.error(
        { problemId: problem.id, error: (error as Error).message },
        '解法真实执行失败（按未通过处理）',
      );
      this.maybeCleanup(workspace, false);

      return {
        executed: false,
        passed: false,
        output: `执行异常: ${(error as Error).message}`,
        failToPassPassed: 0,
        failToPassTotal: failToPass.length,
        passToPassPassed: 0,
        passToPassTotal: passToPass.length,
        missing: failToPass,
        workspace: workspace || undefined,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 按策略清理工作区
   *
   * 默认策略：**通过就清、失败保留**。失败现场最有排查价值；而工作区里的
   * `solution.test.ts` 若大量留存，会被静态扫描器误当仓库测试资产（已实测虚增用例数）。
   *
   * @param workspace 工作区路径（空串表示未创建）
   * @param passed 本次判定是否通过
   */
  private maybeCleanup(workspace: string, passed: boolean): void {
    if (!workspace) return;

    const shouldKeep = this.keepWorkspace || (this.keepOnFailure && !passed);
    if (shouldKeep) {
      logger.debug({ workspace, passed }, '保留工作区（失败现场 / 显式 keepWorkspace）');
      return;
    }

    fs.rmSync(workspace, { recursive: true, force: true });
  }

  /**
   * 用 node 直接启动 vitest（**不经 shell**，argv 逐项传递）
   *
   * @param entry vitest.mjs 绝对路径
   * @param workspace 工作区（作为 --root）
   * @returns 退出码（超时返回 -1）
   */
  private spawnVitest(entry: string, workspace: string): Promise<number> {
    return new Promise<number>((resolve) => {
      // ── 参数已被"基准"筛过：不要加 `--maxWorkers` / `--no-isolate` ──
      // 2026-09-19 实测（单题工作区，同一份最小题目，五个参数组合各跑一遍）：
      //   baseline                    1672ms  total=1 passed=1 ✅
      //   `--maxWorkers=1`             935ms  **total=0 空报告**（退出码仍为 0 → 假成功）
      //   `--no-isolate`               1779ms  total=1 ✅ 但无收益（甚至略慢）
      //   `--maxWorkers=1 --no-isolate`1200ms  **total=0**
      // ⇒ ① `--maxWorkers` 在本仓 vitest 版本下会**静默不执行用例**（"快了"其实是没跑），
      //    绝不能加 —— 判定会退化成"恒未通过"，与 `docs/77` 说的"假信号"同类；
      //   ② 单文件本就只起 1 个 worker，**没有 worker 相关的启动开销可省**，~1.7s 是启动下限。
      // 想要更快只能**减少嵌套运行次数**（每题一次是当前架构的下限）。
      const args = [
        entry,
        'run',
        '--root',
        workspace,
        '--reporter=json',
        `--outputFile=${path.join(workspace, VITEST_RESULT_FILE_NAME)}`,
      ];

      const child = spawn(process.execPath, args, {
        cwd: workspace,
        shell: false, // 结构上杜绝注入
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      child.stdout?.on('data', (d) => {
        output += String(d);
      });
      child.stderr?.on('data', (d) => {
        output += String(d);
      });

      const timer = setTimeout(() => {
        child.kill();
        logger.warn({ workspace, timeoutMs: this.timeoutMs }, '真实测试执行超时（已终止）');
        resolve(-1);
      }, this.timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        logger.debug({ workspace, code, outputTail: output.slice(-400) }, '真实测试执行结束');
        resolve(code ?? -1);
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        logger.error({ workspace, error: error.message }, '真实测试进程启动失败');
        resolve(-2);
      });
    });
  }

  /** 构造"未执行"结果（调用方据此回退启发式并如实标注） */
  private skippedResult(
    reason: string,
    failToPassTotal: number,
    passToPassTotal: number,
  ): ExecutionResult {
    return {
      executed: false,
      passed: false,
      output: `未执行真实测试: ${reason}`,
      failToPassPassed: 0,
      failToPassTotal,
      passToPassPassed: 0,
      passToPassTotal,
      missing: [],
      error: reason,
    };
  }
}
