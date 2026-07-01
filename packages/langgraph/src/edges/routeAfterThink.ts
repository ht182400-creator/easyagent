/**
 * routeAfterThink — 条件路由函数
 * 
 * 在 think 节点执行后判断下一步走向：
 * - 有 tool_calls → 'act'
 * - 无 tool_calls → '__end__' (停止)
 * - 轮次超限 → '__end__' (安全终止)
 */
import { AgentState } from '../state/AgentState';
import { Logger } from '../logger/Logger';
import { getMessageType, hasToolCalls } from '../graph/messageUtils';

/** routeAfterThink 模块 Logger */
const log = new Logger('routeAfterThink');

/**
 * 根据最后一次 AI 消息的内容决定路由
 * 
 * @param state - 当前工作流状态
 * @returns 下一个节点名称或 '__end__'
 */
export function routeAfterThink(
  state: typeof AgentState.State
): 'act' | '__end__' {
  // 安全检查：shouldContinue 为 false 时强制结束
  if (!state.shouldContinue) {
    log.decision('结束 (shouldContinue=false)');
    return '__end__';
  }

  // 轮次超限保护
  if (state.turnCount >= state.maxTurns) {
    log.decision('结束 (轮次超限)', { turnCount: state.turnCount, maxTurns: state.maxTurns });
    return '__end__';
  }

  // 获取最后一条消息
  const lastMessage = state.messages[state.messages.length - 1];

  // 判断是否 AI 消息且包含 tool_calls（兼容 checkpoint 还原的普通对象）
  if (getMessageType(lastMessage) === 'ai' && hasToolCalls(lastMessage)) {
    const toolCalls = (lastMessage as unknown as Record<string, unknown>).tool_calls as Array<{ name: string }>;
    log.decision('路由 → act', { toolCount: toolCalls.length, toolNames: toolCalls.map(tc => tc.name) });
    return 'act';
  }

  // 无 tool_calls → 结束
  log.decision('结束 (无 tool_calls)', { lastMsgType: getMessageType(lastMessage) });
  return '__end__';
}
