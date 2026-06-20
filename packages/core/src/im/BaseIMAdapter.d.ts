/// <reference types="node" />
/**
 * IM 适配器抽象基类
 * 所有平台适配器继承此类，实现平台特定的消息收发逻辑
 */
import { EventEmitter } from 'events';
import { IMAdapterEvent } from './types.js';
import type { IMPlatform, IMAdapterStatus, IMMessage, IMSendOptions, IMAdapterCallbacks } from './types.js';
/**
 * IM 适配器抽象基类
 * 提供生命周期管理、消息路由、会话映射等通用能力
 */
export declare abstract class BaseIMAdapter extends EventEmitter {
    /** 平台标识 */
    readonly platform: IMPlatform;
    /** 适配器名称 */
    readonly name: string;
    /** 当前状态 */
    protected _status: IMAdapterStatus;
    /** 回调处理器 */
    protected callbacks: IMAdapterCallbacks | null;
    /** 启动时间 */
    protected startedAt: string | null;
    /** 错误信息 */
    protected _error: string | null;
    constructor(platform: IMPlatform, name: string);
    /** 获取当前状态 */
    get status(): IMAdapterStatus;
    /** 获取错误信息 */
    get error(): string | null;
    /**
     * 启动适配器
     * 子类实现具体启动逻辑（长轮询/注册 Webhook 等）
     */
    start(): Promise<void>;
    /**
     * 停止适配器
     */
    stop(): Promise<void>;
    /**
     * 设置回调处理器
     */
    setCallbacks(callbacks: IMAdapterCallbacks): void;
    /** 平台特有启动逻辑 */
    protected abstract onStart(): Promise<void>;
    /** 平台特有停止逻辑 */
    protected abstract onStop(): Promise<void>;
    /**
     * 发送文本消息
     * @param chatId - 目标聊天 ID
     * @param text - 文本内容
     * @param options - 发送选项
     * @returns 发送的消息 ID
     */
    abstract sendMessage(chatId: string, text: string, options?: IMSendOptions): Promise<string>;
    /**
     * 编辑已发送的消息（用于流式更新）
     * @param chatId - 聊天 ID
     * @param messageId - 消息 ID
     * @param newText - 新文本
     * @returns 是否成功
     */
    abstract editMessage(chatId: string, messageId: string, newText: string): Promise<boolean>;
    /**
     * 发送"正在输入"状态
     * @param chatId - 聊天 ID
     */
    abstract sendTyping(chatId: string): Promise<void>;
    /**
     * 发送图片
     * @param chatId - 聊天 ID
     * @param imageUrl - 图片 URL 或本地路径
     * @param caption - 图片说明
     */
    abstract sendPhoto(chatId: string, imageUrl: string, caption?: string): Promise<string>;
    /**
     * 发送文件
     * @param chatId - 聊天 ID
     * @param fileUrl - 文件 URL 或本地路径
     * @param caption - 文件说明
     */
    abstract sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<string>;
    /**
     * 流式发送消息：先发空消息，逐步编辑更新
     * @param chatId - 聊天 ID
     * @param streamGenerator - 流式文本生成器
     * @returns 最终消息 ID
     */
    sendStreamingMessage(chatId: string, streamGenerator: AsyncGenerator<string>): Promise<string>;
    /**
     * 更新状态并触发事件
     */
    protected setStatus(status: IMAdapterStatus): void;
    /**
     * 处理收到的消息（子类调用此方法通知上层）
     */
    protected handleIncomingMessage(message: IMMessage): Promise<void>;
    /**
     * 处理回调查询（子类调用）
     */
    protected handleCallbackQuery(callbackData: string, chatId: string, senderId: string): Promise<void>;
    /**
     * 获取运行时长 (秒)
     */
    getUptime(): number;
    /**
     * 获取状态摘要
     */
    getStatusSummary(): Record<string, unknown>;
}
export { IMAdapterEvent };
//# sourceMappingURL=BaseIMAdapter.d.ts.map