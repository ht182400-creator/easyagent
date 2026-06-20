/**
 * 腾讯混元适配器
 * 使用腾讯云API 3.0签名格式
 * API文档: https://cloud.tencent.com/document/product/1729
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

/** 腾讯云API请求签名 */
interface TC3Request {
  action: string;
  version: string;
  region: string;
  payload: Record<string, unknown>;
}

/**
 * 腾讯混元适配器
 * 使用腾讯云API 3.0 TC3-HMAC-SHA256签名
 */
export class HunyuanAdapter extends BaseAdapter {
  private secretId: string;
  private secretKey: string;
  private region: string;

  constructor(config: ProviderConfig, modelName?: string) {
    super(config, modelName);
    // 混元的API_KEY格式: "secretId:secretKey"
    const [secretId, secretKey] = config.apiKey.split(':');
    this.secretId = secretId || config.apiKey;
    this.secretKey = secretKey || '';
    this.region = 'ap-guangzhou';
  }

  /**
   * 腾讯云API 3.0签名 (TC3-HMAC-SHA256)
   */
  private async signRequest(request: TC3Request): Promise<Record<string, string>> {
    const crypto = await import('node:crypto');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const date = new Date(Number(timestamp) * 1000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '');
    const service = 'hunyuan';

    const payload = JSON.stringify(request.payload);
    const hashedPayload = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');

    const httpRequestMethod = 'POST';
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const canonicalHeaders =
      `content-type:application/json\n` +
      `host:hunyuan.tencentcloudapi.com\n` +
      `x-tc-action:${request.action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';

    const canonicalRequest =
      `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n` +
      `${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

    const algorithm = 'TC3-HMAC-SHA256';
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCanonicalRequest = crypto
      .createHash('sha256')
      .update(canonicalRequest)
      .digest('hex');

    const stringToSign =
      `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    const kDate = crypto
      .createHmac('sha256', `TC3${this.secretKey}`)
      .update(date)
      .digest();
    const kService = crypto
      .createHmac('sha256', kDate)
      .update(service)
      .digest();
    const kSigning = crypto
      .createHmac('sha256', kService)
      .update('tc3_request')
      .digest();
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');

    const authorization =
      `${algorithm} Credential=${this.secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
      Authorization: authorization,
      'Content-Type': 'application/json',
      Host: 'hunyuan.tencentcloudapi.com',
      'X-TC-Action': request.action,
      'X-TC-Version': request.version,
      'X-TC-Timestamp': timestamp,
      'X-TC-Region': request.region,
    };
  }

  /**
   * 转换消息格式为混元格式
   */
  private convertMessages(messages: Message[]): Array<Record<string, unknown>> {
    return messages.map(msg => {
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter(c => c.type === 'text')
          .map(c => (c as { text: string }).text)
          .join('\n');
      }

      return {
        Role: msg.role === 'assistant' ? 'assistant' : 'user',
        Content: content,
      };
    });
  }

  /**
   * 非流式聊天
   */
  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const payload: Record<string, unknown> = {
      Model: this.modelName,
      Messages: this.convertMessages(messages),
      TopP: options?.topP ?? 0.8,
      Temperature: options?.temperature ?? 0.7,
    };

    const headers = await this.signRequest({
      action: 'ChatCompletions',
      version: '2023-09-01',
      region: this.region,
      payload,
    });

    try {
      const response = await fetch('https://hunyuan.tencentcloudapi.com', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`混元API错误: ${response.status}`);
      }

      const data = await response.json() as {
        Response: {
          Id: string;
          Choices: Array<{
            Message: { Role: string; Content: string };
            FinishReason: string;
          }>;
          Usage: { PromptTokens: number; CompletionTokens: number; TotalTokens: number };
          Error?: { Message: string };
        };
      };

      if (data.Response?.Error) {
        throw new Error(`混元API错误: ${data.Response.Error.Message}`);
      }

      const resp = data.Response;
      const choice = resp.Choices?.[0];

      return {
        id: resp.Id,
        model: this.modelName,
        content: choice?.Message?.Content || '',
        finishReason: choice?.FinishReason === 'stop' ? 'stop' : 'length',
        usage: resp.Usage
          ? {
              inputTokens: resp.Usage.PromptTokens,
              outputTokens: resp.Usage.CompletionTokens,
              totalTokens: resp.Usage.TotalTokens,
            }
          : undefined,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      logger.error({ error }, '混元请求失败');
      throw error;
    }
  }

  /**
   * 流式聊天
   * 混元流式API使用SSE格式
   */
  async *chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<ChatChunk> {
    const payload: Record<string, unknown> = {
      Model: this.modelName,
      Messages: this.convertMessages(messages),
      TopP: options?.topP ?? 0.8,
      Temperature: options?.temperature ?? 0.7,
      Stream: true,
    };

    const headers = await this.signRequest({
      action: 'ChatCompletions',
      version: '2023-09-01',
      region: this.region,
      payload,
    });

    try {
      const response = await fetch('https://hunyuan.tencentcloudapi.com', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw new Error(`混元流式API错误: ${response.status}`);
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
            const data = JSON.parse(jsonStr);
            const chunkData = data as {
              Response?: {
                Choices?: Array<{
                  Delta?: { Content?: string };
                  FinishReason?: string;
                }>;
                Usage?: { PromptTokens: number; CompletionTokens: number; TotalTokens: number };
              };
            };
            const resp = chunkData.Response;
            if (!resp) continue;

            const result: ChatChunk = {};
            const delta = resp.Choices?.[0]?.Delta;

            if (delta?.Content) {
              result.delta = delta.Content;
            }

            if (resp.Choices?.[0]?.FinishReason) {
              result.finishReason = resp.Choices[0].FinishReason;
              if (resp.Usage) {
                result.usage = {
                  inputTokens: resp.Usage.PromptTokens,
                  outputTokens: resp.Usage.CompletionTokens,
                  totalTokens: resp.Usage.TotalTokens,
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
      logger.error({ error }, '混元流式请求失败');
      throw error;
    }
  }

  /**
   * 验证连接
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.chat([{ role: 'user', content: 'ping' }], { maxTokens: 5 });
      return true;
    } catch (err) {
      return false;
    }
  }
}
