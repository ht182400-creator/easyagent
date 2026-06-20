import { logger } from '../utils/logger.js';
/**
 * 模型适配器抽象基类
 */
export class BaseAdapter {
    config;
    modelName;
    constructor(config, modelName) {
        this.config = config;
        this.modelName = modelName || config.defaultModel || config.models[0]?.id || '';
    }
    /** 获取提供商名称 */
    get providerName() {
        return this.config.name;
    }
    /** 获取当前模型名称 */
    get currentModel() {
        return this.modelName;
    }
    /**
     * 获取可用模型列表
     * @returns 模型信息列表
     */
    getModels() {
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
     * 切换模型
     * @param modelName - 模型名称
     */
    switchModel(modelName) {
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
    getModelConfig() {
        return this.config.models.find(m => m.id === this.modelName);
    }
    /**
     * 获取模型信息
     */
    getModelInfo() {
        const mc = this.getModelConfig();
        if (!mc)
            return undefined;
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
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            ...this.config.headers,
        };
    }
}
//# sourceMappingURL=BaseAdapter.js.map