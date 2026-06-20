/**
 * 飞书/Lark 适配器
 * 通过飞书开放平台接收和发送消息
 * 支持 Webhook 事件订阅 + API 消息回复
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import type { FeishuConfig, IMSendOptions } from './types.js';
/**
 * 飞书适配器
 * 支持 Webhook 事件订阅模式
 * 需在飞书开放平台配置机器人事件订阅 URL 指向本服务
 */
export declare class FeishuAdapter extends BaseIMAdapter {
    private config;
    private apiBase;
    private accessToken;
    private tokenExpiresAt;
    private refreshTimer;
    constructor(config: FeishuConfig);
    protected onStart(): Promise<void>;
    protected onStop(): Promise<void>;
    sendMessage(chatId: string, text: string, options?: IMSendOptions): Promise<string>;
    editMessage(chatId: string, messageId: string, newText: string): Promise<boolean>;
    sendTyping(chatId: string): Promise<void>;
    sendPhoto(chatId: string, imageUrl: string, caption?: string): Promise<string>;
    sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<string>;
    /**
     * 处理飞书事件回调 (由外部 HTTP 服务器调用)
     * @param body - 飞书事件回调 body
     * @returns 响应数据 (challenge 校验用)
     */
    handleEventCallback(body: {
        challenge?: string;
        token?: string;
        type?: string;
        event?: FeishuEvent;
    }): Promise<{
        challenge?: string;
    }>;
    /**
     * 处理飞书事件
     */
    private processFeishuEvent;
    /**
     * 获取 access_token
     */
    private refreshToken;
    /**
     * 确保 token 有效
     */
    private ensureToken;
    private uploadImage;
    private uploadFile;
    private fetchApi;
}
interface FeishuEvent {
    type: string;
    message?: {
        message_id: string;
        chat_id: string;
        chat_type: string;
        content: string;
        create_time: string;
        message_type: string;
    };
    sender?: {
        sender_id?: {
            open_id?: string;
            union_id?: string;
            user_id?: string;
        };
    };
}
export {};
//# sourceMappingURL=FeishuAdapter.d.ts.map