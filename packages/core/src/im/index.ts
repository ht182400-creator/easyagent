/**
 * IM 适配器系统统一导出
 */
export { BaseIMAdapter } from './BaseIMAdapter.js';
export { TelegramAdapter } from './TelegramAdapter.js';
export { FeishuAdapter } from './FeishuAdapter.js';
export { WeChatAdapter } from './WeChatAdapter.js';
export { IMManager } from './IMManager.js';

export type {
  IMPlatform,
  IMAdapterStatus,
  IMAdapterConfig,
  TelegramConfig,
  FeishuConfig,
  WeChatConfig,
  AnyIMConfig,
  IMMessage,
  IMAttachment,
  IMSendOptions,
  IMInlineButton,
  IMAdapterCallbacks,
  IMSessionMapping,
  IMAdapterEvent,
} from './types.js';

export type { MessageHandler, IMManagerOptions } from './IMManager.js';
