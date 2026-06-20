/**
 * 模型适配器基类
 * 定义统一的模型调用接口，所有具体适配器继承此类
 */
import type { Message, ChatOptions, ChatResponse, ChatChunk, ModelInfo, ProviderConfig } from '../types/index.js';
/**
 * 模型适配器抽象基类
 */
export declare abstract class BaseAdapter {
    protected config: ProviderConfig;
    protected modelName: string;
    constructor(config: ProviderConfig, modelName?: string);
    /** 获取提供商名称 */
    get providerName(): string;
    /** 获取当前模型名称 */
    get currentModel(): string;
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
    abstract chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    /**
     * 获取可用模型列表
     * @returns 模型信息列表
     */
    getModels(): ModelInfo[];
    /**
     * 验证连接
     * @returns 是否连接成功
     */
    abstract validateConnection(): Promise<boolean>;
    /**
     * 切换模型
     * @param modelName - 模型名称
     */
    switchModel(modelName: string): void;
    /**
     * 获取模型配置
     */
    protected getModelConfig(): import("../types/index.js").ModelConfig | undefined;
    /**
     * 获取模型信息
     */
    getModelInfo(): ModelInfo | undefined;
    /**
     * 构建请求头
     */
    protected getHeaders(): Record<string, string>;
}
//# sourceMappingURL=BaseAdapter.d.ts.map