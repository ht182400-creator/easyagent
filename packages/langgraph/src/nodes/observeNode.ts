/**
 * observeNode — 观察与结果处理节点
 * 
 * 在工具执行后运行，负责：
 * 1. 验证工具执行结果
 * 2. 将结果追加到消息历史（已在 actNode 中通过 ToolMessage 完成）
 * 3. 决定是否继续循环
 * 
 * 此节点在 actNode 之后、回 loop 之前执行。
 */
import { AgentState } from '../state/AgentState';
import { Logger } from '../logger/Logger';

/** observeNode 模块 Logger */
const log = new Logger('observeNode');

export interface ObserveNodeConfig {
  /** 是否启用结果摘要（默认 false） */
  enableSummary?: boolean;
  /** 工具结果最大长度（超过则截断），默认 2000 */
  maxResultLength?: number;
}

/**
 * 创建 observe 节点函数
 * 
 * @param config - 观察节点配置
 * @returns 节点函数
 */
export function createObserveNode(config: ObserveNodeConfig = {}) {
  const { enableSummary = false, maxResultLength = 2000 } = config;

  return async function observeNode(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    log.enter({ turnCount: state.turnCount, maxTurns: state.maxTurns, msgCount: state.messages.length, enableSummary });

    // 检查轮次是否超限
    if (state.turnCount >= state.maxTurns) {
      log.warn('轮次超限 → shouldContinue=false', { turnCount: state.turnCount, maxTurns: state.maxTurns });
      return {
        shouldContinue: false,
        finalResponse: '已达到最大对话轮次。',
      };
    }

    // 检查连续工具失败次数，防止失败后陷入无限重试循环
    const maxConsecutiveFailures = 3;
    if ((state.consecutiveFailures || 0) >= maxConsecutiveFailures) {
      log.warn('连续工具失败次数超限 → shouldContinue=false', {
        consecutiveFailures: state.consecutiveFailures,
        maxConsecutiveFailures,
      });
      return {
        shouldContinue: false,
        finalResponse: `已连续 ${state.consecutiveFailures} 次工具调用失败，停止循环以避免无限重试。请检查工具配置或重试。`,
      };
    }

    // actNode 已经将 tool_calls 结果作为 ToolMessage 追加到 messages，
    // observe 节点主要做后处理：截断过长结果、记录摘要等

    // TODO(Phase 3): 当 enableSummary=true 时实现消息截断逻辑
    // 需用 ToolMessage 构造函数而非 spread，以保留 BaseMessage 原型链
    if (enableSummary) {
      log.debug('enableSummary 已启用 (截断逻辑待 Phase 3 实现)', {
        msgCount: state.messages.length,
        maxResultLength,
      });
    }

    // 默认：继续循环，回到 think 节点
    log.decision('继续循环 → think', { turnCount: state.turnCount });
    return {
      shouldContinue: true,
    };
  };
}
