/**
 * 百度文心一言适配器
 * 使用百度自有API格式 (非OpenAI兼容)
 * 需要先通过OAuth获取access_token
 */
import type { Message, ChatOptions, ChatResponse, ChatChunk, ProviderConfig } from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
/**
 * 文心一言适配器
 * API文档: https://cloud.baidu.com/doc/WENXINWORKSHOP/s/jlil56u11
 */
export declare class ErnieAdapter extends BaseAdapter {
    private apiKey;
    private secretKey;
    private accessToken;
    private tokenExpiry;
    /** 模型到API端点的映射 */
    private static readonly MODEL_ENDPOINTS;
    constructor(config: ProviderConfig, modelName?: string);
    /**
     * 获取Access Token
     * 使用OAuth 2.0的client_credentials方式
     */
    private getAccessToken;
    /**
     * 获取模型端点URL
     */
    private getEndpoint;
    /**
     * 将消息转换为文心一言格式
     */
    private convertMessages;
    /**
     * 转换工具定义为文心一言格式
     */
    private convertTools;
    /** 非流式聊天 */
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    /** 流式聊天 */
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    /** 验证连接 */
    validateConnection(): Promise<boolean>;
}
//# sourceMappingURL=ErnieAdapter.d.ts.map