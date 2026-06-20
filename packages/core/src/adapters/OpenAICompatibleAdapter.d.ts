/**
 * OpenAI兼容协议适配器
 * 适用于使用OpenAI兼容API格式的模型提供商
 * 包括: DeepSeek, 智谱GLM, 通义千问, Kimi, 豆包, MiniMax, Ollama
 */
import type { Message, ChatOptions, ChatResponse, ChatChunk, ProviderConfig } from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
/**
 * OpenAI兼容API适配器
 * 统一处理所有使用OpenAI API格式的提供商
 */
export declare class OpenAICompatibleAdapter extends BaseAdapter {
    private apiKey;
    private baseURL;
    constructor(config: ProviderConfig, modelName?: string);
    /**
     * 将内部消息格式转换为OpenAI格式
     */
    private convertMessages;
    /**
     * 将工具定义转换为OpenAI格式
     */
    private convertTools;
    /**
     * 非流式聊天请求
     */
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    /**
     * 流式聊天请求
     */
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    /**
     * 验证API连接
     * 失败时抛出详细错误信息，便于前端展示给用户
     */
    validateConnection(): Promise<boolean>;
}
//# sourceMappingURL=OpenAICompatibleAdapter.d.ts.map