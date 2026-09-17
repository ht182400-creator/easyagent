/**
 * ContextManager 类型定义
 *
 * @module agent/context/types
 */

import type { Message, ToolDefinition } from '../../types/index.js';

// ===================== 模型规模档位 =====================

/**
 * 模型规模档位（决定工具暴露范围与上下文预算）
 *
 * 依据实测：70 个工具的定义 + 描述合计约 14,800 token，
 * 在 32k 窗口的小模型上占 45.3% —— 必须分级暴露，否则模型一半上下文被工具吃掉。
 */
export type ModelScale = 'small' | 'medium' | 'large';

// ===================== 配置 =====================

/** ContextManager 配置（全部有默认值，可通过环境变量覆盖） */
export interface ContextManagerOptions {
  /** 是否启用上下文管理（关闭时完全保持旧行为） */
  enabled: boolean;
  /**
   * 上下文窗口的可用比例（0~1）
   *
   * 预留空间给模型输出，故不占满整个窗口。默认 0.7。
   */
  usableRatio: number;
  /** 单条工具结果的字符上限（超出则截断 + 落盘）。0 表示不截断 */
  toolResultLimit: number;
  /** 工具结果截断时保留的头部字符数 */
  toolResultHeadChars: number;
  /** 工具结果截断时保留的尾部字符数 */
  toolResultTailChars: number;
  /** 历史压缩后至少保留的最近消息条数（防止把当前上下文裁空） */
  keepRecentMessages: number;
  /** 是否按模型规模分级暴露工具 */
  enableToolTiering: boolean;
  /** 是否在系统提示词中用「工具索引」替代「完整工具描述」（避免与 tools 参数重复计费） */
  dedupeToolDescriptions: boolean;
  /** 是否在工具结果截断时把完整内容落盘（便于模型按需用 read_file 取回） */
  persistTruncatedResults: boolean;
  /** 落盘目录（默认 ~/.easyagent/context） */
  contextDir?: string;
}

// ===================== 输入 / 输出 =====================

/** 构建上下文时的输入 */
export interface ContextBuildInput {
  /** 系统提示词基础部分（不含工具描述） */
  systemPrompt: string;
  /** 历史消息（不含 system，含本轮 user 消息） */
  messages: Message[];
  /** 候选工具定义（未分级前的全量） */
  toolDefinitions: ToolDefinition[];
  /** 工作区路径（用于落盘路径展示） */
  workspace: string;
  /** 会话 ID（用于落盘分目录） */
  sessionId: string;
  /** 模型名（用于日志与档位推断） */
  model: string;
  /** 模型上下文窗口（token）；缺省时按模型名推断 */
  maxContextTokens?: number;
  /**
   * 本次构建是否启用「系统提示词去重」（用紧凑工具索引替代内联的完整描述）
   *
   * 单次覆盖优先于全局配置。**当模型不支持 function calling 时必须传 false** ——
   * 否则适配器不会下发 `tools` 字段，模型将拿不到任何工具信息（能力直接消失）。
   */
  dedupeToolDescriptions?: boolean;
}

/** 本次裁剪动作记录（用于日志与可观测性） */
export interface ContextAdjustment {
  /** 动作类型 */
  kind: 'tool-tiering' | 'description-dedupe' | 'result-truncation' | 'history-compaction';
  /** 人类可读说明 */
  detail: string;
  /** 该动作影响的估算 token 数（负值表示节省） */
  tokensDelta: number;
}

/** 上下文占用统计 */
export interface ContextStats {
  /** 模型规模档位 */
  scale: ModelScale;
  /** 上下文窗口（token） */
  windowTokens: number;
  /** 可用预算（token，= 窗口 × usableRatio） */
  budgetTokens: number;
  /** 系统提示词 token */
  systemTokens: number;
  /** 工具定义 token（分级后） */
  toolTokens: number;
  /** 消息 token（压缩后） */
  messageTokens: number;
  /** 合计 token */
  totalTokens: number;
  /** 合计占窗口比例（0~1） */
  usageRatio: number;
  /** 工具数量：原始 → 实际暴露 */
  toolCount: { before: number; after: number };
  /** 裁剪动作列表 */
  adjustments: ContextAdjustment[];
}

/** 构建结果 */
export interface ContextBuildResult {
  /** 最终系统提示词（可能追加了工具索引） */
  systemPrompt: string;
  /** 最终消息数组（含 system 为第 0 条） */
  messages: Message[];
  /** 实际暴露的工具定义 */
  toolDefinitions: ToolDefinition[];
  /** 统计信息 */
  stats: ContextStats;
}

// ===================== 落盘 =====================

/** 工具结果截断后的产物 */
export interface TruncatedToolResult {
  /** 截断后用于回填消息的内容 */
  content: string;
  /** 是否发生了截断 */
  truncated: boolean;
  /** 原始字符数 */
  originalChars: number;
  /** 完整内容的落盘路径（未落盘则为 undefined） */
  persistedPath?: string;
}
