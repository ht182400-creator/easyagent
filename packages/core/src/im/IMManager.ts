/**
 * IM 适配器管理器
 * 统一管理多个 IM 平台适配器的生命周期和消息路由
 */
import { EventEmitter } from 'events';
import type {
  IMPlatform,
  IMAdapterStatus,
  AnyIMConfig,
  TelegramConfig,
  FeishuConfig,
  WeChatConfig,
  IMMessage,
  IMSessionMapping,
} from './types.js';
import type { BaseIMAdapter } from './BaseIMAdapter.js';
import { TelegramAdapter } from './TelegramAdapter.js';
import { FeishuAdapter } from './FeishuAdapter.js';
import { WeChatAdapter } from './WeChatAdapter.js';
import { logger } from '../utils/logger.js';

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
export class IMManager extends EventEmitter {
  /** 已注册的适配器 */
  private adapters = new Map<IMPlatform, BaseIMAdapter>();
  /** 平台配置缓存 */
  private configs = new Map<IMPlatform, AnyIMConfig>();
  /** 消息处理器 */
  private messageHandler: MessageHandler | null = null;
  /** 会话映射: chatId → { sessionId, platform } */
  private sessionMap = new Map<string, IMSessionMapping>();
  /** 原始配置对象 (JSON) */
  private rawConfig: Record<string, unknown> | null = null;

  constructor(options?: IMManagerOptions) {
    super();
    if (options?.messageHandler) {
      this.messageHandler = options.messageHandler;
    }
  }

  // ========== 配置管理 ==========

  /**
   * 配置一个平台适配器
   */
  configure(config: AnyIMConfig): void {
    this.configs.set(config.platform, config);
    logger.info({ platform: config.platform, enabled: config.enabled }, 'IM 平台已配置');
  }

  /**
   * 从 JSON 对象批量配置
   */
  configureAll(configs: AnyIMConfig[]): void {
    for (const config of configs) {
      this.configure(config);
    }
  }

  /**
   * 设置消息处理器
   */
  setMessageHandler(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  // ========== 生命周期 ==========

  /**
   * 启动所有已启用的适配器
   */
  async startAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [platform, config] of this.configs) {
      if (!config.enabled) {
        logger.debug({ platform }, '平台未启用，跳过启动');
        continue;
      }
      promises.push(this.startPlatform(platform));
    }

    const results = await Promise.allSettled(promises);

    let started = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') started++;
      else failed++;
    }

    logger.info({ started, failed }, `IM 适配器启动完成: ${started} 成功, ${failed} 失败`);
    this.emit('all-started', { started, failed });
  }

  /**
   * 停止所有适配器
   */
  async stopAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [platform, adapter] of this.adapters) {
      promises.push(adapter.stop());
    }

    await Promise.allSettled(promises);
    this.adapters.clear();
    logger.info('所有 IM 适配器已停止');
    this.emit('all-stopped');
  }

  /**
   * 启动指定平台
   */
  async startPlatform(platform: IMPlatform): Promise<void> {
    const config = this.configs.get(platform);
    if (!config) {
      throw new Error(`平台 ${platform} 未配置`);
    }

    // 如果已在运行，先停止旧实例
    const existing = this.adapters.get(platform);
    if (existing) {
      await existing.stop();
      this.adapters.delete(platform);
    }

    // 创建适配器
    const adapter = this.createAdapter(config);

    // 设置消息路由
    adapter.setCallbacks({
      onMessage: this.routeMessage.bind(this, adapter),
      onStatusChange: (p, status, error) => {
        this.emit('status-change', { platform: p, status, error });
      },
      onError: (p, error) => {
        logger.error({ platform: p, error: error.message }, 'IM 适配器错误');
        this.emit('adapter-error', { platform: p, error });
      },
    });

    // 启动
    await adapter.start();
    this.adapters.set(platform, adapter);
  }

  /**
   * 停止指定平台
   */
  async stopPlatform(platform: IMPlatform): Promise<void> {
    const adapter = this.adapters.get(platform);
    if (adapter) {
      await adapter.stop();
      this.adapters.delete(platform);
    }
  }

  // ========== 消息路由 ==========

  /**
   * 消息路由核心: IM → Agent → IM
   */
  private async routeMessage(adapter: BaseIMAdapter, message: IMMessage): Promise<void> {
    if (!this.messageHandler) {
      logger.warn({ platform: adapter.platform }, '未设置消息处理器，忽略消息');
      return;
    }

    try {
      // 发送 typing 指示器
      adapter.sendTyping(message.chatId).catch(() => {});

      // 调用消息处理器 (由上层注入，连接 AgentEngine)
      const { streamGenerator, references } = await this.messageHandler(message);

      // 流式回复
      if (streamGenerator) {
        await adapter.sendStreamingMessage(message.chatId, streamGenerator);
      }

      // 附加参考文档
      if (references && references.length > 0) {
        const refText = '\n\n📚 **参考:**\n' + references.map((r) => `• ${r}`).join('\n');
        await adapter.sendMessage(message.chatId, refText);
      }
    } catch (err) {
      logger.error(
        { platform: adapter.platform, error: (err as Error).message },
        '消息路由处理失败'
      );
      await adapter.sendMessage(
        message.chatId,
        `⚠️ 处理出错: ${(err as Error).message}`
      );
    }
  }

  // ========== 适配器工厂 ==========

  /**
   * 根据配置创建对应的适配器实例
   */
  private createAdapter(config: AnyIMConfig): BaseIMAdapter {
    switch (config.platform) {
      case 'telegram':
        return new TelegramAdapter(config as TelegramConfig);

      case 'feishu':
        return new FeishuAdapter(config as FeishuConfig);

      case 'wechat':
        return new WeChatAdapter(config as WeChatConfig);

      default:
        throw new Error(`不支持的 IM 平台: ${(config as AnyIMConfig).platform}`);
    }
  }

  // ========== 查询接口 ==========

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
  }> {
    const result: Array<{
      platform: IMPlatform;
      name: string;
      status: IMAdapterStatus;
      enabled: boolean;
      uptime: number;
      error: string | null;
    }> = [];

    for (const [platform, config] of this.configs) {
      const adapter = this.adapters.get(platform);
      result.push({
        platform,
        name: config.name,
        status: adapter?.status || 'stopped',
        enabled: config.enabled,
        uptime: adapter?.getUptime() || 0,
        error: adapter?.error || null,
      });
    }

    return result;
  }

  /**
   * 获取指定平台适配器
   */
  getAdapter(platform: IMPlatform): BaseIMAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * 获取会话映射
   */
  getSessionMapping(chatId: string): IMSessionMapping | undefined {
    return this.sessionMap.get(chatId);
  }

  /**
   * 设置会话映射
   */
  setSessionMapping(chatId: string, sessionId: string, platform: IMPlatform): void {
    const mapping: IMSessionMapping = {
      chatId,
      sessionId,
      platform,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    // 更新已存在的映射
    const existing = this.sessionMap.get(chatId);
    if (existing) {
      mapping.createdAt = existing.createdAt;
    }

    this.sessionMap.set(chatId, mapping);
  }

  /**
   * Webhook 处理入口 (飞书/微信)
   * 由外部 HTTP 服务器调用
   */
  async handleWebhook(
    platform: IMPlatform,
    req: { method: string; query: Record<string, string>; body: unknown }
  ): Promise<unknown> {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`平台 ${platform} 未启动`);
    }

    if (platform === 'feishu') {
      const feishu = adapter as FeishuAdapter;
      return feishu.handleEventCallback(req.body as Parameters<FeishuAdapter['handleEventCallback']>[0]);
    }

    if (platform === 'wechat') {
      const wechat = adapter as WeChatAdapter;
      if (req.method === 'GET') {
        return wechat.handleUrlVerify(req.query);
      }
      return wechat.handleMessageCallback(String(req.body));
    }

    throw new Error(`平台 ${platform} 不支持 Webhook 模式`);
  }

  /**
   * 获取 Webhook 信息 (用于外部 HTTP 服务器注册路由)
   */
  getWebhookPlatforms(): IMPlatform[] {
    return Array.from(this.configs.entries())
      .filter(
        ([, config]) =>
          config.enabled && (config.platform === 'feishu' || config.platform === 'wechat')
      )
      .map(([platform]) => platform);
  }

  /**
   * 获取所有配置
   */
  getAllConfigs(): AnyIMConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * 更新平台配置
   */
  updateConfig(config: AnyIMConfig): void {
    this.configs.set(config.platform, config);
    logger.info({ platform: config.platform }, 'IM 配置已更新');
  }

  /**
   * 删除平台配置
   */
  removeConfig(platform: IMPlatform): void {
    this.stopPlatform(platform);
    this.configs.delete(platform);
    logger.info({ platform }, 'IM 配置已删除');
  }
}
