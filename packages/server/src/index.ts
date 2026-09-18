/**
 * EasyAgent Web服务端 v2.0
 * 提供REST API + 增强 WebSocket (支持流式、工具调用、会话管理)
 */
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import multer from 'multer';

/** ESM 兼容: 模拟 CommonJS 的 __dirname */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** 自定义技能存储路径 */
const CUSTOM_SKILLS_DIR = join(homedir(), '.easyagent', 'data');
const CUSTOM_SKILLS_PATH = join(CUSTOM_SKILLS_DIR, 'custom-skills.json');

import {
  ConfigManager,
  SessionManager,
  ToolRegistry,
  AgentEngine,
  AdapterFactory,
  getAllBuiltinTools,
  PROVIDER_PRESETS,
  getModelRegistry,
  getAnalyticsEngine,
  PluginManager,
  getPluginManager,
  IMManager,
  KnowledgeService,
  AutomationManager,
  logger,
  describeLogTarget,
} from '@easyagent/core';
import type { IMMessage } from '@easyagent/core';

// ========== 插件市场服务 ==========
import { getPluginMarketService, type MarketPlugin, type InstallJob } from './services/PluginMarketService.js';

// ========== API 安全中间件（鉴权 + 限流 + 绑定地址策略）==========
import {
  DEFAULT_BIND_HOST,
  assertSecurityOk,
  createApiAuthMiddleware,
  createCostlyRateLimit,
  createGlobalRateLimit,
  describeSecurityConfig,
  isLoopbackAddress,
  resolveSecurityConfig,
  safeTokenEqual,
} from './middleware/apiSecurity.js';

// ========== 路由模块（P1-1 拆分产物）==========
// 每个 register* 负责一组路由的注册；依赖通过显式对象注入，不依赖闭包。
import {
  fetchModelsFromProvider,
  registerAutomationRoutes,
  registerConfigRoutes,
  registerFilesRoutes,
  registerIMRoutes,
  registerKnowledgeRoutes,
  registerPluginRoutes,
  registerSandboxRoutes,
  registerSemanticRoutes,
  registerStaticRoutes,
  registerSystemRoutes,
  resolveDocViewerFallbackDir,
} from './routes/index.js';

// ========== LangGraph 引擎集成 (Phase B) ==========
import { getEngineType, createAgent, isLangGraphAdapter, parseCliEngineArg, resolveEngineSource } from './langgraph/index.js';
import type { EngineType, AgentInstance, EngineSource } from './langgraph/index.js';

const PORT = parseInt(process.env.PORT || '3456', 10);
/**
 * 监听地址
 *
 * 【2026-09-18 安全加固】默认值由 '0.0.0.0' 改为 '127.0.0.1'。
 * 此前默认全网监听，叠加 REST 无鉴权 = 任何人可远程调用
 * 文件浏览 / 命令执行 / 密钥写入接口。公网部署请显式设置
 * `HOST=0.0.0.0` 并**同时**配置 `EASYAGENT_API_TOKEN`（否则拒绝启动）。
 */
const HOST = process.env.HOST || DEFAULT_BIND_HOST;

/** API 安全配置（令牌 / 限流 / 反代层数），进程内解析一次 */
const SECURITY_CONFIG = resolveSecurityConfig();

/**
 * createApp() 选项
 */
export interface CreateAppOptions {
  /**
   * 项目根目录，决定 project 作用域知识库的存储位置
   * 默认: resolve(__dirname, '..', '..', '..') — 从 packages/server/dist 上溯 3 级
   * Desktop 版本需显式传入有效路径，因为 asar 包内 __dirname 指向只读归档
   */
  projectRoot?: string;
}

/**
 * 创建 Express 应用实例（不启动监听，用于测试和嵌入）
 * 返回 app + HTTP server + WebSocket server 供外部调用
 */
export async function createApp(options: CreateAppOptions = {}) {
  // 启动时后台更新模型目录（不阻塞服务启动）
  const modelRegistry = getModelRegistry();
  modelRegistry
    .initialize()
    .then(async () => {
      // 下载成功 ≠ 数据新鲜：若目录文件本身长期未重新生成，客户端每天都在
      // 拉一份旧数据，厂商的新模型永远不会出现，而界面上看不出任何异常。
      // 因此这里主动告警，把"看不见的过期"变成看得见的事实。
      const freshness = modelRegistry.getFreshness();
      const source = modelRegistry.getSource() || '未知';

      if (freshness.stale) {
        logger.warn(
          {
            generatedAt: freshness.generatedAt,
            ageDays: freshness.ageDays,
            maxAgeDays: freshness.maxAgeDays,
            source,
          },
          '模型目录已过期：厂商新发布的模型不会出现在列表中。' +
            '请运行 `node scripts/refresh-models-catalog.mjs` 重新生成目录',
        );
      }

      // ── 厂商 API 直连补齐（不依赖 GitHub）──
      //
      // 内置的目录分发源（GitHub raw / jsDelivr）在部分网络环境下**都不可达**；
      // 但厂商自己的 API 通常可以直连，且是"厂商一发新模型、/models 立刻就有"的
      // 第一手数据。因此只要目录**不够新**（过期、或来自缓存/内置兜底），
      // 就用已配置 API Key 的厂商直连把模型列表补齐。
      //
      // 注意：此处只**新增**、不删除；新增条目元数据未校准，会标记 unverified。
      const needsEnrich = freshness.stale || /缓存|内置/.test(source);
      if (needsEnrich) {
        let totalAdded = 0;
        for (const preset of PROVIDER_PRESETS) {
          if (!preset.apiKey || !preset.baseURL) continue;
          try {
            const models = await fetchModelsFromProvider(preset);
            if (models.length === 0) continue;
            totalAdded += modelRegistry.mergeModels(
              preset.id,
              models.map((m) => m.id),
              `厂商 API 直连（${preset.id}）`,
            );
          } catch (err) {
            logger.debug(
              { provider: preset.id, error: (err as Error).message },
              '厂商 API 直连补齐失败（忽略，不影响启动）',
            );
          }
        }
        if (totalAdded > 0) {
          logger.info({ totalAdded }, '已通过厂商 API 直连补齐模型列表（目录源不可用或过期）');
        }
      }

      logger.info(
        {
          version: modelRegistry.getVersion(),
          ageDays: freshness.ageDays,
          source,
          stale: freshness.stale,
        },
        '模型目录已就绪',
      );
    })
    .catch((err) => {
      logger.warn({ error: (err as Error).message }, '模型目录初始化失败');
    });

  // 初始化配置
  const configManager = new ConfigManager();
  const config = await configManager.load();

  /** 当前使用的 Agent 引擎类型 — 优先级: CLI参数 > 环境变量 > 配置文件 > 默认值 */
  const cliEngine = parseCliEngineArg(process.argv);
  const engineSource: EngineSource = resolveEngineSource(cliEngine);
  const currentEngine: EngineType = engineSource.engine;

  // 输出一行醒目、清晰的引擎信息，方便用户一眼确认
  const engineLabel = currentEngine === 'langgraph' ? 'LangGraph' : 'Legacy (AgentEngine)';
  logger.info(
    {
      engine: currentEngine,
      source: engineSource.source,
      cli: cliEngine || '无',
      env: process.env.EASYAGENT_ENGINE || '无',
      configPath: engineSource.configPath || '无',
    },
    `▶ Agent 引擎: ${engineLabel}  |  来源: ${engineSource.sourceLabel}`,
  );

  /**
   * 便捷的 Agent 工厂函数 — 使用当前引擎配置创建 Agent 实例
   *
   * @param providerConfig - 模型提供商配置
   * @param opts - 额外选项
   */
  const newAgent = (providerConfig: Parameters<typeof createAgent>[0], opts: Parameters<typeof createAgent>[3] = {}) =>
    createAgent(providerConfig, toolRegistry, sessionManager, {
      ...opts,
      engine: currentEngine,
    });

  // 初始化工具注册表
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerAll(getAllBuiltinTools());
  // 从持久化配置加载已禁用的工具列表
  const disabledToolNames = configManager.getDisabledToolNames();
  if (disabledToolNames.length > 0) {
    toolRegistry.setDisabledNames(disabledToolNames);
    logger.info({ count: disabledToolNames.length }, '已加载禁用的工具列表');
  }

  // 统一插件目录（用户级别，跨项目共享）
  const pluginsDir = join(homedir(), '.easyagent', 'plugins');

  // 初始化插件管理器 (关联 ToolRegistry)
  const pluginManager = getPluginManager({
    userPluginsDir: pluginsDir,
  });
  pluginManager.setToolRegistry(toolRegistry);
  // 异步初始化插件（不阻塞服务启动）
  pluginManager.initialize().catch((e) => {
    logger.error({ error: (e as Error).message }, '插件初始化失败');
  });

  // 初始化知识库服务（双作用域）
  // 优先使用传入的 projectRoot（Desktop 需要），否则从 __dirname 推断
  const PROJECT_ROOT = options.projectRoot || resolve(__dirname, '..', '..', '..');
  /** 项目级知识库 — 存储在 {PROJECT_ROOT}/.easyagent/knowledge/ */
  const knowledgeService = new KnowledgeService(PROJECT_ROOT, 'project');
  /** 全局知识库 — 存储在 ~/.easyagent/knowledge/，跨所有项目共享 */
  const globalKnowledgeService = KnowledgeService.getGlobal();

  /** 根据作用域解析对应的知识库服务实例 */
  const resolveKnowledgeService = (scope?: string): KnowledgeService => {
    return scope === 'global' ? globalKnowledgeService : knowledgeService;
  };

  /** multer 上传配置 — 用于文件导入功能 */
  const uploadDir = resolve(homedir(), '.easyagent', 'uploads');
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
        cb(null, `${uniqueSuffix}_${file.originalname}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 上限
  });

  // 初始化自动化任务管理器
  const automationManager = new AutomationManager({
    checkIntervalMs: 30000,
  });
  automationManager.initialize();

  // 设置自动化执行器：通过 AgentEngine 执行任务
  automationManager.setExecutor(async (task) => {
    // 优先使用任务指定的 provider/model，否则使用当前默认配置
    const taskProviderId = task.provider || config.currentModel.provider;
    const taskModel = task.model || config.currentModel.model;

    const providerConfig = configManager.getProvider(taskProviderId);
    if (!providerConfig) {
      const allConfigured = configManager.getAvailableProviders();
      const configuredNames =
        allConfigured.map((p: { name: string }) => p.name || p.id).join('、') || '无';
      throw new Error(
        `未找到模型提供商 ${taskProviderId}。` +
          (task.provider
            ? `任务指定了 "${taskProviderId}"，但该提供商未配置 API 密钥，请在「设置 → 模型提供商」中配置。`
            : `当前已配置的提供商: ${configuredNames}。请在「设置 → 模型提供商」中配置 API 密钥。`),
      );
    }

    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_start',
      message: `开始执行: ${task.prompt.substring(0, 80)}`,
      detail: `提供商: ${taskProviderId}, 模型: ${taskModel}`,
    });

    const agent = await newAgent(providerConfig, {
      model: taskModel,
      provider: taskProviderId,
    });

    /** 注册 Agent 事件监听，将工具调用进度广播到前端 */
    let currentTurn = 0;
    const agentListener = (event: { type: string; data: unknown }) => {
      if (event.type === 'turn_start') {
        currentTurn++;
        broadcastAutomationProgress({
          taskId: task.id,
          taskName: task.name,
          type: 'agent_turn',
          message: `第 ${currentTurn} 轮推理中...`,
        });
      } else if (event.type === 'tool_call') {
        const data = event.data as {
          toolCalls?: Array<{ function: { name: string; arguments: string } }>;
        };
        if (data?.toolCalls) {
          for (const tc of data.toolCalls) {
            broadcastAutomationProgress({
              taskId: task.id,
              taskName: task.name,
              type: 'tool_call',
              message: `调用工具: ${tc.function.name}`,
              detail: `参数: ${tc.function.arguments}`,
            });
          }
        }
      } else if (event.type === 'tool_result') {
        const data = event.data as {
          toolName: string;
          result: { success?: boolean; content?: string; error?: string };
        };
        broadcastAutomationProgress({
          taskId: task.id,
          taskName: task.name,
          type: 'tool_result',
          message: `工具结果: ${data.toolName} ${data.result?.error ? '❌' : '✅'}`,
          detail: data.result?.error || data.result?.content?.substring(0, 300) || '',
        });
      }
    };
    agent.onEvent(agentListener);

    let fullResponse = '';
    try {
      await agent.run(task.prompt, {
        sessionId: `auto_${task.id}_${Date.now()}`,
        onPartialResponse: (text: string) => {
          fullResponse += text;
        },
      });

      broadcastAutomationProgress({
        taskId: task.id,
        taskName: task.name,
        type: 'agent_done',
        message: '执行完成',
      });

      const usage = await agent.getTokenUsage();
      return {
        result: fullResponse,
        tokenUsage: {
          input: usage?.inputTokens || 0,
          output: usage?.outputTokens || 0,
          total: usage?.totalTokens || 0,
        },
      };
    } catch (error) {
      broadcastAutomationProgress({
        taskId: task.id,
        taskName: task.name,
        type: 'agent_error',
        message: '执行出错',
        detail: (error as Error).message,
      });
      throw error;
    } finally {
      agent.offEvent(agentListener);
    }
  });

  // 监听自动化任务生命周期事件，广播到前端
  automationManager.on('task:start', (task: any) => {
    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_start',
      message: `任务开始: ${task.name}`,
    });
  });
  automationManager.on('task:complete', (task: any) => {
    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_done',
      message: `任务完成: ${task.name}`,
    });
  });
  automationManager.on('task:error', (task: any) => {
    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_error',
      message: `任务失败: ${task.name}`,
    });
  });

  // 初始化会话管理器
  const sessionManager = new SessionManager();

  // 初始化 IM 适配器管理器
  const imManager = new IMManager({
    messageHandler: async (message: IMMessage) => {
      // IM 消息 → Agent 引擎处理逻辑
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        throw new Error('未配置模型提供商');
      }
      const agent = await newAgent(providerConfig, {
        model: config.currentModel.model,
        provider: config.currentModel.provider,
      });

      // 创建/获取 IM 会话
      const sessionId = `im_${message.chatId}`;

      // 流式生成器
      async function* streamGen(): AsyncGenerator<string> {
        let done = false;
        agent.onEvent((event) => {
          if (event.type === 'error') {
            done = true;
          }
        });

        await agent.run(message.text, {
          sessionId,
          onPartialResponse: async (text: string) => {
            // yield 每次增量文本
          },
        });
      }

      // 使用简易方式：直接运行并返回流
      let fullResponse = '';
      const chunks: string[] = [];

      agent.onEvent((event) => {
        if (event.type === 'error') {
          chunks.push(`\n\n⚠️ ${event.message}`);
        }
      });

      await agent.run(message.text, {
        sessionId,
        onPartialResponse: (text: string) => {
          fullResponse += text;
          chunks.push(text);
        },
      });

      // 构造支持流式输出的生成器
      async function* actualStream(): AsyncGenerator<string> {
        let index = 0;
        // 按字符逐批 yield，模拟流式效果
        const allText = fullResponse;
        const batchSize = 50;
        while (index < allText.length) {
          yield allText.substring(index, index + batchSize);
          index += batchSize;
          // 小延迟模拟流式
          await new Promise((r) => setTimeout(r, 30));
        }
      }

      return { streamGenerator: actualStream() };
    },
  });

  // Express应用
  const app = express();

  const corsEnv = process.env.CORS_ORIGIN;
  const allowedCorsOrigins = corsEnv
    ? corsEnv.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  // 同源预判定中间件（保留 cors 包做真正的头设置；此处只判定“是否同源”）
  // 浏览器加载同源子资源（<script>/<link>/同站 fetch）会带 Origin 头；
  // 服务器若在 NAT 后（网卡是私网 IP，对外是公网 IP），无法靠网卡地址判断同源，
  // 故比较 Origin 的 host:port 与本次请求的 Host 头是否一致：
  //   · 一致 → 视为同源，摘除 Origin，让后续 cors 按“无 origin（同源导航）”放行；
  //   · 不一致 → 保留 Origin，交给 cors 按 CORS_ORIGIN 白名单处理（跨域前端场景）。
  // 安全不变：仅“站点自身 + 白名单跨域源 + file:// 桌面版”可被放行；
  // 第三方恶意站点（Origin 与 Host 不符且不在白名单）仍会被 cors 拒绝。
  app.use((req, _res, next) => {
    const origin = req.headers.origin as string | undefined;
    const host = (req.headers.host || '') as string;
    if (origin) {
      try {
        const o = new URL(origin);
        if (o.host === host) {
          // 同源：等价于浏览器自身导航，cors 按无 origin 处理即可，无需反射具体源
          delete (req.headers as Record<string, string | undefined>).origin;
        }
      } catch {
        // Origin 非法，保留交 cors 拒绝
      }
    }
    next();
  });

  // CORS 配置（cors 包，标准安全控件，控制“哪些源可读取本 API / 携带凭据”）
  // 放行策略：无 Origin（同源导航） / file://（Electron Desktop）
  // / 本地开发（localhost/127.0.0.1） / CORS_ORIGIN 显式白名单（独立前端域名）
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin || origin === 'null' || origin.startsWith('file://')) {
          callback(null, true); // 同源导航 / Electron Desktop (file://)
          return;
        }
        if (allowedCorsOrigins.length > 0 && allowedCorsOrigins.includes(origin)) {
          callback(null, true); // 显式跨域白名单（独立前端域名访问）
          return;
        }
        if (
          origin.startsWith('http://localhost') ||
          origin.startsWith('http://127.0.0.1') ||
          origin.startsWith('http://[::1]')
        ) {
          callback(null, true); // 本地开发服务器
          return;
        }
        console.log(`[CORS] 拒绝未知 origin="${origin}"`);
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );
  // 反向代理支持：置于 Caddy / Nginx 之后时**必须**设置 EASYAGENT_TRUST_PROXY，
  // 否则 req.ip 恒为代理地址，会导致「回环免鉴权」误判与限流聚簇到同一个桶。
  if (SECURITY_CONFIG.trustProxy) {
    app.set('trust proxy', SECURITY_CONFIG.trustProxy);
  }

  // ── 限流 ──
  // 必须置于 express.json 之前：未授权的超大请求体不应消耗 10MB 解析开销。
  // 注册方式为 `app.use(fn)`（不带路径前缀），详见 createGlobalRateLimit 注释。
  if (SECURITY_CONFIG.rateLimitEnabled) {
    app.use(createGlobalRateLimit());
    app.use(createCostlyRateLimit());
  }

  app.use(express.json({ limit: '10mb' }));

  /** 安全 HTTP 头中间件：防止常见 Web 攻击 */
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 允许同源内嵌（文档浏览器需要在 iframe 中加载），其他来源拒绝
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  });

  // ── API 鉴权 ──
  // 策略：静态资源放行；回环地址（Desktop / 本地 Web）免鉴权；
  // 非回环请求必须携带有效令牌，否则 401。详见 middleware/apiSecurity.ts。
  app.use(createApiAuthMiddleware(SECURITY_CONFIG));

  // ========== 系统API ==========

  /** 当前应用版本号（优先环境变量，其次 version.json，最后兜底） */
  let APP_VERSION = process.env.EASYAGENT_VERSION || '0.3.0';
  try {
    const versionPath = join(__dirname, '..', '..', '..', 'version.json');
    if (existsSync(versionPath)) {
      const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
      if (versionData.version) {
        APP_VERSION = versionData.version;
      }
    }
  } catch (_err) {
    /* 读取失败则用默认值 */
  }

  /** WebSocket 会话映射: ws → 订阅的 sessionId
   *  ⚠️ 定义在系统段**之前**：registerSystemRoutes 的 /api/test/open-panel
   *  依赖此 Map；WebSocket 段与该路由必须共享同一实例（勿在 WS 段重复创建）。
   */
  const wsSubscriptions = new Map<WebSocket, string>();

  /** 健康检查 */
  // 【P1-1 拆分】系统(5) + Token 用量(1) + 北极星(3) 共 9 条路由已迁至 routes/system.ts。
  // ⚠️ APP_VERSION 解析块保留在本文件（入口段也要用），以 deps.appVersion 注入；
  //    wsSubscriptions/safeSend 定义在 WebSocket 段，注入同一实例。
  registerSystemRoutes(app, {
    appVersion: APP_VERSION,
    serverDir: __dirname,
    port: PORT,
    sessionManager,
    toolRegistry,
    config,
    wsSubscriptions,
    safeSend,
  });
  // ========== 配置API ==========
  // 【P1-1 拆分】5 条配置路由 + 8 条提供商路由已迁至 routes/config.ts
  // （连同模型缓存、fetchModelsFromProvider、DEFAULT_TEMPLATES 等辅助）。
  // ⚠️ config 是 configManager.load() 的同一引用（模板与 allowed-commands 的兜底读取它）。
  registerConfigRoutes(app, { configManager, config, modelRegistry });

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

  // ========== LangGraph Checkpoint 管理 API (Phase B) ==========

  /**
   * 获取当前 Agent 引擎类型
   * GET /api/engine-type
   */
  app.get('/api/engine-type', (_req, res) => {
    try {
      res.json({ engineType: currentEngine });
    } catch (error) {
      logger.error({ err: error }, '获取引擎类型失败');
      res.status(500).json({ error: (error as Error).message || '获取引擎类型失败' });
    }
  });

  /**
   * 获取 LangGraph 引擎的所有会话列表
   * GET /api/langgraph/sessions
   * 说明: Legacy 引擎下返回空列表，避免前端在模式切换时直接报错
   */
  app.get('/api/langgraph/sessions', async (_req, res) => {
    try {
      if (currentEngine !== 'langgraph') {
        return res.json({
          sessions: [],
          engine: currentEngine,
          total: 0,
        });
      }
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const tempAgent = await newAgent(providerConfig);
      if (isLangGraphAdapter(tempAgent)) {
        const sessions = tempAgent.listSessions();
        res.json({ sessions, engine: 'langgraph', total: sessions.length });
      } else {
        res.json({ sessions: [], engine: 'legacy', total: 0 });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * 获取特定会话的状态
   * GET /api/langgraph/sessions/:id
   */
  app.get('/api/langgraph/sessions/:id', async (req, res) => {
    try {
      if (currentEngine !== 'langgraph') {
        return res.status(400).json({
          error: '当前未启用 LangGraph 引擎',
          engine: currentEngine,
        });
      }
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const tempAgent = await newAgent(providerConfig);
      if (isLangGraphAdapter(tempAgent)) {
        const state = await tempAgent.getSessionState(req.params.id);
        if (!state) {
          return res.status(404).json({ error: '会话不存在' });
        }
        res.json({ sessionId: req.params.id, state });
      } else {
        res.status(400).json({ error: '仅 LangGraph 引擎支持此功能' });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * 从 Checkpoint 恢复会话
   * POST /api/langgraph/sessions/:id/resume
   */
  app.post('/api/langgraph/sessions/:id/resume', async (req, res) => {
    try {
      if (currentEngine !== 'langgraph') {
        return res.status(400).json({
          error: '当前未启用 LangGraph 引擎',
          engine: currentEngine,
        });
      }
      const { message } = req.body;
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        return res.status(500).json({ error: '未配置模型提供商' });
      }
      const agent = await newAgent(providerConfig);
      if (isLangGraphAdapter(agent)) {
        const response = await agent.resume(req.params.id, message);
        const usage = await agent.getTokenUsage();
        res.json({ sessionId: req.params.id, response, usage });
      } else {
        res.status(400).json({ error: '仅 LangGraph 引擎支持此功能' });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========== LangGraph 场景执行 API (Phase C/D) ==========

  /**
   * LangGraph 场景预设数据（与前端 LangGraphPage.tsx SCENARIOS 同步）
   * 每个场景的静态执行结果，供前端可视化调用
   */
  const SCENARIO_RESULTS: Record<number, {
    turnCount: number;
    messageCount: number;
    duration: string;
    output: string;
    logs: Array<{ node: string; type: string; message: string }>;
    actualPath: string[];
  }> = {
    1: {
      turnCount: 1, messageCount: 2, duration: '120ms',
      output: '你好！我是 EasyAgent AI 助手，有什么可以帮助你的吗？',
      actualPath: ['START', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: 'LLM 分析输入: "你好" → 判定为纯文本对话，无需工具调用' },
        { node: 'route', type: 'decision', message: '路由决策: → END（无工具调用）' },
        { node: 'END', type: 'exit', message: '执行完成，输出自然语言回复' },
      ],
    },
    2: {
      turnCount: 1, messageCount: 4, duration: '340ms',
      output: '北京今天晴，气温 18°C-28°C，北风 3-4 级，空气质量良好。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: 'LLM 分析: 识别到天气查询需求 → 准备调用 weather_query 工具 (location="北京")' },
        { node: 'route', type: 'decision', message: '路由决策: → act（有工具调用）' },
        { node: 'act', type: 'info', message: '执行工具: weather_query({ location: "北京" }) → 成功 (18°C, 晴)' },
        { node: 'observe', type: 'info', message: '观察结果: 温度18-28°C, 北风3-4级, AQI 56 良' },
        { node: 'think', type: 'info', message: 'LLM 二次分析: 工具结果已获取，生成自然语言回复' },
        { node: 'route', type: 'decision', message: '路由决策: → END（满足退出条件）' },
        { node: 'END', type: 'exit', message: '执行完成，输出天气回复' },
      ],
    },
    3: {
      turnCount: 1, messageCount: 6, duration: '280ms',
      output: '深圳当前气温 32°C，多云，东南风 2 级。当前时间：2026-06-29 21:25 CST。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: 'LLM 分析: 识别到 2 个需求 → weather_query + time_query → 并行执行' },
        { node: 'route', type: 'decision', message: '路由决策: → act（并行 2 工具）' },
        { node: 'act', type: 'info', message: '执行工具(并行): weather_query({ location: "深圳" }) + time_query() → 均成功' },
        { node: 'observe', type: 'info', message: '观察结果: 深圳 32°C 多云 | 时间 2026-06-29 21:25' },
        { node: 'think', type: 'info', message: 'LLM 二次分析: 合并两个工具输出，生成回复' },
        { node: 'route', type: 'decision', message: '路由决策: → END' },
        { node: 'END', type: 'exit', message: '执行完成，输出合并回复' },
      ],
    },
    4: {
      turnCount: 3, messageCount: 8, duration: '520ms',
      output: '已达到最大轮次限制 (maxTurns=3)，系统自动终止以防止死循环。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化，maxTurns=3' },
        { node: 'think', type: 'info', message: '第1轮: LLM 请求 file_search 工具' },
        { node: 'route', type: 'decision', message: '第1轮: → act' },
        { node: 'act', type: 'info', message: '第1轮: file_search → 未找到文件' },
        { node: 'observe', type: 'warn', message: '第1轮: 工具返回空结果' },
        { node: 'think', type: 'info', message: '第2轮: LLM 调整查询 → 请求 file_search' },
        { node: 'route', type: 'decision', message: '第2轮: → act' },
        { node: 'act', type: 'info', message: '第2轮: file_search → 仍未找到' },
        { node: 'observe', type: 'warn', message: '第2轮: 工具返回空结果' },
        { node: 'think', type: 'info', message: '第3轮: LLM 再次调整 → 请求 file_search' },
        { node: 'route', type: 'decision', message: '第3轮: → END（maxTurns 截断）' },
        { node: 'END', type: 'exit', message: 'maxTurns=3 强制终止，输出终止信息' },
      ],
    },
    5: {
      turnCount: 2, messageCount: 6, duration: '280ms',
      output: '已记住你的偏好：喜欢蓝色。下次对话我将记住这个信息。',
      actualPath: ['START', 'think', 'route', 'END', 'START', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '段1: 会话初始化 (thread_id=abc123)' },
        { node: 'think', type: 'info', message: '段1: LLM 分析 "记住我喜欢蓝色" → 存储偏好' },
        { node: 'route', type: 'decision', message: '段1: → END，checkpoint 已保存' },
        { node: 'END', type: 'exit', message: '段1 完成，checkpoint 保存至 .langgraph/checkpoints/' },
        { node: 'START', type: 'enter', message: '段2: 从 checkpoint abc123 恢复' },
        { node: 'think', type: 'info', message: '段2: LLM 从上下文中读取到偏好 "喜欢蓝色"' },
        { node: 'route', type: 'decision', message: '段2: → END' },
        { node: 'END', type: 'exit', message: '段2 完成，偏好成功恢复' },
      ],
    },
    7: {
      turnCount: 1, messageCount: 5, duration: '310ms',
      output: '根据历史讨论 (200+ 条消息已压缩为摘要)，当前进度：已完成模块 A、B 的代码编写，待完成模块 C 的测试。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话含 200+ 条历史消息' },
        { node: 'think', type: 'info', message: 'MemoryManager 触发压缩: 200 条 → 摘要 (约 1KB)' },
        { node: 'route', type: 'decision', message: '→ act（调用摘要工具）' },
        { node: 'act', type: 'info', message: '执行摘要压缩: context_compress → 成功' },
        { node: 'observe', type: 'info', message: '摘要: "用户正在开发 EasyAgent，已完成模块 A/B，下一步模块 C 测试"' },
        { node: 'think', type: 'info', message: 'LLM 基于摘要生成回复' },
        { node: 'route', type: 'decision', message: '→ END' },
        { node: 'END', type: 'exit', message: '执行完成，摘要压缩节省 95% token' },
      ],
    },
    8: {
      turnCount: 2, messageCount: 8, duration: '450ms',
      output: '北京今天晴转多云，气温 18°C-28°C。第一次调用失败（参数格式错误），自动修正后成功。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: '第1轮: LLM 调用 weather_query (参数格式不标准)' },
        { node: 'route', type: 'decision', message: '第1轮: → act' },
        { node: 'act', type: 'error', message: '第1轮: weather_query 执行失败 → 参数格式错误' },
        { node: 'observe', type: 'warn', message: '第1轮: 检测到工具执行失败，返回错误信息给 LLM' },
        { node: 'think', type: 'info', message: '第2轮: LLM 分析错误 → 自动修正参数格式 → 重试' },
        { node: 'route', type: 'decision', message: '第2轮: → act（重试）' },
        { node: 'act', type: 'info', message: '第2轮: weather_query({ location: "北京" }) → 成功' },
        { node: 'observe', type: 'info', message: '第2轮: 观察结果 — 北京 18-28°C, 晴转多云' },
        { node: 'think', type: 'info', message: '第2轮: LLM 基于正确结果生成回复' },
        { node: 'route', type: 'decision', message: '第2轮: → END' },
        { node: 'END', type: 'exit', message: '执行完成，1 次重试后成功' },
      ],
    },
    9: {
      turnCount: 2, messageCount: 8, duration: '390ms',
      output: '用户数据分析完成：共 12 个字段，3 个异常值（已标记），建议执行数据清洗后再使用。',
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
      logs: [
        { node: 'START', type: 'enter', message: '会话已初始化' },
        { node: 'think', type: 'info', message: '第1轮: LLM 识别 → 需先读取文件 → read_file' },
        { node: 'route', type: 'decision', message: '第1轮: → act' },
        { node: 'act', type: 'info', message: '第1轮: read_file("user_data.csv") → 12列 × 1000行, 200KB' },
        { node: 'observe', type: 'info', message: '第1轮: 文件读取完成，含 12 字段描述' },
        { node: 'think', type: 'info', message: '第2轮: LLM 分析 → 需分析数据 → analyze_data' },
        { node: 'route', type: 'decision', message: '第2轮: → act' },
        { node: 'act', type: 'info', message: '第2轮: analyze_data → 发现 3 个异常值 (索引: 42, 128, 567)' },
        { node: 'observe', type: 'info', message: '第2轮: 分析结果 — 3个异常值, 均值/方差正常' },
        { node: 'think', type: 'info', message: '第2轮: LLM 综合 A 输出 + B 结果 → 生成最终回复' },
        { node: 'route', type: 'decision', message: '第2轮: → END' },
        { node: 'END', type: 'exit', message: '链式调用完成: read_file → analyze_data' },
      ],
    },
  };

  /**
   * 执行 LangGraph 场景
   * POST /api/run/:id
   * 返回场景的预设执行结果（含详细日志）
   * Phase D: 执行期间通过 WebSocket 广播节点高亮动画
   */
  app.post('/api/run/:id', async (req, res) => {
    try {
      const scenarioId = parseInt(req.params.id, 10);
      const result = SCENARIO_RESULTS[scenarioId];

      if (!result) {
        return res.status(404).json({ error: `场景 ${scenarioId} 不存在` });
      }

      if (currentEngine !== 'langgraph') {
        // non-langgraph 模式下仍然返回预设数据，方便前端演示
        logger.info({ scenarioId }, 'Legacy引擎下返回预设场景结果');
      }

      // Phase D: 模拟节点遍历广播（通过 WebSocket 发送 langgraph_node 消息）
      if (result.actualPath && result.actualPath.length > 0) {
        for (let i = 0; i < result.actualPath.length; i++) {
          const nodeId = result.actualPath[i];
          const logEntry = result.logs?.[i];
          broadcastLangGraphNode(nodeId, logEntry?.type || 'executing');
          // 模拟动画间隔（200ms，与前端一致）
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      res.json(result);
    } catch (error) {
      logger.error({ err: error }, '场景执行失败');
      res.status(500).json({ error: (error as Error).message || '场景执行失败' });
    }
  });

  // ========== LangGraph Demo 服务管理 API ==========

  /** Demo 进程引用 */
  let demoProcess: ChildProcess | null = null;
  /** Demo 服务是否就绪 */
  let demoReady = false;

  /**
   * 获取 Demo 服务状态
   * GET /api/demo/status
   * 返回 demo 是否在运行 + 输出日志
   */
  app.get('/api/demo/status', (_req, res) => {
    res.json({
      running: demoProcess !== null && !demoProcess.killed,
      ready: demoReady,
      port: demoReady ? 3455 : null,
    });
  });

  /**
   * 一键启动 LangGraph Demo 服务
   * POST /api/demo/start
   * 在后台启动 start-demo.bat --web，实时广播终端输出到 WebSocket
   */
  app.post('/api/demo/start', async (_req, res) => {
    try {
      // 检查是否已运行
      if (demoProcess && !demoProcess.killed) {
        // 检查端口是否已就绪
        if (demoReady) {
          return res.json({ success: true, message: 'Demo 服务已在运行 (端口 3455)', port: 3455 });
        }
        return res.json({ success: true, message: 'Demo 服务正在启动中...', port: null });
      }

      // 构建启动命令
      const projectRoot = resolve(__dirname, '..', '..', '..');
      const demoDir = join(projectRoot, 'packages', 'langgraph');
      const batchFile = join(demoDir, 'start-demo.bat');

      // 广播启动开始
      broadcastDemoOutput('▶ 正在启动 LangGraph Demo 服务...\n');
      broadcastDemoOutput(`  工作目录: ${demoDir}\n`);
      broadcastDemoOutput(`  启动脚本: start-demo.bat --web\n\n`);

      // 使用 cmd.exe 启动 bat 文件
      demoReady = false;
      demoProcess = spawn('cmd.exe', ['/c', 'start-demo.bat', '--web'], {
        cwd: demoDir,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      let startTime = Date.now();
      const STARTUP_TIMEOUT = 30000; // 30 秒超时

      // 捕获 stdout
      if (demoProcess.stdout) {
        demoProcess.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          broadcastDemoOutput(text, 'stdout');

          // 检测就绪信号 — 匹配 "listening on" / "started" / "ready" 等关键词
          if (!demoReady && /listening|started|ready|running|http.*3455|服务器已启动/i.test(text)) {
            demoReady = true;
            broadcastDemoOutput('\n✅ Demo 服务就绪 → http://localhost:3455\n', 'ready');
          }
        });
      }

      // 捕获 stderr
      if (demoProcess.stderr) {
        demoProcess.stderr.on('data', (data: Buffer) => {
          broadcastDemoOutput(data.toString(), 'stderr');
        });
      }

      // 进程退出处理
      demoProcess.on('close', (code) => {
        broadcastDemoOutput(`\n⚠️ Demo 进程退出 (退出码: ${code})\n`, 'exit');
        demoProcess = null;
        demoReady = false;
      });

      demoProcess.on('error', (err) => {
        broadcastDemoOutput(`\n❌ Demo 进程错误: ${err.message}\n`, 'error');
        demoProcess = null;
        demoReady = false;
      });

      // 超时检查
      const timeoutCheck = setInterval(() => {
        if (demoReady) {
          clearInterval(timeoutCheck);
          return;
        }
        if (Date.now() - startTime > STARTUP_TIMEOUT) {
          clearInterval(timeoutCheck);
          broadcastDemoOutput('\n⚠️ 启动超时 (30s) — 请检查终端是否有错误输出\n', 'warn');
        }
      }, 1000);

      res.json({ success: true, message: '正在启动 Demo 服务...', port: null });
    } catch (error) {
      logger.error({ err: error }, '启动 Demo 服务失败');
      res.status(500).json({ error: (error as Error).message || '启动 Demo 失败' });
    }
  });

  /**
   * 停止 Demo 服务
   * POST /api/demo/stop
   */
  app.post('/api/demo/stop', (_req, res) => {
    if (demoProcess && !demoProcess.killed) {
      broadcastDemoOutput('\n⏹️ 正在停止 Demo 服务...\n', 'info');
      demoProcess.kill('SIGTERM');
      // 强制杀进程树
      setTimeout(() => {
        if (demoProcess && !demoProcess.killed) {
          demoProcess.kill('SIGKILL');
        }
      }, 3000);
      demoProcess = null;
      demoReady = false;
      res.json({ success: true, message: 'Demo 服务已停止' });
    } else {
      res.json({ success: true, message: 'Demo 服务未运行' });
    }
  });

  /**
   * 广播 Demo 终端输出到所有 WebSocket 客户端
   * @param text - 终端文本
   * @param level - 日志级别
   */
  function broadcastDemoOutput(text: string, level: string = 'stdout'): void {
    const payload = JSON.stringify({
      type: 'demo_output',
      text,
      level,
      timestamp: Date.now(),
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // ========== 插件与技能 API ==========
  // 【P1-1 拆分】插件(4) + 市场(8) + 技能(6) + 工具(2) 共 20 条路由已迁至 routes/plugins.ts
  // （连同自定义技能磁盘存储与 getAllSkillsWithStatus）。
  // ⚠️ marketService 是全局单例：WebSocket 段（下方）也持同一实例广播安装进度；
  //    两个「安装后自动 load / 卸载时自动 unload」回调在模块内注册，不可遗漏。
  const marketService = getPluginMarketService(pluginsDir);
  registerPluginRoutes(app, { pluginManager, toolRegistry, configManager, pluginsDir, marketService });

  // ========== IM 适配器管理 API ==========
  // 【P1-1 拆分】7 条路由的实现已迁至 routes/im.ts，此处仅做注册。
  // ⚠️ /api/im/config 的 GET 在模块内做了敏感字段脱敏。
  registerIMRoutes(app, { imManager });

  // ========== Docker 沙箱 API 🆕 ==========
  // 【P1-1 拆分】6 条路由的实现已迁至 routes/sandbox.ts（含管理器单例创建与异步 init）。
  registerSandboxRoutes(app);

  // ========== 语义分析 API 🆕 ==========
  // 【P1-1 拆分】5 条路由的实现已迁至 routes/semantic.ts。
  // ⚠️ projectRoot 必须传入：/api/semantic/file 的路径越界检查以此为基准。
  registerSemanticRoutes(app, { projectRoot: PROJECT_ROOT });

  // ========== 文件浏览 API ==========
  // 【P1-1 拆分】实现已迁至 routes/files.ts。
  // ⚠️ projectRoot 必须传入：/api/files/browse 的路径越界检查以此为基准。
  registerFilesRoutes(app, { projectRoot: PROJECT_ROOT });

  // ========== 知识库 API（支持 project/global 双作用域） ==========
  // 【P1-1 拆分】8 条路由的实现已迁至 routes/knowledge.ts，此处仅做注册。
  // ⚠️ 注册顺序在模块内部保持不变（/stats/summary 必须先于 /:id）。
  registerKnowledgeRoutes(app, {
    resolveKnowledgeService,
    projectKnowledgeService: knowledgeService,
    globalKnowledgeService,
    upload,
  });

  // ========== 自动化任务 API ==========
  // 【P1-1 拆分】8 条路由的实现已迁至 routes/automations.ts，此处仅做注册。
  registerAutomationRoutes(app, { automationManager });

  // ========== 静态文件服务 (Web Dashboard + 文档浏览器) ==========
  // 【P1-1 拆分】实现已迁至 routes/staticFiles.ts。
  // ⚠️ 必须在**所有 API 路由之后**注册：模块内含 /api/* 的 404 兜底与 SPA fallback，
  //    顺序错误会让未匹配的 API 请求返回 200 + index.html（前端把 HTML 当 JSON 解析，报错难定位）。
  registerStaticRoutes(app, {
    serverDir: __dirname,
    docViewerFallbackDir: resolveDocViewerFallbackDir(__dirname),
  });



  // （文档浏览器与 Web Dashboard 静态文件已在 registerStaticRoutes 中注册）

  // ========== WebSocket (增强协议) ==========

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  /** 订阅自动化进度推送的客户端集合 */
  const automationSubscriptions = new Set<WebSocket>();
  /** 订阅 LangGraph 节点状态推送的客户端集合（Phase D 实时高亮） */
  const langgraphSubscriptions = new Set<WebSocket>();
  /** 每个连接的 AbortController，用于中断正在运行的 Agent */
  const wsAbortControllers = new WeakMap<WebSocket, AbortController>();

  /**
   * 安全发送 WebSocket 消息，避免在连接关闭时抛错
   */
  function safeSend(ws: WebSocket, data: Record<string, unknown>): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
      logger.warn({ readyState: ws.readyState, type: data.type }, 'WebSocket 未就绪，跳过发送');
      return false;
    }
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error({ error, type: data.type }, 'WebSocket 发送失败');
      return false;
    }
  }

  /**
   * 向所有订阅自动化的客户端广播任务进度事件
   */
  function broadcastAutomationProgress(event: {
    taskId: string;
    taskName: string;
    type: 'agent_start' | 'agent_turn' | 'tool_call' | 'tool_result' | 'agent_done' | 'agent_error';
    message: string;
    detail?: string;
  }): void {
    const payload = {
      type: 'automation_progress',
      ...event,
      timestamp: Date.now(),
    };
    for (const ws of automationSubscriptions) {
      safeSend(ws, payload);
    }
  }

  /**
   * 向所有订阅 LangGraph 节点的客户端广播节点状态变化（Phase D 实时高亮）
   *
   * @param nodeId - 当前活跃的 LangGraph 节点 ID（如 think/route/act 等）
   * @param status - 节点状态描述
   */
  function broadcastLangGraphNode(nodeId: string, status?: string): void {
    const payload = {
      type: 'langgraph_node',
      nodeId,
      status: status || 'executing',
      timestamp: Date.now(),
    };
    for (const ws of langgraphSubscriptions) {
      safeSend(ws, payload);
    }
  }

  /**
   * 广播插件安装进度到所有 WebSocket 客户端
   *
   * @param job - 安装任务信息
   */
  function broadcastPluginInstallProgress(job: InstallJob): void {
    const payload = JSON.stringify({
      type: 'plugin:install:progress',
      jobId: job.jobId,
      pluginId: job.pluginId,
      progress: job.progress,
      status: job.status,
      message: job.error || undefined,
      timestamp: Date.now(),
    });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  // 注册插件安装进度回调
  marketService.onProgress((job) => {
    broadcastPluginInstallProgress(job);
  });

  wss.on('connection', (ws: WebSocket, req) => {
    // WebSocket 认证
    //
    // 【2026-09-18 安全加固】原实现仅在设置了 EASYAGENT_WS_TOKEN 时才校验
    // （`if (serverToken && ...)`）—— 未设置环境变量即等于**完全不校验**，
    // 且与 REST 侧令牌各管一套。现改为与 REST 共用同一策略：
    //   · 回环地址（Desktop / 本地）→ 免鉴权
    //   · 非回环 → 必须命中 EASYAGENT_API_TOKEN 或（兼容旧配置）EASYAGENT_WS_TOKEN
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const reqToken =
      url.searchParams.get('token') || (req.headers['x-auth-token'] as string | undefined) || null;
    const wsPeer = req.socket.remoteAddress || undefined;
    const wsNeedsAuth = !isLoopbackAddress(wsPeer);

    if (wsNeedsAuth) {
      const accepted = [SECURITY_CONFIG.token, process.env.EASYAGENT_WS_TOKEN].filter(
        (t): t is string => !!t,
      );
      const passed = !!reqToken && accepted.some((t) => safeTokenEqual(reqToken, t));
      if (!passed) {
        logger.warn({ ip: wsPeer, hasToken: !!reqToken }, 'WebSocket 认证失败');
        safeSend(ws, { type: 'error', error: '认证失败' });
        ws.close(4001, 'Unauthorized');
        return;
      }
    }
    logger.info({ ip: wsPeer, authRequired: wsNeedsAuth }, 'WebSocket 客户端已连接');

    // 发送连接确认
    safeSend(ws, { type: 'connected', timestamp: Date.now() });

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        const { type } = msg;

        switch (type) {
          /** 订阅会话 */
          case 'subscribe': {
            const sessionId = msg.sessionId || 'web_default';
            wsSubscriptions.set(ws, sessionId);
            logger.info({ sessionId }, '客户端订阅会话');
            break;
          }

          /** 发送聊天消息 */
          case 'chat': {
            const { message, sessionId, model, provider } = msg;
            if (!message) {
              safeSend(ws, { type: 'error', message: '缺少消息内容' });
              return;
            }

            const sid = sessionId || wsSubscriptions.get(ws) || `ws_${Date.now()}`;

            // 获取提供商配置
            let providerConfig;
            if (provider && model) {
              // 使用客户端指定的模型
              providerConfig = configManager.getProvider(
                provider as Parameters<typeof configManager.getProvider>[0],
              );
            }
            if (!providerConfig) {
              providerConfig = configManager.getCurrentProvider();
            }
            if (!providerConfig) {
              safeSend(ws, { type: 'error', message: '未配置模型提供商' });
              return;
            }

            const selectedModel = model || config.currentModel.model;

            // 创建 Agent 实例
            const agent = await newAgent(providerConfig, {
              model: selectedModel,
              provider: provider || config.currentModel.provider,
            });

            // 监听 Agent 事件并转发
            agent.onEvent((event) => {
              // Phase D: 如果是 LangGraph thinking 事件，广播节点状态
              if (event.type === 'turn_start' && event.data) {
                const nodeId = (event.data as { node?: string }).node;
                if (nodeId) {
                  broadcastLangGraphNode(nodeId, 'executing');
                }
              }

              switch (event.type) {
                case 'tool_start': {
                  safeSend(ws, {
                    type: 'tool_use',
                    toolCallId: event.toolCallId || `tool_${Date.now()}`,
                    toolName: event.toolName || 'unknown',
                    input: event.input || {},
                  });
                  break;
                }

                case 'tool_result': {
                  const toolResultData = event.data as { toolCallId?: string; name?: string; output?: string } | undefined;
                  safeSend(ws, {
                    type: 'tool_result',
                    toolCallId: toolResultData?.toolCallId,
                    output: toolResultData?.output || '',
                    error: event.error || null,
                  });

                  // 文档浏览器工具执行成功后，通知前端打开右侧面板
                  if (toolResultData?.name === 'open-doc-viewer' && !event.error) {
                    const panelUrl = `http://localhost:${PORT}/doc-viewer/`;
                    safeSend(ws, {
                      type: 'open_panel',
                      panelType: 'doc-viewer',
                      url: panelUrl,
                      title: '文档浏览器',
                    });
                    logger.info({ url: panelUrl }, '通知前端打开文档浏览器面板');
                  }
                  break;
                }

                case 'token_usage': {
                  safeSend(ws, {
                    type: 'token_usage',
                    usage: event.usage,
                  });
                  break;
                }

                case 'done': {
                  safeSend(ws, {
                    type: 'done',
                    sessionId: sid,
                  });
                  break;
                }

                case 'error': {
                  safeSend(ws, {
                    type: 'error',
                    message: event.message || '未知错误',
                  });
                  break;
                }
              }
            });

            logger.info({ sid, provider, model: selectedModel }, '开始执行 Agent.run');

            // 运行 Agent
            try {
              let fullResponse = '';
              let chunkCount = 0;

              // 创建 AbortController 用于支持 stop 消息
              const abortController = new AbortController();
              wsAbortControllers.set(ws, abortController);

              const startTime = Date.now();
              let fullReasoning = '';

              await agent.run(message, {
                sessionId: sid,
                signal: abortController.signal,
                onPartialResponse: (text: string) => {
                  fullResponse += text;
                  chunkCount++;
                  safeSend(ws, {
                    type: 'text_delta',
                    delta: text,
                  });
                },
                // 思考过程（推理模型的思维链）单独转发
                //
                // 为什么不并入 text_delta：思维链是模型的自我推导，混进正文会让用户
                // 看到大段"让我想想…不对，应该是…"；但直接丢弃又会导致思考期间界面
                // 完全空白、看起来像卡死。因此用独立消息类型上抛，由前端分栏展示。
                onReasoning: (text: string) => {
                  fullReasoning += text;
                  safeSend(ws, {
                    type: 'reasoning_delta',
                    delta: text,
                  });
                },
              });

              const durationMs = Date.now() - startTime;

              // 发送本轮 Token 用量（兼容 legacy / LangGraph 两种引擎）
              try {
                const usage = await agent.getTokenUsage();
                safeSend(ws, {
                  type: 'token_usage',
                  usage: {
                    input: usage?.inputTokens || 0,
                    output: usage?.outputTokens || 0,
                    total: usage?.totalTokens || 0,
                  },
                });
              } catch (usageErr) {
                logger.warn({ sid, error: (usageErr as Error).message }, '获取 Token 用量失败');
              }

              logger.info(
                {
                  sid,
                  chunkCount,
                  responseLen: fullResponse.length,
                  reasoningLen: fullReasoning.length,
                  durationMs,
                },
                'Agent 执行完成',
              );
              // 发送完成信号，附带本轮耗时
              safeSend(ws, {
                type: 'text_done',
                sessionId: sid,
                duration: durationMs,
              });
            } catch (error) {
              logger.error({ sid, error: (error as Error).message }, 'Agent 执行失败');
              safeSend(ws, {
                type: 'error',
                message: (error as Error).message,
              });
            }
            break;
          }

          /** 停止生成 */
          case 'stop': {
            const sid = msg.sessionId || wsSubscriptions.get(ws);
            logger.info({ sessionId: sid }, '客户端请求停止生成');
            // 通过 AbortController 中断正在运行的 Agent
            const ctrl = wsAbortControllers.get(ws);
            if (ctrl) {
              ctrl.abort();
              wsAbortControllers.delete(ws);
            }
            safeSend(ws, { type: 'done', sessionId: sid });
            break;
          }

          /** 切换模型 */
          case 'switch_model': {
            const { provider: newProvider, model: newModel } = msg;
            configManager.switchModel(newProvider, newModel);
            configManager.save().catch((e) => logger.error({ error: e }, '保存模型配置失败'));
            safeSend(ws, { type: 'model_switched', provider: newProvider, model: newModel });
            break;
          }

          /** 订阅自动化任务进度 */
          case 'subscribe_automation': {
            automationSubscriptions.add(ws);
            safeSend(ws, { type: 'automation_subscribed', message: '已订阅自动化任务进度' });
            logger.info('客户端订阅自动化进度');
            break;
          }

          /** 取消订阅自动化任务进度 */
          case 'unsubscribe_automation': {
            automationSubscriptions.delete(ws);
            logger.info('客户端取消订阅自动化进度');
            break;
          }

          /** 订阅 LangGraph 节点状态推送（Phase D 实时高亮） */
          case 'subscribe_langgraph': {
            langgraphSubscriptions.add(ws);
            safeSend(ws, { type: 'langgraph_subscribed', message: '已订阅 LangGraph 节点状态' });
            logger.info('客户端订阅 LangGraph 节点状态');
            break;
          }

          /** 取消订阅 LangGraph 节点状态推送 */
          case 'unsubscribe_langgraph': {
            langgraphSubscriptions.delete(ws);
            logger.info('客户端取消订阅 LangGraph 节点状态');
            break;
          }

          default:
            safeSend(ws, { type: 'error', message: `未知消息类型: ${type}` });
        }
      } catch (error) {
        logger.error({ error: (error as Error).message }, 'WebSocket 消息处理异常');
        safeSend(ws, { type: 'error', message: `消息解析失败: ${(error as Error).message}` });
      }
    });

    ws.on('close', () => {
      logger.info('WebSocket 客户端已断开');
      wsSubscriptions.delete(ws);
      automationSubscriptions.delete(ws);
      langgraphSubscriptions.delete(ws);
      wsAbortControllers.delete(ws);
    });

    ws.on('error', (err) => {
      logger.error({ error: err.message }, 'WebSocket 错误');
      wsSubscriptions.delete(ws);
      automationSubscriptions.delete(ws);
      langgraphSubscriptions.delete(ws);
      wsAbortControllers.delete(ws);
    });
  });

  // 返回服务对象（不启动监听）
  return {
    app,
    server,
    wss,
    configManager,
    sessionManager,
    toolRegistry,
    pluginManager,
    imManager,
    knowledgeService,
    automationManager,
    /** 应用版本号（由 version.json 读取，供启动横幅等场景复用，避免硬编码） */
    appVersion: APP_VERSION,
  };
}

// ========== 入口：直接运行时启动服务 ==========
const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('\\index.ts') ||
  process.argv[1]?.endsWith('/index.ts');

if (isMainModule) {
  // 启动前安全自检：非回环监听且无令牌 → 直接拒绝启动（fail-fast）
  // 宁可起不来，也不能悄悄把 API Key / 文件系统暴露到公网。
  try {
    assertSecurityOk(HOST, SECURITY_CONFIG);
  } catch (err) {
    console.error(`\n[安全自检失败] ${(err as Error).message}\n`);
    process.exit(1);
  }

  createApp()
    .then(({ server, sessionManager, wss, automationManager, appVersion }) => {
      // 启动服务器
      server.listen(PORT, HOST, () => {
        logger.info(
          `EasyAgent Server v${appVersion} 已启动\n` +
            `  HTTP:      http://${HOST}:${PORT}\n` +
            `  WebSocket: ws://${HOST}:${PORT}/ws\n` +
            `  安全策略:  ${describeSecurityConfig(HOST, SECURITY_CONFIG)}\n` +
            // 显式打印日志文件路径：使用者不必猜测"日志到底写到哪里去了"
            `  日志文件:  ${describeLogTarget()}`,
        );
      });

      // 优雅关闭
      const shutdown = () => {
        logger.info('正在关闭服务器...');
        automationManager.shutdown();
        sessionManager.close();
        wss.close();
        server.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error('服务器启动失败:', error);
      process.exit(1);
    });
}
