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
    static create(config, modelName) {
        // 使用提供商配置中的apiFormat或根据provider id自动判断
        const format = config.apiFormat || AdapterFactory.detectFormat(config.id);
        switch (format) {
            case 'custom':
                return AdapterFactory.createCustomAdapter(config, modelName);
            case 'openai':
            default:
                return new OpenAICompatibleAdapter(config, modelName);
        }
    }
    /**
     * 根据提供商ID创建自定义适配器
     */
    static createCustomAdapter(config, modelName) {
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
    static detectFormat(providerId) {
        const customProviders = ['ernie', 'hunyuan'];
        return customProviders.includes(providerId) ? 'custom' : 'openai';
    }
    /**
     * 批量创建所有可用适配器
     * @param configs - 提供商配置列表
     */
    static createAll(configs) {
        const adapters = new Map();
        for (const config of configs) {
            try {
                const adapter = AdapterFactory.create(config);
                adapters.set(config.id, adapter);
            }
            catch (error) {
                logger.error({ error, provider: config.id }, '创建适配器失败');
            }
        }
        return adapters;
    }
}
export { BaseAdapter, OpenAICompatibleAdapter, ErnieAdapter, HunyuanAdapter };
//# sourceMappingURL=index.js.map