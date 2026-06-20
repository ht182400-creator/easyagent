/**
 * 腾讯混元适配器
 * 使用腾讯云API 3.0签名格式
 * API文档: https://cloud.tencent.com/document/product/1729
 */
import type { Message, ChatOptions, ChatResponse, ChatChunk, ProviderConfig } from '../types/index.js';
import { BaseAdapter } from './BaseAdapter.js';
/**
 * 腾讯混元适配器
 * 使用腾讯云API 3.0 TC3-HMAC-SHA256签名
 */
export declare class HunyuanAdapter extends BaseAdapter {
    private secretId;
    private secretKey;
    private region;
    constructor(config: ProviderConfig, modelName?: string);
    /**
     * 腾讯云API 3.0签名 (TC3-HMAC-SHA256)
     */
    private signRequest;
    /**
     * 转换消息格式为混元格式
     */
    private convertMessages;
    /**
     * 非流式聊天
     */
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    /**
     * 流式聊天
     * 混元流式API使用SSE格式
     */
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    /**
     * 验证连接
     */
    validateConnection(): Promise<boolean>;
}
//# sourceMappingURL=HunyuanAdapter.d.ts.map