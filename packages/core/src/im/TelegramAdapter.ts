/**
 * Telegram Bot 适配器
 * 使用原生 Telegram Bot API (fetch-base, 零外部依赖)
 * 支持长轮询 (getUpdates) 和 Webhook 两种模式
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import type {
  TelegramConfig,
  IMMessage,
  IMSendOptions,
  IMAttachment,
} from './types.js';
import { logger } from '../utils/logger.js';

/** Telegram API 基础 URL */
const TG_API_BASE = 'https://api.telegram.org';

/** 长轮询超时时间 (秒) */
const POLL_TIMEOUT = 30;

/** 重连延迟基数 (ms) */
const RECONNECT_DELAY = 1000;

/**
 * Telegram 适配器
 * 通过 Bot API 收发消息，支持流式回复
 */
export class TelegramAdapter extends BaseIMAdapter {
  private config: TelegramConfig;
  private botToken: string;
  private apiUrl: string;
  /** 轮询偏移 ID (避免重复消息) */
  private updateOffset = 0;
  /** 轮询是否活跃 */
  private polling = false;
  /** 轮询定时器 */
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** 正在处理的用户集合 (防止并发) */
  private processingUsers = new Set<string>();

  constructor(config: TelegramConfig) {
    super('telegram', config.name || 'Telegram Bot');
    this.config = config;
    this.botToken = config.botToken;
    this.apiUrl = `${TG_API_BASE}/bot${this.botToken}`;
  }

  // ========== 生命周期 ==========

  protected async onStart(): Promise<void> {
    // 验证 Bot Token
    const me = await this.apiCall<{ ok: boolean; result?: { id: number; username: string } }>(
      'getMe'
    );
    if (!me.ok || !me.result) {
      throw new Error('Telegram Bot Token 无效');
    }
    logger.info(
      { botId: me.result.id, botUsername: me.result.username },
      'Telegram Bot 验证成功'
    );

    if (this.config.mode === 'polling' || !this.config.mode) {
      this.startPolling();
    } else if (this.config.mode === 'webhook') {
      await this.setupWebhook();
    }
  }

  protected async onStop(): Promise<void> {
    this.stopPolling();

    if (this.config.mode === 'webhook') {
      try {
        await this.apiCall('deleteWebhook');
      } catch {
        // 忽略清理错误
      }
    }
  }

  // ========== 消息发送 ==========

  async sendMessage(
    chatId: string,
    text: string,
    options?: IMSendOptions
  ): Promise<string> {
    // 长度限制：Telegram 单条消息最多 4096 字符
    const maxLen = 4096;
    let content = text;
    if (text.length > maxLen) {
      content = text.substring(0, maxLen - 50) + '\n\n... (内容过长已截断)';
    }

    const params: Record<string, unknown> = {
      chat_id: chatId,
      text: content,
    };

    if (options?.replyToMessageId) {
      params.reply_to_message_id = options.replyToMessageId;
    }
    if (options?.disableNotification) {
      params.disable_notification = true;
    }
    if (options?.parseMode && options.parseMode !== 'text') {
      if (options.parseMode === 'MarkdownV2') {
        params.parse_mode = 'MarkdownV2';
        params.text = this.escapeMarkdownV2(content);
      } else if (options.parseMode === 'Markdown') {
        params.parse_mode = 'Markdown';
      } else if (options.parseMode === 'HTML') {
        params.parse_mode = 'HTML';
      }
    }
    if (options?.inlineKeyboard) {
      params.reply_markup = {
        inline_keyboard: options.inlineKeyboard.map((row) =>
          row.map((btn) => ({
            text: btn.text,
            ...(btn.callbackData ? { callback_data: btn.callbackData } : {}),
            ...(btn.url ? { url: btn.url } : {}),
          }))
        ),
      };
    }

    const result = await this.apiCall<{ ok: boolean; result?: { message_id: number } }>(
      'sendMessage',
      params
    );
    if (!result.ok || !result.result) {
      throw new Error(`Telegram sendMessage 失败: ${JSON.stringify(result)}`);
    }
    return String(result.result.message_id);
  }

  async editMessage(
    chatId: string,
    messageId: string,
    newText: string
  ): Promise<boolean> {
    const maxLen = 4096;
    let content = newText;
    if (newText.length > maxLen) {
      content = newText.substring(0, maxLen - 50) + '\n\n... (内容过长已截断)';
    }

    try {
      const result = await this.apiCall<{ ok: boolean }>('editMessageText', {
        chat_id: chatId,
        message_id: parseInt(messageId, 10),
        text: content,
      });
      return result.ok;
    } catch (err) {
      // 如果内容没变化，Telegram 返回 400，忽略即可
      if ((err as Error).message.includes('message is not modified')) {
        return true;
      }
      logger.warn({ error: (err as Error).message }, 'editMessage 失败');
      return false;
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    try {
      await this.apiCall('sendChatAction', {
        chat_id: chatId,
        action: 'typing',
      });
    } catch {
      // 忽略非关键错误
    }
  }

  async sendPhoto(
    chatId: string,
    imageUrl: string,
    caption?: string
  ): Promise<string> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      photo: imageUrl,
    };
    if (caption) params.caption = caption;

    const result = await this.apiCall<{ ok: boolean; result?: { message_id: number } }>(
      'sendPhoto',
      params
    );
    return result.ok && result.result ? String(result.result.message_id) : '';
  }

  async sendDocument(
    chatId: string,
    fileUrl: string,
    caption?: string
  ): Promise<string> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      document: fileUrl,
    };
    if (caption) params.caption = caption;

    const result = await this.apiCall<{ ok: boolean; result?: { message_id: number } }>(
      'sendDocument',
      params
    );
    return result.ok && result.result ? String(result.result.message_id) : '';
  }

  // ========== 轮询逻辑 ==========

  /**
   * 开始长轮询
   */
  private startPolling(): void {
    this.polling = true;
    logger.info({ platform: this.platform }, '开始 Telegram 长轮询');
    this.poll();
  }

  /**
   * 停止长轮询
   */
  private stopPolling(): void {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * 执行一次轮询
   */
  private async poll(): Promise<void> {
    if (!this.polling) return;

    try {
      const result = await this.apiCall<{
        ok: boolean;
        result?: Array<{
          update_id: number;
          message?: TelegramMessage;
          callback_query?: TelegramCallbackQuery;
        }>;
      }>('getUpdates', {
        offset: this.updateOffset,
        timeout: POLL_TIMEOUT,
        allowed_updates: ['message', 'callback_query'],
      });

      if (result.ok && result.result) {
        for (const update of result.result) {
          // 更新 offset 避免重复
          this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);

          if (update.message) {
            await this.processMessage(update.message);
          }
          if (update.callback_query) {
            await this.processCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      logger.error({ error: errorMsg }, 'Telegram 轮询出错');

      // 冲突: 另一个 bot 实例在轮询
      if (errorMsg.includes('409') || errorMsg.includes('Conflict')) {
        this._error = '另一个 Bot 实例已在轮询，请先停止其他实例';
        this.setStatus('error');
        return;
      }
    }

    // 下一次轮询 (无延迟，getUpdates 自带 long polling)
    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), 200);
    }
  }

  /**
   * 处理收到的消息
   */
  private async processMessage(msg: TelegramMessage): Promise<void> {
    // 过滤非文本消息 (暂不支持)
    if (!msg.text && !msg.caption) return;

    const chatId = String(msg.chat.id);
    const senderId = String(msg.from?.id || 'unknown');

    // 白名单检查
    if (
      this.config.allowedUserIds &&
      this.config.allowedUserIds.length > 0 &&
      !this.config.allowedUserIds.includes(parseInt(senderId, 10))
    ) {
      logger.debug({ senderId }, '用户不在白名单中，忽略消息');
      return;
    }

    // 并发保护
    if (this.processingUsers.has(senderId)) {
      await this.sendMessage(chatId, '⏳ 请等待上一个请求处理完成...');
      return;
    }

    // 解析附件
    const attachments: IMAttachment[] = [];
    if (msg.photo) {
      const bestPhoto = msg.photo[msg.photo.length - 1];
      const fileInfo = await this.getFile(bestPhoto.file_id);
      if (fileInfo) {
        attachments.push({
          type: 'image',
          url: fileInfo,
          mimeType: 'image/jpeg',
          fileSize: bestPhoto.file_size,
        });
      }
    }
    if (msg.document) {
      const fileInfo = await this.getFile(msg.document.file_id);
      if (fileInfo) {
        attachments.push({
          type: 'document',
          fileName: msg.document.file_name,
          url: fileInfo,
          mimeType: msg.document.mime_type,
          fileSize: msg.document.file_size,
        });
      }
    }

    const imMessage: IMMessage = {
      messageId: String(msg.message_id),
      chatId,
      senderId,
      senderName: msg.from?.username || msg.from?.first_name || senderId,
      text: msg.text || msg.caption || '',
      attachments,
      timestamp: new Date(msg.date * 1000).toISOString(),
      isGroupChat: msg.chat.type === 'group' || msg.chat.type === 'supergroup',
      groupName: 'title' in msg.chat ? (msg.chat as { title?: string }).title : undefined,
      raw: msg,
    };

    this.processingUsers.add(senderId);
    try {
      await this.handleIncomingMessage(imMessage);
    } finally {
      this.processingUsers.delete(senderId);
    }
  }

  /**
   * 处理回调查询
   */
  private async processCallbackQuery(cb: TelegramCallbackQuery): Promise<void> {
    const chatId = String(cb.message?.chat?.id || '');
    const senderId = String(cb.from?.id || '');
    const data = cb.data || '';

    // 告知 Telegram 已收到回调
    try {
      await this.apiCall('answerCallbackQuery', {
        callback_query_id: cb.id,
      });
    } catch {
      // 忽略
    }

    await this.handleCallbackQuery(data, chatId, senderId);
  }

  // ========== Webhook 模式 ==========

  /**
   * 设置 Webhook
   */
  private async setupWebhook(): Promise<void> {
    if (!this.config.webhookUrl) {
      throw new Error('Webhook 模式需要提供 webhookUrl');
    }
    const result = await this.apiCall<{ ok: boolean; description?: string }>(
      'setWebhook',
      {
        url: this.config.webhookUrl,
        allowed_updates: ['message', 'callback_query'],
      }
    );
    if (!result.ok) {
      throw new Error(`Telegram setWebhook 失败: ${result.description}`);
    }
    logger.info({ url: this.config.webhookUrl }, 'Telegram Webhook 设置成功');
  }

  /**
   * Webhook 模式下的消息处理入口
   * 由外部 HTTP 服务器调用
   */
  async handleWebhookUpdate(body: unknown): Promise<void> {
    const update = body as {
      update_id?: number;
      message?: TelegramMessage;
      callback_query?: TelegramCallbackQuery;
    };

    if (update?.message) {
      await this.processMessage(update.message);
    }
    if (update?.callback_query) {
      await this.processCallbackQuery(update.callback_query);
    }
  }

  // ========== API 辅助 ==========

  /**
   * 调用 Telegram Bot API
   */
  private async apiCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const url = `${this.apiUrl}/${method}`;
    const body = JSON.stringify(params || {});

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Telegram API ${method} 返回 ${response.status}: ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * 获取文件下载 URL
   */
  private async getFile(fileId: string): Promise<string | null> {
    try {
      const result = await this.apiCall<{ ok: boolean; result?: { file_path: string } }>(
        'getFile',
        { file_id: fileId }
      );
      if (result.ok && result.result?.file_path) {
        return `${TG_API_BASE}/file/bot${this.botToken}/${result.result.file_path}`;
      }
    } catch {
      // 忽略
    }
    return null;
  }

  /**
   * 转义 Telegram MarkdownV2 特殊字符
   */
  private escapeMarkdownV2(text: string): string {
    const specialChars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    let escaped = text;
    for (const char of specialChars) {
      escaped = escaped.replaceAll(char, `\\${char}`);
    }
    return escaped;
  }
}

// ========== Telegram 类型定义 (内部) ==========

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}
