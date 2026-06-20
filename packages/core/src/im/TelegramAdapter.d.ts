/**
 * Telegram Bot 适配器
 * 使用原生 Telegram Bot API (fetch-base, 零外部依赖)
 * 支持长轮询 (getUpdates) 和 Webhook 两种模式
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import type { TelegramConfig, IMSendOptions } from './types.js';
/**
 * Telegram 适配器
 * 通过 Bot API 收发消息，支持流式回复
 */
export declare class TelegramAdapter extends BaseIMAdapter {
    private config;
    private botToken;
    private apiUrl;
    /** 轮询偏移 ID (避免重复消息) */
    private updateOffset;
    /** 轮询是否活跃 */
    private polling;
    /** 轮询定时器 */
    private pollTimer;
    /** 正在处理的用户集合 (防止并发) */
    private processingUsers;
    constructor(config: TelegramConfig);
    protected onStart(): Promise<void>;
    protected onStop(): Promise<void>;
    sendMessage(chatId: string, text: string, options?: IMSendOptions): Promise<string>;
    editMessage(chatId: string, messageId: string, newText: string): Promise<boolean>;
    sendTyping(chatId: string): Promise<void>;
    sendPhoto(chatId: string, imageUrl: string, caption?: string): Promise<string>;
    sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<string>;
    /**
     * 开始长轮询
     */
    private startPolling;
    /**
     * 停止长轮询
     */
    private stopPolling;
    /**
     * 执行一次轮询
     */
    private poll;
    /**
     * 处理收到的消息
     */
    private processMessage;
    /**
     * 处理回调查询
     */
    private processCallbackQuery;
    /**
     * 设置 Webhook
     */
    private setupWebhook;
    /**
     * Webhook 模式下的消息处理入口
     * 由外部 HTTP 服务器调用
     */
    handleWebhookUpdate(body: unknown): Promise<void>;
    /**
     * 调用 Telegram Bot API
     */
    private apiCall;
    /**
     * 获取文件下载 URL
     */
    private getFile;
    /**
     * 转义 Telegram MarkdownV2 特殊字符
     */
    private escapeMarkdownV2;
}
//# sourceMappingURL=TelegramAdapter.d.ts.map