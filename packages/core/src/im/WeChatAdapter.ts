/**
 * 微信适配器 (企业微信/微信公众平台)
 *
 * ## 接入方式说明
 *
 * ### 企业微信
 * 1. 在企业微信管理后台创建自建应用
 * 2. 获取 Corp ID、Agent ID、App Secret
 * 3. 配置消息接收 URL (指向 EasyAgent Server 的 /api/im/wechat/callback)
 * 4. 设置 Token 和 EncodingAESKey 用于消息加解密
 *
 * ### 微信公众号(服务号)
 * 1. 在微信公众平台配置服务器 URL
 * 2. 使用被动回复消息或客服消息接口
 * 3. 需要已完成认证的服务号
 *
 * ## 依赖要求
 * - 企业微信需要 `xml2js` 或 `fast-xml-parser` 解析 XML 消息体
 * - 需要实现 AES 加解密 (EncodingAESKey)
 *
 * ## 当前状态: 占位实现
 * 由于企业微信/微信公众平台的接入需要企业资质认证和公网服务器，
 * 此处提供框架代码和接入文档，实际接入时补充完整实现。
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import type { WeChatConfig, IMMessage, IMSendOptions } from './types.js';
import { logger } from '../utils/logger.js';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** 企业微信 API 基础 URL */
const WECOM_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';

/**
 * 微信适配器 (企业微信)
 *
 * 主要功能:
 * - 接收企业微信消息回调
 * - 通过企业微信 API 发送/回复消息
 * - 支持文本、图片、文件等消息类型
 */
export class WeChatAdapter extends BaseIMAdapter {
  private config: WeChatConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WeChatConfig) {
    super('wechat', config.name || '企业微信 Bot');
    this.config = config;
  }

  // ========== 生命周期 ==========

  protected async onStart(): Promise<void> {
    if (!this.config.corpId || !this.config.appSecret) {
      throw new Error(
        '企业微信接入需要配置 corpId 和 appSecret\n' +
          '参考: https://developer.work.weixin.qq.com/document/path/90665',
      );
    }

    await this.refreshToken();

    // 每 1.5 小时刷新 token
    this.refreshTimer = setInterval(
      () => {
        this.refreshToken().catch((err) => {
          logger.error({ error: (err as Error).message }, '企业微信 token 刷新失败');
        });
      },
      90 * 60 * 1000,
    );

    logger.info({ corpId: this.config.corpId }, '企业微信适配器已启动 (框架模式)');
  }

  protected async onStop(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.accessToken = null;
  }

  // ========== 消息发送 ==========

  async sendMessage(chatId: string, text: string, _options?: IMSendOptions): Promise<string> {
    const token = await this.ensureToken();

    const body = {
      touser: chatId,
      msgtype: 'text',
      agentid: this.config.agentId,
      text: { content: text },
    };

    const result = await this.fetchApi<{
      errcode: number;
      errmsg: string;
    }>(`${WECOM_API_BASE}/message/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (result.errcode !== 0) {
      throw new Error(`企业微信 sendMessage 失败: ${result.errcode} ${result.errmsg}`);
    }

    return ''; // 企业微信 send 接口不返回 message_id
  }

  async editMessage(_chatId: string, _messageId: string, newText: string): Promise<boolean> {
    // 企业微信不支持编辑已发送消息
    logger.warn('企业微信不支持消息编辑');
    return false;
  }

  async sendTyping(_chatId: string): Promise<void> {
    // 企业微信无 typing 指示器 API
  }

  async sendPhoto(chatId: string, _imageUrl: string, _caption?: string): Promise<string> {
    // 企业微信图片消息需先上传素材获取 media_id
    const token = await this.ensureToken();

    // TODO: 实现图片上传 → media_id → 发送图片消息
    logger.warn('企业微信图片发送需实现素材上传');
    return '';
  }

  async sendDocument(chatId: string, _fileUrl: string, _caption?: string): Promise<string> {
    const token = await this.ensureToken();

    // TODO: 实现文件上传 → media_id → 发送文件消息
    logger.warn('企业微信文件发送需实现素材上传');
    return '';
  }

  // ========== 回调入口 ==========

  /**
   * 处理企业微信 URL 验证 (GET 请求)
   * 企业微信配置回调 URL 时会发送 GET 请求验证
   *
   * @param query - 查询参数 { msg_signature, timestamp, nonce, echostr }
   * @returns 解密后的 echostr
   */
  async handleUrlVerify(query: {
    msg_signature?: string;
    timestamp?: string;
    nonce?: string;
    echostr?: string;
  }): Promise<string> {
    // 企业微信 URL 验证需要解密 echostr
    // 参考: https://developer.work.weixin.qq.com/document/path/90968
    const { msg_signature, timestamp, nonce, echostr } = query;
    logger.info('企业微信 URL 验证请求');

    if (!echostr) return '';

    // 如果有 EncodingAESKey 则进行 AES 解密
    if (this.config.encodingAESKey) {
      try {
        const decrypted = this.wxDecrypt(echostr, this.config.encodingAESKey);
        logger.info('企业微信 URL 验证成功');
        return decrypted;
      } catch (err) {
        logger.warn(
          { error: (err as Error).message },
          '企业微信 URL 验证解密失败，返回原始 echostr',
        );
        return echostr;
      }
    }

    // 无加密配置时返回原始值
    return echostr;
  }

  /**
   * 处理企业微信消息回调 (POST 请求)
   * 企业微信会将消息以加密 XML 格式 POST 到回调 URL
   *
   * @param body - 加密的消息体 (XML)
   * @returns 回复消息 (XML 或空)
   */
  async handleMessageCallback(body: string): Promise<string> {
    logger.debug('收到企业微信消息回调', { bodyLength: body.length });

    try {
      // 1. 解密 XML 消息体 (如果有 EncodingAESKey)
      let xmlStr = body;
      if (this.config.encodingAESKey) {
        // 提取 <Encrypt> 标签中的密文
        const encryptMatch = body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
        if (encryptMatch) {
          const decrypted = this.wxDecrypt(encryptMatch[1], this.config.encodingAESKey);
          // 去除随机前缀(16字节) + 网络字节序(4字节)后的 XML
          xmlStr = decrypted.slice(20);
        }
      }

      // 2. 解析 XML → IMMessage
      const msg = this.parseWeChatXML(xmlStr);
      if (!msg) {
        logger.warn('企业微信消息解析为空，跳过处理');
        return '';
      }

      // 3. 调用消息处理器
      const imMsg: IMMessage = {
        chatId: msg.fromUserName || '',
        text: msg.content || msg.msgType === 'text' ? msg.content || '' : `[${msg.msgType}]`,
        messageId: msg.msgId || `wechat_${Date.now()}`,
        senderId: msg.fromUserName || '',
        senderName: '',
        timestamp: msg.createTime
          ? new Date(parseInt(msg.createTime, 10) * 1000).toISOString()
          : new Date().toISOString(),
      };

      await this.handleIncomingMessage(imMsg);

      // 4. 回复确认 (企业微信要求 200 响应，不需要业务回复)
      return '';
    } catch (err) {
      logger.error({ error: (err as Error).message }, '企业微信消息回调处理失败');
      return '';
    }
  }

  // ========== Token 管理 ==========

  private async refreshToken(): Promise<string> {
    const url = `${WECOM_API_BASE}/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.appSecret}`;

    const result = await this.fetchApi<{
      errcode: number;
      errmsg: string;
      access_token?: string;
      expires_in?: number;
    }>(url, { method: 'GET' });

    if (result.errcode !== 0 || !result.access_token) {
      throw new Error(`企业微信获取 token 失败: ${result.errcode} ${result.errmsg}`);
    }

    this.accessToken = result.access_token;
    this.tokenExpiresAt = Date.now() + ((result.expires_in || 7200) - 300) * 1000;
    return this.accessToken;
  }

  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      return this.refreshToken();
    }
    return this.accessToken;
  }

  private async fetchApi<T>(url: string, options: RequestInit): Promise<T> {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`企业微信 API 请求失败 ${response.status}: ${errorBody}`);
    }
    return response.json() as Promise<T>;
  }

  // ========== 加解密 & XML 解析 ==========

  /**
   * 企业微信 AES-256-CBC 解密
   * EncodingAESKey 是 Base64 编码的 43 字符密钥 (实际 32 字节)
   */
  private wxDecrypt(encrypted: string, encodingAESKey: string): string {
    // EncodingAESKey = Base64(AESKey)，AESKey 为 32 字节
    const aesKey = Buffer.from(encodingAESKey + '=', 'base64'); // 43→44 chars with padding
    const ciphertext = Buffer.from(encrypted, 'base64');

    // AES-256-CBC 解密，IV = AESKey 前 16 字节
    const iv = aesKey.subarray(0, 16);
    const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);
    decipher.setAutoPadding(false); // PKCS7 padding 手动处理

    let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // 去除 PKCS7 padding
    const padLen = decrypted[decrypted.length - 1];
    if (padLen > 0 && padLen <= 32) {
      decrypted = decrypted.subarray(0, decrypted.length - padLen);
    }

    // 去掉前 16 字节随机字符串 + 4 字节网络字节序的长度
    const contentLen = decrypted.readInt32BE(16);
    const content = decrypted.subarray(20, 20 + contentLen).toString('utf-8');
    // 后面可能有 CorpID 填充，需要去除 null 字符
    const nullIdx = content.indexOf('\0');
    return nullIdx >= 0 ? content.slice(0, nullIdx) : content;
  }

  /**
   * 解析企业微信 XML 消息体为简单对象
   * 使用正则提取，避免额外依赖
   */
  private parseWeChatXML(xml: string): Record<string, string> | null {
    try {
      const result: Record<string, string> = {};
      // 匹配 <TagName><![CDATA[value]]></TagName> 或 <TagName>value</TagName>
      const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/gs;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        result[match[1]] = match[2] || match[3] || '';
      }
      return Object.keys(result).length > 0 ? result : null;
    } catch (err) {
      return null;
    }
  }
}
