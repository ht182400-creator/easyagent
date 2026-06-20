/**
 * 模型适配器基类
 * 定义统一的模型调用接口，所有具体适配器继承此类
 */
import type {
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ModelInfo,
  ProviderConfig,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * 模型适配器抽象基类
 */
export abstract class BaseAdapter {
  protected config: ProviderConfig;
  protected modelName: string;

  constructor(config: ProviderConfig, modelName?: string) {
    this.config = config;
    this.modelName = modelName || config.defaultModel || config.models[0]?.id || '';
  }

  /** 获取提供商名称 */
  get providerName(): string {
    return this.config.name;
  }

  /** 获取当前模型名称 */
  get currentModel(): string {
    return this.modelName;
  }

  /**
   * 聊天请求(非流式)
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 聊天响应
   */
  abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;

  /**
   * 聊天请求(流式)
   * @param messages - 消息列表
   * @param options - 聊天选项
   * @returns 异步生成器，产出聊天块
   */
  abstract chatStream(
    messages: Message[],
    options?: ChatOptions
  ): AsyncGenerator<ChatChunk>;

  /**
   * 获取可用模型列表
   * @returns 模型信息列表
   */
  getModels(): ModelInfo[] {
    return this.config.models.map(m => ({
      id: m.id,
      name: m.name,
      provider: this.config.id,
      maxContextTokens: m.maxContextTokens,
      maxOutputTokens: m.maxOutputTokens,
      supportsTools: m.supportsTools,
      supportsVision: m.supportsVision,
      pricing: m.pricing,
    }));
  }

  /**
   * 验证连接
   * @returns 是否连接成功
   */
  abstract validateConnection(): Promise<boolean>;

  /**
   * 切换模型
   * @param modelName - 模型名称
   */
  switchModel(modelName: string): void {
    const model = this.config.models.find(m => m.id === modelName);
    if (!model) {
      throw new Error(`模型 ${modelName} 在提供商 ${this.config.name} 中不存在`);
    }
    this.modelName = modelName;
    logger.info({ provider: this.config.name, model: modelName }, '模型已切换');
  }

  /**
   * 获取模型配置
   */
  protected getModelConfig() {
    return this.config.models.find(m => m.id === this.modelName);
  }

  /**
   * 获取模型信息
   */
  getModelInfo(): ModelInfo | undefined {
    const mc = this.getModelConfig();
    if (!mc) return undefined;
    return {
      id: mc.id,
      name: mc.name,
      provider: this.config.id,
      maxContextTokens: mc.maxContextTokens,
      maxOutputTokens: mc.maxOutputTokens,
      supportsTools: mc.supportsTools,
      supportsVision: mc.supportsVision,
      pricing: mc.pricing,
    };
  }

  /**
   * 构建请求头
   */
  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };
  }
}
