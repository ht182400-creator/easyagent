/**
 * 百度文心一言适配器
 * 使用百度自有API格式 (非OpenAI兼容)
 * 需要先通过OAuth获取access_token
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

/** 文心一言API响应 */
interface ErnieResponse {
  id: string;
  object: string;
  created: number;
  result: string;
  is_end: boolean;
  need_clear_history: boolean;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  function_call?: {
    name: string;
    arguments: string;
    thoughts?: string;
  };
}

/** 文心一言流式响应 */
interface ErnieStreamChunk {
  id: string;
  object: string;
  created: number;
  result: string;
  is_end: boolean;
  need_clear_history: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  function_call?: {
    name: string;
    arguments: string;
    thoughts?: string;
  };
}

/**
 * 文心一言适配器
 * API文档: https://cloud.baidu.com/doc/WENXINWORKSHOP/s/jlil56u11
 */
export class ErnieAdapter extends BaseAdapter {
  private apiKey: string;
  private secretKey: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  /** 模型到API端点的映射 */
  private static readonly MODEL_ENDPOINTS: Record<string, string> = {
    'ernie-4.0-8k': '/ernie-4.0-8k',
    'ernie-4.0-turbo-8k': '/ernie-4.0-turbo-8k',
    'ernie-3.5-8k': '/completions',
  };

  constructor(config: ProviderConfig, modelName?: string) {
    super(config, modelName);
    // 文心一言的API_KEY格式通常是 "apiKey:secretKey"
    const [apiKey, secretKey] = config.apiKey.split(':');
    this.apiKey = apiKey || config.apiKey;
    this.secretKey = secretKey || '';
  }

  /**
   * 获取Access Token
   * 使用OAuth 2.0的client_credentials方式
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.secretKey) {
      throw new Error(
        '文心一言需要同时提供API Key和Secret Key，格式: "apiKey:secretKey"'
      );
    }

    try {
      const response = await fetch(
        `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error(`获取Access Token失败: ${response.status}`);
      }

      const data = await response.json() as { access_token: string; expires_in: number };
      this.accessToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // 提前60秒刷新

      logger.info('文心一言Access Token已获取');
      return this.accessToken;
    } catch (error) {
      logger.error({ error }, '获取文心一言Access Token失败');
      throw error;
    }
  }

  /**
   * 获取模型端点URL
   */
  private getEndpoint(): string {
    const endpoint = ErnieAdapter.MODEL_ENDPOINTS[this.modelName];
    if (!endpoint) {
      throw new Error(`不支持的文心一言模型: ${this.modelName}`);
    }
    return `${this.config.baseURL}${endpoint}`;
  }

  /**
   * 将消息转换为文心一言格式
   */
  private convertMessages(messages: Message[]): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(c => c.type === 'text')
          .map(c => (c as { text: string }).text)
          .join('\n');
      }

      if (msg.role === 'tool') {
        result.push({ role: 'assistant', content: `工具结果: ${content}` });
      } else {
        result.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content });
      }
    }

    return result;
  }

  /**
   * 转换工具定义为文心一言格式
   */
  private convertTools(tools: ChatOptions['tools']) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      responses: {},
    }));
  }

  /** 非流式聊天 */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const token = await this.getAccessToken();
    const endpoint = this.getEndpoint();

    const body: Record<string, unknown> = {
      messages: this.convertMessages(messages),
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP ?? 0.8,
      penalty_score: 1.0,
    };

    if (options?.tools && options.tools.length > 0) {
      body.functions = this.convertTools(options.tools);
    }

    try {
      const url = `${endpoint}?access_token=${token}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`文心一言API错误 [${response.status}]: ${errorText}`);
      }

      const data = (await response.json()) as ErnieResponse;

      return {
        id: data.id,
        model: this.modelName,
        content: data.result,
        toolCalls: data.function_call
          ? [
              {
                id: `call_${Date.now()}`,
                type: 'function' as const,
                function: {
                  name: data.function_call.name,
                  arguments: data.function_call.arguments,
                },
              },
            ]
          : undefined,
        finishReason: data.is_end ? 'stop' : 'length',
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      logger.error({ error }, '文心一言请求失败');
      throw error;
    }
  }

  /** 流式聊天 */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<ChatChunk> {
    const token = await this.getAccessToken();
    const endpoint = this.getEndpoint();

    const body: Record<string, unknown> = {
      messages: this.convertMessages(messages),
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP ?? 0.8,
      stream: true,
    };

    if (options?.tools && options.tools.length > 0) {
      body.functions = this.convertTools(options.tools);
    }

    try {
      const url = `${endpoint}?access_token=${token}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`文心一言流式API错误: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法获取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);

          try {
            const chunk: ErnieStreamChunk = JSON.parse(jsonStr);
            const result: ChatChunk = {};

            if (chunk.result) {
              result.delta = chunk.result;
            }

            if (chunk.is_end) {
              result.finishReason = 'stop';
              if (chunk.usage) {
                result.usage = {
                  inputTokens: chunk.usage.prompt_tokens,
                  outputTokens: chunk.usage.completion_tokens,
                  totalTokens: chunk.usage.total_tokens,
                };
              }
            }

            yield result;
          } catch (err) {
            // 跳过无法解析的行
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      logger.error({ error }, '文心一言流式请求失败');
      throw error;
    }
  }

  /** 验证连接 */
  async validateConnection(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (err) {
      return false;
    }
  }
}
