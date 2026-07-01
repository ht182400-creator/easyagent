/**
 * LangGraphAgent 适配器 — 将 LangGraphAgent 包装为 AgentEngine 兼容接口
 *
 * 目的：让 server 中的 4 个 AgentEngine 使用点可以通过配置切换引擎，
 * 而不需要大幅修改现有代码。
 *
 * @module server/langgraph/agentAdapter
 */
import type { LangGraphAgent, AgentEvent as LGAgentEvent, AgentResult } from '@easyagent/langgraph';

/**
 * 兼容 AgentEngine 的 Token 用量结构
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * 兼容 AgentEngine 的 RunOptions（含 onPartialResponse 回调）
 */
export interface RunOptions {
  sessionId?: string;
  signal?: AbortSignal;
  /** 流式部分响应回调 — LangGraphAdapter 通过此回调模拟流式输出 */
  onPartialResponse?: (text: string) => void;
}

/**
 * 统一事件类型 — 兼容 AgentEngine 的事件格式
 */
export interface UnifiedAgentEvent {
  type: string;
  data?: unknown;
  // AgentEngine 事件字段
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  message?: string;
  usage?: TokenUsage;
  toolCalls?: Array<{ function: { name: string; arguments: string } }>;
  result?: { success?: boolean; content?: string; error?: string };
}

export type EventListener = (event: UnifiedAgentEvent) => void;

/**
 * LangGraph 事件 → AgentEngine 兼容事件映射
 *
 * AgentEngine 事件类型（server/WS 使用）:
 *   turn_start, tool_start, tool_end, token_usage, error, done
 *
 * LangGraphAgent 事件类型:
 *   thinking, tool_call, tool_result, response, error, done
 *
 * 映射策略: 将 LangGraph 事件字段映射为 AgentEngine 的字段名，
 * 使现有 server WS 处理代码无需修改即可工作。
 */
function mapLangGraphToAgentEngineEvent(lgEvent: LGAgentEvent): UnifiedAgentEvent | null {
  switch (lgEvent.type) {
    case 'thinking': {
      const data = lgEvent.data as { node?: string; status?: string } | undefined;
      return {
        type: 'turn_start',
        data: { node: data?.node || 'think' },
      };
    }

    case 'tool_call': {
      const data = lgEvent.data as { name?: string; input?: unknown } | undefined;
      const now = Date.now();
      return {
        // 映射为 AgentEngine 兼容事件类型
        type: 'tool_start',
        toolCallId: `lg_tool_${now}`,
        toolName: data?.name || 'unknown',
        input: data?.input || {},
        // 保留 toolCalls 格式供 automation executor 使用
        toolCalls: data?.name
          ? [{ function: { name: data.name, arguments: JSON.stringify(data.input || {}) } }]
          : [],
      };
    }

    case 'tool_result': {
      const data = lgEvent.data as {
        name?: string;
        output?: { success?: boolean; content?: string; error?: string };
      } | undefined;
      return {
        // 映射为 AgentEngine 兼容事件类型
        type: 'tool_end',
        toolCallId: `lg_tool_result_${Date.now()}`,
        toolName: data?.name || 'unknown',
        output: data?.output?.content || '',
        error: data?.output?.error || null,
        // 保留 result 格式供 automation executor 使用
        result: data?.output || { success: true, content: '' },
      };
    }

    case 'response': {
      // 流式文本增量 → 不作为独立事件暴露，由 onPartialResponse 处理
      return null;
    }

    case 'error': {
      const data = lgEvent.data as { message?: string } | undefined;
      return {
        type: 'error',
        message: data?.message || '未知错误',
      };
    }

    case 'done':
      return { type: 'done', data: lgEvent.data };

    default:
      return null;
  }
}

/**
 * LangGraphAgentAdapter — 包装 LangGraphAgent 模拟 AgentEngine 接口
 *
 * 对外接口与 AgentEngine 保持一致:
 *   - run(message, options) → Promise<string>
 *   - getTokenUsage() → TokenUsage
 *   - onEvent(listener) / offEvent(listener)
 *   - abort()
 */
export class LangGraphAgentAdapter {
  private agent: LangGraphAgent;
  private listeners = new Set<EventListener>();
  private lastSessionId = '';
  private lastUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  constructor(agent: LangGraphAgent) {
    this.agent = agent;
  }

  /**
   * 执行对话（兼容 AgentEngine.run）
   *
   * - 如果提供 onPartialResponse → 使用 runStream() 获得原生流式体验
   * - 否则 → 使用 agent.run() 获得更快响应
   */
  async run(message: string, options: RunOptions = {}): Promise<string> {
    this.lastSessionId = options.sessionId || `lg_${Date.now()}`;

    // 流式模式：使用原生 LangGraph stream
    if (options.onPartialResponse) {
      return this.runStream(message, options);
    }

    // 非流式模式：直接使用 agent.run()
    try {
      const result: AgentResult = await this.agent.run(message, {
        sessionId: this.lastSessionId,
        signal: options.signal,
      });

      // 更新用量
      this.lastUsage = {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      };

      // 触发 done 事件
      this.emit({ type: 'done', data: { sessionId: this.lastSessionId } });

      return result.response;
    } catch (error) {
      this.emit({
        type: 'error',
        message: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * 流式执行（LangGraph 原生支持）
   *
   * 使用 agent.stream() 获取实时事件，通过回调输出
   */
  async runStream(message: string, options: RunOptions = {}): Promise<string> {
    this.lastSessionId = options.sessionId || `lg_stream_${Date.now()}`;

    let fullResponse = '';
    let chunkCount = 0;

    try {
      for await (const event of this.agent.stream(message, {
        sessionId: this.lastSessionId,
        signal: options.signal,
      })) {
        // 映射并触发 AgentEngine 兼容事件
        const mapped = mapLangGraphToAgentEngineEvent(event);
        if (mapped) {
          this.emit(mapped);
        }

        // 处理流式文本增量
        if (event.type === 'response') {
          const data = event.data as { content?: string } | undefined;
          if (data?.content) {
            fullResponse += data.content;
            chunkCount++;
            if (options.onPartialResponse) {
              options.onPartialResponse(data.content);
            }
          }
        }
      }

      // 触发完成事件
      this.emit({ type: 'done', data: { sessionId: this.lastSessionId } });

      return fullResponse;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        this.emit({
          type: 'error',
          message: (error as Error).message,
        });
      }
      throw error;
    }
  }

  /**
   * 获取 Token 用量
   */
  async getTokenUsage(): Promise<TokenUsage> {
    if (this.lastSessionId) {
      try {
        return await this.agent.getTokenUsage(this.lastSessionId);
      } catch {
        // 降级到缓存值
      }
    }
    return this.lastUsage;
  }

  // ============ Checkpoint 管理方法（Phase B — 供 REST API 使用） ============

  /**
   * 列出所有 Checkpoint 会话
   */
  listSessions(): Array<{ threadId: string; turnCount: number; updatedAt: string }> {
    const threads = this.agent.listSessions();
    return threads.map((t: Record<string, unknown>) => ({
      threadId: t.thread_id as string || String(t.threadId || ''),
      turnCount: (t.turnCount as number) || 0,
      updatedAt: (t.updated_at as string) || new Date().toISOString(),
    }));
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string): Promise<Record<string, unknown> | null> {
    return this.agent.getState(sessionId);
  }

  /**
   * 恢复会话
   */
  async resume(sessionId: string, userMessage?: string): Promise<string> {
    const result = await this.agent.resume(sessionId, userMessage);
    return result.response;
  }

  // ============ 事件与生命周期 ============

  /**
   * 注册事件监听器
   */
  onEvent(listener: EventListener): void {
    this.listeners.add(listener);
  }

  /**
   * 移除事件监听器
   */
  offEvent(listener: EventListener): void {
    this.listeners.delete(listener);
  }

  /**
   * 取消当前执行
   */
  abort(): void {
    this.agent.abort();
  }

  /** 触发事件到所有监听器 */
  private emit(event: UnifiedAgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 忽略监听器错误
      }
    }
  }
}
