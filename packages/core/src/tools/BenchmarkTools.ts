/**
 * SWE-Bench 评测工具集
 */
import type { ITool } from './ToolRegistry.js';
import type { ToolResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { SWEBenchEngine, scanSWEBenchData } from '../benchmark/SWEBenchEngine.js';
import type { BenchmarkConfig } from '../benchmark/SWEBenchEngine.js';
import * as path from 'path';

/** 缓存的引擎实例 */
let _engine: SWEBenchEngine | null = null;

function getEngine(config?: Partial<BenchmarkConfig>): SWEBenchEngine {
  if (!_engine) {
    _engine = new SWEBenchEngine({
      dataDir: config?.dataDir || path.join(process.cwd(), 'swebench_data'),
      resultsDir: config?.resultsDir || path.join(process.cwd(), '.easyagent', 'benchmark_results'),
      maxProblems: config?.maxProblems || 10,
      timeoutPerProblem: config?.timeoutPerProblem || 300000,
    });
  }
  return _engine;
}

/** 清除引擎缓存（测试用） */
export function resetBenchmarkEngine(): void {
  _engine = null;
}

/**
 * 加载 SWE-Bench 数据集
 */
export const LoadBenchmarkTool: ITool = {
  name: 'benchmark_load',
  description:
    '加载 SWE-Bench 评测数据集。SWE-Bench 包含来自真实 GitHub 仓库的编程问题，用于评估 AI 编程助手在代码修复任务上的表现。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      dataPath: {
        type: 'string',
        description: 'SWE-Bench 数据集文件路径（JSONL 格式）或目录',
      },
      maxProblems: {
        type: 'number',
        description: '最大加载问题数，默认10',
      },
      difficulty: {
        type: 'string',
        description: '按难度筛选: easy/medium/hard',
        enum: ['easy', 'medium', 'hard'],
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const dataPath = params.dataPath as string | undefined;
      const maxProblems = (params.maxProblems as number) || 10;
      const difficulty = params.difficulty as string | undefined;

      const engine = getEngine({
        maxProblems,
        filterDifficulty: difficulty as BenchmarkConfig['filterDifficulty'],
        dataDir: dataPath || undefined,
      });

      const problems = engine.loadProblems(dataPath);

      const lines: string[] = [`📥 SWE-Bench 数据集加载完毕`, `问题数: ${problems.length}`, ``];

      if (problems.length === 0) {
        lines.push('⚠ 未找到 SWE-Bench 数据。请:');
        lines.push('  1. 下载数据集: https://huggingface.co/datasets/princeton-nlp/SWE-bench');
        lines.push(`  2. 放入 ${dataPath || 'swebench_data/ 目录'}`);
        lines.push('  3. 或使用 --dataPath 指定路径');
      } else {
        // 显示摘要
        const byDiff = new Map<string, number>();
        const byRepo = new Map<string, number>();
        for (const p of problems) {
          const d = p.difficulty || 'unknown';
          byDiff.set(d, (byDiff.get(d) || 0) + 1);
          const r = p.repo.split('/').pop() || p.repo;
          byRepo.set(r, (byRepo.get(r) || 0) + 1);
        }

        lines.push('📊 统计:');
        for (const [diff, count] of byDiff) {
          lines.push(`  ${diff}: ${count}`);
        }
        lines.push('');
        lines.push('📁 仓库分布:');
        for (const [repo, count] of [...byRepo.entries()].slice(0, 10)) {
          lines.push(`  ${repo}: ${count}`);
        }

        lines.push('');
        lines.push('📝 示例问题:');
        for (const p of problems.slice(0, 3)) {
          lines.push(`  [${p.difficulty || '?'}] ${p.issue_title}`);
          lines.push(`  仓库: ${p.repo} | 实例: ${p.instance_id}`);
          lines.push(`  ${p.issue_body.substring(0, 120)}...`);
          lines.push('');
        }
      }

      return {
        success: true,
        content: lines.join('\n'),
        metadata: { problemCount: problems.length },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '加载 SWE-Bench 数据集失败');
      return { success: false, content: `加载数据集失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 运行 SWE-Bench 评测
 */
export const RunBenchmarkTool: ITool = {
  name: 'benchmark_run',
  description:
    '运行 SWE-Bench 评测，评估 AI 编程助手在真实问题修复任务上的表现。生成解决率、时间、Token 用量等指标的报告。',
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      problemIds: {
        type: 'array',
        items: { type: 'string', description: '问题ID' },
        description: '要评测的问题ID列表（不指定则评测全部）',
      },
      maxProblems: {
        type: 'number',
        description: '最大评测问题数',
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const engine = getEngine();
      const problems = engine.getProblems();

      if (problems.length === 0) {
        return {
          success: false,
          content: '没有已加载的 SWE-Bench 问题。请先使用 benchmark_load 加载数据集。',
          error: '没有已加载的 SWE-Bench 问题',
        };
      }

      const maxProblems = (params.maxProblems as number) || problems.length;
      const selectedIds =
        (params.problemIds as string[]) || problems.slice(0, maxProblems).map((p) => p.id);

      // 创建会话
      const session = engine.createSession(selectedIds.slice(0, maxProblems));

      // 模拟评测结果（实际需要 Agent 执行修复）
      const results: ToolResult[] = [];
      for (const id of selectedIds.slice(0, maxProblems)) {
        const problem = problems.find((p) => p.id === id);
        if (!problem) continue;

        // 记录评测结果（占位 — 实际评测需要 Agent 介入）
        engine.recordResult(id, {
          problemId: id,
          passed: false,
          score: 0,
          details: {
            resolved: false,
            timeElapsed: 0,
            attempts: 0,
          },
          metadata: { status: 'pending', note: '需要配置模型后运行实际评测' },
        });
      }

      const summary = engine.generateSummary();
      const report = engine.formatReport();
      engine.saveResults();

      return {
        success: true,
        content: report,
        metadata: { summary, sessionId: session.id },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'SWE-Bench 评测失败');
      return { success: false, content: `评测失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 查看评测结果报告
 */
export const BenchmarkReportTool: ITool = {
  name: 'benchmark_report',
  description: '查看 SWE-Bench 评测结果报告，包括解决率、性能指标、常见错误等。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: '要查看的评测会话ID',
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const engine = getEngine();
      const session = engine.getSession();

      if (!session) {
        return {
          success: false,
          content:
            '没有正在进行的评测会话。请先使用 benchmark_load 加载数据，再用 benchmark_run 运行评测。',
          error: '没有正在进行的评测会话',
        };
      }

      const report = engine.formatReport();

      return {
        success: true,
        content: report,
        metadata: { sessionId: session.id, progress: session.progress },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `获取报告失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 扫描 SWE-Bench 数据
 */
export const BenchmarkScanTool: ITool = {
  name: 'benchmark_scan',
  description: '扫描指定目录中的 SWE-Bench 数据文件，查看可用的评测数据集及问题数量。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      dataDir: {
        type: 'string',
        description: '要扫描的数据目录',
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const dataDir = (params.dataDir as string) || path.join(process.cwd(), 'swebench_data');
      const { files, problemCount } = scanSWEBenchData(dataDir);

      const lines: string[] = [
        `🔍 SWE-Bench 数据扫描: ${dataDir}`,
        ``,
        `数据文件: ${files.length} 个`,
        `总问题数: ${problemCount}`,
        ``,
      ];

      if (files.length === 0) {
        lines.push('⚠ 未发现 SWE-Bench 数据文件。');
        lines.push('  请下载数据集并放入该目录。');
      } else {
        for (const f of files) {
          lines.push(`  📄 ${f}`);
        }
      }

      return {
        success: true,
        content: lines.join('\n'),
        metadata: { dataDir, fileCount: files.length, problemCount },
      };
    } catch (error) {
      return { success: false, content: `扫描失败: ${error}`, error: String(error) };
    }
  },
};

/** SWE-Bench 评测工具集 */
export const BenchmarkTools = [
  LoadBenchmarkTool,
  RunBenchmarkTool,
  BenchmarkReportTool,
  BenchmarkScanTool,
];
