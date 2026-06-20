import type { ModelConfig, ProviderId } from '../types/index.js';
/** 模型目录条目（文件格式） */
interface CatalogEntry {
    /** 提供商 ID */
    provider: ProviderId;
    /** 提供商显示名称 */
    providerName: string;
    /** API 基础 URL */
    baseURL: string;
    /** API 密钥环境变量名 */
    apiKeyEnv: string;
    /** API 格式 */
    apiFormat: 'openai' | 'anthropic' | 'custom';
    /** 默认模型 */
    defaultModel: string;
    /** 模型列表 */
    models: ModelConfig[];
    /** 更新时间戳 */
    updatedAt?: string;
}
/** 模型目录文件格式 */
interface ModelsCatalog {
    /** 文件版本 */
    version: string;
    /** 生成时间 */
    generatedAt: string;
    /** 提供商列表 */
    providers: CatalogEntry[];
}
/**
 * 模型目录注册中心
 * 单例模式，负责管理模型目录的下载和缓存
 */
export declare class ModelRegistry {
    private catalog;
    private initialized;
    private initPromise;
    /**
     * 初始化：加载本地缓存，必要时从远程更新
     * @param forceRefresh - 是否强制刷新（跳过缓存有效期检查）
     */
    initialize(forceRefresh?: boolean): Promise<void>;
    private doInitialize;
    /**
     * 获取指定提供商的模型列表
     * @param providerId - 提供商 ID
     * @returns 模型列表，如果未初始化返回 null
     */
    getModels(providerId: ProviderId): ModelConfig[] | null;
    /**
     * 获取指定提供商的完整目录条目
     * @param providerId - 提供商 ID
     * @returns 目录条目，如果未初始化返回 null
     */
    getProviderEntry(providerId: ProviderId): CatalogEntry | null;
    /**
     * 获取所有提供商的目录条目
     * @returns 所有条目的数组，如果未初始化返回 null
     */
    getAllEntries(): CatalogEntry[] | null;
    /**
     * 获取完整的模型目录
     */
    getCatalog(): ModelsCatalog | null;
    /**
     * 获取目录版本信息
     */
    getVersion(): string | null;
    /**
     * 获取上次更新时间
     */
    getGeneratedAt(): string | null;
    /**
     * 是否已初始化
     */
    isReady(): boolean;
    /**
     * 强制刷新：忽略缓存，从远程重新下载
     */
    refresh(): Promise<void>;
}
/**
 * 获取模型目录注册中心实例
 */
export declare function getModelRegistry(): ModelRegistry;
/**
 * 重置单例（主要用于测试）
 */
export declare function resetModelRegistry(): void;
export {};
//# sourceMappingURL=ModelRegistry.d.ts.map