/**
 * Anthropic Messages API 适配器
 *
 * ── 为什么需要专用适配器（不能复用 OpenAICompatibleAdapter）──
 * Anthropic 的 Messages API 与 OpenAI Chat Completions 在**五个层面**都不同：
 *
 * | 层面 | OpenAI | Anthropic |
 * |------|--------|-----------|
 * | 鉴权 | `Authorization: Bearer` | `x-api-key` + **`anthropic-version`** 头 |
 * | 系统提示 | messages 里 role=system | **顶层 `system` 字段**（不在 messages 中） |
 * | `max_tokens` | 可选 | **必填**（缺失直接 400） |
 * | 流式 | `data:` 单事件流 | **命名事件**（`content_block_delta` / `message_delta` …） |
 * | 工具 | `tool_calls` 数组 | **`tool_use` / `tool_result` 内容块** |
 *
 * 若强行用 OpenAI 适配器去请求，会得到 400/401，而错误信息与真实原因
 * （"格式选错了"）毫无关系 —— 因此 `AdapterFactory` 曾显式抛错拒绝静默降级，
 * 本文件即为该分支的正式实现。
 *
 * ── 与既有契约的衔接 ──
 *   · 「思考过程」：Anthropic 的 `thinking` 块 → `ChatChunk.reasoningDelta` /
 *     `ChatResponse.reasoning`（与 v0.6.31 的推理模型契约一致）
 *   · 工具调用归一化：`tool_use` 块的 `input`（对象）→ 内部 `ToolCall.function.arguments`（JSON 字符串）
 *
 * @module adapters/AnthropicAdapter
 */

import type {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ProviderConfig,
  ToolCall,
  ContentBlock,
} from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
import { logger } from '../utils/logger.js';

// ===================== 常量 =====================

/** Anthropic API 版本头（缺省会 400） */
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

/** Messages API 路径（baseURL 通常为 https://api.anthropic.com，不含 /v1） */
const MESSAGES_PATH = '/v1/messages';

/** 未指定时的默认最大输出（该字段必填） */
const DEFAULT_MAX_TOKENS = 4096;

// ===================== Anthropic 响应类型 =====================

/** Anthropic 内容块 */
type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'redacted_thinking'; data?: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content?: string; is_error?: boolean };

/** Anthropic 消息 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/** Anthropic 非流式响应 */
interface AnthropicResponse {
  id: string;
  model: string;
  role: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Anthropic 流式事件 */
interface AnthropicStreamEvent {
  type: string;
  index?: number;
  message?: AnthropicResponse;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Anthropic 工具定义 */
interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

// ===================== 适配器 =====================

/**
 * Anthropic Messages API 适配器
 */
export class AnthropicAdapter extends BaseAdapter {
  private apiKey: string;
  private baseURL: string;
  private anthropicVersion: string;

  constructor(config: ProviderConfig, modelName?: string) {
    super(config, modelName);
    this.apiKey = config.apiKey;
    // baseURL 允许写成 https://api.anthropic.com 或带尾部斜杠，统一去掉尾斜杠
    this.baseURL = config.baseURL.replace(/\/+$/, '');
    this.anthropicVersion =
      (config.headers?.['anthropic-version'] as string) || DEFAULT_ANTHROPIC_VERSION;
  }

  /**
   * 请求头
   *
   * ⚠️ 与 OpenAI 不同：使用 `x-api-key` 而非 `Authorization`，
   *    且 **`anthropic-version` 必填**（缺失会 400）。
   */
  protected override getHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.anthropicVersion,
      ...this.config.headers,
    };
  }

  /**
   * 把内部消息格式转换为 Anthropic 格式
   *
   * 三处关键差异：
   *   ① `system` 必须抽到**顶层字段**，不能放在 messages 里
   *   ② 内部 `role: 'tool'` 的消息 → Anthropic 的 **user 消息 + `tool_result` 内容块**
   *   ③ assistant 的 `tool_calls` → **`tool_use` 内容块**
   *
   * @param messages - 内部消息列表
   * @returns system 文本与 Anthropic messages
   */
  private convertMessages(messages: Message[]): {
    system: string | undefined;
    messages: AnthropicMessage[];
  } {
    const systemParts: string[] = [];
    const out: AnthropicMessage[] = [];

    for (const msg of messages) {
      // ① 系统提示抽到顶层
      if (msg.role === 'system') {
        const text = typeof msg.content === 'string' ? msg.content : extractText(msg.content);
        if (text) systemParts.push(text);
        continue;
      }

      // ② 工具结果 → user 消息里的 tool_result 块
      if (msg.role === 'tool') {
        const toolResult: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || '',
          content: typeof msg.content === 'string' ? msg.content : extractText(msg.content),
        };
        out.push({ role: 'user', content: [toolResult] });
        continue;
      }

      // ③ assistant 带工具调用 → tool_use 内容块
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        const blocks: AnthropicContentBlock[] = [];
        const text = typeof msg.content === 'string' ? msg.content : extractText(msg.content);
        if (text) blocks.push({ type: 'text', text });
        for (const tc of msg.tool_calls) {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: safeParseJson(tc.function.arguments),
          });
        }
        out.push({ role: 'assistant', content: blocks });
        continue;
      }

      out.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: normalizeContent(msg.content),
      });
    }

    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: out,
    };
  }

  /** 把内部工具定义转换成 Anthropic 的 `input_schema` 形式 */
  private convertTools(tools: ChatOptions['tools']): AnthropicTool[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as unknown as Record<string, unknown>,
    }));
  }

  /** 构造请求体 */
  private buildBody(messages: Message[], options: ChatOptions | undefined, stream: boolean) {
    const { system, messages: anthropicMessages } = this.convertMessages(messages);
    const modelConfig = this.getModelConfig();

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages: anthropicMessages,
      // ⚠️ max_tokens 是**必填**字段，缺失会直接 400
      max_tokens: options?.maxTokens || modelConfig?.maxOutputTokens || DEFAULT_MAX_TOKENS,
      stream,
    };

    if (system) body.system = system;
    if (options?.temperature !== undefined) body.temperature = options.temperature;
    if (options?.topP !== undefined) body.top_p = options.topP;
    if (options?.stop?.length) body.stop_sequences = options.stop;

    const tools = this.convertTools(options?.tools);
    if (tools) {
      body.tools = tools;
      // Anthropic 的 tool_choice 结构与 OpenAI 不同
      if (options?.toolChoice === 'none') {
        body.tool_choice = { type: 'none' };
      } else if (typeof options?.toolChoice === 'object') {
        body.tool_choice = { type: 'tool', name: options.toolChoice.function.name };
      } else {
        body.tool_choice = { type: 'auto' };
      }
    }

    return body;
  }

  /**
   * 归一化停止原因
   *
   * Anthropic 的取值与内部枚举不同，必须显式映射 —— 否则 `stop_reason`
   * 会以非法值进入 `ChatResponse.finishReason`，下游判断全部失准。
   */
  private mapStopReason(stopReason: string | null | undefined): ChatResponse['finishReason'] {
    switch (stopReason) {
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'refusal':
        return 'content_filter';
      case 'end_turn':
      case 'stop_sequence':
      case null:
      case undefined:
        return 'stop';
      default:
        logger.debug({ stopReason }, '未识别的 Anthropic stop_reason，按 stop 处理');
        return 'stop';
    }
  }

  /** 从内容块数组中提取正文与思考过程 */
  private extractFromBlocks(blocks: AnthropicContentBlock[]): {
    content: string;
    reasoning: string;
    toolCalls: ToolCall[];
  } {
    let content = '';
    let reasoning = '';
    const toolCalls: ToolCall[] = [];

    for (const b of blocks) {
      if (b.type === 'text') content += b.text;
      else if (b.type === 'thinking') reasoning += b.thinking;
      else if (b.type === 'tool_use') {
        toolCalls.push({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        });
      }
    }

    return { content, reasoning, toolCalls };
  }

  // ===================== 非流式 =====================

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const res = await fetch(`${this.baseURL}${MESSAGES_PATH}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(this.buildBody(messages, options, false)),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic API 请求失败 [${res.status}]: ${errorText}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const { content, reasoning, toolCalls } = this.extractFromBlocks(data.content || []);

    return {
      id: data.id,
      model: data.model,
      content,
      // 思考过程与正文分开返回（与 v0.6.31 推理模型契约一致）
      reasoning: reasoning || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: this.mapStopReason(data.stop_reason),
      usage: data.usage
        ? {
            inputTokens: data.usage.input_tokens ?? 0,
            outputTokens: data.usage.output_tokens ?? 0,
            totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  }

  // ===================== 流式 =====================

  async *chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    const res = await fetch(`${this.baseURL}${MESSAGES_PATH}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(this.buildBody(messages, options, true)),
      signal: options?.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic API 流式请求失败 [${res.status}]: ${errorText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('无法获取响应流');

    const decoder = new TextDecoder();
    let buffer = '';

    /** 进行中的工具调用（按内容块 index 累积 input_json_delta） */
    const toolCallsInProgress = new Map<number, { id: string; name: string; args: string }>();
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        // Anthropic 使用命名事件：`event: xxx` + `data: {...}` 成对出现。
        // 这里只关心 data 行 —— 事件类型在 data 对象里也有 `type` 字段。
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;

        let evt: AnthropicStreamEvent;
        try {
          evt = JSON.parse(payload) as AnthropicStreamEvent;
        } catch {
          continue; // 半包/心跳等非 JSON 行，跳过
        }

        const chunk: ChatChunk = {};

        switch (evt.type) {
          case 'message_start': {
            inputTokens = evt.message?.usage?.input_tokens ?? 0;
            break;
          }

          case 'content_block_start': {
            const block = evt.content_block;
            if (block?.type === 'tool_use' && evt.index !== undefined) {
              toolCallsInProgress.set(evt.index, { id: block.id, name: block.name, args: '' });
            }
            break;
          }

          case 'content_block_delta': {
            const d = evt.delta;
            // 正文
            if (d?.text) chunk.delta = d.text;
            // 思考过程（Anthropic 的 thinking 块）→ 与推理模型契约一致
            else if (d?.thinking) chunk.reasoningDelta = d.thinking;
            // 工具参数增量（JSON 片段）
            else if (d?.partial_json !== undefined && evt.index !== undefined) {
              const tc = toolCallsInProgress.get(evt.index);
              if (tc) tc.args += d.partial_json;
            }
            break;
          }

          case 'content_block_stop': {
            // 工具调用参数收齐后一次性上抛
            if (evt.index !== undefined) {
              const tc = toolCallsInProgress.get(evt.index);
              if (tc) {
                chunk.toolCallDelta = {
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.args },
                };
                toolCallsInProgress.delete(evt.index);
              }
            }
            break;
          }

          case 'message_delta': {
            outputTokens = evt.usage?.output_tokens ?? outputTokens;
            if (evt.delta?.stop_reason) {
              chunk.finishReason = this.mapStopReason(evt.delta.stop_reason);
            }
            break;
          }

          case 'message_stop': {
            chunk.usage = {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            };
            break;
          }

          case 'error': {
            throw new Error(`Anthropic 流式错误: ${payload}`);
          }

          default:
            // ping / 其它控制事件，忽略
            break;
        }

        if (Object.keys(chunk).length > 0) yield chunk;
      }
    }
  }

  // ===================== 连接校验 =====================

  /**
   * 验证连接
   *
   * Anthropic 没有 OpenAI 那样的 `/models` 端点，这里用一个**最小化的
   * messages 请求**探活。注意 `max_tokens` 必填。
   */
  async validateConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseURL}${MESSAGES_PATH}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.modelName,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      return res.ok;
    } catch (error) {
      logger.warn({ error: (error as Error).message }, 'Anthropic 连接校验失败');
      return false;
    }
  }
}

// ===================== 工具函数 =====================

/** 从内容块数组里抽纯文本（非文本块忽略） */
function extractText(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** 把内部 content 归一化为 Anthropic 可接受的形式 */
function normalizeContent(content: string | ContentBlock[]): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content;

  return content.flatMap<AnthropicContentBlock>((b) => {
    switch (b.type) {
      case 'text':
        return [{ type: 'text', text: b.text }];
      case 'image':
        // Anthropic 图片块的 source **只接受 base64**；URL 形式会直接 400。
        // base64 → 原样透传；URL → 降级为文字说明（宁可少一张图，也不要整条请求失败）
        if (b.source.type === 'base64') {
          return [
            {
              type: 'image',
              source: { type: 'base64', media_type: b.source.media_type, data: b.source.data },
            },
          ];
        }
        return [
          { type: 'text', text: `[图片(URL 形式，Anthropic 不支持): ${b.source.media_type}]` },
        ];
      case 'tool_use':
        return [{ type: 'tool_use', id: b.id, name: b.name, input: b.input }];
      case 'tool_result':
        return [
          {
            type: 'tool_result',
            tool_use_id: b.tool_use_id,
            content: b.content,
            is_error: b.is_error,
          },
        ];
      default:
        return [];
    }
  });
}

/** 安全解析 JSON 字符串（失败返回空对象，避免整条请求因一个坏参数失败） */
function safeParseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text || '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
