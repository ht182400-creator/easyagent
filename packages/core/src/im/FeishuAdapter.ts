/**
 * 飞书/Lark 适配器
 * 通过飞书开放平台接收和发送消息
 * 支持 Webhook 事件订阅 + API 消息回复
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import type {
  FeishuConfig,
  IMMessage,
  IMSendOptions,
} from './types.js';
import { logger } from '../utils/logger.js';

/** 飞书 API 基础 URL */
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

/** 飞书国际版 (Lark) API 基础 URL */
const LARK_API_BASE = 'https://open.larksuite.com/open-apis';

/**
 * 飞书适配器
 * 支持 Webhook 事件订阅模式
 * 需在飞书开放平台配置机器人事件订阅 URL 指向本服务
 */
export class FeishuAdapter extends BaseIMAdapter {
  private config: FeishuConfig;
  private apiBase: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: FeishuConfig) {
    super('feishu', config.name || '飞书 Bot');
    this.config = config;
    // 根据 appId 前缀判断 Lark 国际版
    this.apiBase = config.appId?.startsWith('cli_') ? LARK_API_BASE : FEISHU_API_BASE;
  }

  // ========== 生命周期 ==========

  protected async onStart(): Promise<void> {
    // 获取初始 access_token
    await this.refreshToken();

    // 每隔 1.5 小时刷新 token (token 有效期 2 小时)
    this.refreshTimer = setInterval(() => {
      this.refreshToken().catch((err) => {
        logger.error({ error: (err as Error).message }, '飞书 token 刷新失败');
      });
    }, 90 * 60 * 1000);

    logger.info({ appId: this.config.appId }, '飞书适配器已启动');
  }

  protected async onStop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.accessToken = null;
  }

  // ========== 消息发送 ==========

  async sendMessage(
    chatId: string,
    text: string,
    options?: IMSendOptions
  ): Promise<string> {
    const token = await this.ensureToken();

    const content = JSON.stringify({ text });
    const body: Record<string, unknown> = {
      receive_id: chatId,
      msg_type: 'text',
      content,
    };

    const result = await this.fetchApi<{
      code: number;
      msg: string;
      data?: { message_id: string };
    }>(`${this.apiBase}/im/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (result.code !== 0) {
      throw new Error(`飞书 sendMessage 失败: ${result.code} ${result.msg}`);
    }

    return result.data?.message_id || '';
  }

  async editMessage(
    chatId: string,
    messageId: string,
    newText: string
  ): Promise<boolean> {
    // 飞书不支持编辑已发送消息，采用删除+重发策略
    try {
      // 先删除旧消息
      if (messageId) {
        const token = await this.ensureToken();
        await this.fetchApi(`${this.apiBase}/im/v1/messages/${messageId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => { /* 忽略删除失败 */ });
      }
      // 再发新消息
      await this.sendMessage(chatId, newText);
      return true;
    } catch {
      return false;
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    // 飞书无"正在输入"API，通过发送临时消息模拟
    // 此处留空，由上层决定是否发送状态文本
  }

  async sendPhoto(
    chatId: string,
    imageUrl: string,
    caption?: string
  ): Promise<string> {
    const token = await this.ensureToken();

    // 飞书图片消息需先上传获取 image_key
    const imageKey = await this.uploadImage(imageUrl, token);
    if (!imageKey) return '';

    const content = JSON.stringify({ image_key: imageKey });
    const body: Record<string, unknown> = {
      receive_id: chatId,
      msg_type: 'image',
      content,
    };

    const result = await this.fetchApi<{
      code: number;
      msg: string;
      data?: { message_id: string };
    }>(`${this.apiBase}/im/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return result.data?.message_id || '';
  }

  async sendDocument(
    chatId: string,
    fileUrl: string,
    caption?: string
  ): Promise<string> {
    // 飞书文件消息需先上传
    const token = await this.ensureToken();
    const fileKey = await this.uploadFile(fileUrl, caption || 'file', token);
    if (!fileKey) return '';

    const content = JSON.stringify({ file_key: fileKey });
    const body: Record<string, unknown> = {
      receive_id: chatId,
      msg_type: 'file',
      content,
    };

    const result = await this.fetchApi<{
      code: number;
      msg: string;
      data?: { message_id: string };
    }>(`${this.apiBase}/im/v1/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return result.data?.message_id || '';
  }

  // ========== Webhook 入口 ==========

  /**
   * 处理飞书事件回调 (由外部 HTTP 服务器调用)
   * @param body - 飞书事件回调 body
   * @returns 响应数据 (challenge 校验用)
   */
  async handleEventCallback(body: {
    challenge?: string;
    token?: string;
    type?: string;
    event?: FeishuEvent;
  }): Promise<{ challenge?: string }> {
    // URL 验证
    if (body.type === 'url_verification') {
      const expectedToken = this.config.verificationToken;
      if (expectedToken && body.token !== expectedToken) {
        logger.warn('飞书 URL 验证 token 不匹配');
        return {};
      }
      return { challenge: body.challenge };
    }

    // 事件回调
    if (body.event) {
      await this.processFeishuEvent(body.event);
    }

    return {};
  }

  /**
   * 处理飞书事件
   */
  private async processFeishuEvent(event: FeishuEvent): Promise<void> {
    if (event.type !== 'im.message.receive_v1') return;

    const msg = event.message;
    if (!msg) return;

    // 只处理文本消息
    const textContent = msg.content;
    if (!textContent) return;

    let text = '';
    try {
      const parsed = JSON.parse(textContent);
      text = parsed.text || '';
    } catch {
      text = textContent;
    }

    if (!text.trim()) return;

    const chatId = msg.chat_id;
    const senderId = event.sender?.sender_id?.open_id || 'unknown';
    const senderName = event.sender?.sender_id?.open_id || senderId;

    const imMessage: IMMessage = {
      messageId: msg.message_id,
      chatId,
      senderId,
      senderName,
      text,
      timestamp: new Date(parseInt(msg.create_time, 10) || Date.now()).toISOString(),
      isGroupChat: msg.chat_type === 'group',
      raw: event,
    };

    await this.handleIncomingMessage(imMessage);
  }

  // ========== Token 管理 ==========

  /**
   * 获取 access_token
   */
  private async refreshToken(): Promise<string> {
    const result = await this.fetchApi<{
      code: number;
      msg: string;
      tenant_access_token?: string;
      expire?: number;
    }>(`${this.apiBase}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });

    if (result.code !== 0 || !result.tenant_access_token) {
      throw new Error(`飞书获取 token 失败: ${result.code} ${result.msg}`);
    }

    this.accessToken = result.tenant_access_token;
    this.tokenExpiresAt = Date.now() + ((result.expire || 7200) - 300) * 1000; // 提前 5 分钟刷新
    logger.debug('飞书 token 刷新成功');
    return this.accessToken;
  }

  /**
   * 确保 token 有效
   */
  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      return this.refreshToken();
    }
    return this.accessToken;
  }

  // ========== 文件上传 ==========

/**
   * 上传图片到飞书，获取 image_key
   * 如果是 URL 则先下载，然后以 multipart/form-data 上传
   */
  private async uploadImage(imageUrl: string, token: string): Promise<string | null> {
    try {
      let imageData: Buffer;
      
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        // 从 URL 下载图片
        const resp = await fetch(imageUrl);
        if (!resp.ok) {
          logger.warn({ status: resp.status }, '下载图片失败');
          return null;
        }
        const arrayBuf = await resp.arrayBuffer();
        imageData = Buffer.from(arrayBuf);
      } else if (imageUrl.startsWith('data:')) {
        // Base64 data URL
        const b64 = imageUrl.split(',')[1];
        imageData = Buffer.from(b64, 'base64');
      } else {
        // 本地文件路径 - 直接读取
        const { readFileSync, existsSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const fullPath = resolve(imageUrl);
        if (!existsSync(fullPath)) {
          logger.warn({ path: imageUrl }, '图片文件不存在');
          return null;
        }
        imageData = readFileSync(fullPath);
      }
      
      // 构建 FormData (Node.js 18+ 原生支持)
      const formData = new FormData();
      formData.append('image_type', 'message');
      formData.append('image', new Blob([imageData]), 'image.png');
      
      const result = await this.fetchApi<{
        code: number;
        msg: string;
        data?: { image_key: string };
      }>(`${this.apiBase}/im/v1/images`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (result.code !== 0) {
        logger.warn({ code: result.code, msg: result.msg }, '飞书图片上传失败');
        return null;
      }
      return result.data?.image_key || null;
    } catch (err) {
      logger.warn({ error: (err as Error).message }, '飞书图片上传异常');
      return null;
    }
  }

  /**
   * 上传文件到飞书，获取 file_key
   */
  private async uploadFile(fileUrl: string, fileName: string, token: string): Promise<string | null> {
    try {
      let fileData: Buffer;
      
      if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
        const resp = await fetch(fileUrl);
        if (!resp.ok) {
          logger.warn({ status: resp.status }, '下载文件失败');
          return null;
        }
        const arrayBuf = await resp.arrayBuffer();
        fileData = Buffer.from(arrayBuf);
        if (!fileName || fileName === 'file') {
          // 从 URL 提取文件名
          const urlPath = new URL(fileUrl).pathname;
          fileName = urlPath.split('/').pop() || 'file';
        }
      } else {
        const { readFileSync, existsSync } = await import('node:fs');
        const { resolve, basename } = await import('node:path');
        const fullPath = resolve(fileUrl);
        if (!existsSync(fullPath)) {
          logger.warn({ path: fileUrl }, '文件不存在');
          return null;
        }
        fileData = readFileSync(fullPath);
        if (!fileName || fileName === 'file') {
          fileName = basename(fullPath);
        }
      }
      
      // 构建 FormData
      const formData = new FormData();
      formData.append('file_type', 'stream');
      formData.append('file_name', fileName);
      formData.append('file', new Blob([fileData]), fileName);
      
      const result = await this.fetchApi<{
        code: number;
        msg: string;
        data?: { file_key: string };
      }>(`${this.apiBase}/im/v1/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (result.code !== 0) {
        logger.warn({ code: result.code, msg: result.msg }, '飞书文件上传失败');
        return null;
      }
      return result.data?.file_key || null;
    } catch (err) {
      logger.warn({ error: (err as Error).message }, '飞书文件上传异常');
      return null;
    }
  }

  // ========== HTTP 辅助 ==========

  private async fetchApi<T>(url: string, options: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`飞书 API 请求失败 ${response.status}: ${errorBody}`);
    }
    return response.json() as Promise<T>;
  }
}

// ========== 飞书事件类型 (内部) ==========

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
