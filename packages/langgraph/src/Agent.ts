/**
 * Agent — LangGraph Agent 主类
 * 
 * 封装 StateGraph 的调用、流式输出、状态管理。
 * 对外接口兼容现有 AgentEngine，便于渐进式替换。
 */
import { HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { createAgentGraph } from './graph/agentGraph';
import type { AgentGraphConfig } from './graph/agentGraph';
import { SqliteCheckpointer } from './memory/Checkpointer';
import { MemoryManager } from './memory/Memory';
import type { MemoryConfig } from './memory/Memory';
import type { CheckpointerConfig } from './memory/Checkpointer';
import { Logger, setupFromEnv } from './logger/Logger';

// 启动时从环境变量读取日志配置
setupFromEnv();

/** Agent 模块 Logger */
const log = new Logger('Agent');

// ---- 类型定义 ----

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 最终响应文本 */
  response: string;
  /** 完整消息历史 */
  messages: BaseMessage[];
  /** 执行轮次 */
  turnCount: number;
  /** Token 用量 */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** 会话 ID */
  sessionId: string;
}

/**
 * Agent 事件（兼容 AgentEngine 的 AgentEvent）
 */
export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error' | 'done';
  data: unknown;
  timestamp: Date;
}

export type AgentEventListener = (event: AgentEvent) => void;

/**
 * 运行选项
 */
export interface RunOptions {
  /** 会话 ID（用于持久化/恢复） */
  sessionId?: string;
  /** 取消信号 */
  signal?: AbortSignal;
}

/**
 * Agent 配置
 */
export interface AgentConfig extends AgentGraphConfig {
  /** Checkpoint 持久化配置 */
  checkpointerConfig?: CheckpointerConfig;
  /** 长期记忆配置 */
  memoryConfig?: Partial<MemoryConfig>;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大轮次 */
  maxTurns?: number;
}

/**
 * LangGraph Agent — 对外主类
 * 
 * 使用方式:
 * ```
 * const agent = new LangGraphAgent({
 *   think: { chat: adapter.chat.bind(adapter), getToolDefinitions: () => registry.getDefinitions() },
 *   act: { toolExecutor: { execute: (n, p) => registry.execute(n, p, ctx) } },
 *   systemPrompt: '你是一个有帮助的助手',
 *   checkpointerConfig: { dbPath: './checkpoints.db' },
 * });
 * 
 * const result = await agent.run('你好');
 * console.log(result.response);
 * ```
 */
export class LangGraphAgent {
  private graph: ReturnType<typeof createAgentGraph>;
  private checkpointer: SqliteCheckpointer;
  private memory: MemoryManager;
  private systemPrompt: string;
  private maxTurns: number;
  private listeners: Set<AgentEventListener> = new Set();
  private abortController: AbortController | null = null;

  constructor(config: AgentConfig) {
    log.debug('Agent 构造开始', { maxTurns: config.maxTurns, hasCheckpointer: !!config.checkpointerConfig, hasMemory: !!config.memoryConfig });
    this.systemPrompt = config.systemPrompt || `你是一个有帮助的 AI 编程助手。

## 行为准则
- 普通聊天、问候、解释性问题时，直接回复文本，**不要调用工具**。
- 只有在需要执行具体操作（如读取文件、运行命令、搜索代码、管理知识库）时才调用工具。
- 不要对问候、简单问答、闲聊类请求调用 benchmark、git、exec 等工具。
- 如果工具调用失败，不要反复尝试同类工具，应直接告知用户失败原因。`;
    this.maxTurns = config.maxTurns || 25;

    // 初始化 Checkpoint 持久化
    this.checkpointer = new SqliteCheckpointer(config.checkpointerConfig);
    log.debug('Checkpointer 已初始化');

    // 初始化长期记忆
    this.memory = new MemoryManager(config.memoryConfig);
    log.debug('MemoryManager 已初始化');

    // 编译 StateGraph
    const compileTimer = log.startTimer('StateGraph 编译');
    this.graph = createAgentGraph({
      ...config,
      think: {
        ...config.think,
        systemPrompt: config.systemPrompt,
      },
      checkpointer: this.checkpointer,
      name: 'EasyAgent-LangGraph',
    });
    compileTimer();
    log.info('Agent 构造完成', { systemPrompt: this.systemPrompt.substring(0, 50) + '...', maxTurns: this.maxTurns });
  }

  // ============ 核心运行方法 ============

  /**
   * 执行 Agent 对话（非流式）
   * 
   * @param userMessage - 用户消息
   * @param options - 运行选项
   * @returns 执行结果
   */
  async run(userMessage: string, options: RunOptions = {}): Promise<AgentResult> {
    const sessionId = options.sessionId || generateSessionId();
    this.abortController = new AbortController();
    log.enter({ sessionId, userMessage: userMessage.substring(0, 100), method: 'run' });

    try {
      // 注入记忆上下文到系统提示词
      const memoryContext = this.memory.getContextForPrompt(sessionId);
      const enhancedSystemPrompt = memoryContext
        ? `${this.systemPrompt}\n\n${memoryContext}`
        : this.systemPrompt;
      if (memoryContext) {
        log.debug('已注入记忆上下文');
      }

      // 调用编译后的图
      const invokeTimer = log.startTimer('graph.invoke');
      const result = await this.graph.invoke(
        {
          messages: [new HumanMessage({ content: userMessage })],
          sessionId,
          systemPrompt: enhancedSystemPrompt,
          maxTurns: this.maxTurns,
          workspace: process.cwd(),
        },
        {
          configurable: { thread_id: sessionId },
          signal: options.signal || this.abortController.signal,
        }
      );
      invokeTimer();

      // 提取最终响应
      const messages = result.messages as BaseMessage[];
      const lastMessage = messages[messages.length - 1];
      const response =
        lastMessage && typeof lastMessage.content === 'string'
          ? lastMessage.content
          : '';

      // 提取关键信息到长期记忆
      const memItemsBefore = this.memory.getItems().length;
      this.memory.extractKeyInfo(messages);
      const memItemsAfter = this.memory.getItems().length;
      if (memItemsAfter > memItemsBefore) {
        log.debug(`记忆提取: 新增 ${memItemsAfter - memItemsBefore} 条`);
      }

      const usage = {
        inputTokens: (result.totalInputTokens as number) || 0,
        outputTokens: (result.totalOutputTokens as number) || 0,
        totalTokens:
          ((result.totalInputTokens as number) || 0) +
          ((result.totalOutputTokens as number) || 0),
      };

      log.exit({
        sessionId,
        turnCount: result.turnCount,
        msgCount: messages.length,
        responseLen: response.length,
        usage,
      });

      return { response, messages, turnCount: (result.turnCount as number) || 0, usage, sessionId };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        log.warn('任务已取消', { sessionId });
        return {
          response: '任务已取消。',
          messages: [],
          turnCount: 0,
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          sessionId,
        };
      }
      log.error('run 执行异常', { sessionId, error: (error as Error).message });
      throw error;
    }
  }

  // ============ 恢复执行 ============

  /**
   * 从 Checkpoint 恢复会话并继续执行
   * 
   * @param sessionId - 会话 ID
   * @param userMessage - 追加的用户消息（可选，不提供则继续之前的状态）
   * @returns 执行结果
   */
  async resume(sessionId: string, userMessage?: string): Promise<AgentResult> {
    log.enter({ sessionId, hasNewMessage: !!userMessage, method: 'resume' });
    // 获取最新状态
    const latestState = this.checkpointer.getLatestState(sessionId);
    if (!latestState) {
      log.error('会话不存在，无法恢复', { sessionId });
      throw new Error(`会话 ${sessionId} 不存在，无法恢复`);
    }
    log.debug('已恢复 checkpoint', { turnCount: latestState.turnCount, msgCount: (latestState.messages as unknown[])?.length });

    // 如果提供了新消息，追加到状态
    const input: Record<string, unknown> = { ...latestState, sessionId };

    if (userMessage) {
      const existingMessages = (latestState.messages as BaseMessage[]) || [];
      input.messages = [...existingMessages, new HumanMessage({ content: userMessage })];
    }

    // 注入记忆上下文
    const memoryContext = this.memory.getContextForPrompt(sessionId);
    if (memoryContext) {
      const currentPrompt = (input.systemPrompt as string) || this.systemPrompt;
      input.systemPrompt = `${currentPrompt}\n\n${memoryContext}`;
    }

    const invokeTimer = log.startTimer('graph.invoke (resume)');
    const result = await this.graph.invoke(input, {
      configurable: { thread_id: sessionId },
    });
    invokeTimer();

    const messages = result.messages as BaseMessage[];
    const lastMessage = messages[messages.length - 1];
    const usage = {
      inputTokens: (result.totalInputTokens as number) || 0,
      outputTokens: (result.totalOutputTokens as number) || 0,
      totalTokens:
        ((result.totalInputTokens as number) || 0) +
        ((result.totalOutputTokens as number) || 0),
    };
    log.exit({ sessionId, turnCount: result.turnCount, msgCount: messages.length, usage });

    return {
      response: lastMessage && typeof lastMessage.content === 'string' ? lastMessage.content : '',
      messages,
      turnCount: (result.turnCount as number) || 0,
      usage,
      sessionId,
    };
  }

  // ============ 流式输出 ============

  /**
   * 流式执行 Agent 对话
   * 
   * @param userMessage - 用户消息
   * @param options - 运行选项
   * @returns 异步生成器，产生 AgentEvent
   */
  async *stream(
    userMessage: string,
    options: RunOptions = {}
  ): AsyncGenerator<AgentEvent> {
    const sessionId = options.sessionId || generateSessionId();
    this.abortController = new AbortController();
    log.enter({ sessionId, userMessage: userMessage.substring(0, 100), method: 'stream' });

    let eventCount = 0;
    let hasResponseContent = false;
    try {
      const memoryContext = this.memory.getContextForPrompt(sessionId);
      const enhancedSystemPrompt = memoryContext
        ? `${this.systemPrompt}\n\n${memoryContext}`
        : this.systemPrompt;

      // 使用图的 streamEvents 获取每步事件
      // 递归限制按图步数计算：一次 think→act→observe 循环约 3 步，预留 10 步余量。
      const recursionLimit = this.maxTurns * 3 + 10;
      const eventStream = this.graph.streamEvents(
        {
          messages: [new HumanMessage({ content: userMessage })],
          sessionId,
          systemPrompt: enhancedSystemPrompt,
          maxTurns: this.maxTurns,
        },
        {
          configurable: { thread_id: sessionId },
          version: 'v2',
          signal: options.signal || this.abortController.signal,
          recursionLimit,
        }
      );

      for await (const event of eventStream) {
        const agentEvent = this.mapLangGraphEvent(event);
        if (agentEvent) {
          this.emit(agentEvent);
          yield agentEvent;
          eventCount++;
          if (agentEvent.type === 'response' && (agentEvent.data as { content?: string })?.content) {
            hasResponseContent = true;
          }
        }
      }

      // 兜底：如果 streamEvents 没有产出任何文本增量（例如底层 chat() 是非流式调用），
      // 从 checkpoint 最新状态中提取最终 AI 消息或 observeNode 设置的 finalResponse，
      // 确保前端能收到完整回复。
      if (!hasResponseContent) {
        const finalState = await this.checkpointer.getLatestState(sessionId);
        const finalResponse = (finalState?.finalResponse as string) || '';
        if (finalResponse) {
          log.warn('streamEvents 未产出文本增量，从 finalResponse 兜底输出', {
            sessionId,
            contentLen: finalResponse.length,
          });
          const fallbackEvent: AgentEvent = {
            type: 'response',
            data: { content: finalResponse },
            timestamp: new Date(),
          };
          this.emit(fallbackEvent);
          yield fallbackEvent;
          eventCount++;
        } else {
          const stateMessages = finalState?.messages as BaseMessage[] | undefined;
          const lastMessage = stateMessages?.[stateMessages.length - 1];
          // checkpoint 中消息可能是 LangChain 序列化格式 (kwargs.content)，
          // 也可能是普通对象 (content)，需要兼容两种格式提取文本内容。
          const finalContent = extractMessageContent(lastMessage);
          if (finalContent) {
            log.warn('streamEvents 未产出文本增量，从 checkpoint 兜底输出完整回复', {
              sessionId,
              contentLen: finalContent.length,
            });
            const fallbackEvent: AgentEvent = {
              type: 'response',
              data: { content: finalContent },
              timestamp: new Date(),
            };
            this.emit(fallbackEvent);
            yield fallbackEvent;
            eventCount++;
          }
        }
      }

      log.exit({ sessionId, eventCount, method: 'stream' });
      yield {
        type: 'done',
        data: { sessionId },
        timestamp: new Date(),
      };
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        log.error('stream 执行异常', { sessionId, error: (error as Error).message });
        yield {
          type: 'error',
          data: { message: (error as Error).message },
          timestamp: new Date(),
        };
      } else {
        log.warn('stream 已取消', { sessionId, eventCount });
      }
      yield { type: 'done', data: { sessionId }, timestamp: new Date() };
    }
  }

  // ============ 状态查询 ============

  /**
   * 获取会话的当前状态
   * @param sessionId - 会话 ID
   * @returns 完整 State
   */
  async getState(sessionId: string): Promise<Record<string, unknown> | null> {
    return this.checkpointer.getLatestState(sessionId);
  }

  /**
   * 列出所有已保存的会话
   * @returns 会话摘要列表
   */
  listSessions() {
    return this.checkpointer.listThreads();
  }

  /**
   * 获取 Token 用量汇总
   */
  async getTokenUsage(sessionId: string): Promise<{
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }> {
    const state = await this.checkpointer.getLatestState(sessionId);
    if (!state) {
      return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    }
    return {
      inputTokens: (state.totalInputTokens as number) || 0,
      outputTokens: (state.totalOutputTokens as number) || 0,
      totalTokens:
        ((state.totalInputTokens as number) || 0) +
        ((state.totalOutputTokens as number) || 0),
    };
  }

  // ============ 控制方法 ============

  /**
   * 取消当前执行
   */
  abort(): void {
    if (this.abortController) {
      log.warn('Agent 执行中止');
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 清除会话历史
   * @param sessionId - 会话 ID
   */
  clearHistory(sessionId: string): void {
    log.info('清除会话历史', { sessionId });
    this.checkpointer.deleteThread(sessionId);
  }

  // ============ 事件系统 ============

  /**
   * 注册事件监听器
   */
  onEvent(listener: AgentEventListener): void {
    this.listeners.add(listener);
    log.debug('事件监听器已注册', { listenerCount: this.listeners.size });
  }

  /**
   * 移除事件监听器
   */
  offEvent(listener: AgentEventListener): void {
    this.listeners.delete(listener);
    log.debug('事件监听器已移除', { listenerCount: this.listeners.size });
  }

  /** 发送事件到所有监听器 */
  private emit(event: AgentEvent): void {
    log.debug('发送事件', { type: event.type, listenerCount: this.listeners.size });
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 忽略监听器内部错误
        log.warn('事件监听器执行异常', { type: event.type });
      }
    }
  }

  // ============ 资源清理 ============

  /**
   * 关闭 Agent，释放资源
   */
  close(): void {
    log.info('Agent 关闭中...');
    this.checkpointer.close();
    this.memory.clear();
    this.listeners.clear();
    log.info('Agent 已关闭，资源已释放');
  }

  // ============ 内部工具 ============

  /**
   * 将 LangGraph 流式事件映射为 AgentEvent
   */
  private mapLangGraphEvent(event: Record<string, unknown>): AgentEvent | null {
    const eventName = event.event as string;
    const now = new Date();

    switch (eventName) {
      case 'on_chat_model_start':
        return {
          type: 'thinking',
          data: { node: 'think' },
          timestamp: now,
        };

      case 'on_chat_model_stream': {
        const chunk = event.data as { chunk?: { content?: string } };
        if (chunk?.chunk?.content) {
          return {
            type: 'response',
            data: { content: chunk.chunk.content },
            timestamp: now,
          };
        }
        return null;
      }

      case 'on_chat_model_end':
        return {
          type: 'thinking',
          data: { node: 'think', status: 'complete' },
          timestamp: now,
        };

      case 'on_tool_start':
        return {
          type: 'tool_call',
          data: {
            // 透传 LangChain 的 run_id 作为工具调用唯一 ID，
            // 供前端的 tool_call/tool_result 事件配对使用
            toolCallId: (event.run_id as string) || `tool_start_${now.getTime()}`,
            name: (event as Record<string, unknown>).name || 'unknown',
            input: event.data,
          },
          timestamp: now,
        };

      case 'on_tool_end':
        return {
          type: 'tool_result',
          data: {
            // 同一 run_id 必须与 on_tool_start 保持一致，
            // 否则前端的 tool_result 找不到对应 toolCall 无法更新工具卡片
            toolCallId: (event.run_id as string) || `tool_end_${now.getTime()}`,
            name: (event as Record<string, unknown>).name || 'unknown',
            output: (event.data as Record<string, unknown>)?.output,
          },
          timestamp: now,
        };

      default:
        return null;
    }
  }
}

// ============ 工具函数 ============

/** 生成唯一的会话 ID */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 从 checkpoint 中的消息对象提取文本内容
 *
 * 兼容两种格式：
 * - LangChain 序列化格式: { lc: 1, type: 'constructor', kwargs: { content: '...' } }
 * - 普通对象格式: { content: '...' } 或 { content: [{ type: 'text', text: '...' }] }
 *
 * @param msg - 消息对象（可能来自 checkpoint）
 * @returns 提取的文本内容，提取失败返回空字符串
 */
function extractMessageContent(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';
  const obj = msg as Record<string, unknown>;

  // 优先从 kwargs.content 提取（LangChain 序列化格式）
  if (obj.kwargs && typeof obj.kwargs === 'object') {
    const kwargs = obj.kwargs as Record<string, unknown>;
    const kwContent = kwargs.content;
    if (typeof kwContent === 'string') return kwContent;
    // content 可能是 ContentBlock[] 数组
    if (Array.isArray(kwContent)) {
      // 提取所有 text 类型块的文本拼接
      const texts = kwContent
        .map((b: unknown) => {
          if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text') {
            return (b as Record<string, unknown>).text as string || '';
          }
          return '';
        })
        .filter(Boolean);
      return texts.join('');
    }
  }

  // 兜底：直接从 content 属性提取
  const content = obj.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = content
      .map((b: unknown) => {
        if (b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text') {
          return (b as Record<string, unknown>).text as string || '';
        }
        return '';
      })
      .filter(Boolean);
    return texts.join('');
  }

  return '';
}
