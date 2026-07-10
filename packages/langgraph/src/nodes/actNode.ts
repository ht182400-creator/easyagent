/**
 * actNode — 工具执行节点
 * 
 * 解析 AIMessage 中的 tool_calls，按依赖关系并行或串行执行工具。
 * 支持：
 * - 独立工具并行执行（默认）
 * - 强制串行模式（debug 用途）
 */
import { ToolMessage } from '@langchain/core/messages';
import type { AIMessage } from '@langchain/core/messages';
import { AgentState } from '../state/AgentState';
import { Logger } from '../logger/Logger';
import { getMessageType, hasToolCalls } from '../graph/messageUtils';

/** actNode 模块 Logger */
const log = new Logger('actNode');

// ---- 工具接口（兼容 EasyAgent ToolRegistry 的 ITool）----

/**
 * 工具执行接口
 * 与 packages/core 的 ToolRegistry.execute() 签名兼容
 */
export interface ToolExecutor {
  /**
   * 执行工具调用
   * @param name - 工具名称
   * @param params - 工具参数
   * @returns 执行结果
   */
  execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult>;
}

/**
 * 工具执行结果
 * 统一返回格式，与 EasyAgent ToolRegistry 兼容
 */
export interface ToolResult {
  /** 执行是否成功 */
  success: boolean;
  /** 工具返回内容 */
  content: string;
  /** 失败时的错误信息（可选） */
  error?: string;
}

// ---- actNode 配置 ----

export interface ActNodeConfig {
  /** 工具执行器（通常是 ToolRegistry） */
  toolExecutor: ToolExecutor;
  /** 是否强制串行执行工具（默认 false = 并行） */
  forceSequential?: boolean;
  /** 单个工具超时时间（毫秒），默认 120000 */
  toolTimeout?: number;
}

/**
 * 创建 act 节点函数
 * 
 * @param config - 工具执行配置
 * @returns 节点函数
 */
export function createActNode(config: ActNodeConfig) {
  const { toolExecutor, forceSequential = false, toolTimeout = 120_000 } = config;

  return async function actNode(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    log.enter({ turnCount: state.turnCount, mode: forceSequential ? '串行' : '并行' });

    // 获取最后一条消息（兼容 BaseMessage 实例和 checkpoint 还原的普通对象）
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage | undefined;

    if (!lastMessage || getMessageType(lastMessage) !== 'ai') {
      log.debug('跳过: 最后一条消息非 AIMessage', { lastMsgType: getMessageType(lastMessage) });
      return {};
    }

    if (!hasToolCalls(lastMessage)) {
      log.debug('跳过: 无 tool_calls');
      return {};
    }

    const toolCalls = (lastMessage as unknown as Record<string, unknown>).tool_calls as NonNullable<AIMessage['tool_calls']>;

    log.info('工具调用列表', {
      count: toolCalls.length,
      tools: toolCalls.map(tc => ({ name: tc.name, args: tc.args })),
      mode: forceSequential ? '串行' : '并行',
    });

    let results: ToolMessage[];

    if (forceSequential) {
      // 串行执行（用于调试或有依赖关系的工具）
      results = [];
      for (const tc of toolCalls) {
        const toolTimer = log.startTimer(`工具执行 [串行] ${tc.name}`);
        const msg = await executeSingleTool(tc.id!, tc.name, tc.args, toolExecutor, toolTimeout);
        const contentStr = msg.content as string;
        toolTimer({ name: tc.name, success: !contentStr.startsWith('工具执行失败') && !contentStr.startsWith('工具执行异常') });
        results.push(msg);
      }
    } else {
      // 并行执行所有工具（默认）
      const parallelTimer = log.startTimer(`工具并行执行 (${toolCalls.length}个)`);
      const promises = toolCalls.map((tc) =>
        executeSingleTool(tc.id!, tc.name, tc.args, toolExecutor, toolTimeout)
      );
      results = await Promise.all(promises);
      parallelTimer({ toolCount: toolCalls.length });
    }

    // 记录每个工具执行结果摘要，并统计本轮成功/失败数量
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const tc = toolCalls[i];
      const rContent = r.content as string;
      const isSuccess = rContent && !rContent.startsWith('工具执行失败') && !rContent.startsWith('工具执行异常');
      if (isSuccess) {
        successCount++;
      } else {
        failureCount++;
      }
      log.debug(`工具结果: ${tc.name}`, {
        success: isSuccess,
        contentLen: rContent.length,
        contentPreview: rContent.substring(0, 100),
      });
    }

    // 连续失败计数：只要本轮有任意工具成功就重置为 0，否则累加失败数
    const consecutiveFailures = successCount > 0 ? 0 : (state.consecutiveFailures || 0) + failureCount;
    if (consecutiveFailures > 0) {
      log.warn('本轮工具全部失败', { successCount, failureCount, consecutiveFailures });
    }

    log.exit({ toolCount: toolCalls.length, resultCount: results.length, consecutiveFailures });
    return {
      messages: results,
      consecutiveFailures,
    };
  };
}

/**
 * 执行单个工具调用，返回 ToolMessage
 */
async function executeSingleTool(
  callId: string,
  name: string,
  args: Record<string, unknown>,
  executor: ToolExecutor,
  timeout: number
): Promise<ToolMessage> {
  try {
    // 带超时的工具执行
    const result = await Promise.race([
      executor.execute(name, args),
      new Promise<ToolResult>((resolve) =>
        setTimeout(() => {
          resolve({
            success: false,
            content: '',
            error: `工具 "${name}" 执行超时 (${timeout / 1000}s)`,
          });
        }, timeout)
      ),
    ]);

    // 防御性兜底：executor.execute 契约要求返回 ToolResult，但插件/旧工具可能返回
    // 半结构化结果（字符串或裸对象）。若发现 success 字段缺失但 content 是字符串，
    // 视为"成功但接口不规范"，避免 LLM 进入"工具失败"→反思 的无意义循环。
    if (typeof result !== 'object' || result === null) {
      log.warn(`工具返回非对象: ${name}`, { type: typeof result, args });
      return new ToolMessage({
        tool_call_id: callId,
        name,
        content: typeof result === 'string' ? result : String(result ?? ''),
      });
    }
    if (typeof result.success !== 'boolean') {
      log.warn(`工具返回缺少 success 字段: ${name}`, { resultKeys: Object.keys(result), args });
      // 视为成功：把 content 透传回去，并附加结构提示
      const contentStr =
        typeof result.content === 'string'
          ? result.content
          : (result.content == null ? '' : String(result.content));
      return new ToolMessage({
        tool_call_id: callId,
        name,
        content: contentStr
          ? `${contentStr}\n\n[系统提示] 该工具未遵守 ITool.execute 契约（缺少 success 字段），结果已按成功处理。`
          : `[系统提示] 工具 "${name}" 未返回标准 ToolResult 格式。请联系插件作者修复。`,
      });
    }

    if (result.success) {
      log.debug(`工具执行成功: ${name}`, { contentLen: result.content.length });
      return new ToolMessage({
        tool_call_id: callId,
        name,
        content: result.content,
      });
    } else {
      log.warn(`工具执行失败: ${name}`, { error: result.error, args });
      return new ToolMessage({
        tool_call_id: callId,
        name,
        content: `工具执行失败: ${result.error || '未知错误'}`,
      });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`工具执行异常: ${name}`, { error: errMsg, args });
    return new ToolMessage({
      tool_call_id: callId,
      name,
      content: `工具执行异常: ${errMsg}`,
    });
  }
}
