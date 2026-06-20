/**
 * OpenAI兼容协议适配器
 * 适用于使用OpenAI兼容API格式的模型提供商
 * 包括: DeepSeek, 智谱GLM, 通义千问, Kimi, 豆包, MiniMax, Ollama
 */
import type {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ProviderConfig,
} from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
import { logger } from '../utils/logger.js';

/** OpenAI API 响应类型 */
interface OpenAIChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** OpenAI 流式响应类型 */
interface OpenAIChatStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI兼容API适配器
 * 统一处理所有使用OpenAI API格式的提供商
 */
export class OpenAICompatibleAdapter extends BaseAdapter {
  private apiKey: string;
  private baseURL: string;

  constructor(config: ProviderConfig, modelName?: string) {
    super(config, modelName);
    this.apiKey = config.apiKey;
    // 确保URL以/v1结尾
    this.baseURL = config.baseURL.endsWith('/v1')
      ? config.baseURL
      : config.baseURL.replace(/\/$/, '') + '/v1';
  }

  /**
   * 将内部消息格式转换为OpenAI格式
   */
  private convertMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map(msg => {
      const converted: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.tool_calls) {
        converted.tool_calls = msg.tool_calls;
      }
      if (msg.tool_call_id) {
        converted.tool_call_id = msg.tool_call_id;
      }
      if (msg.name) {
        converted.name = msg.name;
      }

      return converted;
    });
  }

  /**
   * 将工具定义转换为OpenAI格式
   */
  private convertTools(tools: ChatOptions['tools']) {
    if (!tools) return undefined;
    return tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  /**
   * 非流式聊天请求
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const modelConfig = this.getModelConfig();
    const maxTokens = options?.maxTokens || modelConfig?.maxOutputTokens || 4096;

    const body = {
      model: this.modelName,
      messages: this.convertMessages(messages),
      max_tokens: maxTokens,
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP ?? 1,
      stop: options?.stop,
      tools: this.convertTools(options?.tools),
      tool_choice: options?.toolChoice || 'auto',
      stream: false,
    };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败 [${response.status}]: ${errorText}`);
      }

      const data = (await response.json()) as OpenAIChatResponse;
      const choice = data.choices[0];
      const message = choice.message;

      return {
        id: data.id,
        model: data.model,
        content: message.content || '',
        toolCalls: message.tool_calls?.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
        finishReason: choice.finish_reason,
        usage: data.usage
          ? {
              inputTokens: data.usage.prompt_tokens,
              outputTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      logger.error({ error, provider: this.config.name }, '聊天请求失败');
      throw error;
    }
  }

  /**
   * 流式聊天请求
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<ChatChunk> {
    const modelConfig = this.getModelConfig();
    const maxTokens = options?.maxTokens || modelConfig?.maxOutputTokens || 4096;

    const body = {
      model: this.modelName,
      messages: this.convertMessages(messages),
      max_tokens: maxTokens,
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP ?? 1,
      stop: options?.stop,
      tools: this.convertTools(options?.tools),
      tool_choice: options?.toolChoice || 'auto',
      stream: true,
    };

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API流式请求失败 [${response.status}]: ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const toolCallsInProgress: Map<number, { id: string; name: string; args: string }> =
        new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const chunk: OpenAIChatStreamChunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            if (!delta) continue;

            const result: ChatChunk = {};

            // 文本增量
            if (delta.content) {
              result.delta = delta.content;
            }

            // 工具调用增量
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCallsInProgress.get(tc.index) || {
                  id: '',
                  name: '',
                  args: '',
                };

                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.args += tc.function.arguments;

                toolCallsInProgress.set(tc.index, existing);
              }

              // 输出最后一个工具调用
              const lastTc = delta.tool_calls[delta.tool_calls.length - 1];
              const inProgress = toolCallsInProgress.get(lastTc.index);
              if (inProgress) {
                result.toolCallDelta = {
                  id: inProgress.id,
                  function: {
                    name: inProgress.name,
                    arguments: inProgress.args,
                  },
                };
              }
            }

            // 完成原因
            if (chunk.choices[0]?.finish_reason) {
              result.finishReason = chunk.choices[0].finish_reason;
            }

            // Token用量
            if (chunk.usage) {
              result.usage = {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              };
            }

            yield result;
          } catch {
            // 跳过无法解析的行
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw error;
      }
      logger.error({ error, provider: this.config.name }, '流式聊天请求失败');
      throw error;
    }
  }

  /**
   * 验证API连接
   * 失败时抛出详细错误信息，便于前端展示给用户
   */
  async validateConnection(): Promise<boolean> {
    if (!this.apiKey) {
      logger.warn({ provider: this.config.name }, 'API密钥未设置');
      throw new Error('API密钥未设置，请先在下方的"设置API密钥"中配置密钥');
    }

    try {
      const response = await fetch(`${this.baseURL}/models`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (response.ok) {
        logger.info({ provider: this.config.name }, '连接验证成功');
        return true;
      }

      // 分析 HTTP 状态码，给出针对性提示
      if (response.status === 401 || response.status === 403) {
        throw new Error(`认证失败 (HTTP ${response.status})，请检查API密钥是否正确、是否已过期`);
      }
      if (response.status === 429) {
        throw new Error('请求频率超限 (HTTP 429)，请稍后再试或检查API配额');
      }
      if (response.status >= 500) {
        throw new Error(`服务器错误 (HTTP ${response.status})，${this.config.name} 服务端暂时不可用，请稍后重试`);
      }

      // 某些提供商不支持/models端点，尝试简单聊天请求
      logger.info({ provider: this.config.name }, '/models 端点不可用，尝试聊天请求验证');
      const testResponse = await this.chat([
        { role: 'user', content: 'ping' },
      ], { maxTokens: 5 });

      return !!testResponse.content;
    } catch (error: unknown) {
      // 如果已经抛出了结构化错误，直接向上传递
      if (error instanceof Error && error.message.includes('API密钥') || error instanceof Error && error.message.includes('认证失败') || error instanceof Error && error.message.includes('请求频率超限') || error instanceof Error && error.message.includes('服务器错误')) {
        throw error;
      }

      const errMsg = (error as Error).message || String(error);

      // 网络层错误分析
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('Connection refused')) {
        throw new Error(`无法连接到 ${this.baseURL}：连接被拒绝，请检查网络或代理设置`);
      }
      if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo') || errMsg.includes('DNS')) {
        throw new Error(`无法解析域名 ${this.baseURL}：DNS解析失败，请检查网络连接`);
      }
      if (errMsg.includes('ETIMEDOUT') || errMsg.includes('timeout')) {
        throw new Error(`连接 ${this.baseURL} 超时，请检查网络或防火墙设置`);
      }
      if (errMsg.includes('self-signed') || errMsg.includes('SSL') || errMsg.includes('TLS') || errMsg.includes('certificate')) {
        throw new Error(`SSL/TLS证书验证失败：${errMsg}`);
      }

      logger.error({ error, provider: this.config.name }, '连接验证失败');
      throw new Error(`连接验证失败：${errMsg}`);
    }
  }
}
