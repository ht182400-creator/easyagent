/**
 * IM 适配器系统类型定义
 * 支持 Telegram / 飞书 / 微信等多平台接入
 */

/** IM 平台标识 */
export type IMPlatform = 'telegram' | 'feishu' | 'wechat' | 'dingtalk';

/** IM 适配器状态 */
export type IMAdapterStatus = 'stopped' | 'starting' | 'running' | 'error' | 'stopping';

/** IM 适配器配置基类 */
export interface IMAdapterConfig {
  /** 平台类型 */
  platform: IMPlatform;
  /** 是否启用 */
  enabled: boolean;
  /** 显示名称 */
  name: string;
}

/** Telegram 适配器配置 */
export interface TelegramConfig extends IMAdapterConfig {
  platform: 'telegram';
  /** Bot Token (从 @BotFather 获取) */
  botToken: string;
  /** 轮询模式: 'polling' | 'webhook' */
  mode: 'polling' | 'webhook';
  /** Webhook URL (mode=webhook 时必需) */
  webhookUrl?: string;
  /** Webhook 端口 */
  webhookPort?: number;
  /** 允许的用户 ID 列表 (空白名单时允许所有) */
  allowedUserIds?: number[];
}

/** 飞书适配器配置 */
export interface FeishuConfig extends IMAdapterConfig {
  platform: 'feishu';
  /** 应用 App ID */
  appId: string;
  /** 应用 App Secret */
  appSecret: string;
  /** 事件订阅的 Verification Token */
  verificationToken?: string;
  /** 事件订阅的 Encrypt Key */
  encryptKey?: string;
  /** Webhook 接收端口 */
  port?: number;
}

/** 微信适配器配置 */
export interface WeChatConfig extends IMAdapterConfig {
  platform: 'wechat';
  /** 企业微信 Corp ID */
  corpId?: string;
  /** 企业微信应用 Agent ID */
  agentId?: string;
  /** 企业微信应用 Secret */
  appSecret?: string;
  /** Token (用于验证URL) */
  token?: string;
  /** Encoding AES Key */
  encodingAESKey?: string;
}

/** IM 适配器配置联合类型 */
export type AnyIMConfig = TelegramConfig | FeishuConfig | WeChatConfig;

/** 统一 IM 消息 */
export interface IMMessage {
  /** 消息唯一 ID */
  messageId: string;
  /** 聊天/会话 ID */
  chatId: string;
  /** 发送者 ID */
  senderId: string;
  /** 发送者名称 */
  senderName?: string;
  /** 文本内容 */
  text: string;
  /** 附件 URL 列表 */
  attachments?: IMAttachment[];
  /** 消息时间戳 (ISO 8601) */
  timestamp: string;
  /** 是否为群聊消息 */
  isGroupChat?: boolean;
  /** 群聊名称 */
  groupName?: string;
  /** 原始消息对象 (平台特定) */
  raw?: unknown;
}

/** IM 附件 */
export interface IMAttachment {
  /** 附件类型 */
  type: 'image' | 'document' | 'audio' | 'video' | 'other';
  /** 文件名 */
  fileName?: string;
  /** 文件 URL */
  url?: string;
  /** MIME 类型 */
  mimeType?: string;
  /** 文件大小 (bytes) */
  fileSize?: number;
}

/** 发送 IM 消息的选项 */
export interface IMSendOptions {
  /** 回复的消息 ID */
  replyToMessageId?: string;
  /** 是否静默发送 */
  disableNotification?: boolean;
  /** Markdown 解析模式 */
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML' | 'text';
  /** 内联键盘按钮 */
  inlineKeyboard?: IMInlineButton[][];
}

/** 内联按钮 */
export interface IMInlineButton {
  text: string;
  /** 回调数据 */
  callbackData?: string;
  /** 跳转 URL */
  url?: string;
}

/** IM 适配器回调 */
export interface IMAdapterCallbacks {
  /** 收到新消息 */
  onMessage: (message: IMMessage) => Promise<void>;
  /** 收到回调查询 (按钮点击等) */
  onCallbackQuery?: (callbackData: string, chatId: string, senderId: string) => Promise<void>;
  /** 适配器状态变更 */
  onStatusChange?: (platform: IMPlatform, status: IMAdapterStatus, error?: string) => void;
  /** 适配器错误 */
  onError?: (platform: IMPlatform, error: Error) => void;
}

/** IM 会话映射 */
export interface IMSessionMapping {
  /** IM 聊天 ID → sessionId */
  chatId: string;
  /** EasyAgent 会话 ID */
  sessionId: string;
  /** 平台类型 */
  platform: IMPlatform;
  /** 创建时间 */
  createdAt: string;
  /** 最后活动时间 */
  lastActivityAt: string;
  /** 工作目录 */
  workDir?: string;
}

/** IM 适配器抽象事件 */
export enum IMAdapterEvent {
  MESSAGE = 'message',
  CALLBACK_QUERY = 'callback_query',
  STATUS_CHANGE = 'status_change',
  ERROR = 'error',
  STARTED = 'started',
  STOPPED = 'stopped',
}
