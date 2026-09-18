/**
 * 模型适配器工厂
 * 根据提供商类型创建对应的适配器实例
 */
import type { ProviderConfig, ProviderId } from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter.js';
import { ErnieAdapter } from './ErnieAdapter.js';
import { HunyuanAdapter } from './HunyuanAdapter.js';
import { logger } from '../utils/logger.js';

/**
 * 适配器工厂
 * 根据提供商配置自动选择正确的适配器
 */
export class AdapterFactory {
  /**
   * 创建适配器实例
   * @param config - 提供商配置
   * @param modelName - 可选指定的模型名称
   * @returns 适配器实例
   */
  static create(config: ProviderConfig, modelName?: string): BaseAdapter {
    // 使用提供商配置中的apiFormat或根据provider id自动判断
    const format = config.apiFormat || AdapterFactory.detectFormat(config.id);

    switch (format) {
      case 'custom':
        return AdapterFactory.createCustomAdapter(config, modelName);

      /**
       * Anthropic Messages API 与 OpenAI 格式**不兼容**（鉴权头、请求体结构、
       * 流式 SSE 事件类型、工具调用块结构都不同），必须专用适配器。
       *
       * ⚠️ 这里**显式抛错**而不是落到 default 分支：
       *    若静默回退到 OpenAI 兼容适配器，请求会以 400/401 失败，
       *    而错误信息与真实原因（"格式选错了"）毫无关系，排查成本极高。
       *    **明确的失败远好于悄悄用错的实现。**
       *
       * 待实现：见 docs/70（Anthropic 适配器）。实现后改回 `new AnthropicAdapter(...)`。
       */
      case 'anthropic':
        throw new Error(
          `提供商 ${config.id} 使用 anthropic 格式，但当前版本尚未实现 Anthropic 适配器。` +
            '请改用 OpenAI 兼容端点，或等待该适配器落地（见 docs/70）。',
        );

      case 'openai':
      default:
        return new OpenAICompatibleAdapter(config, modelName);
    }
  }

  /**
   * 根据提供商ID创建自定义适配器
   */
  private static createCustomAdapter(config: ProviderConfig, modelName?: string): BaseAdapter {
    switch (config.id) {
      case 'ernie':
        return new ErnieAdapter(config, modelName);
      case 'hunyuan':
        return new HunyuanAdapter(config, modelName);
      default:
        logger.warn({ provider: config.id }, '未知的自定义提供商，回退到OpenAI兼容适配器');
        return new OpenAICompatibleAdapter(config, modelName);
    }
  }

  /**
   * 自动检测API格式
   */
  private static detectFormat(providerId: ProviderId): 'openai' | 'custom' {
    const customProviders: ProviderId[] = ['ernie', 'hunyuan'];
    return customProviders.includes(providerId) ? 'custom' : 'openai';
  }

  /**
   * 批量创建所有可用适配器
   * @param configs - 提供商配置列表
   */
  static createAll(configs: ProviderConfig[]): Map<ProviderId, BaseAdapter> {
    const adapters = new Map<ProviderId, BaseAdapter>();
    for (const config of configs) {
      try {
        const adapter = AdapterFactory.create(config);
        adapters.set(config.id, adapter);
      } catch (error) {
        logger.error({ error, provider: config.id }, '创建适配器失败');
      }
    }
    return adapters;
  }
}

export { BaseAdapter, OpenAICompatibleAdapter, ErnieAdapter, HunyuanAdapter };
