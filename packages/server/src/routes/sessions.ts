/**
 * 会话与同步聊天路由（P1-1 第四批拆分产物）
 *
 * ── 本模块的约定 ──
 *   1. 纯搬迁：路由路径、方法、处理逻辑与拆分前完全一致；
 *   2. /api/sessions/search 必须先于 /api/sessions/:id 注册（防 search 被 :id 捕获），
 *      模块内注册顺序即原顺序，勿调整；
 *   3. /api/chat 是同步聊天（一次请求一次响应）；流式走 WebSocket 的 chat 消息，
 *      两条路径共用 newAgent 注入。
 *
 * @module routes/sessions
 */

import type { Express } from 'express';
import type { SessionManager, ConfigManager, createAgent } from '@easyagent/core';

/** 会话/聊天路由依赖 */
export interface SessionRoutesDeps {
  sessionManager: SessionManager;
  configManager: ConfigManager;
  config: ReturnType<ConfigManager['getConfig']>;
  newAgent: (
    providerConfig: Parameters<typeof createAgent>[0],
    opts?: Parameters<typeof createAgent>[3],
  ) => ReturnType<typeof createAgent>;
}

/** 注册会话与同步聊天路由 */
export function registerSessionRoutes(app: Express, deps: SessionRoutesDeps): void {
  const { sessionManager, configManager, config, newAgent } = deps;

  // ========== 会话API ==========

  app.get('/api/sessions', (req, res) => {
    const status = req.query.status as string;
    const sessions = sessionManager.list(status as Parameters<typeof sessionManager.list>[0]);
    // 格式化返回
    const formatted = sessions.map((s: Record<string, unknown>) => ({
      id: s.id || s.sessionId,
      workspace: s.workspace || '',
      metadata: {
        title: s.title || s.id || '未命名',
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
        status: s.status || 'active',
        tokenUsage: s.tokenUsage || {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
        messageCount: Array.isArray(s.messages) ? (s.messages as unknown[]).length : 0,
      },
    }));
    res.json(formatted);
  });

  /** 搜索会话（必须在 :id 路由之前注册，防止 search 被 id 参数捕获） */
  app.get('/api/sessions/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: '缺少q参数' });
    }
    const results = sessionManager.search(query);
    res.json(results);
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = sessionManager.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: '会话不存在' });
    }
    res.json(session);
  });

  app.delete('/api/sessions/:id', (req, res) => {
    sessionManager.delete(req.params.id);
    res.json({ success: true });
  });

  app.post('/api/sessions/:id/archive', (req, res) => {
    sessionManager.archive(req.params.id);
    res.json({ success: true });
  });

  // ========== 聊天API (同步模式 ==========

  app.post('/api/chat', async (req, res) => {
    try {
      const { message, sessionId, provider, model } = req.body;
      if (!message) {
        return res.status(400).json({ error: '缺少message参数' });
      }
      // 如果请求指定了 provider，优先使用指定的提供商配置
      // 如果请求指定了 provider，优先使用指定的提供商配置
      const providerConfig = provider
        ? configManager.getProvider(provider as Parameters<typeof configManager.getProvider>[0])
        : configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const agent = await newAgent(providerConfig, {
        model: model || config.currentModel.model,
        provider: provider || config.currentModel.provider,
      });
      const response = await agent.run(message, {
        sessionId: sessionId || `web_${Date.now()}`,
      });
      const usage = await agent.getTokenUsage();
      // AgentEngine.run() 返回 void；LangGraphAdapter 返回 string
      const responseText = typeof response === 'string' ? response : '';
      res.json({ response: responseText, usage });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

}
