/**
 * 系统 / Token 用量 / 北极星指标路由（P1-1 第四批拆分产物）
 *
 * ── 本模块的约定 ──
 *   1. 纯搬迁：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. 路径基准由调用方传入（serverDir）：/api/version 读取 version.json 与
 *      CHANGELOG.md，路径取决于构建产物布局而非源码布局；
 *   3. wsSubscriptions / safeSend 由调用方注入 —— 定义在 WebSocket 段，
 *      /api/test/open-panel 与 WS 广播必须操作同一份订阅表；
 *   4. MODEL_PRICES 是估算用参考价（美元/1K tokens），匹配不到时用保守默认值；
 *   5. /api/version/check 直连 GitHub Releases API，网络不可达时返回
 *      hasUpdate: false + error，不抛 500。
 *
 * @module routes/system
 */

import type { Express } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getAnalyticsEngine, logger } from '@easyagent/core';
import type { SessionManager, ToolRegistry, ConfigManager } from '@easyagent/core';
import type { WebSocket } from 'ws';

/** 系统路由依赖 */
export interface SystemRoutesDeps {
  /** 当前应用版本号（index.ts 内解析：env → version.json → 兜底） */
  appVersion: string;
  /** 编译产物目录（index.ts 的 __dirname）：version.json / CHANGELOG.md 定位基准 */
  serverDir: string;
  /** HTTP 监听端口（/api/test/open-panel 拼 doc-viewer 面板地址用） */
  port: number;
  sessionManager: SessionManager;
  toolRegistry: ToolRegistry;
  config: ReturnType<ConfigManager['getConfig']>;
  /** WebSocket → 订阅会话 ID（与 WebSocket 段共享同一 Map） */
  wsSubscriptions: Map<WebSocket, string>;
  /** 安全发送（与 WebSocket 段共享同一实现） */
  safeSend: (ws: WebSocket, data: Record<string, unknown>) => boolean;
}

/**
 * 注册系统 / Token 用量 / 北极星指标路由
 */
export function registerSystemRoutes(app: Express, deps: SystemRoutesDeps): void {
  const { appVersion, serverDir, port, sessionManager, toolRegistry, config, wsSubscriptions, safeSend } = deps;
  void serverDir;
  /** 健康检查 */
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: appVersion,
      uptime: process.uptime(),
      memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      timestamp: new Date().toISOString(),
    });
  });

  /** 开发调试：模拟 open-doc-viewer 工具结果，向所有订阅的客户端发送 open_panel */
  app.post('/api/test/open-panel', (_req, res) => {
    const panelUrl = `http://localhost:${port}/doc-viewer/`;
    let sent = 0;
    for (const [ws, sid] of wsSubscriptions.entries()) {
      if (ws.readyState === 1) {
        safeSend(ws, {
          type: 'open_panel',
          panelType: 'doc-viewer',
          url: panelUrl,
          title: '文档浏览器',
        });
        sent++;
      }
    }
    logger.info({ sent, url: panelUrl }, '[TEST] 已广播 open_panel');
    res.json({ ok: true, sent, url: panelUrl });
  });

  /** 获取版本信息 + 更新日志 */
  app.get('/api/version', (_req, res) => {
    // 读取 CHANGELOG.md 获取最近版本的更新内容
    const changelogPath = join(dirname(__dirname), '..', '..', '..', 'CHANGELOG.md');
    let changelog = '';
    try {
      if (existsSync(changelogPath)) {
        const raw = readFileSync(changelogPath, 'utf-8');
        // 提取最近两个有实质性内容的版本 changelog
        // 跳过只有标题没有变更内容的空条目（如 release.mjs 自动生成的空标题）
        const sections = raw.split(/^## \[/m);
        const meaningful: string[] = [];
        for (let i = 1; i < sections.length; i++) {
          const entry = '## [' + sections[i];
          // 判断是否有实质内容：至少包含一个 ### 分类标题
          const hasContent = /^###\s/m.test(sections[i]);
          if (hasContent) {
            meaningful.push(entry);
            if (meaningful.length >= 2) break;
          }
        }
        changelog = meaningful.join('\n').trim();
      }
    } catch (err) {
      /* changelog 不可用 */
    }

    // 从 version.json 读取 codename 和 releaseDate，Desktop 环境从 env 读取
    let codename = process.env.EASYAGENT_CODENAME || '';
    let releaseDate = process.env.EASYAGENT_RELEASE_DATE || '';
    try {
      const versionPath = join(__dirname, '..', '..', '..', 'version.json');
      if (existsSync(versionPath)) {
        const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
        if (versionData.codename) codename = versionData.codename;
        if (versionData.releaseDate) releaseDate = versionData.releaseDate;
      }
    } catch (_err) {
      /* 读取失败用 env 兜底 */
    }

    res.json({
      version: appVersion,
      codename,
      releaseDate,
      changelog,
    });
  });

  /** 检查是否有新版本可用（从 GitHub Releases API） */
  app.get('/api/version/check', async (_req, res) => {
    try {
      const https = await import('node:https');

      const githubRequest = (
        url: string,
      ): Promise<{ tag_name: string; published_at: string; body: string }> => {
        return new Promise((resolve, reject) => {
          const opts = {
            hostname: 'api.github.com',
            path: url,
            headers: {
              'User-Agent': 'EasyAgent/' + appVersion,
              Accept: 'application/vnd.github.v3+json',
            },
          };
          https
            .get(opts, (resp) => {
              let data = '';
              resp.on('data', (chunk: string) => (data += chunk));
              resp.on('end', () => {
                if (resp.statusCode === 200) {
                  try {
                    resolve(JSON.parse(data));
                  } catch (err) {
                    reject(new Error('JSON parse error'));
                  }
                } else {
                  reject(new Error(`GitHub API: ${resp.statusCode}`));
                }
              });
            })
            .on('error', reject);
        });
      };

      const release = await githubRequest('/repos/ht182400-creator/easyagent/releases/latest');
      const latestVersion = release.tag_name.startsWith('v')
        ? release.tag_name.substring(1)
        : release.tag_name;

      const isNewer = (a: string, b: string): boolean => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if ((pa[i] || 0) > (pb[i] || 0)) return true;
          if ((pa[i] || 0) < (pb[i] || 0)) return false;
        }
        return false;
      };

      res.json({
        currentVersion: appVersion,
        latestVersion,
        hasUpdate: isNewer(latestVersion, appVersion),
        releaseUrl: `https://github.com/ht182400-creator/easyagent/releases/tag/${release.tag_name}`,
        publishedAt: release.published_at,
        body: release.body,
      });
    } catch (err) {
      res.json({
        currentVersion: appVersion,
        hasUpdate: false,
        error: (err as Error).message,
      });
    }
  });

  /** 获取系统状态 */
  app.get('/api/status', (_req, res) => {
    const usage = sessionManager.getTotalTokenUsage();
    res.json({
      model: config.currentModel,
      tokenUsage: usage,
      sessionCount: sessionManager.list().length,
      toolCount: toolRegistry.list().length,
      providerCount: config.providers.length,
      uptime: Math.round(process.uptime()),
      memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    });
  });

  // ========== Token 用量分析 API ==========

  /** 模型参考价格 (美元/1K tokens) */
  const MODEL_PRICES: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
    'claude-3-opus': { input: 0.015, output: 0.075 },
    'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    'deepseek-chat': { input: 0.00014, output: 0.00028 },
    'deepseek-reasoner': { input: 0.00055, output: 0.00219 },
    'gemini-2.5-pro': { input: 0.0035, output: 0.0105 },
    'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
    'qwen-max': { input: 0.00286, output: 0.00857 },
    'qwen-plus': { input: 0.00057, output: 0.002 },
  };

  /** 根据模型ID估算价格 */
  function estimateModelPrice(modelId: string): { input: number; output: number } {
    const key = modelId.toLowerCase();
    // 精确匹配
    for (const [k, v] of Object.entries(MODEL_PRICES)) {
      if (key.includes(k)) return v;
    }
    // 默认保守估算
    return { input: 0.003, output: 0.01 };
  }

  /** 获取Token用量分析数据 */
  app.get('/api/token-usage/analytics', (_req, res) => {
    try {
      const sessions = sessionManager.list();
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // 按模型聚合
      const byModelMap = new Map<
        string,
        {
          model: string;
          provider: string;
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
          calls: number;
        }
      >();
      // 按日期聚合 (最近30天)
      const byDayMap = new Map<
        string,
        {
          date: string;
          inputTokens: number;
          outputTokens: number;
          totalTokens: number;
          calls: number;
        }
      >();
      // 按提供商聚合
      const byProviderMap = new Map<
        string,
        { provider: string; inputTokens: number; outputTokens: number; totalTokens: number }
      >();
      // 明细调用记录
      const allCalls: Array<{
        timestamp: string;
        sessionId: string;
        title: string;
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCost: number;
      }> = [];

      // 总计
      let totalInput = 0;
      let totalOutput = 0;
      let totalTokens = 0;
      let todayInput = 0;
      let todayOutput = 0;
      let todayTokens = 0;
      let weekInput = 0;
      let weekOutput = 0;
      let weekTokens = 0;
      let monthInput = 0;
      let monthOutput = 0;
      let monthTokens = 0;

      const sevenDaysAgo = now - 7 * DAY_MS;
      const thirtyDaysAgo = now - 30 * DAY_MS;

      for (const session of sessions) {
        const ts = session.metadata.tokenUsage;
        if (ts.totalTokens === 0) continue;

        const { provider, model } = session.modelConfig;
        const modelKey = `${provider}/${model}`;
        const createdAt = new Date(session.metadata.createdAt).getTime();
        const dateStr = new Date(session.metadata.createdAt).toISOString().split('T')[0];

        // 累计统计
        totalInput += ts.inputTokens;
        totalOutput += ts.outputTokens;
        totalTokens += ts.totalTokens;

        const isToday = createdAt >= todayStart.getTime();
        const isThisWeek = createdAt >= sevenDaysAgo;
        const isThisMonth = createdAt >= thirtyDaysAgo;

        if (isToday) {
          todayInput += ts.inputTokens;
          todayOutput += ts.outputTokens;
          todayTokens += ts.totalTokens;
        }
        if (isThisWeek) {
          weekInput += ts.inputTokens;
          weekOutput += ts.outputTokens;
          weekTokens += ts.totalTokens;
        }
        if (isThisMonth) {
          monthInput += ts.inputTokens;
          monthOutput += ts.outputTokens;
          monthTokens += ts.totalTokens;
        }

        // 按模型聚合
        const modelEntry = byModelMap.get(modelKey) || {
          model,
          provider,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          calls: 0,
        };
        modelEntry.inputTokens += ts.inputTokens;
        modelEntry.outputTokens += ts.outputTokens;
        modelEntry.totalTokens += ts.totalTokens;
        modelEntry.calls += 1;
        byModelMap.set(modelKey, modelEntry);

        // 按日期聚合
        const dayEntry = byDayMap.get(dateStr) || {
          date: dateStr,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          calls: 0,
        };
        dayEntry.inputTokens += ts.inputTokens;
        dayEntry.outputTokens += ts.outputTokens;
        dayEntry.totalTokens += ts.totalTokens;
        dayEntry.calls += 1;
        byDayMap.set(dateStr, dayEntry);

        // 按提供商聚合
        const provEntry = byProviderMap.get(provider) || {
          provider,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
        provEntry.inputTokens += ts.inputTokens;
        provEntry.outputTokens += ts.outputTokens;
        provEntry.totalTokens += ts.totalTokens;
        byProviderMap.set(provider, provEntry);

        // 估算费用
        const price = estimateModelPrice(model);
        const estimatedCost =
          (ts.inputTokens / 1000) * price.input + (ts.outputTokens / 1000) * price.output;

        // 明细记录
        allCalls.push({
          timestamp:
            session.metadata.createdAt instanceof Date
              ? session.metadata.createdAt.toISOString()
              : String(session.metadata.createdAt),
          sessionId: session.id,
          title: session.metadata.title,
          provider,
          model,
          inputTokens: ts.inputTokens,
          outputTokens: ts.outputTokens,
          totalTokens: ts.totalTokens,
          estimatedCost: Math.round(estimatedCost * 10000) / 10000,
        });
      }

      // 按日期排序 (最近30天)
      const byDay = Array.from(byDayMap.values())
        .filter((d) => new Date(d.date).getTime() >= thirtyDaysAgo)
        .sort((a, b) => a.date.localeCompare(b.date));

      // 按模型排序 (用量降序)
      const byModel = Array.from(byModelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);

      // 按提供商排序
      const byProvider = Array.from(byProviderMap.values()).sort(
        (a, b) => b.totalTokens - a.totalTokens,
      );

      // 明细按时间倒序 (最近20条)
      const recentCalls = allCalls
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 50);

      // 费用汇总
      let totalEstimatedCost = 0;
      const costByModel: Array<{ model: string; provider: string; cost: number; tokens: number }> =
        [];
      for (const m of byModel) {
        const price = estimateModelPrice(m.model);
        const cost = (m.inputTokens / 1000) * price.input + (m.outputTokens / 1000) * price.output;
        totalEstimatedCost += cost;
        costByModel.push({
          model: m.model,
          provider: m.provider,
          cost: Math.round(cost * 10000) / 10000,
          tokens: m.totalTokens,
        });
      }

      res.json({
        success: true,
        summary: {
          total: { inputTokens: totalInput, outputTokens: totalOutput, totalTokens },
          today: { inputTokens: todayInput, outputTokens: todayOutput, totalTokens: todayTokens },
          thisWeek: { inputTokens: weekInput, outputTokens: weekOutput, totalTokens: weekTokens },
          thisMonth: {
            inputTokens: monthInput,
            outputTokens: monthOutput,
            totalTokens: monthTokens,
          },
        },
        byModel,
        byDay,
        byProvider,
        recentCalls,
        cost: {
          totalEstimatedCost: Math.round(totalEstimatedCost * 10000) / 10000,
          byModel: costByModel,
          currency: 'USD',
        },
      });
    } catch (error) {
      logger.error('获取Token分析数据失败', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
        summary: {
          total: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          today: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          thisWeek: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          thisMonth: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
        byModel: [],
        byDay: [],
        byProvider: [],
        recentCalls: [],
        cost: { totalEstimatedCost: 0, byModel: [], currency: 'USD' },
      });
    }
  });

  // ========== 🆕 北极星指标 Analytics API ==========

  /** 获取北极星指标 (FTSR / 7日留存 / TTFV / DAU/WAU/MAU) */
  app.get('/api/analytics/north-star', (_req, res) => {
    try {
      const engine = getAnalyticsEngine();
      const report = engine.generateReport();
      res.json({
        success: true,
        northStar: report.northStar,
        funnel: report.funnel,
        updatedAt: report.generatedAt,
      });
    } catch (error) {
      logger.error('获取北极星指标失败', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取用量趋势数据 */
  app.get('/api/analytics/trends', (req, res) => {
    try {
      const engine = getAnalyticsEngine();
      const days = parseInt(req.query.days as string) || 30;
      res.json({
        success: true,
        dau: engine.getDAUTrend(days),
        messages: engine.getMessagesTrend(days),
      });
    } catch (error) {
      logger.error('获取趋势数据失败', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 记录用户事件 */
  app.post('/api/analytics/track', (req, res) => {
    try {
      const engine = getAnalyticsEngine();
      const { type, data } = req.body;
      if (!type) {
        return res.status(400).json({ success: false, error: '缺少 type 字段' });
      }
      engine.track({
        type,
        timestamp: Date.now(),
        sessionId: req.body.sessionId || 'unknown',
        userId: req.body.userId,
        data: data || {},
      });
      res.json({ success: true });
    } catch (error) {
      logger.error('记录事件失败', error);
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

}
