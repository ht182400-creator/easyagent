/**
 * 上下文工程模块（Context Engineering）
 *
 * ── 一句话说明 ──
 * 管理"每一轮请求到底带多少东西给模型"，是 2026 年 Agent 的核心竞争力所在。
 *
 * ── 模块构成 ──
 *   · tokenEstimator      本地零依赖 token 估算
 *   · toolSelection       按模型规模分级暴露工具 + 生成紧凑工具索引
 *   · toolResultTruncator 工具结果超长截断并在工作区内落盘
 *   · historyCompactor    历史超预算时压缩为结构化摘要（保护工具调用配对）
 *   · ContextManager      上述能力的编排入口
 *   · options             配置解析（环境变量 + 分项开关，可灰度可回滚）
 *
 * @module agent/context
 */

export { ContextManager, getContextManager, resetContextManager } from './ContextManager.js';
export { resolveContextOptions, CONTEXT_DIR_RELATIVE } from './options.js';
export {
  PER_MESSAGE_OVERHEAD_TOKENS,
  estimateMessagesTokens,
  estimateTokens,
  estimateToolDefinitionsTokens,
  resolveEstimatorOptions,
  type EstimatableMessage,
  type EstimatableToolDefinition,
  type TokenEstimatorOptions,
} from './tokenEstimator.js';
export {
  ALWAYS_EXCLUDED_TOOLS,
  CORE_TOOL_NAMES,
  MEDIUM_EXCLUDED_TOOLS,
  MEDIUM_SCALE_MAX_TOKENS,
  SMALL_SCALE_MAX_TOKENS,
  buildToolIndexText,
  resolveModelScale,
  selectToolDefinitions,
  type ToolSelectionResult,
} from './toolSelection.js';
export { truncateToolResult } from './toolResultTruncator.js';
export {
  compactHistory,
  type CompactHistoryInput,
  type CompactHistoryResult,
} from './historyCompactor.js';
export type {
  ContextAdjustment,
  ContextBuildInput,
  ContextBuildResult,
  ContextManagerOptions,
  ContextStats,
  ModelScale,
  TruncatedToolResult,
} from './types.js';
