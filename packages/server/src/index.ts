/**
 * EasyAgent Web服务端 v2.0
 * 提供REST API + 增强 WebSocket (支持流式、工具调用、会话管理)
 */
import express from 'express';
import { WebSocket } from 'ws';
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import multer from 'multer';

/** ESM 兼容: 模拟 CommonJS 的 __dirname */
const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  ConfigManager,
  SessionManager,
  ToolRegistry,
  getAllBuiltinTools,
  getModelRegistry,
  getPluginManager,
  KnowledgeService,
  logger,
  describeLogTarget,
} from '@easyagent/core';

// ========== 插件市场服务 ==========
import { getPluginMarketService } from './services/PluginMarketService.js';

// ========== API 安全中间件（鉴权 + 限流 + 绑定地址策略）==========
import {
  DEFAULT_BIND_HOST,
  assertSecurityOk,
  describeSecurityConfig,
  resolveSecurityConfig,
} from './middleware/apiSecurity.js';

// ========== 全局错误处理（P1-6）==========
import { errorHandler } from './middleware/errorHandler.js';

// ========== 初始化引导（P1-1 第六批拆分产物）==========
// 管理器初始化与中间件栈的实现已迁至 bootstrap.ts / middleware/securityStack.ts，
// index.ts 仅负责编排。
import {
  createAutomationSystem,
  createIMManagerFor,
  createWsHub,
  initModelRegistryBackground,
} from './bootstrap.js';
import { applySecurityMiddleware } from './middleware/securityStack.js';

// ========== 路由模块（P1-1 拆分产物）==========
// 每个 register* 负责一组路由的注册；依赖通过显式对象注入，不依赖闭包。
import {
  registerAutomationRoutes,
  registerConfigRoutes,
  registerFilesRoutes,
  registerIMRoutes,
  registerLangGraphRoutes,
  registerKnowledgeRoutes,
  registerPluginRoutes,
  registerSandboxRoutes,
  registerSemanticRoutes,
  registerSessionRoutes,
  registerStaticRoutes,
  registerSystemRoutes,
  resolveDocViewerFallbackDir,
  setupWebSocket,
} from './routes/index.js';

// ========== LangGraph 引擎集成 (Phase B) ==========
import { createAgent, parseCliEngineArg, resolveEngineSource } from './langgraph/index.js';
import type { EngineType, EngineSource } from './langgraph/index.js';

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
  // 启动时后台更新模型目录（不阻塞服务启动）——实现见 bootstrap.ts
  const modelRegistry = getModelRegistry();
  initModelRegistryBackground(modelRegistry);

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

  // 初始化自动化任务管理器（含执行器与生命周期事件广播）——实现见 bootstrap.ts
  // ⚠️ wsHub 必须先于自动化系统创建：执行器依赖其中的 broadcastAutomationProgress
  const {
    wsSubscriptions,
    automationSubscriptions,
    langgraphSubscriptions,
    wsAbortControllers,
    safeSend,
    broadcastAutomationProgress,
    broadcastLangGraphNode,
  } = createWsHub();

  const automationManager = createAutomationSystem({
    config,
    configManager,
    newAgent,
    broadcastAutomationProgress,
  });

  // 初始化会话管理器
  const sessionManager = new SessionManager();

  // 初始化 IM 适配器管理器（消息处理逻辑见 bootstrap.ts）
  const imManager = createIMManagerFor({ configManager, config, newAgent });

  // Express应用
  const app = express();

  // 安全中间件栈（同源预判定 → CORS → trust proxy → 限流 → json → 安全头 → 鉴权）
  // 顺序是安全契约，实现见 bootstrap.ts；必须先于所有 register*Routes 调用。
  applySecurityMiddleware(app, SECURITY_CONFIG);

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

  // WebSocket 订阅集合 / safeSend / 广播函数已由上方 createWsHub() 创建（见 bootstrap.ts）；
  // system 路由（open-panel）、automation 执行器、langgraph 路由与 WebSocket 段共享同一实例。


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
  // 【P1-1 拆分】会话(5) + 同步聊天(1) 已迁至 routes/sessions.ts。
  registerSessionRoutes(app, { sessionManager, configManager, config, newAgent });

  // ========== LangGraph 路由 ==========
  // 【P1-1 拆分】engine-type(1) + checkpoint(3) + 场景执行(1) + Demo 管理(3)
  // 共 8 条路由已迁至 routes/langgraph.ts（连同 SCENARIO_RESULTS 与 demo 进程状态）。
  // ⚠️ broadcastDemoOutput 保留在本文件（依赖 wss，函数声明有提升，此处传引用安全）。
  registerLangGraphRoutes(app, {
    currentEngine,
    configManager,
    newAgent,
    serverDir: __dirname,
    broadcastLangGraphNode,
    broadcastDemoOutput,
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

  // ========== 全局错误处理（P1-6）==========
  // ⚠️ 必须在**所有路由与静态托管之后**注册：Express 错误中间件只捕获其之前
  //    注册的路由抛出的错误。/api/* 统一返回 { success:false, error:{ code, message } }，
  //    错误堆栈只进日志不进响应体。详见 middleware/errorHandler.ts。
  app.use(errorHandler);



  // （文档浏览器与 Web Dashboard 静态文件已在 registerStaticRoutes 中注册）

  // ========== WebSocket (增强协议) ==========
  // 【P1-1 拆分】server/wss 创建与连接协议处理已迁至 routes/websocket.ts（setupWebSocket）。
  // 订阅集合 / safeSend / broadcastAutomationProgress / broadcastLangGraphNode
  // 定义在上方（多处共享），注入同一实例；broadcastDemoOutput 同理（依赖 wss）。
  const { server, wss } = setupWebSocket({
    app,
    configManager,
    config,
    newAgent,
    marketService,
    port: PORT,
    securityToken: SECURITY_CONFIG.token,
    wsSubscriptions,
    automationSubscriptions,
    langgraphSubscriptions,
    wsAbortControllers,
    safeSend,
    broadcastLangGraphNode,
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
