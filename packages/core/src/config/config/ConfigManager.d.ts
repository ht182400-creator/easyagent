import type { AppConfig, ProviderConfig, ProviderId } from '../types/index.js';
export declare class ConfigManager {
    private config;
    private configPath;
    private providersPath;
    constructor(configDir?: string);
    /**
     * 加载配置
     * 优先级: 环境变量 > 配置文件 > 默认值
     */
    load(): Promise<AppConfig>;
    /**
     * 初始化模型目录注册中心
     * 异步执行，不阻塞主流程
     */
    private initModelRegistry;
    /**
     * 将远程模型目录合并到 PROVIDER_PRESETS 中
     * 远程数据优先，本地预设兜底
     */
    private mergeRemoteModels;
    /**
     * 保存配置
     */
    save(): Promise<void>;
    /**
     * 获取当前配置
     */
    getConfig(): AppConfig;
    /**
     * 更新部分配置
     */
    updateConfig(partial: Partial<AppConfig>): void;
    /**
     * 获取当前模型提供商配置
     */
    getCurrentProvider(): ProviderConfig | undefined;
    /**
     * 切换当前模型
     */
    switchModel(provider: ProviderId, model: string): void;
    /**
     * 获取提供商配置
     */
    getProvider(id: ProviderId): ProviderConfig | undefined;
    /**
     * 获取所有可用提供商
     */
    getAvailableProviders(): ProviderConfig[];
    /**
     * 设置提供商的API密钥
     * 如果提供商不在可用列表中，从 PROVIDER_PRESETS 查找完整配置后加入
     */
    setApiKey(providerId: ProviderId, apiKey: string): void;
    /**
     * 获取所有提供商预设(用于UI展示)
     */
    getProviderPresets(): ProviderConfig[];
}
/**
 * 获取配置管理器实例
 */
export declare function getConfigManager(): ConfigManager;
