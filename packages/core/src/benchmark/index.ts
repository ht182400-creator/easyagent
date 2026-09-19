/**
 * 评测模块导出
 */
export { SWEBenchEngine, scanSWEBenchData } from './SWEBenchEngine.js';

export type {
  SWEBenchProblem,
  EvaluationResult,
  EvaluationSession,
  EvaluationSummary,
  BenchmarkConfig,
} from './SWEBenchEngine.js';

export {
  BenchmarkRunner,
  loadBuiltinDataset,
  dryRunBenchmark,
  buildOfflineStubSolution,
} from './BenchmarkRunner.js';

export type {
  AgentBenchmarkConfig,
  BenchmarkProblemResult,
  BenchmarkAttempt,
  BenchmarkReport,
  SolutionGenerator,
  BenchmarkMode,
} from './BenchmarkRunner.js';

// 真实测试执行（SWE-bench 式判定：落盘解法 + test_patch，用 vitest 实跑）
export {
  SolutionRunner,
  parseCaseNames,
  summarizeVitestReport,
  resolveVitestEntry,
} from './solutionRunner.js';
export type { ExecutionResult, SolutionRunnerOptions } from './solutionRunner.js';

// 评测用 Mock 适配器（把桩下沉到 adapter 层，使工具/多轮等 agent 链路可离线跑通）
export { createBenchmarkMockAdapter, BenchmarkMockAdapter } from './mockAdapter.js';
export type { MockAdapterOptions } from './mockAdapter.js';
