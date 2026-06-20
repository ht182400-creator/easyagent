/**
 * SWE-Bench 评测框架
 * 用于评估 AI 编程助手在真实 GitHub 问题修复任务上的表现
 * 支持问题加载、补丁生成、评估和结果报告
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';

/** SWE-Bench 问题定义 */
export interface SWEBenchProblem {
  id: string;
  repo: string;
  instance_id: string;
  base_commit: string;
  issue_title: string;
  issue_body: string;
  hint_text?: string;
  patch?: string;       // 标准答案 patch (gold patch)
  test_patch?: string;  // 测试补丁
  fail_to_pass: string[];
  pass_to_pass: string[];
  created_at: string;
  version: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

/** 评估结果 */
export interface EvaluationResult {
  problemId: string;
  passed: boolean;
  score: number;
  details: {
    resolved: boolean;
    testResults?: {
      total: number;
      passed: number;
      failed: number;
      errors: string[];
    };
    patchGenerated?: string;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
    };
    timeElapsed: number;
    attempts: number;
  };
  metadata?: Record<string, unknown>;
}

/** 评测会话 */
export interface EvaluationSession {
  id: string;
  startTime: string;
  problems: string[];
  results: Map<string, EvaluationResult>;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: {
    total: number;
    completed: number;
    passed: number;
    failed: number;
  };
  summary?: EvaluationSummary;
}

/** 评测摘要 */
export interface EvaluationSummary {
  totalProblems: number;
  resolved: number;
  unresolved: number;
  resolutionRate: number;
  averageTime: number;
  averageTokens: { input: number; output: number };
  byDifficulty: Record<string, { total: number; resolved: number }>;
  topErrors: Array<{ message: string; count: number }>;
}

/** 框架配置 */
export interface BenchmarkConfig {
  dataDir: string;          // SWE-Bench 数据集路径
  resultsDir: string;       // 评测结果保存路径
  maxProblems?: number;     // 最大评测问题数
  filterDifficulty?: 'easy' | 'medium' | 'hard';
  filterRepos?: string[];   // 只评测特定仓库
  timeoutPerProblem?: number; // 每题超时毫秒
  parallel?: number;        // 并行评测数
}

/**
 * SWE-Bench 评测引擎
 */
export class SWEBenchEngine {
  private config: BenchmarkConfig;
  private problems: SWEBenchProblem[] = [];
  private session: EvaluationSession | null = null;

  constructor(config: BenchmarkConfig) {
    this.config = {
      maxProblems: 10,
      timeoutPerProblem: 300000, // 5分钟
      parallel: 1,
      ...config,
    };
  }

  /**
   * 从标准 SWE-Bench JSONL 文件加载问题
   */
  loadProblems(dataPath?: string): SWEBenchProblem[] {
    const filePath = dataPath || this.config.dataDir;
    try {
      if (fs.statSync(filePath).isDirectory()) {
        // 从目录加载所有 JSONL 文件
        const files = fs.readdirSync(filePath).filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));
        for (const file of files) {
          this.loadFromFile(path.join(filePath, file));
        }
      } else {
        this.loadFromFile(filePath);
      }

      // 应用过滤器
      this.applyFilters();

      logger.info({ count: this.problems.length }, 'SWE-Bench 问题已加载');
      return this.problems;
    } catch (error) {
      logger.error({ error: (error as Error).message }, '加载 SWE-Bench 数据失败');
      return [];
    }
  }

  /**
   * 从单个文件加载
   */
  private loadFromFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      logger.warn({ filePath }, 'SWE-Bench 数据文件不存在');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        this.problems.push({
          id: data.instance_id || data.id || `swe_${this.problems.length}`,
          repo: data.repo || '',
          instance_id: data.instance_id || '',
          base_commit: data.base_commit || '',
          issue_title: data.issue_title || data.title || '',
          issue_body: data.issue_body || data.body || '',
          hint_text: data.hint_text,
          patch: data.patch,
          test_patch: data.test_patch,
          fail_to_pass: data.FAIL_TO_PASS?.split('\n').filter(Boolean) || [],
          pass_to_pass: data.PASS_TO_PASS?.split('\n').filter(Boolean) || [],
          created_at: data.created_at || '',
          version: data.version || '1.0',
          difficulty: this.inferDifficulty(data),
        });
      } catch {
        // 跳过无效行
      }
    }
  }

  /**
   * 推断问题难度
   */
  private inferDifficulty(data: Record<string, unknown>): 'easy' | 'medium' | 'hard' {
    const body = (data.issue_body || data.body || '') as string;
    const length = body.length;
    const tests = ((data.FAIL_TO_PASS || '') as string).split('\n').filter(Boolean).length;

    if (length > 3000 || tests > 5) return 'hard';
    if (length > 1000 || tests > 2) return 'medium';
    return 'easy';
  }

  /**
   * 应用过滤器
   */
  private applyFilters(): void {
    if (this.config.filterDifficulty) {
      this.problems = this.problems.filter(p => p.difficulty === this.config.filterDifficulty);
    }
    if (this.config.filterRepos?.length) {
      this.problems = this.problems.filter(p =>
        this.config.filterRepos!.some(r => p.repo.includes(r))
      );
    }
    if (this.config.maxProblems) {
      this.problems = this.problems.slice(0, this.config.maxProblems);
    }
  }

  /**
   * 获取已加载的问题列表
   */
  getProblems(): SWEBenchProblem[] {
    return [...this.problems];
  }

  /**
   * 创建评测会话
   */
  createSession(problemIds?: string[]): EvaluationSession {
    const sessionId = `swebench_${Date.now()}`;
    const problems = problemIds || this.problems.map(p => p.id);

    this.session = {
      id: sessionId,
      startTime: new Date().toISOString(),
      problems,
      results: new Map(),
      status: 'idle',
      progress: {
        total: problems.length,
        completed: 0,
        passed: 0,
        failed: 0,
      },
    };

    return this.session;
  }

  /**
   * 记录单个问题的评测结果
   */
  recordResult(problemId: string, result: EvaluationResult): void {
    if (!this.session) {
      this.createSession();
    }

    this.session!.results.set(problemId, result);
    this.session!.progress.completed = this.session!.results.size;
    this.session!.progress.passed = [...this.session!.results.values()].filter(r => r.passed).length;
    this.session!.progress.failed = this.session!.progress.completed - this.session!.progress.passed;
  }

  /**
   * 生成评测摘要
   */
  generateSummary(): EvaluationSummary {
    if (!this.session) {
      return {
        totalProblems: 0, resolved: 0, unresolved: 0,
        resolutionRate: 0, averageTime: 0,
        averageTokens: { input: 0, output: 0 },
        byDifficulty: {}, topErrors: [],
      };
    }

    const results = [...this.session.results.values()];
    const resolved = results.filter(r => r.passed).length;
    const total = results.length || 1;

    const times = results.map(r => r.details.timeElapsed).filter(t => t > 0);
    const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

    const tokenUsages = results
      .filter(r => r.details.tokenUsage)
      .map(r => r.details.tokenUsage!);
    const avgInput = tokenUsages.length > 0
      ? tokenUsages.reduce((s, t) => s + t.inputTokens, 0) / tokenUsages.length : 0;
    const avgOutput = tokenUsages.length > 0
      ? tokenUsages.reduce((s, t) => s + t.outputTokens, 0) / tokenUsages.length : 0;

    // 按难度统计
    const byDifficulty: Record<string, { total: number; resolved: number }> = {};
    const problemMap = new Map(this.problems.map(p => [p.id, p]));
    for (const r of results) {
      const problem = problemMap.get(r.problemId);
      const diff = problem?.difficulty || 'unknown';
      if (!byDifficulty[diff]) byDifficulty[diff] = { total: 0, resolved: 0 };
      byDifficulty[diff].total++;
      if (r.passed) byDifficulty[diff].resolved++;
    }

    // 常见错误
    const errorCounts = new Map<string, number>();
    for (const r of results) {
      if (!r.passed && r.details.testResults?.errors) {
        for (const err of r.details.testResults.errors) {
          const short = err.substring(0, 80);
          errorCounts.set(short, (errorCounts.get(short) || 0) + 1);
        }
      }
    }
    const topErrors = [...errorCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const summary: EvaluationSummary = {
      totalProblems: total === 1 && resolved === 0 ? 0 : total,
      resolved,
      unresolved: total - resolved,
      resolutionRate: total > 0 ? resolved / total : 0,
      averageTime: avgTime,
      averageTokens: { input: avgInput, output: avgOutput },
      byDifficulty,
      topErrors,
    };

    this.session.summary = summary;
    return summary;
  }

  /**
   * 保存评测结果到文件
   */
  saveResults(outputPath?: string): string {
    const filePath = outputPath || path.join(
      this.config.resultsDir,
      `swebench_result_${Date.now()}.json`
    );

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      sessionId: this.session?.id,
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      results: [...(this.session?.results.values() || [])].map(r => ({
        ...r,
        details: { ...r.details, patchGenerated: r.details.patchGenerated?.substring(0, 500) },
      })),
    };

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.info({ filePath }, '评测结果已保存');
    return filePath;
  }

  /**
   * 格式化评测报告文本
   */
  formatReport(): string {
    const summary = this.generateSummary();

    const lines: string[] = [
      '═══════════════════════════════════════════',
      '       SWE-Bench 评测报告',
      '═══════════════════════════════════════════',
      '',
      `📊 总体结果:`,
      `  总问题数: ${summary.totalProblems}`,
      `  已解决:   ${summary.resolved}`,
      `  未解决:   ${summary.unresolved}`,
      `  解决率:   ${(summary.resolutionRate * 100).toFixed(1)}%`,
      '',
      `⏱️ 性能指标:`,
      `  平均耗时:   ${(summary.averageTime / 1000).toFixed(1)}s`,
      `  平均输入Tokens: ${Math.round(summary.averageTokens.input)}`,
      `  平均输出Tokens: ${Math.round(summary.averageTokens.output)}`,
      '',
    ];

    if (Object.keys(summary.byDifficulty).length > 0) {
      lines.push('📈 按难度分布:');
      for (const [diff, stats] of Object.entries(summary.byDifficulty)) {
        const rate = stats.total > 0 ? ((stats.resolved / stats.total) * 100).toFixed(1) : '0.0';
        lines.push(`  ${diff}: ${stats.resolved}/${stats.total} (${rate}%)`);
      }
      lines.push('');
    }

    if (summary.topErrors.length > 0) {
      lines.push('❌ 常见错误:');
      for (const err of summary.topErrors.slice(0, 5)) {
        lines.push(`  [${err.count}次] ${err.message}`);
      }
    }

    lines.push('');
    lines.push('═══════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * 获取当前会话
   */
  getSession(): EvaluationSession | null {
    return this.session;
  }

  /**
   * 重置引擎
   */
  reset(): void {
    this.problems = [];
    this.session = null;
  }
}

/**
 * 从目录扫描 SWE-Bench 格式的数据
 */
export function scanSWEBenchData(dataDir: string): { files: string[]; problemCount: number } {
  if (!fs.existsSync(dataDir)) {
    return { files: [], problemCount: 0 };
  }

  const files: string[] = [];
  if (fs.statSync(dataDir).isDirectory()) {
    const items = fs.readdirSync(dataDir);
    for (const item of items) {
      if (item.endsWith('.jsonl') || item.endsWith('.json')) {
        files.push(item);
      }
    }
  }

  let problemCount = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      problemCount += content.split('\n').filter(l => l.trim()).length;
    } catch {
      // 跳过
    }
  }

  return { files, problemCount };
}
