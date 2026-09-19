/**
 * Agent引擎
 * 实现ReAct模式的智能体循环
 * 集成工具调用、多模型支持
 */
import type {
  Message,
  ChatOptions,
  ChatResponse,
  ToolCall,
  ToolDefinition,
  ToolResult,
  AgentConfig,
  AgentState,
  AgentEvent,
  TokenUsage,
} from '../types/index.js';
import { BaseAdapter } from '../adapters/BaseAdapter.js';
import { AdapterFactory } from '../adapters/index.js';
import type { ProviderConfig } from '../types/index.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { SessionManager } from '../session/SessionManager.js';
import { logger } from '../utils/logger.js';
import { getContextManager } from './context/index.js';

/** Agent事件监听器 */
export type AgentEventListener = (event: AgentEvent) => void;

/**
 * Agent引擎
 * 核心的智能体循环，管理思考-行动-观察循环
 */
export class AgentEngine {
  private adapter: BaseAdapter;
  private tools: ToolRegistry;
  private sessions: SessionManager;
  private config: Required<AgentConfig>;
  private state: AgentState = 'idle';
  private listeners: AgentEventListener[] = [];
  private abortController: AbortController | null = null;
  private totalUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private turnCount = 0;

  /** 默认系统提示词 */
  private static readonly DEFAULT_SYSTEM_PROMPT = `你是一个AI编程助手，专注于帮助开发者编写高质量的代码。

## 能力
- 读写文件、搜索代码库
- 执行命令（git, npm, node等）
- 调试和修复bug
- 代码重构和优化
- 编写测试
- 解释代码逻辑、提供最佳实践建议

## 行为准则
- 对于不确定的信息，明确告知用户
- 复杂任务先制定计划再执行
- 先读取再编辑，避免盲目修改
- 代码修改后运行相关测试验证
- 给出清晰的解释和建议`;

  constructor(
    adapterOrConfig: BaseAdapter | ProviderConfig,
    tools?: ToolRegistry,
    sessions?: SessionManager,
    config?: Partial<AgentConfig>,
  ) {
    // 支持传入适配器实例或提供商配置
    // 使用鸭子类型判断: 有chat和chatStream方法的视为适配器
    if (
      typeof (adapterOrConfig as any)?.chat === 'function' &&
      typeof (adapterOrConfig as any)?.chatStream === 'function'
    ) {
      this.adapter = adapterOrConfig as BaseAdapter;
    } else {
      this.adapter = AdapterFactory.create(adapterOrConfig as ProviderConfig, config?.model);
    }

    this.tools = tools || new ToolRegistry();
    this.sessions = sessions || new SessionManager();
    this.config = {
      provider: config?.provider || 'deepseek',
      model: config?.model || 'deepseek-v4',
      systemPrompt: config?.systemPrompt || AgentEngine.DEFAULT_SYSTEM_PROMPT,
      maxTurns: config?.maxTurns || 25,
      tools: config?.tools || [],
      allowTools: config?.allowTools ?? true,
      temperature: config?.temperature ?? 0.7,
    };
  }

  /**
   * 获取当前Agent状态
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * 获取Token用量
   */
  getTokenUsage(): TokenUsage {
    return { ...this.totalUsage };
  }

  /**
   * 添加事件监听器
   */
  onEvent(listener: AgentEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * 移除事件监听器
   */
  offEvent(listener: AgentEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * 发出事件
   */
  private emit(type: AgentEvent['type'], data: unknown): void {
    const event: AgentEvent = { type, data, timestamp: new Date() };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error({ error }, '事件监听器错误');
      }
    }
  }

  /**
   * 运行Agent对话循环
   * @param userMessage - 用户输入
   * @param options - 对话选项
   * @returns 最终响应文本
   */
  async run(
    userMessage: string,
    options?: {
      sessionId?: string;
      workspace?: string;
      /** 正式回答正文的增量回调 */
      onPartialResponse?: (text: string) => void;
      /**
       * 思考过程（思维链）的增量回调
       *
       * 推理模型（DeepSeek-R1 / Qwen3-thinking / GLM-Z1 / o 系列等）在正式回答前
       * 会先输出思维链。通过本回调可让界面在思考期间展示进度，而不是一片空白。
       */
      onReasoning?: (text: string) => void;
    },
  ): Promise<string> {
    const sessionId = options?.sessionId || `session_${Date.now()}`;
    const workspace = options?.workspace || process.cwd();

    // 初始化或恢复会话
    const session = this.sessions.getOrCreate(sessionId, {
      workspace,
      provider: this.config.provider,
      model: this.config.model,
    });

    // 首条消息作为会话标题（2026-09-19）：默认标题"会话 <时间>"只有时间没有信息量，
    // 历史会话列表里一排"会话 2026/9/19 19:12:57"完全无法分辨内容。取首条用户消息前 30 字；
    // 只在仍是默认标题（"会话 "前缀）时覆盖 —— 恢复老会话不改名。
    if (session.metadata.title.startsWith('会话 ') && userMessage.trim()) {
      session.metadata.title = userMessage.trim().replace(/\s+/g, ' ').slice(0, 30);
      this.sessions.save(session);
    }

    // 初始化中止控制器
    this.abortController = new AbortController();
    this.state = 'thinking';
    this.turnCount = 0;

    // 入口日志（DEBUG）：只记录规模与关键参数。
    // 刻意**不**记录消息全文 —— 既避免日志膨胀，也避免把用户代码/密钥写进日志文件。
    // 【2026-09-18 补充】此前 core 全包仅 6 处 debug，出问题时无从回溯，故补齐关键路径。
    logger.debug(
      {
        sessionId,
        workspace,
        provider: this.config.provider,
        model: this.config.model,
        maxTurns: this.config.maxTurns,
        allowTools: this.config.allowTools,
        historyMessages: session.messages.length,
        userMessageChars: userMessage.length,
      },
      'AgentEngine.run 入口',
    );

    try {
      // ── 上下文工程（P0-4）──
      // 由 ContextManager 统一决定「系统提示词 / 消息 / 工具定义」三件事：
      //   ① 工具按模型规模分级暴露（32k 小模型只给核心工具）
      //   ② 系统提示词用紧凑工具索引，消除与 tools 参数的重复计费
      //   ③ 历史超预算时压缩为结构化摘要
      // 关闭开关（EASYAGENT_CONTEXT_V2=0）时行为与改造前完全一致。
      const contextManager = getContextManager();
      const contextOptions = contextManager.getOptions();
      const modelInfo = this.adapter.getModelInfo();

      /**
       * 是否可以把「完整工具描述」从系统提示词中移除
       *
       * ⚠️ 安全守卫：**模型不支持 function calling 时必须保留内联描述**。
       * 否则 `tools` 字段不会被适配器下发，而提示词里也没有工具说明，
       * 模型将完全不知道有工具可用 —— 那是能力消失，不是省 token。
       */
      const supportsFunctionCalling = modelInfo?.supportsTools !== false;
      const dedupeDescriptions = contextOptions.dedupeToolDescriptions && supportsFunctionCalling;
      if (contextOptions.dedupeToolDescriptions && !supportsFunctionCalling) {
        logger.info(
          { model: this.config.model },
          '该模型不支持 function calling，已保留系统提示词中的完整工具描述（不执行描述去重）',
        );
      }

      /**
       * 完整历史（不含 system，**不做任何压缩**）
       *
       * 与工作集 `messages` 分开维护的原因：压缩只应改变「发给模型的上下文」，
       * **绝不应导致会话记录丢失**。会话落盘时使用本数组。
       */
      const fullHistory: Message[] = [...session.messages, { role: 'user', content: userMessage }];

      const built = contextManager.build({
        systemPrompt: this.buildSystemPrompt(workspace, !dedupeDescriptions),
        messages: fullHistory,
        toolDefinitions: this.config.allowTools ? this.tools.getDefinitions() : [],
        workspace,
        sessionId,
        model: this.config.model,
        maxContextTokens: modelInfo?.maxContextTokens,
        dedupeToolDescriptions: dedupeDescriptions,
      });

      /** 工作集：真正发给模型的消息（含 system，可能已被压缩） */
      const messages: Message[] = built.messages;
      const toolDefinitions = built.toolDefinitions;

      // Agent循环
      let fullResponse = '';
      let shouldContinue = true;

      while (shouldContinue && this.turnCount < this.config.maxTurns) {
        this.turnCount++;
        // 轮次推进属于"循环细节"，按日志分级规范归 DEBUG。
        // 原实现用 INFO，会在长任务里刷屏并淹没真正的状态变更（INFO 应留给关键状态）。
        logger.debug(
          {
            turn: this.turnCount,
            maxTurns: this.config.maxTurns,
            messageCount: messages.length,
            toolDefinitions: toolDefinitions.length,
          },
          'Agent 轮次开始',
        );

        this.state = 'thinking';
        this.emit('thinking', { turn: this.turnCount });

        // 调用模型
        const chatOptions: ChatOptions = {
          maxTokens: 4096,
          temperature: this.config.temperature,
          tools: this.config.allowTools ? toolDefinitions : undefined,
          toolChoice: this.config.allowTools ? 'auto' : 'none',
          signal: this.abortController.signal,
        };

        let response: ChatResponse;

        if (options?.onPartialResponse || options?.onReasoning) {
          // 流式输出
          response = await this.streamChat(
            messages,
            chatOptions,
            options.onPartialResponse ?? (() => {}),
            options.onReasoning,
          );
        } else {
          response = await this.adapter.chat(messages, chatOptions);
        }

        // 累积Token用量
        if (response.usage) {
          this.totalUsage.inputTokens += response.usage.inputTokens;
          this.totalUsage.outputTokens += response.usage.outputTokens;
          this.totalUsage.totalTokens += response.usage.totalTokens;
        }

        // 添加助手消息到对话历史（工作集与完整历史同步追加）
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        };
        messages.push(assistantMessage);
        fullHistory.push(assistantMessage);

        fullResponse += response.content || '';

        // 检查是否需要调用工具
        if (
          response.toolCalls &&
          response.toolCalls.length > 0 &&
          response.finishReason === 'tool_calls'
        ) {
          this.state = 'acting';
          this.emit('tool_call', { toolCalls: response.toolCalls });

          // 执行工具调用
          for (const toolCall of response.toolCalls) {
            if (this.abortController.signal.aborted) break;

            const toolName = toolCall.function.name;
            let toolInput: Record<string, unknown>;

            try {
              toolInput = JSON.parse(toolCall.function.arguments);
            } catch (err) {
              toolInput = {};
            }

            // 脱敏工具输入，避免日志泄露 API Key / 密码等敏感字段
            const sanitizedInput = sanitizeToolInput(toolInput);
            const toolStartedAt = Date.now();
            logger.debug({ tool: toolName, input: sanitizedInput }, '工具执行开始');

            const result = await this.tools.execute(toolName, toolInput, {
              workspace,
              sessionId,
              signal: this.abortController.signal,
            });

            // 出口日志：耗时与结果规模是排查"工具卡住 / 结果被截断 / 静默失败"的关键线索
            logger.debug(
              {
                tool: toolName,
                success: result.success,
                elapsedMs: Date.now() - toolStartedAt,
                contentChars: result.content?.length ?? 0,
                error: result.error,
              },
              '工具执行结束',
            );

            this.emit('tool_result', { toolName, result });

            // 工具结果超长时截断：完整内容落盘到工作区 `.easyagent/context/`，
            // 消息里给出相对路径，模型需要时可用 read_file 分段取回。
            const truncated = contextManager.truncateToolResult(result.content, {
              workspace,
              sessionId,
              toolName,
            });

            // 工作集用**截断版**（省上下文）；完整历史保留**原文**
            // （用户回看会话、以及"重新读取完整结果"的诉求不应因压缩而受损）
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: truncated.content,
            });
            fullHistory.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.content,
            });
          }
        } else {
          // 模型给出最终回答
          shouldContinue = false;
        }
      }

      // 保存会话：使用**完整历史**而非工作集
      // （工作集可能已被 ContextManager 压缩，用它落盘会导致会话记录永久丢失）
      session.messages = fullHistory;
      session.metadata.updatedAt = new Date();
      session.metadata.tokenUsage = { ...this.totalUsage };
      this.sessions.save(session);

      this.state = 'done';
      this.emit('done', { response: fullResponse, usage: this.totalUsage });

      logger.debug(
        {
          sessionId,
          turns: this.turnCount,
          responseChars: fullResponse.length,
          usage: { ...this.totalUsage },
        },
        'AgentEngine.run 出口',
      );
      return fullResponse || 'Agent已完成，但没有生成回复。';
    } catch (error) {
      this.state = 'error';
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit('error', { error: errorMsg });

      if ((error as Error).name === 'AbortError') {
        logger.debug({ sessionId, turns: this.turnCount }, 'AgentEngine.run 被用户中止');
        return '操作已取消。';
      }

      logger.error({ error }, 'Agent运行错误');
      return `错误: ${errorMsg}`;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 流式聊天(带回调)
   *
   * @param onChunk - 正式回答正文的增量回调
   * @param onReasoningChunk - 思考过程（思维链）的增量回调。
   *   推理模型会先输出大段思维链再给正式回答；这里与正文**分开**上抛，
   *   不传则思考内容仅累积到返回值的 `reasoning` 字段（界面会表现为思考期间空白）。
   */
  private async streamChat(
    messages: Message[],
    options: ChatOptions,
    onChunk: (text: string) => void,
    onReasoningChunk?: (text: string) => void,
  ): Promise<ChatResponse> {
    let fullContent = '';
    let fullReasoning = '';
    let finalUsage: TokenUsage | undefined;
    let finalFinishReason: ChatResponse['finishReason'] = 'stop';
    let toolCalls: ToolCall[] | undefined;
    const toolCallMap = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of this.adapter.chatStream(messages, options)) {
      if (this.abortController?.signal.aborted) break;

      if (chunk.delta) {
        fullContent += chunk.delta;
        onChunk(chunk.delta);
      }

      if (chunk.reasoningDelta) {
        fullReasoning += chunk.reasoningDelta;
        onReasoningChunk?.(chunk.reasoningDelta);
      }

      if (chunk.toolCallDelta) {
        // 累积工具调用
        const existing = Array.from(toolCallMap.values());
        if (existing.length === 0) {
          toolCallMap.set(0, {
            id: chunk.toolCallDelta.id || `call_${Date.now()}`,
            name: chunk.toolCallDelta.function?.name || '',
            args: chunk.toolCallDelta.function?.arguments || '',
          });
        } else {
          const tc = existing[0];
          if (chunk.toolCallDelta.function?.arguments) {
            tc.args += chunk.toolCallDelta.function.arguments;
          }
        }
      }

      if (chunk.finishReason) {
        finalFinishReason = chunk.finishReason as ChatResponse['finishReason'];
      }

      if (chunk.usage) {
        finalUsage = chunk.usage;
      }
    }

    // 处理累积的工具调用
    if (toolCallMap.size > 0) {
      toolCalls = Array.from(toolCallMap.values()).map((tc) => ({
        id: tc.id || `call_${Date.now()}`,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.args,
        },
      }));
    }

    return {
      id: `chat_${Date.now()}`,
      model: this.adapter.currentModel,
      content: fullContent,
      // 思考过程单独返回（无内容时不产出该字段，保持与非推理模型一致的响应形状）
      reasoning: fullReasoning || undefined,
      toolCalls,
      finishReason: finalFinishReason,
      usage: finalUsage,
    };
  }

  /**
   * 构建系统提示词
   *
   * @param workspace - 工作目录
   * @param includeToolDetails - 是否把**完整工具描述**拼进提示词。
   *   启用上下文工程时传 `false` —— 完整参数定义已由 function calling 的 `tools` 字段承载，
   *   再拼一遍等于同一份信息付两次 token（实测约 6,058 token）。
   *   ContextManager 会改为追加一份紧凑的「工具索引」。
   */
  private buildSystemPrompt(workspace: string, includeToolDetails = true): string {
    const os =
      process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
    const date = new Date().toLocaleString('zh-CN');

    const toolSection = !this.config.allowTools
      ? '工具调用已禁用'
      : includeToolDetails
        ? this.tools.getDescriptions()
        : '（完整参数定义见本次请求的 tools 字段；命名与用途见下方「工具索引」）';

    return `${this.config.systemPrompt}

## 环境信息
- 当前日期时间: ${date}
- 操作系统: ${os}
- 工作目录: ${workspace}
- Shell: ${process.env.SHELL || (process.platform === 'win32' ? 'PowerShell' : 'bash')}

## 可用工具
${toolSection}`;
  }

  /**
   * 构建工具定义列表
   *
   * @deprecated 工具选择已交由 `ContextManager.build()` 统一负责
   *   （需要按模型规模分级 + 统计 token）。保留本方法仅供外部按需调用全量定义。
   */
  getToolDefinitions(): ToolDefinition[] {
    if (!this.config.allowTools) return [];
    return this.tools.getDefinitions();
  }

  /**
   * 停止Agent执行
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.state = 'idle';
      logger.info('Agent执行已中止');
    }
  }

  /**
   * 切换到不同的模型
   */
  switchModel(providerConfig: ProviderConfig, modelName: string): void {
    this.adapter = AdapterFactory.create(providerConfig, modelName);
    this.config.provider = providerConfig.id;
    this.config.model = modelName;
    logger.info({ provider: providerConfig.id, model: modelName }, 'Agent模型已切换');
  }

  /**
   * 清除对话历史
   */
  clearHistory(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    this.turnCount = 0;
    logger.info({ sessionId }, '会话已清除');
  }
}

/**
 * 脱敏工具输入参数，防止日志泄露敏感信息
 * 对常见敏感字段（apiKey, token, password, secret, key 等）的值进行掩码
 */
function sanitizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'apiKey',
    'apikey',
    'api_key',
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'password',
    'passwd',
    'secret',
    'privateKey',
    'private_key',
    'key',
    'credential',
    'auth',
  ];
  const sanitized: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(input)) {
    const lowerKey = k.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey === sk || lowerKey.includes(sk))) {
      sanitized[k] = typeof v === 'string' && v.length > 3 ? v.slice(0, 3) + '***' : '***';
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      sanitized[k] = sanitizeToolInput(v as Record<string, unknown>);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}
