/**
 * IM 适配器抽象基类
 * 所有平台适配器继承此类，实现平台特定的消息收发逻辑
 */
import { EventEmitter } from 'events';
import { IMAdapterEvent, } from './types.js';
import { logger } from '../utils/logger.js';
/**
 * IM 适配器抽象基类
 * 提供生命周期管理、消息路由、会话映射等通用能力
 */
export class BaseIMAdapter extends EventEmitter {
    /** 平台标识 */
    platform;
    /** 适配器名称 */
    name;
    /** 当前状态 */
    _status = 'stopped';
    /** 回调处理器 */
    callbacks = null;
    /** 启动时间 */
    startedAt = null;
    /** 错误信息 */
    _error = null;
    constructor(platform, name) {
        super();
        this.platform = platform;
        this.name = name;
    }
    /** 获取当前状态 */
    get status() {
        return this._status;
    }
    /** 获取错误信息 */
    get error() {
        return this._error;
    }
    // ========== 生命周期方法 ==========
    /**
     * 启动适配器
     * 子类实现具体启动逻辑（长轮询/注册 Webhook 等）
     */
    async start() {
        if (this._status === 'running') {
            logger.warn({ platform: this.platform }, '适配器已在运行中');
            return;
        }
        try {
            this.setStatus('starting');
            await this.onStart();
            this.startedAt = new Date().toISOString();
            this.setStatus('running');
            this.emit(IMAdapterEvent.STARTED);
            logger.info({ platform: this.platform }, 'IM 适配器已启动');
        }
        catch (err) {
            this._error = err.message;
            this.setStatus('error');
            logger.error({ platform: this.platform, error: this._error }, 'IM 适配器启动失败');
            throw err;
        }
    }
    /**
     * 停止适配器
     */
    async stop() {
        if (this._status !== 'running' && this._status !== 'error') {
            return;
        }
        try {
            this.setStatus('stopping');
            await this.onStop();
            this.setStatus('stopped');
            this.startedAt = null;
            this.emit(IMAdapterEvent.STOPPED);
            logger.info({ platform: this.platform }, 'IM 适配器已停止');
        }
        catch (err) {
            this._error = err.message;
            this.setStatus('error');
            logger.error({ platform: this.platform, error: this._error }, 'IM 适配器停止失败');
        }
    }
    /**
     * 设置回调处理器
     */
    setCallbacks(callbacks) {
        this.callbacks = callbacks;
    }
    // ========== 流式响应辅助 ==========
    /**
     * 流式发送消息：先发空消息，逐步编辑更新
     * @param chatId - 聊天 ID
     * @param streamGenerator - 流式文本生成器
     * @returns 最终消息 ID
     */
    async sendStreamingMessage(chatId, streamGenerator) {
        // 发送初始空消息
        let messageId;
        try {
            messageId = await this.sendMessage(chatId, '⏳ 思考中...');
        }
        catch {
            messageId = await this.sendMessage(chatId, '...');
        }
        let fullText = '';
        let lastUpdate = Date.now();
        const UPDATE_INTERVAL = 500; // 最小更新间隔 ms
        try {
            for await (const chunk of streamGenerator) {
                fullText += chunk;
                // 节流更新，避免频率限制
                const now = Date.now();
                if (now - lastUpdate >= UPDATE_INTERVAL) {
                    try {
                        await this.editMessage(chatId, messageId, fullText);
                        lastUpdate = now;
                    }
                    catch {
                        // 编辑失败时继续累积
                    }
                }
            }
            // 最终更新
            await this.editMessage(chatId, messageId, fullText);
            return messageId;
        }
        catch (err) {
            logger.error({ platform: this.platform, error: err.message }, '流式发送失败');
            try {
                await this.editMessage(chatId, messageId, fullText + '\n\n⚠️ 回复中断');
            }
            catch {
                // 编辑也失败，静默处理
            }
            return messageId;
        }
    }
    // ========== 内部辅助 ==========
    /**
     * 更新状态并触发事件
     */
    setStatus(status) {
        this._status = status;
        this.emit(IMAdapterEvent.STATUS_CHANGE, status);
        this.callbacks?.onStatusChange?.(this.platform, status, this._error || undefined);
    }
    /**
     * 处理收到的消息（子类调用此方法通知上层）
     */
    async handleIncomingMessage(message) {
        logger.debug({ platform: this.platform, chatId: message.chatId, messageId: message.messageId }, '收到 IM 消息');
        this.emit(IMAdapterEvent.MESSAGE, message);
        if (this.callbacks?.onMessage) {
            await this.callbacks.onMessage(message);
        }
    }
    /**
     * 处理回调查询（子类调用）
     */
    async handleCallbackQuery(callbackData, chatId, senderId) {
        this.emit(IMAdapterEvent.CALLBACK_QUERY, { callbackData, chatId, senderId });
        if (this.callbacks?.onCallbackQuery) {
            await this.callbacks.onCallbackQuery(callbackData, chatId, senderId);
        }
    }
    /**
     * 获取运行时长 (秒)
     */
    getUptime() {
        if (!this.startedAt)
            return 0;
        return Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000);
    }
    /**
     * 获取状态摘要
     */
    getStatusSummary() {
        return {
            platform: this.platform,
            name: this.name,
            status: this._status,
            uptime: this.getUptime(),
            error: this._error,
            startedAt: this.startedAt,
        };
    }
}
export { IMAdapterEvent };
//# sourceMappingURL=BaseIMAdapter.js.map