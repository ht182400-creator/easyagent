/**
 * 模型适配器工厂
 * 根据提供商类型创建对应的适配器实例
 */
import type { ProviderConfig, ProviderId } from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter.js';
import { ErnieAdapter } from './ErnieAdapter.js';
import { HunyuanAdapter } from './HunyuanAdapter.js';
/**
 * 适配器工厂
 * 根据提供商配置自动选择正确的适配器
 */
export declare class AdapterFactory {
    /**
     * 创建适配器实例
     * @param config - 提供商配置
     * @param modelName - 可选指定的模型名称
     * @returns 适配器实例
     */
    static create(config: ProviderConfig, modelName?: string): BaseAdapter;
    /**
     * 根据提供商ID创建自定义适配器
     */
    private static createCustomAdapter;
    /**
     * 自动检测API格式
     */
    private static detectFormat;
    /**
     * 批量创建所有可用适配器
     * @param configs - 提供商配置列表
     */
    static createAll(configs: ProviderConfig[]): Map<ProviderId, BaseAdapter>;
}
export { BaseAdapter, OpenAICompatibleAdapter, ErnieAdapter, HunyuanAdapter };
//# sourceMappingURL=index.d.ts.map