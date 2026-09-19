/**
 * 评测用 Mock 适配器（**不是**真实模型）
 *
 * ── 它解决什么问题 ──
 * `--offline` 的桩工作在 **Runner 层**（直接替换"解法文本"），因此**绕过了整个 Agent**：
 * 工具调用、多轮循环、上下文压缩、消息协议全都没被执行 —— 无 Key 时无法回答
 * "我们的 Agent 编排本身对不对"。
 *
 * 本适配器把桩下沉到 **adapter 层**：`AgentEngine` 的构造签名允许直接传适配器实例
 * （`BaseAdapter | ProviderConfig`），于是整条 agentic 链路都能在不花钱、不联网的前提下跑起来。
 *
 * ── 诚实性约定 ──
 * ① 所有输出都带 `[MOCK ADAPTER]` 标记，且 `providerName` 明确写"离线"
 * ② 可配置成"先发一次工具调用，再给最终答复"（`withToolCall`）——这才是它存在的意义：
 *    **真实地走一遍工具注册表 → 工具执行 → 消息回灌 → 多轮**
 * ③ 它**不代表任何模型的能力**；用它跑出的分数只说明"编排链路能跑通"
 */
import { BaseAdapter } from '../adapters/BaseAdapter.js';
import type {
  ChatChunk,
  ChatOptions,
  ChatResponse,
  Message,
  ProviderConfig,
  ProviderId,
  ToolCall,
} from '../types/index.js';

// ===================== 常量 =====================

/** Mock 适配器的 provider id（不进入 PROVIDER_PRESETS，仅用于适配器内部标识） */
const MOCK_PROVIDER_ID = 'benchmark-mock';

/** 醒目标记：所有产物都带它，防止被当成真实模型输出 */
const MOCK_MARKER = '[MOCK ADAPTER]';

/** Mock 输出的函数名（结构化代码用） */
const MOCK_FUNCTION_NAME = 'mockSolution';

/** 默认触发的工具名（只读、快、无副作用） */
const DEFAULT_TOOL_NAME = 'list_dir';

/** 默认工具参数 */
const DEFAULT_TOOL_ARGUMENTS = JSON.stringify({ path: '.' });

/** 默认回复：结构完整的占位实现（保证走完 agent 循环且产出可被判定的代码块） */
const DEFAULT_MOCK_REPLY = [
  '```typescript',
  `// ${MOCK_MARKER} 离线占位实现 —— 非真实模型输出，勿作为能力依据`,
  `export function ${MOCK_FUNCTION_NAME}(input: unknown): unknown {`,
  '  if (input === undefined || input === null) return null;',
  '  return input;',
  '}',
  '```',
].join('\n');

/** Mock 适配器选项 */
export interface MockAdapterOptions {
  /** 固定回复（默认结构化占位实现） */
  reply?: string;
  /** 是否先发一次工具调用再给答复（用于真实地跑通工具链路） */
  withToolCall?: boolean;
  /** 工具名（默认 `list_dir`） */
  toolName?: string;
  /** 工具参数 JSON 字符串（默认 `{"path":"."}`） */
  toolArguments?: string;
}

/**
 * 构造评测用 Mock 适配器
 *
 * @param options 行为选项（见 {@link MockAdapterOptions}）
 * @returns BaseAdapter 实例（可直接传给 AgentEngine）
 */
export function createBenchmarkMockAdapter(options: MockAdapterOptions = {}): BaseAdapter {
  return new BenchmarkMockAdapter(options);
}

/**
 * 评测用 Mock 适配器实现
 *
 * 行为：第 1 次调用（尚无工具结果）可选地返回一个工具调用；之后返回固定答复。
 */
export class BenchmarkMockAdapter extends BaseAdapter {
  private readonly options: Required<MockAdapterOptions>;
  private callCount = 0;

  constructor(options: MockAdapterOptions = {}) {
    // 注意：这里的 id 是自定义字符串，需断言为 ProviderId（该并集是"已知厂商"清单，
    // Mock 刻意不进清单，避免出现在用户可见的厂商/模型列表里）
    const config = {
      id: MOCK_PROVIDER_ID as ProviderId,
      name: 'Benchmark Mock (离线，非真实模型)',
      baseURL: '',
      apiKey: 'mock',
      apiFormat: 'openai',
      defaultModel: 'benchmark-mock',
      models: [
        {
          id: 'benchmark-mock',
          name: 'Benchmark Mock',
          maxContextTokens: 32_768,
          maxOutputTokens: 4_096,
          supportsTools: true,
          supportsVision: false,
          pricing: { input: 0, output: 0 },
        },
      ],
    } as ProviderConfig;

    super(config, 'benchmark-mock');

    this.options = {
      reply: options.reply ?? DEFAULT_MOCK_REPLY,
      withToolCall: options.withToolCall ?? false,
      toolName: options.toolName ?? DEFAULT_TOOL_NAME,
      toolArguments: options.toolArguments ?? DEFAULT_TOOL_ARGUMENTS,
    };
  }

  /**
   * 是否应当本轮返回工具调用
   *
   * 判据：开启了 withToolCall、且消息里**还没有**工具结果（避免无限循环）
   *
   * @param messages 当前消息列表
   * @returns 需要发起工具调用时返回调用对象，否则 null
   */
  private nextToolCall(messages: Message[]): ToolCall | null {
    if (!this.options.withToolCall) return null;
    const hasToolResult = messages.some((m) => m.role === 'tool');
    if (hasToolResult) return null;
    if (messages.length === 0) return null;

    return {
      id: `mock_call_${this.callCount}`,
      type: 'function',
      function: { name: this.options.toolName, arguments: this.options.toolArguments },
    };
  }

  /**
   * 非流式聊天
   *
   * @param messages 消息列表
   * @param _options 聊天选项（本实现忽略）
   */
  async chat(messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
    this.callCount += 1;
    const toolCall = this.nextToolCall(messages);

    if (toolCall) {
      return {
        id: `mock_${this.callCount}`,
        model: this.currentModel,
        content: `${MOCK_MARKER} 先调用工具 ${toolCall.function.name}，再给出最终实现。`,
        toolCalls: [toolCall],
        finishReason: 'tool_calls',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    return {
      id: `mock_${this.callCount}`,
      model: this.currentModel,
      content: this.options.reply,
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  /**
   * 流式聊天（按整段产出，行为与非流式一致）
   *
   * @param messages 消息列表
   * @param options 聊天选项
   */
  async *chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    const response = await this.chat(messages, options);
    yield { delta: response.content, finishReason: response.finishReason };
  }

  /** 连接校验：Mock 恒为可用 */
  async validateConnection(): Promise<boolean> {
    return true;
  }
}
