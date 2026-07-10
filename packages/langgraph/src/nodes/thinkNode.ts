/**
 * thinkNode — LLM 思考节点
 *
 * 负责构建消息列表（SystemMessage + 历史消息），调用 LLM 获取响应。
 * 根据响应是否为 tool_calls 决定后续路由。
 *
 * 依赖：通过闭包注入 BaseAdapter 和 ToolRegistry
 */
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { AgentState } from '../state/AgentState';
import { Logger } from '../logger/Logger';
import { getMessageType, getMessageContent, hasToolCalls, getToolCallId } from '../graph/messageUtils';

/** thinkNode 模块 Logger */
const log = new Logger('thinkNode');

/**
 * 连续重复工具调用最大容忍次数。
 * 首次调用不计数；第 1 次重复 consecutiveIdenticalCalls=1，第 2 次=2，以此类推。
 * 当 consecutiveIdenticalCalls > MAX_IDENTICAL_TOOL_CALLS 时终止循环。
 * 设 0 = 只允许首次调用，第 1 次重复即拦截。
 */
const MAX_IDENTICAL_TOOL_CALLS = 0;

// 类型依赖最小化：只声明需要的接口
export interface ThinkNodeConfig {
  /** 
   * 聊天接口 — 兼容 EasyAgent 的 BaseAdapter.chat() 签名
   * 接收 Message[] (包含 role/content/tool_calls)，返回 ChatResponse
   */
  chat: (messages: ChatMessage[], options?: ChatOptions) => Promise<ChatResponse>;
  /** 获取工具定义的 JSON Schema 列表 */
  getToolDefinitions: () => ToolDef[];
  /** 系统提示词 (可选，可在 config 或 state 中提供) */
  systemPrompt?: string;
}

// ---- 最小化内部类型（避免直接依赖 core 包）----

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ChatOptions {
  tools?: ToolDef[];
  toolChoice?: string;
  signal?: AbortSignal;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * 将 BaseMessage 或 checkpoint 还原的普通对象转为 ChatMessage
 * 
 * 兼容两种消息格式：
 * - BaseMessage 实例（首次运行，有 getType() 原型方法）
 * - 普通 JS 对象（checkpoint JSON 还原后，无 getType() 原型方法）
 */
function toChatMessages(messages: BaseMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    const msgType = getMessageType(msg);
    const base: ChatMessage = {
      role: mapRole(msgType),
      content: getMessageContent(msg),
    };

    // 处理 tool_calls（兼容两种消息格式）
    if (msgType === 'ai' && hasToolCalls(msg)) {
      const rawToolCalls = (msg as unknown as Record<string, unknown>).tool_calls as Array<Record<string, unknown>>;
      base.tool_calls = rawToolCalls.map((tc: Record<string, unknown>) => ({
        id: (tc.id as string) ?? (tc.name as string) ?? '',
        type: 'function' as const,
        function: {
          name: (tc.name as string) || '',
          arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args ?? {}),
        },
      }));
    }

    // 处理 tool_call_id（兼容两种消息格式）
    if (msgType === 'tool') {
      const toolCallId = getToolCallId(msg);
      if (toolCallId) {
        base.tool_call_id = toolCallId;
      }
    }

    return base;
  });
}

/** 映射 LangChain 消息类型到 adapter 角色 */
function mapRole(type: string): 'system' | 'user' | 'assistant' | 'tool' {
  switch (type) {
    case 'system': return 'system';
    case 'human': return 'user';
    case 'ai': return 'assistant';
    case 'tool': return 'tool';
    default: return 'user';
  }
}

/**
 * 创建 think 节点函数
 * 
 * @param config - 包含模型调用接口和工具定义
 * @returns 节点函数，接收 AgentState 返回部分状态更新
 */
export function createThinkNode(config: ThinkNodeConfig) {
  return async function thinkNode(
    state: typeof AgentState.State
  ): Promise<Partial<typeof AgentState.State>> {
    const { chat, getToolDefinitions, systemPrompt: configSystemPrompt } = config;
    log.enter({ turnCount: state.turnCount, maxTurns: state.maxTurns, msgCount: state.messages.length });

    // 超过最大轮次则强制终止
    if (state.turnCount >= state.maxTurns) {
      log.warn('达到最大轮次，强制终止', { turnCount: state.turnCount, maxTurns: state.maxTurns });
      // 已经有最后一条 AI 消息则直接结束
      const lastMsg = state.messages[state.messages.length - 1];
      if (getMessageType(lastMsg) === 'ai') {
        return { shouldContinue: false };
      }
      // 否则添加一条终止提示
      return {
        messages: [new AIMessage({ content: '已达到最大对话轮次，任务终止。' })],
        shouldContinue: false,
      };
    }

    try {
      // 1. 构建完整消息列表
      const systemPrompt = configSystemPrompt || state.systemPrompt;
      const fullMessages: BaseMessage[] = [];

      // System prompt（仅当不存在时添加）
      if (systemPrompt && getMessageType(state.messages[0]) !== 'system') {
        fullMessages.push(new SystemMessage({ content: systemPrompt }));
      }

      // 历史消息
      fullMessages.push(...state.messages);
      log.debug('消息列表已构建', { totalMsgCount: fullMessages.length, hasSystemPrompt: !!systemPrompt });

      // 2. 获取工具定义
      const tools = getToolDefinitions();
      log.debug('工具定义已获取', { toolCount: tools.length, toolNames: tools.map(t => t.name) });

      // 3. 调用 LLM
      const chatMessages = toChatMessages(fullMessages);
      const llmTimer = log.startTimer('LLM 调用');
      const response = await chat(chatMessages, { tools });
      llmTimer({
        finishReason: response.finishReason,
        contentLen: response.content.length,
        toolCallsCount: response.toolCalls?.length || 0,
        usage: response.usage,
      });

      // 4. 检测重复工具调用（防 LLM 无限循环）：
      //    如果当前 tool_calls 与上一条 AI 消息的 tool_calls 完全相同，
      //    则递增重复计数；超过阈值后强制终止循环。
      const currentToolCount = response.toolCalls?.length || 0;
      let consecutiveIdenticalCalls = 0;
      if (currentToolCount > 0) {
        // 向上查找最近一条 AI 消息
        const lastAiMsg = [...state.messages].reverse().find(m => getMessageType(m) === 'ai');
        if (lastAiMsg && hasToolCalls(lastAiMsg)) {
          const lastRawToolCalls = (lastAiMsg as unknown as Record<string, unknown>).tool_calls as Array<Record<string, unknown>>;
          // 比较当前与上轮的工具调用（名称 + 参数）
          const isIdentical = response.toolCalls!.length === lastRawToolCalls.length &&
            response.toolCalls!.every((tc, i) => {
              const last = lastRawToolCalls[i];
              const lastArgs = typeof last.args === 'string' ? last.args : JSON.stringify(last.args ?? {});
              return tc.function.name === (last.name as string) &&
                     tc.function.arguments === lastArgs;
            });
          if (isIdentical) {
            consecutiveIdenticalCalls = (state.consecutiveIdenticalToolCalls ?? 0) + 1;
            log.warn('检测到重复工具调用', {
              toolName: response.toolCalls![0].function.name,
              count: consecutiveIdenticalCalls,
              maxAllowed: MAX_IDENTICAL_TOOL_CALLS,
            });
          }
        }
      }

      // 仅当计数 > 阈值时才拦截（避免 MAX=0 时误拦截首次正常调用）
      if (consecutiveIdenticalCalls > MAX_IDENTICAL_TOOL_CALLS) {
        log.warn('重复工具调用次数超限，强制终止循环', {
          toolName: response.toolCalls?.[0]?.function.name,
          consecutiveIdenticalCalls,
        });
        // 仍需构建 AIMessage 记录本轮操作，但强制结束循环
        const aiMessage = new AIMessage({
          content: response.content || '',
          tool_calls: response.toolCalls?.map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            args: safeJsonParse(tc.function.arguments),
          })),
        });
        return {
          messages: [aiMessage],
          turnCount: state.turnCount + 1,
          shouldContinue: false,
          consecutiveIdenticalToolCalls: consecutiveIdenticalCalls,
          finalResponse: `检测到连续 ${consecutiveIdenticalCalls} 次相同的工具调用 (${response.toolCalls?.[0]?.function.name})，已自动终止循环以避免重复执行。`,
        };
      }

      // 5. 构建 AIMessage
      const aiMessage = new AIMessage({
        content: response.content || '',
        tool_calls: response.toolCalls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: safeJsonParse(tc.function.arguments),
        })),
      });

      const hasToolCallsInResponse = response.toolCalls && response.toolCalls.length > 0;
      if (hasToolCallsInResponse) {
        log.info('LLM 返回 tool_calls', {
          tools: response.toolCalls!.map(tc => ({ name: tc.function.name, argsLen: tc.function.arguments.length })),
        });
      } else {
        log.debug('LLM 返回纯文本', { contentLen: response.content.length, finishReason: response.finishReason });
      }

      const result = {
        messages: [aiMessage],
        turnCount: state.turnCount + 1,
        totalInputTokens: response.usage?.inputTokens ?? 0,
        totalOutputTokens: response.usage?.outputTokens ?? 0,
        // 传递重复调用计数：无 tool_calls 时重置，有 tool_calls 时保留
        consecutiveIdenticalToolCalls: hasToolCallsInResponse ? consecutiveIdenticalCalls : 0,
      };

      log.exit({ turnCount: state.turnCount + 1, hasToolCalls: hasToolCallsInResponse });
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error('LLM 调用异常', { error: errMsg });
      return {
        messages: [
          new AIMessage({
            content: `调用 LLM 时发生错误: ${errMsg}`,
          }),
        ],
        shouldContinue: false,
        finalResponse: `错误: ${errMsg}`,
      };
    }
  };
}

/**
 * 安全解析 JSON，失败时返回空对象
 */
function safeJsonParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json);
  } catch {
    log.warn('JSON 解析失败', { json: json.substring(0, 100) });
    return {};
  }
}
