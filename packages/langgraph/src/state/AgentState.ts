/**
 * AgentState — LangGraph 工作流状态定义
 * 
 * 使用 Annotation API 声明状态结构及合并策略 (Reducer)。
 * 参考 LangGraph 官方模式：https://langchain-ai.github.io/langgraph/how-tos/create-react-agent/
 */
import { Annotation } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * LangGraph Agent 工作流状态注解
 * 
 * 使用 Annotation.Root 定义顶层状态，每个字段可配置 reducer 和 default 值。
 * - messages 字段自动追加（不覆盖），符合对话历史累积语义
 * - 其他控制字段使用替换策略
 */
export const AgentState = Annotation.Root({
  // ==================== 核心消息 ====================

  /**
   * 对话消息历史
   * reducer: 追加模式 — 新消息累积而非替换（LangGraph 标准行为）
   */
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => {
      // 如果两个都是数组，合并；否则用新的
      const combined = [...(prev ?? []), ...(next ?? [])];
      return combined;
    },
    default: () => [],
  }),

  // ==================== 控制字段 ====================

  /**
   * 当前轮次计数
   * reducer: 替换 — 每轮覆盖为新值
   */
  turnCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  /**
   * 最大允许轮次，防止无限循环
   */
  maxTurns: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 25,
  }),

  /**
   * 是否继续执行循环
   * reducer: 替换
   */
  shouldContinue: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => true,
  }),

  /**
   * 连续工具失败次数，用于防止失败后无限重试。
   * 任何一次工具调用成功后会被重置为 0。
   */
  consecutiveFailures: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // ==================== 系统配置 ====================

  /**
   * 系统提示词
   */
  systemPrompt: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  /**
   * 会话 ID，用于持久化和恢复
   */
  sessionId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  /**
   * 工作区路径
   */
  workspace: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),

  // ==================== Token 用量 ====================

  /**
   * 累计输入 Token
   */
  totalInputTokens: Annotation<number>({
    reducer: (prev, next) => (prev ?? 0) + (next ?? 0),
    default: () => 0,
  }),

  /**
   * 累计输出 Token
   */
  totalOutputTokens: Annotation<number>({
    reducer: (prev, next) => (prev ?? 0) + (next ?? 0),
    default: () => 0,
  }),

  // ==================== 中断/恢复 ====================

  /**
   * 中断原因（如人工审批等待）
   */
  interruptReason: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),

  /**
   * 最终响应文本
   */
  finalResponse: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
});

/** 导出 State 类型（供节点函数使用） */
export type AgentStateType = typeof AgentState.State;
