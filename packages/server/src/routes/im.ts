/**
 * IM 适配器管理路由（P1-1 第二批拆分产物）
 *
 * ── ⚠️ 本模块的约定 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. `imManager` 由调用方注入 —— 它持有 `messageHandler` 闭包（连到聊天引擎），
 *      无法在本模块内重建；
 *   3. `/api/im/config` 的 GET **必须脱敏**（botToken / appSecret / encodingAESKey /
 *      verificationToken），修改返回结构时不要破坏这一点；
 *   4. `/api/im/webhook/:platform` 是**唯一对外暴露的入口**（飞书/微信回调），
 *      用 `app.all` 注册 —— 飞书 URL 验证是 GET，消息回调是 POST。
 *
 * @module routes/im
 */

import type { Express } from 'express';
import type { AnyIMConfig, IMPlatform, IMManager } from '@easyagent/core';

/** IM 路由依赖 */
export interface IMRoutesDeps {
  /** IM 适配器管理器（在 index.ts 中创建，持有 messageHandler 闭包） */
  imManager: IMManager;
}

/**
 * 注册 IM 适配器管理路由
 *
 * @param app - Express 应用
 * @param deps - 显式注入的依赖
 */
export function registerIMRoutes(app: Express, deps: IMRoutesDeps): void {
  const { imManager } = deps;

  /** 获取 IM 平台状态 */
  app.get('/api/im/status', (_req, res) => {
    res.json(imManager.getStatus());
  });

  /** 获取 IM 配置列表 */
  app.get('/api/im/config', (_req, res) => {
    const configs = imManager.getAllConfigs();
    // 脱敏处理: 隐藏敏感字段
    const safe = configs.map((c: AnyIMConfig) => {
      const copy = { ...c } as Record<string, unknown>;
      if (copy.botToken) copy.botToken = '••••••••';
      if (copy.appSecret) copy.appSecret = '••••••••';
      if (copy.encodingAESKey) copy.encodingAESKey = '••••••••';
      if (copy.verificationToken) copy.verificationToken = '••••••••';
      return copy;
    });
    res.json(safe);
  });

  /** 配置/更新 IM 平台 */
  app.put('/api/im/config', (req, res) => {
    try {
      const config = req.body as AnyIMConfig;
      if (!config.platform || !config.name) {
        return res.status(400).json({ error: '缺少 platform 或 name 字段' });
      }
      imManager.updateConfig(config);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 启动指定 IM 平台 */
  app.post('/api/im/:platform/start', async (req, res) => {
    try {
      const platform = req.params.platform as IMPlatform;
      await imManager.startPlatform(platform);
      res.json({ success: true, platform, status: 'running' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 停止指定 IM 平台 */
  app.post('/api/im/:platform/stop', async (req, res) => {
    try {
      const platform = req.params.platform as IMPlatform;
      await imManager.stopPlatform(platform);
      res.json({ success: true, platform, status: 'stopped' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 删除 IM 平台配置 */
  app.delete('/api/im/:platform', (req, res) => {
    try {
      const platform = req.params.platform as IMPlatform;
      imManager.removeConfig(platform);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** IM Webhook 接收端点 (飞书/微信) */
  app.all('/api/im/webhook/:platform', async (req, res) => {
    try {
      const platform = req.params.platform as IMPlatform;
      const result = await imManager.handleWebhook(platform, {
        method: req.method,
        query: req.query as Record<string, string>,
        body: req.body,
      });
      // 飞书 URL 验证需返回纯文本
      if (result && typeof result === 'object' && 'challenge' in result) {
        res.json(result);
      } else {
        res.json(result || { success: true });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
}
