/**
 * IM 适配器抽象基类
 * 所有平台适配器继承此类，实现平台特定的消息收发逻辑
 */
import { EventEmitter } from 'events';
import {
  IMAdapterEvent,
} from './types.js';
import type {
  IMPlatform,
  IMAdapterStatus,
  IMMessage,
  IMSendOptions,
  IMAdapterCallbacks,
} from './types.js';
import { logger } from '../utils/logger.js';

/**
 * IM 适配器抽象基类
 * 提供生命周期管理、消息路由、会话映射等通用能力
 */
export abstract class BaseIMAdapter extends EventEmitter {
  /** 平台标识 */
  readonly platform: IMPlatform;
  /** 适配器名称 */
  readonly name: string;
  /** 当前状态 */
  protected _status: IMAdapterStatus = 'stopped';
  /** 回调处理器 */
  protected callbacks: IMAdapterCallbacks | null = null;
  /** 启动时间 */
  protected startedAt: string | null = null;
  /** 错误信息 */
  protected _error: string | null = null;

  constructor(platform: IMPlatform, name: string) {
    super();
    this.platform = platform;
    this.name = name;
  }

  /** 获取当前状态 */
  get status(): IMAdapterStatus {
    return this._status;
  }

  /** 获取错误信息 */
  get error(): string | null {
    return this._error;
  }

  // ========== 生命周期方法 ==========

  /**
   * 启动适配器
   * 子类实现具体启动逻辑（长轮询/注册 Webhook 等）
   */
  async start(): Promise<void> {
    if (this._status === 'running') {
      logger.warn({ platform: this.platform }, '适配器已在运行中');
      return;
    }

    try {
      this.setStatus('starting');
      await this.onStart();
      this.startedAt = new Date().toISOString();
      this.setStatus('running');
      this.emit(IMAdapterEvent.STARTED as string);
      logger.info({ platform: this.platform }, 'IM 适配器已启动');
    } catch (err) {
      this._error = (err as Error).message;
      this.setStatus('error');
      logger.error({ platform: this.platform, error: this._error }, 'IM 适配器启动失败');
      throw err;
    }
  }

  /**
   * 停止适配器
   */
  async stop(): Promise<void> {
    if (this._status !== 'running' && this._status !== 'error') {
      return;
    }

    try {
      this.setStatus('stopping');
      await this.onStop();
      this.setStatus('stopped');
      this.startedAt = null;
      this.emit(IMAdapterEvent.STOPPED as string);
      logger.info({ platform: this.platform }, 'IM 适配器已停止');
    } catch (err) {
      this._error = (err as Error).message;
      this.setStatus('error');
      logger.error({ platform: this.platform, error: this._error }, 'IM 适配器停止失败');
    }
  }

  /**
   * 设置回调处理器
   */
  setCallbacks(callbacks: IMAdapterCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 平台特有启动逻辑 */
  protected abstract onStart(): Promise<void>;

  /** 平台特有停止逻辑 */
  protected abstract onStop(): Promise<void>;

  // ========== 消息发送 ==========

  /**
   * 发送文本消息
   * @param chatId - 目标聊天 ID
   * @param text - 文本内容
   * @param options - 发送选项
   * @returns 发送的消息 ID
   */
  abstract sendMessage(
    chatId: string,
    text: string,
    options?: IMSendOptions
  ): Promise<string>;

  /**
   * 编辑已发送的消息（用于流式更新）
   * @param chatId - 聊天 ID
   * @param messageId - 消息 ID
   * @param newText - 新文本
   * @returns 是否成功
   */
  abstract editMessage(
    chatId: string,
    messageId: string,
    newText: string
  ): Promise<boolean>;

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
  abstract sendPhoto(
    chatId: string,
    imageUrl: string,
    caption?: string
  ): Promise<string>;

  /**
   * 发送文件
   * @param chatId - 聊天 ID
   * @param fileUrl - 文件 URL 或本地路径
   * @param caption - 文件说明
   */
  abstract sendDocument(
    chatId: string,
    fileUrl: string,
    caption?: string
  ): Promise<string>;

  // ========== 流式响应辅助 ==========

  /**
   * 流式发送消息：先发空消息，逐步编辑更新
   * @param chatId - 聊天 ID
   * @param streamGenerator - 流式文本生成器
   * @returns 最终消息 ID
   */
  async sendStreamingMessage(
    chatId: string,
    streamGenerator: AsyncGenerator<string>
  ): Promise<string> {
    // 发送初始空消息
    let messageId: string;
    try {
      messageId = await this.sendMessage(chatId, '⏳ 思考中...');
    } catch (err) {
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
          } catch (err) {
            // 编辑失败时继续累积
          }
        }
      }

      // 最终更新
      await this.editMessage(chatId, messageId, fullText);
      return messageId;
    } catch (err) {
      logger.error({ platform: this.platform, error: (err as Error).message }, '流式发送失败');
      try {
        await this.editMessage(chatId, messageId, fullText + '\n\n⚠️ 回复中断');
      } catch (err) {
        // 编辑也失败，静默处理
      }
      return messageId;
    }
  }

  // ========== 内部辅助 ==========

  /**
   * 更新状态并触发事件
   */
  protected setStatus(status: IMAdapterStatus): void {
    this._status = status;
    this.emit(IMAdapterEvent.STATUS_CHANGE as string, status);
    this.callbacks?.onStatusChange?.(this.platform, status, this._error || undefined);
  }

  /**
   * 处理收到的消息（子类调用此方法通知上层）
   */
  protected async handleIncomingMessage(message: IMMessage): Promise<void> {
    logger.debug(
      { platform: this.platform, chatId: message.chatId, messageId: message.messageId },
      '收到 IM 消息'
    );
    this.emit(IMAdapterEvent.MESSAGE as string, message);
    if (this.callbacks?.onMessage) {
      await this.callbacks.onMessage(message);
    }
  }

  /**
   * 处理回调查询（子类调用）
   */
  protected async handleCallbackQuery(
    callbackData: string,
    chatId: string,
    senderId: string
  ): Promise<void> {
    this.emit(IMAdapterEvent.CALLBACK_QUERY as string, { callbackData, chatId, senderId });
    if (this.callbacks?.onCallbackQuery) {
      await this.callbacks.onCallbackQuery(callbackData, chatId, senderId);
    }
  }

  /**
   * 获取运行时长 (秒)
   */
  getUptime(): number {
    if (!this.startedAt) return 0;
    return Math.floor((Date.now() - new Date(this.startedAt).getTime()) / 1000);
  }

  /**
   * 获取状态摘要
   */
  getStatusSummary(): Record<string, unknown> {
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
