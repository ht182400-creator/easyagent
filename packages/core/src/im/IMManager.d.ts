/// <reference types="node" />
/**
 * IM 适配器管理器
 * 统一管理多个 IM 平台适配器的生命周期和消息路由
 */
import { EventEmitter } from 'events';
import type { IMPlatform, IMAdapterStatus, AnyIMConfig, IMMessage, IMSessionMapping } from './types.js';
import type { BaseIMAdapter } from './BaseIMAdapter.js';
/** 消息处理函数类型 */
export type MessageHandler = (message: IMMessage) => Promise<{
    /** 生成的回复文本 (流式输出回调) */
    streamGenerator?: AsyncGenerator<string>;
    /** 参考文档/链接 */
    references?: string[];
}>;
/** IMManager 配置 */
export interface IMManagerOptions {
    /** 消息处理器 (连接 AgentEngine) */
    messageHandler?: MessageHandler;
    /** 会话映射存储目录 (持久化 chatId→sessionId) */
    sessionMapDir?: string;
}
/**
 * IM 管理器
 * 管理所有 IM 平台适配器的生命周期
 *
 * 使用示例:
 * ```typescript
 * const im = new IMManager({
 *   messageHandler: async (msg) => {
 *     const stream = agentEngine.processStream(msg.text, sessionId);
 *     return { streamGenerator: stream };
 *   }
 * });
 *
 * im.configure('telegram', { botToken: '123:abc', enabled: true });
 * await im.startAll();
 * ```
 */
export declare class IMManager extends EventEmitter {
    /** 已注册的适配器 */
    private adapters;
    /** 平台配置缓存 */
    private configs;
    /** 消息处理器 */
    private messageHandler;
    /** 会话映射: chatId → { sessionId, platform } */
    private sessionMap;
    /** 原始配置对象 (JSON) */
    private rawConfig;
    constructor(options?: IMManagerOptions);
    /**
     * 配置一个平台适配器
     */
    configure(config: AnyIMConfig): void;
    /**
     * 从 JSON 对象批量配置
     */
    configureAll(configs: AnyIMConfig[]): void;
    /**
     * 设置消息处理器
     */
    setMessageHandler(handler: MessageHandler): void;
    /**
     * 启动所有已启用的适配器
     */
    startAll(): Promise<void>;
    /**
     * 停止所有适配器
     */
    stopAll(): Promise<void>;
    /**
     * 启动指定平台
     */
    startPlatform(platform: IMPlatform): Promise<void>;
    /**
     * 停止指定平台
     */
    stopPlatform(platform: IMPlatform): Promise<void>;
    /**
     * 消息路由核心: IM → Agent → IM
     */
    private routeMessage;
    /**
     * 根据配置创建对应的适配器实例
     */
    private createAdapter;
    /**
     * 获取所有适配器状态
     */
    getStatus(): Array<{
        platform: IMPlatform;
        name: string;
        status: IMAdapterStatus;
        enabled: boolean;
        uptime: number;
        error: string | null;
    }>;
    /**
     * 获取指定平台适配器
     */
    getAdapter(platform: IMPlatform): BaseIMAdapter | undefined;
    /**
     * 获取会话映射
     */
    getSessionMapping(chatId: string): IMSessionMapping | undefined;
    /**
     * 设置会话映射
     */
    setSessionMapping(chatId: string, sessionId: string, platform: IMPlatform): void;
    /**
     * Webhook 处理入口 (飞书/微信)
     * 由外部 HTTP 服务器调用
     */
    handleWebhook(platform: IMPlatform, req: {
        method: string;
        query: Record<string, string>;
        body: unknown;
    }): Promise<unknown>;
    /**
     * 获取 Webhook 信息 (用于外部 HTTP 服务器注册路由)
     */
    getWebhookPlatforms(): IMPlatform[];
    /**
     * 获取所有配置
     */
    getAllConfigs(): AnyIMConfig[];
    /**
     * 更新平台配置
     */
    updateConfig(config: AnyIMConfig): void;
    /**
     * 删除平台配置
     */
    removeConfig(platform: IMPlatform): void;
}
//# sourceMappingURL=IMManager.d.ts.map