/**
 * SWE-Bench 评测运行器 - Agent 集成
 * 使用 EasyAgent AgentEngine 对 benchmark-tasks.json 中的任务进行实际代码生成评测
 * 计算 pass@k、resolved rate 等核心指标
 *
 * 参考: docs/09_EasyAgent项目Review与优化建议报告.md P0-2
 */
import { SWEBenchEngine } from './SWEBenchEngine.js';
import type { SWEBenchProblem } from './SWEBenchEngine.js';
import { SolutionRunner } from './solutionRunner.js';
import type { ExecutionResult } from './solutionRunner.js';
import { AgentEngine } from '../agent/AgentEngine.js';
import type { BaseAdapter } from '../adapters/BaseAdapter.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { ToolRegistry } from '../tools/index.js';
import { getAllBuiltinTools } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import type { ProviderConfig, ProviderId } from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ===================== 常量 =====================

/**
 * 评分口径标识（两档，会写进报告与摘要）
 *
 * · `vitest-executed`     —— 解法与数据集自带 `test_patch` 落盘后**由 vitest 真实执行**，
 *                            并按 `FAIL_TO_PASS` / `PASS_TO_PASS` 逐条核对（2026-09-19 起为默认）
 * · `heuristic-structural` —— 回退档：只做「非空 + 括号配对 + 含 export/function/class」判断，
 *                            **不执行测试**（vitest 不可用时使用，报告中必须如实标注）
 */
const SCORING_VITEST = 'vitest-executed';
const SCORING_HEURISTIC = 'heuristic-structural';

/** 口径限制说明（写进报告与摘要，防止数字被过度解读） */
const LIMITATION_VITEST =
  '解法与数据集自带 test_patch 一并落盘，由 vitest 真实执行并逐条核对 FAIL_TO_PASS；' +
  '注意提示词仍把 test_patch 作为"参考"给了模型（开卷），分数天然偏乐观。';
const LIMITATION_HEURISTIC =
  '评分为结构化启发式（代码块非空 + 括号配对 + 含 export/function/class），不执行测试用例；' +
  'pass@k 表示"产出结构完整的代码"，不等于"通过测试"。';

/** 评测默认轮次上限（非 agentic 模式够用；agentic 模式由 CLI 提到 10~15） */
const DEFAULT_MAX_TURNS = 3;

/** 评测默认是否允许工具调用：false = 只考"一次性输出代码"（历史行为） */
const DEFAULT_ALLOW_TOOLS = false;

/** 离线桩输出的函数名（离线自测用，非真实模型输出） */
const OFFLINE_STUB_FUNCTION_NAME = 'offlineStubSolution';

/** 离线桩产物标记：一眼可辨"这不是模型写的" */
const OFFLINE_STUB_MARKER = '[OFFLINE STUB]';

// ===================== 类型 =====================

/**
 * 解法生成器（依赖注入）
 *
 * 存在的意义：让**评测流程本身**不依赖真实模型也能跑通 —— 离线自测（`--offline`）、
 * CI 自检、单元测试都靠它注入确定性实现。离线产出的结果**不代表任何真实模型的
 * 代码能力**，报告中以 `meta.mode = 'offline-mock'` + 醒目横幅标注。
 *
 * @param prompt 与真实模式完全相同的提示词（保证离线路径与在线路径同构）
 * @param problem 当前题目（桩实现可据此产出确定性输出）
 */
export type SolutionGenerator = (prompt: string, problem: SWEBenchProblem) => Promise<string>;

/** 运行模式：live = 真实模型；offline-mock = 离线桩（不调用任何模型） */
export type BenchmarkMode = 'live' | 'offline-mock';

/** Agent 评测配置 */
export interface AgentBenchmarkConfig {
  /** 使用的模型提供商 */
  provider: string;
  /** 使用的模型名 */
  model: string;
  /** pass@k 的 k 值 (每题尝试 k 次) */
  k: number;
  /** 单题超时 (毫秒) */
  timeoutPerProblem: number;
  /** 评测数据集路径 */
  datasetPath: string;
  /** 结果输出目录 */
  outputDir: string;
  /** 最大评测题数 (用于快速验证) */
  maxProblems?: number;
  /** 按难度过滤 */
  filterDifficulty?: 'easy' | 'medium' | 'hard';
  /** 是否详细输出日志 */
  verbose?: boolean;
  /**
   * 离线模式：不初始化任何模型，改用 `solutionGenerator`（未提供时用内置桩）。
   * 用途：无 API Key 时验证评测全流程（题数/聚合/报告落盘）。
   */
  offline?: boolean;
  /** 依赖注入的解法生成器（离线自测 / 单测用；提供时优先于 offline 内置桩） */
  solutionGenerator?: SolutionGenerator;
  /**
   * 依赖注入的适配器（Mock 适配器 / 自定义适配器）
   *
   * `AgentEngine` 本身就支持直接传适配器实例。传入后走**完整的 agent 链路**
   * （工具注册表 → 工具执行 → 消息回灌 → 多轮），因此可以在零成本、不联网的前提下
   * 验证"我们的编排逻辑"而不是"模型的第一次输出"。
   */
  adapter?: BaseAdapter;
  /** 是否允许模型调用工具（默认 false = 只考"一次性输出代码"；true = agentic 模式） */
  allowTools?: boolean;
  /** 最大轮次（默认 3；agentic 模式建议 10~15） */
  maxTurns?: number;
  /**
   * 评分方式：
   * · `auto`（默认）——能解析到 vitest 就真实执行，否则回退启发式并标注
   * · `vitest`      ——强制真实执行（不可用则每题按"未执行/未通过"记录并标注）
   * · `off`         ——强制启发式（不跑测试，用于对照）
   */
  testExecution?: 'auto' | 'vitest' | 'off';
  /** 真实测试工作区根目录（默认 `temp/benchmark-run`，仓库内且已被忽略） */
  workDir?: string;
  /** 单题真实测试超时（毫秒，默认 60000） */
  testTimeoutMs?: number;
  /** 是否保留**全部**工作区（默认 false = 通过即清、失败保留；调试时可开） */
  keepWorkspace?: boolean;
}

/**
 * 离线桩解法：easy/medium 输出结构完整的占位实现，hard **刻意不产出**可判定结构
 *
 * 为什么 hard 故意失败：离线自测的目的是验证**聚合与报告**（pass@k 计算、难度分组、
 * 失败分支记录）。若桩让 10 题全绿，则"全通过"会掩盖聚合缺陷（如恒真判定）。
 * 因此固定产出 7/10 的确定性混合结果，并全程标注 OFFLINE STUB。
 */
export function buildOfflineStubSolution(problem: SWEBenchProblem): string {
  if (problem.difficulty === 'hard') {
    return [
      `// ${OFFLINE_STUB_MARKER} 离线自测：hard 题刻意不产出可判定结构（覆盖失败分支）`,
      `// 题目: ${problem.id}`,
    ].join('\n');
  }

  return [
    '```typescript',
    `// ${OFFLINE_STUB_MARKER} 离线自测占位实现 —— 非真实模型输出，勿作为能力依据`,
    `export function ${OFFLINE_STUB_FUNCTION_NAME}(input: unknown): unknown {`,
    '  if (input === undefined || input === null) return null;',
    '  return input;',
    '}',
    '```',
  ].join('\n');
}

/** 单题结果详情 */
export interface BenchmarkProblemResult {
  problemId: string;
  difficulty: string;
  /** pass@k: k 次尝试中至少一次通过 */
  passed: boolean;
  /** 通过的尝试次数 */
  passCount: number;
  /** 总尝试次数 */
  totalAttempts: number;
  /** pass@k 值 */
  passAtK: number;
  /** 每次尝试的详情 */
  attempts: BenchmarkAttempt[];
}

/** 单次尝试详情 */
export interface BenchmarkAttempt {
  attemptIndex: number;
  success: boolean;
  solution: string;
  testResult: string;
  timeElapsed: number;
  tokenUsage: { input: number; output: number };
  /** 真实执行详情（落盘工作区 + FAIL_TO_PASS 逐条核对结果；未执行时不出现） */
  execution?: ExecutionResult;
  error?: string;
}

/** 完整评测报告 */
export interface BenchmarkReport {
  /** 评测元信息 */
  meta: {
    provider: string;
    model: string;
    k: number;
    timestamp: string;
    datasetPath: string;
    totalProblems: number;
    /** 运行模式：live = 真实模型；offline-mock = 离线桩（结果不代表模型能力） */
    mode: BenchmarkMode;
    /** 评分口径标识（`vitest-executed` 真实执行 / `heuristic-structural` 结构化启发式） */
    scoring: string;
    /** 口径限制说明（原样写进报告，防止数字被过度解读） */
    limitation: string;
    /** 是否 agentic（允许工具调用 + 多轮）：true 才是"测 Agent"，false 只考"一次性输出" */
    agentic: boolean;
    /** 真实测试执行是否可用（false 时 scoring 必为启发式档） */
    testExecutionAvailable: boolean;
    /** 真实执行不可用的原因（可用时为空） */
    testExecutionReason?: string;
  };
  /** 总体评分 */
  scores: {
    /** 总体 pass@k 率 */
    overallPassRate: number;
    /** 总体解决率 (resolved rate) */
    overallResolvedRate: number;
    /** 按难度分组的 pass@k */
    byDifficulty: Record<string, { total: number; passed: number; rate: number }>;
    /** 平均每题耗时 */
    avgTimePerProblem: number;
    /** 平均 Token 消耗 */
    avgTokens: { input: number; output: number };
  };
  /** 每题详情 */
  problemResults: BenchmarkProblemResult[];
}

/**
 * Agent 评测运行器
 * 将 SWEBenchEngine 与 AgentEngine 集成，实际运行代码生成评测
 */
export class BenchmarkRunner {
  private engine: SWEBenchEngine;
  private config: AgentBenchmarkConfig;
  private agentEngine: AgentEngine | null = null;
  /** 真实测试执行器（每题一个独立工作区） */
  private solutionRunner: SolutionRunner;
  /** 真实执行是否启用（在 run() 里解析一次，避免每题重复探测 vitest） */
  private executionEnabled = false;
  /** 真实执行不可用的原因 */
  private executionReason: string | undefined;

  constructor(config: AgentBenchmarkConfig) {
    this.config = config;

    this.engine = new SWEBenchEngine({
      dataDir: this.config.datasetPath,
      resultsDir: this.config.outputDir,
      maxProblems: this.config.maxProblems,
      filterDifficulty: this.config.filterDifficulty,
      timeoutPerProblem: this.config.timeoutPerProblem,
      parallel: 1,
    });

    this.solutionRunner = new SolutionRunner({
      workDir: this.config.workDir,
      timeoutMs: this.config.testTimeoutMs,
      keepWorkspace: this.config.keepWorkspace,
    });
  }

  /**
   * 初始化 Agent 引擎
   *
   * 两条装配路径：
   * · 注入了 `adapter`（Mock / 自定义）→ 直接把适配器交给 AgentEngine，**不读取任何 API Key**
   * · 否则从 `ConfigManager` 取 ProviderConfig（无 Key 时 fail-fast 报「未配置」）
   */
  private async initAgent(): Promise<AgentEngine> {
    if (this.agentEngine) return this.agentEngine;

    const agentOptions = {
      maxTurns: this.config.maxTurns ?? DEFAULT_MAX_TURNS,
      allowTools: this.config.allowTools ?? DEFAULT_ALLOW_TOOLS,
    };

    // ① 真实模型路径**先**校验 provider：fail-fast（无 Key 立即报错，不去白建工具表）
    let provider: ProviderConfig | undefined;
    if (!this.config.adapter) {
      const configManager = new ConfigManager();
      provider = configManager.getProvider(this.config.provider as ProviderId);
      if (!provider) {
        throw new Error(`提供商 "${this.config.provider}" 未配置。请先设置 API Key。`);
      }
    }

    // ② 工具表：仅 agentic 模式需要
    const toolRegistry = this.buildToolRegistry(agentOptions.allowTools);

    // ③ 装配 AgentEngine
    if (this.config.adapter) {
      this.agentEngine = new AgentEngine(
        this.config.adapter,
        toolRegistry,
        undefined,
        agentOptions,
      );
      logger.warn(
        { agentic: agentOptions.allowTools, maxTurns: agentOptions.maxTurns },
        '评测使用注入的适配器（Mock/自定义），不读取任何 API Key',
      );
    } else {
      this.agentEngine = new AgentEngine(
        provider as ProviderConfig,
        toolRegistry,
        undefined,
        agentOptions,
      );
    }

    return this.agentEngine;
  }

  /**
   * 构建工具表
   *
   * 仅 agentic 模式需要内置工具；**注册失败不中断评测**（降级为无工具 + 告警）——
   * 工具表属于增强项，不该让整轮评测崩掉（`tools/index.ts` 的惰性 require 问题
   * 就是这样在测试里暴露的）。
   *
   * @param allowTools 是否允许工具调用
   */
  private buildToolRegistry(allowTools: boolean): ToolRegistry {
    const registry = new ToolRegistry();
    if (!allowTools) return registry;

    try {
      for (const tool of getAllBuiltinTools()) {
        registry.register(tool);
      }
    } catch (error) {
      logger.warn(
        { error: (error as Error).message },
        '内置工具注册失败：agentic 能力受限，评测继续（非致命）',
      );
    }
    return registry;
  }

  /** 是否走离线路径（显式 offline，或注入了自定义解法生成器） */
  private useOfflineStub(): boolean {
    return Boolean(this.config.offline) || typeof this.config.solutionGenerator === 'function';
  }

  /** 是否 agentic（允许工具调用 + 多轮） */
  private isAgentic(): boolean {
    return Boolean(this.config.allowTools);
  }

  /**
   * 当前运行模式
   *
   * 注入了 `adapter` 也算 `offline-mock`：无法保证该适配器是真实厂商通道
   * （通常是 Mock 或本地实现），因此**保守地**标注为"结果不代表模型能力"。
   */
  private getMode(): BenchmarkMode {
    if (this.useOfflineStub()) return 'offline-mock';
    if (this.config.adapter) return 'offline-mock';
    return 'live';
  }

  /** 当前评分口径（真实执行未启用时一律为启发式档） */
  private getScoring(): string {
    return this.executionEnabled ? SCORING_VITEST : SCORING_HEURISTIC;
  }

  /** 当前口径限制说明 */
  private getLimitation(): string {
    return this.executionEnabled ? LIMITATION_VITEST : LIMITATION_HEURISTIC;
  }

  /**
   * 解析真实执行是否可用（每次 run() 只做一次）
   *
   * @returns 是否启用 + 不可用原因
   */
  private resolveExecution(): { enabled: boolean; reason?: string } {
    const mode = this.config.testExecution ?? 'auto';
    if (mode === 'off') {
      return { enabled: false, reason: '配置为 testExecution=off（强制启发式对照档）' };
    }

    const available = this.solutionRunner.isAvailable();
    if (available.ok) return { enabled: true };

    const reason = available.reason || 'vitest 不可用';
    if (mode === 'vitest') {
      logger.error({ reason }, 'testExecution=vitest 但 vitest 不可用：所有题目将按"未执行"记录');
    } else {
      logger.warn({ reason }, 'vitest 不可用，自动回退结构化启发式（报告中会如实标注）');
    }
    return { enabled: false, reason };
  }

  /**
   * 取一次"解法"文本
   *
   * 三条路径同构（都吃同一份 prompt）：
   *   ① 注入的生成器（离线自测 / 单测）→ ② offline 内置桩 → ③ 真实模型 / 注入适配器的 Agent
   */
  private async resolveSolution(prompt: string, problem: SWEBenchProblem): Promise<string> {
    if (typeof this.config.solutionGenerator === 'function') {
      return this.config.solutionGenerator(prompt, problem);
    }
    if (this.config.offline) {
      return buildOfflineStubSolution(problem);
    }
    const agent = await this.initAgent();
    return agent.run(prompt);
  }

  /**
   * 运行完整评测
   */
  async run(): Promise<BenchmarkReport> {
    const startTime = Date.now();

    // 加载问题
    const problems = this.engine.loadProblems();
    if (problems.length === 0) {
      throw new Error(`未找到评测数据: ${this.config.datasetPath}`);
    }

    if (this.getMode() === 'offline-mock') {
      // 必须大声说明：离线结果不代表任何模型的代码能力（防止被当成真实评测数据引用）
      logger.warn(
        {
          provider: this.config.provider,
          model: this.config.model,
          problems: problems.length,
          adapterInjected: Boolean(this.config.adapter),
        },
        '离线自测模式（offline-mock）：不调用真实模型，结果不代表模型代码能力',
      );
    }

    // 真实执行是否可用：只解析一次，不可用时如实回退并在报告中标注
    const execution = this.resolveExecution();
    this.executionEnabled = execution.enabled;
    this.executionReason = execution.reason;

    logger.info(
      {
        count: problems.length,
        k: this.config.k,
        scoring: this.getScoring(),
        agentic: this.isAgentic(),
        executionReason: this.executionReason,
      },
      '开始 SWE-Bench Agent 评测',
    );

    // 真实模型路径先 fail-fast：无 provider 时尽早报「未配置 API Key」，避免白跑数据集
    // （注入适配器 / 离线桩两条路径不需要 Key）
    if (!this.useOfflineStub()) {
      await this.initAgent();
    }

    // 创建会话
    this.engine.createSession();

    const problemResults: BenchmarkProblemResult[] = [];

    // 逐题评测
    for (let i = 0; i < problems.length; i++) {
      const problem = problems[i];
      logger.info(
        { idx: i + 1, total: problems.length, id: problem.id },
        `评测中: ${problem.issue_title}`,
      );

      try {
        const result = await this.evaluateProblem(problem);
        problemResults.push(result);

        // 记录到引擎
        this.engine.recordResult(problem.id, {
          problemId: problem.id,
          passed: result.passed,
          score: result.passAtK,
          details: {
            resolved: result.passed,
            timeElapsed: result.attempts.reduce((s, a) => s + a.timeElapsed, 0),
            attempts: result.totalAttempts,
          },
          metadata: { passCount: result.passCount },
        });
      } catch (error) {
        logger.error({ problemId: problem.id, error: (error as Error).message }, '评测失败');
        const failed: BenchmarkProblemResult = {
          problemId: problem.id,
          difficulty: problem.difficulty || 'unknown',
          passed: false,
          passCount: 0,
          totalAttempts: this.config.k,
          passAtK: 0,
          attempts: [],
        };
        problemResults.push(failed);
      }
    }

    // 生成摘要
    const summary = this.engine.generateSummary();

    // 计算按难度分组
    const byDifficulty: Record<string, { total: number; passed: number; rate: number }> = {};
    const problemMap = new Map(problems.map((p) => [p.id, p]));
    for (const r of problemResults) {
      const diff = problemMap.get(r.problemId)?.difficulty || 'unknown';
      if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, passed: 0, rate: 0 };
      byDifficulty[diff].total++;
      if (r.passed) byDifficulty[diff].passed++;
    }
    for (const key of Object.keys(byDifficulty)) {
      const d = byDifficulty[key];
      d.rate = d.total > 0 ? d.passed / d.total : 0;
    }

    const totalTime = Date.now() - startTime;
    const report: BenchmarkReport = {
      meta: {
        provider: this.config.provider,
        model: this.config.model,
        k: this.config.k,
        timestamp: new Date().toISOString(),
        datasetPath: this.config.datasetPath,
        totalProblems: problems.length,
        mode: this.getMode(),
        scoring: this.getScoring(),
        limitation: this.getLimitation(),
        agentic: this.isAgentic(),
        testExecutionAvailable: this.executionEnabled,
        testExecutionReason: this.executionReason,
      },
      scores: {
        overallPassRate: summary.resolutionRate,
        overallResolvedRate: summary.resolutionRate,
        byDifficulty,
        avgTimePerProblem: problemResults.length > 0 ? totalTime / problemResults.length : 0,
        avgTokens: summary.averageTokens,
      },
      problemResults,
    };

    // 保存结果
    this.saveReport(report);

    return report;
  }

  /**
   * 评测单个问题 (pass@k)
   */
  private async evaluateProblem(problem: SWEBenchProblem): Promise<BenchmarkProblemResult> {
    const attempts: BenchmarkAttempt[] = [];
    let passCount = 0;

    for (let attempt = 0; attempt < this.config.k; attempt++) {
      const attemptResult = await this.singleAttempt(problem, attempt);
      attempts.push(attemptResult);
      if (attemptResult.success) passCount++;
    }

    return {
      problemId: problem.id,
      difficulty: problem.difficulty || 'unknown',
      passed: passCount > 0,
      passCount,
      totalAttempts: this.config.k,
      passAtK: passCount / this.config.k,
      attempts,
    };
  }

  /**
   * 单次尝试：让 Agent 解决一个编码问题
   */
  private async singleAttempt(
    problem: SWEBenchProblem,
    attemptIndex: number,
  ): Promise<BenchmarkAttempt> {
    const startTime = Date.now();

    try {
      // 构建 prompt（离线/在线同构：桩也收到同一份提示词）
      const prompt = this.buildPrompt(problem);

      // 生成"解法"：注入的生成器 / 离线桩 / 真实模型 Agent 三选一
      const responseText = await this.runWithTimeout(
        this.resolveSolution(prompt, problem),
        this.config.timeoutPerProblem,
      );

      // 提取生成的代码
      const solution = this.extractCodeFromResponse(responseText);

      // 判定：优先真实执行（落盘 + vitest + FAIL_TO_PASS 核对），不可用时回退启发式并标注
      const judged = await this.judgeSolution(solution, problem);

      const timeElapsed = Date.now() - startTime;

      return {
        attemptIndex,
        success: judged.passed,
        solution,
        testResult: judged.output,
        timeElapsed,
        // 无法精确获取 Token 用量，因为 Agent.run() 返回 string
        tokenUsage: { input: 0, output: 0 },
        execution: judged.execution,
      };
    } catch (error) {
      const timeElapsed = Date.now() - startTime;
      return {
        attemptIndex,
        success: false,
        solution: '',
        testResult: '',
        timeElapsed,
        tokenUsage: { input: 0, output: 0 },
        error: (error as Error).message,
      };
    }
  }

  /**
   * 构建 Agent Prompt：要求生成可通过测试的代码
   */
  private buildPrompt(problem: SWEBenchProblem): string {
    let prompt = `你是一个专业的 TypeScript 编程助手。请解决以下编码问题，写出完整的、可直接运行的正确代码。

## 问题描述
${problem.issue_body}

## 要求
1. 写出完整的 TypeScript/JavaScript 实现代码
2. 代码必须正确处理所有边界条件
3. 只输出代码，使用 \`\`\`typescript 代码块包裹
4. 确保代码语法正确、逻辑完整

`;
    if (problem.hint_text) {
      prompt += `## 提示
${problem.hint_text}

`;
    }

    if (problem.test_patch) {
      prompt += `## 需要通过的测试用例 (参考)
${problem.test_patch}

`;
    }

    prompt += `请立即输出完整代码：`;
    return prompt;
  }

  /**
   * 从 Agent 响应中提取代码
   */
  private extractCodeFromResponse(text: string): string {
    // 尝试提取 ```typescript ... ``` 或 ```ts ... ``` 或 ``` ... ```
    const tsMatch = text.match(/```(?:typescript|ts|javascript|js)?\s*\n?([\s\S]*?)```/);
    if (tsMatch) return tsMatch[1].trim();

    // 回退：返回全部文本
    return text.trim();
  }

  /**
   * 判定解法是否"解决"（统一入口）
   *
   * 优先级：**真实执行**（落盘 + vitest + `FAIL_TO_PASS` 核对）→ 不可用时回退结构化启发式。
   * **回退不是静默的**：原因会写进 `output` 与报告的 `meta.testExecutionReason`。
   *
   * @param solution 从模型响应中提取出的解法源码
   * @param problem 题目（提供 `test_patch` / `FAIL_TO_PASS`）
   */
  private async judgeSolution(
    solution: string,
    problem: SWEBenchProblem,
  ): Promise<{ passed: boolean; output: string; execution?: ExecutionResult }> {
    if (this.executionEnabled) {
      const execution = await this.solutionRunner.run(problem, solution);
      if (execution.executed) {
        return { passed: execution.passed, output: execution.output, execution };
      }
      // 执行器存在但本次没跑成（缺 test_patch / 超时 / 报告缺失）→ 回退并保留原因
      const fallback = this.heuristicJudge(solution);
      return {
        ...fallback,
        output: `${fallback.output}（真实执行未完成：${execution.error ?? '未知原因'}）`,
        execution,
      };
    }
    return this.heuristicJudge(solution);
  }

  /**
   * 结构化启发式判定（**不执行测试**，回退档）
   *
   * 判据：① 非空且长度 ≥ 10 ② 花括号数量差 ≤ 2 ③ 含 export/function/class
   *
   * ⚠️ 它只是 `pass@k` 的**粗近似**，只说明"产出了结构完整的代码"。启用本档时报告与摘要的
   * `scoring` 必为 `heuristic-structural`，对外**不得**声称 SWE-bench 分数。
   *
   * @param solution 解法源码
   */
  private heuristicJudge(solution: string): { passed: boolean; output: string } {
    // 1. 非空且长度足够
    if (!solution || solution.trim().length < 10) {
      return {
        passed: false,
        output: '解决方案为空或过短',
      };
    }

    // 2. 基础语法检查：括号匹配
    const openBraces = (solution.match(/{/g) || []).length;
    const closeBraces = (solution.match(/}/g) || []).length;
    if (Math.abs(openBraces - closeBraces) > 2) {
      return {
        passed: false,
        output: `括号不匹配: { ${openBraces} vs } ${closeBraces}`,
      };
    }

    // 3. 是否包含 export/function/class 等关键结构
    const hasExport = solution.includes('export');
    const hasFunction = solution.includes('function') || solution.includes('=>');
    const hasClass = solution.includes('class');
    const hasStructuralCode = hasExport || hasFunction || hasClass;

    return {
      passed: hasStructuralCode && openBraces > 0,
      output: hasStructuralCode
        ? `语法基本验证通过 (export=${hasExport}, fn=${hasFunction}, class=${hasClass})`
        : '未找到关键代码结构 (export/function/class)',
    };
  }

  /**
   * 带超时的 Promise 执行
   */
  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`评测超时 (${timeoutMs}ms)`)), timeoutMs),
      ),
    ]);
  }

  /**
   * 保存评测报告为 Markdown
   */
  saveReport(report: BenchmarkReport, outputPath?: string): string {
    const filePath =
      outputPath || path.join(this.config.outputDir, `swebench_report_${Date.now()}.md`);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const md = this.formatMarkdownReport(report);
    fs.writeFileSync(filePath, md, 'utf-8');
    logger.info({ filePath }, '评测报告已保存');
    return filePath;
  }

  /**
   * 格式化为 Markdown 报告
   */
  formatMarkdownReport(report: BenchmarkReport): string {
    const { meta, scores } = report;
    const passRate = (scores.overallPassRate * 100).toFixed(1);

    const lines: string[] = [
      `# SWE-Bench Agent 代码质量评测报告`,
      '',
      // 离线自测必须"自曝身份"，否则数字会被当成真实模型能力引用
      ...(meta.mode === 'offline-mock'
        ? [
            '> ⚠️ **本次为离线自测（offline-mock）**：全程未调用任何模型，',
            '> 结果为内置桩输出，**不代表任何模型的真实代码能力**，仅用于验证评测流程与聚合口径。',
            '',
          ]
        : []),
      `> 评分口径: \`${meta.scoring}\`（${
        meta.scoring === SCORING_VITEST ? 'vitest 真实执行' : '结构化启发式，**未执行测试**'
      }）`,
      `> 运行姿态: ${meta.agentic ? 'agentic（允许工具调用 + 多轮）' : '非 agentic（仅一次性输出代码）'} · 真实执行: ${
        meta.testExecutionAvailable ? '可用' : `不可用（${meta.testExecutionReason ?? '未知'}）`
      }`,
      `> 口径限制: ${meta.limitation}`,
      '',
      `> 评测时间: ${meta.timestamp}`,
      `> 模型: ${meta.provider}/${meta.model}`,
      `> 评测模式: pass@${meta.k}`,
      `> 题目总数: ${meta.totalProblems}`,
      '',
      '## 📊 总体结果',
      '',
      `| 指标 | 值 |`,
      `|------|-----|`,
      `| 总体 Pass@${meta.k} | **${passRate}%** (${report.problemResults.filter((r) => r.passed).length}/${meta.totalProblems}) |`,
      `| 解决率 (Resolved Rate) | **${passRate}%** |`,
      `| 平均耗时 | ${(scores.avgTimePerProblem / 1000).toFixed(1)}s |`,
      `| 平均输入 Token | ${Math.round(scores.avgTokens.input)} |`,
      `| 平均输出 Token | ${Math.round(scores.avgTokens.output)} |`,
      '',
      '## 📈 按难度分布',
      '',
      '| 难度 | 总数 | 通过 | 通过率 |',
      '|------|------|------|--------|',
    ];

    for (const [diff, stats] of Object.entries(scores.byDifficulty)) {
      const rate = (stats.rate * 100).toFixed(1);
      lines.push(`| ${diff} | ${stats.total} | ${stats.passed} | ${rate}% |`);
    }

    lines.push('', '## 📋 逐题详情', '');

    for (const r of report.problemResults) {
      const status = r.passed ? '✅' : '❌';
      const passInfo = r.totalAttempts > 1 ? ` (${r.passCount}/${r.totalAttempts} attempts)` : '';
      lines.push(`### ${status} ${r.problemId} - \`${r.difficulty}\`${passInfo}`);
      lines.push(`- 通过率: ${(r.passAtK * 100).toFixed(0)}%`);
      lines.push('');

      for (const a of r.attempts) {
        const aStatus = a.success ? '✅' : '❌';
        lines.push(
          `<details><summary>${aStatus} 尝试 ${a.attemptIndex + 1} (${(a.timeElapsed / 1000).toFixed(1)}s)</summary>`,
        );
        lines.push('');
        if (a.solution) {
          lines.push('```typescript');
          lines.push(a.solution.substring(0, 300));
          if (a.solution.length > 300) lines.push('// ... (截断)');
          lines.push('```');
        }
        if (a.execution) {
          lines.push(
            `- 真实执行: ${a.execution.executed ? 'vitest 已跑' : '未跑'} · FAIL_TO_PASS ${a.execution.failToPassPassed}/${a.execution.failToPassTotal}${
              a.execution.workspace ? ` · 工作区 \`${a.execution.workspace}\`` : ''
            }`,
          );
        }
        if (a.error) {
          lines.push(`- 错误: \`${a.error}\``);
        }
        lines.push('</details>');
        lines.push('');
      }
    }

    lines.push('---');
    lines.push(`*报告由 EasyAgent SWE-Bench Runner 生成 · ${meta.timestamp}*`);

    return lines.join('\n');
  }

  /**
   * 生成精简的 JSON 摘要 (用于 README badge 等)
   */
  getSummaryJSON(report: BenchmarkReport): string {
    const { meta, scores } = report;
    return JSON.stringify(
      {
        provider: meta.provider,
        model: meta.model,
        passAtK: meta.k,
        passRate: scores.overallPassRate,
        resolvedRate: scores.overallResolvedRate,
        totalProblems: meta.totalProblems,
        byDifficulty: scores.byDifficulty,
        timestamp: meta.timestamp,
        // 机器可读的口径字段：任何展示/引用这些数字的地方都应带上它们
        mode: meta.mode,
        scoring: meta.scoring,
        limitation: meta.limitation,
        agentic: meta.agentic,
        testExecutionAvailable: meta.testExecutionAvailable,
      },
      null,
      2,
    );
  }
}

/**
 * 定位内置 benchmark 数据集
 *
 * tsup 只处理 JS/TS 入口，**不会复制 JSON 资源**，因此产物目录 `dist/` 下
 * 曾经没有这份数据集 —— 而 `__dirname` 恒指向构建产物目录，导致
 * `dryRunBenchmark()` 在 dist 环境下永远返回 ok:false。
 *
 * 现在按优先级探测，并在**源码目录**（本仓开发态 / vitest）兜底：
 *   ① `dist/benchmark-tasks.json`（构建时由 tsup `onSuccess` 复制）
 *   ② `<core>/src/benchmark/benchmark-tasks.json`（源码目录）
 *
 * @returns 数据集绝对路径（都找不到时返回候选①，由调用方判断存在性）
 */
export function loadBuiltinDataset(): string {
  const candidates = [
    path.join(__dirname, 'benchmark-tasks.json'),
    path.resolve(__dirname, '..', 'src', 'benchmark', 'benchmark-tasks.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/**
 * 快速验证运行器能否正常工作 (dry-run)
 *
 * 注意：这里**真实调用 `SWEBenchEngine.loadProblems()`**（与评测同一条加载链路）。
 * 旧实现只检查文件是否存在，而 CLI 另有一套宽松解析器 —— 于是出现过
 * 「dry-run 显示 10 题、真评测 0 题」的假通过（2026-09-19 修复）。
 *
 * @param datasetPath 可选自定义数据集路径
 * @param outputDir 结果目录（仅用于构造引擎，不会写文件）
 */
export async function dryRunBenchmark(
  datasetPath?: string,
  outputDir?: string,
): Promise<{ ok: boolean; problemCount: number; datasetPath: string }> {
  const resolved = datasetPath || loadBuiltinDataset();
  if (!fs.existsSync(resolved)) {
    return { ok: false, problemCount: 0, datasetPath: resolved };
  }

  const engine = new SWEBenchEngine({
    dataDir: resolved,
    resultsDir: outputDir || path.join(__dirname, '..', 'benchmark-results'),
    maxProblems: 0, // 0 = 不截断，统计全量
  });
  const problems = engine.loadProblems();
  return { ok: problems.length > 0, problemCount: problems.length, datasetPath: resolved };
}
