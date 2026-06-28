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
  readdirSync,
  statSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
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
  BUILTIN_SKILLS,
  getSkillByName,
  IMManager,
  SandboxManager,
  checkDockerAvailability,
  buildSemanticMap,
  searchSymbol,
  findReferences,
  getCodebaseOverview,
  analyzeFile,
  resetSemanticCache,
  KnowledgeService,
  AutomationManager,
  logger,
} from '@easyagent/core';
import type { AnyIMConfig, IMPlatform, IMMessage } from '@easyagent/core';

/** 仪表盘默认模板列表 */
const DEFAULT_TEMPLATES = [
  {
    id: 'code',
    label: '代码生成',
    desc: '根据需求生成高质量代码',
    icon: 'Code2',
    prompt: '请帮我写一段代码：',
  },
  {
    id: 'doc',
    label: '文档写作',
    desc: '撰写技术文档与报告',
    icon: 'FileText',
    prompt: '请帮我写一份文档：',
  },
  {
    id: 'research',
    label: '深度研究',
    desc: '多源信息综合分析',
    icon: 'Search',
    prompt: '请帮我深入分析：',
  },
  {
    id: 'data',
    label: '数据分析',
    desc: '解析数据生成洞察',
    icon: 'BarChart3',
    prompt: '请帮我分析以下数据：',
  },
  {
    id: 'creative',
    label: '创意设计',
    desc: '头脑风暴与创意产出',
    icon: 'Palette',
    prompt: '请帮我想一些创意方案：',
  },
  {
    id: 'debug',
    label: '代码调试',
    desc: '定位与修复 BUG',
    icon: 'Bug',
    prompt: '请帮我调试这段代码：',
  },
];

// ===================== 自定义技能存储 =====================

/** 自定义技能接口 */
interface CustomSkill {
  name: string;
  description: string;
  prompt?: string;
  tags?: string[];
  requiresConfirm?: boolean;
}

/** 从磁盘加载自定义技能 */
function loadCustomSkills(): CustomSkill[] {
  try {
    if (!existsSync(CUSTOM_SKILLS_PATH)) return [];
    const raw = readFileSync(CUSTOM_SKILLS_PATH, 'utf-8');
    return JSON.parse(raw) || [];
  } catch (err) {
    logger.warn('加载自定义技能失败，返回空列表');
    return [];
  }
}

/** 保存自定义技能到磁盘 */
function saveCustomSkills(skills: CustomSkill[]): void {
  if (!existsSync(CUSTOM_SKILLS_DIR)) {
    mkdirSync(CUSTOM_SKILLS_DIR, { recursive: true });
  }
  writeFileSync(CUSTOM_SKILLS_PATH, JSON.stringify(skills, null, 2), 'utf-8');
}

const PORT = parseInt(process.env.PORT || '3456', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * 将 Ollama 模型标签名格式化为可读名称
 * 例如 qwen3.5:9b → Qwen 3.5 9B
 */
function formatOllamaModelName(tag: string): string {
  return tag
    .replace(/^([a-zA-Z]+)(\d)/, '$1 $2') // qwen3 → Qwen 3
    .replace(/(\d)\.(\d)/, '$1.$2') // 保留小数点
    .replace(/:(\d+)b$/i, ' $1B') // :9b → 9B
    .replace(/\b\w/g, (c) => c.toUpperCase()); // 首字母大写
}

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
  modelRegistry.initialize().catch((err) => {
    logger.warn({ error: (err as Error).message }, '模型目录初始化失败');
  });

  // 初始化配置
  const configManager = new ConfigManager();
  const config = await configManager.load();

  // 初始化工具注册表
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerAll(getAllBuiltinTools());
  // 从持久化配置加载已禁用的工具列表
  const disabledToolNames = configManager.getDisabledToolNames();
  if (disabledToolNames.length > 0) {
    toolRegistry.setDisabledNames(disabledToolNames);
    logger.info({ count: disabledToolNames.length }, '已加载禁用的工具列表');
  }

  // 初始化插件管理器 (关联 ToolRegistry)
  const pluginManager = getPluginManager({
    userPluginsDir: join(process.cwd(), '.easyagent', 'plugins'),
  });
  pluginManager.setToolRegistry(toolRegistry);
  // 异步初始化插件（不阻塞服务启动）
  pluginManager.initialize().catch((e) => {
    logger.error({ error: (e as Error).message }, '插件初始化失败');
  });

  /** 合并所有可用技能并标记激活状态 */
  function getAllSkillsWithStatus(): Array<{
    name: string;
    description: string;
    prompt?: string;
    tags?: string[];
    requiresConfirm?: boolean;
    source: 'builtin' | 'plugin' | 'custom';
    activated: boolean;
  }> {
    const custom = loadCustomSkills();
    const activeNames = pluginManager.getActiveSkillNames();

    function getSkillWithStatus<
      T extends {
        name: string;
        description: string;
        prompt?: string;
        tags?: string[];
        requiresConfirm?: boolean;
      },
    >(skill: T, source: 'builtin' | 'plugin' | 'custom') {
      return {
        name: skill.name,
        description: skill.description,
        prompt: skill.prompt,
        tags: skill.tags,
        requiresConfirm: skill.requiresConfirm,
        source,
        activated: activeNames.includes(skill.name),
      };
    }

    return [
      ...BUILTIN_SKILLS.map((s) => getSkillWithStatus(s, 'builtin')),
      ...pluginManager.getSkills().map((s) => getSkillWithStatus(s, 'plugin')),
      ...custom.map((s) => getSkillWithStatus(s, 'custom')),
    ];
  }

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

    const agent = new AgentEngine(providerConfig, toolRegistry, sessionManager, {
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

      const usage = agent.getTokenUsage();
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
      const agent = new AgentEngine(providerConfig, toolRegistry, sessionManager, {
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
  // CORS 配置：允许 Web 开发服务器 + Electron Desktop (file:// → Origin: null)
  // 关键：Desktop 版从 file:// 加载前端 → 渲染进程 fetch 的 Origin 为 "null" 字符串
  // 必须显式让 cors 中间件反射请求 Origin 到 Access-Control-Allow-Origin
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        const corsEnv = process.env.CORS_ORIGIN;
        if (corsEnv) {
          // 显式设置 CORS_ORIGIN 时精确匹配
          if (origin === corsEnv) {
            callback(null, true);
          } else {
            console.log(`[CORS] 拒绝 origin="${origin}", 要求="${corsEnv}"`);
            callback(new Error('Not allowed by CORS'));
          }
          return;
        }
        // 默认：允许 file://、本地开发服务器、桌面版自建
        if (!origin || origin === 'null') {
          callback(null, true); // Electron Desktop (file://)
        } else if (origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost')) {
          callback(null, true); // Vite dev server / 桌面版自建
        } else {
          console.log(`[CORS] 拒绝未知 origin="${origin}"`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
    }),
  );
  app.use(express.json({ limit: '10mb' }));

  /** 安全 HTTP 头中间件：防止常见 Web 攻击 */
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  });

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

  /** 健康检查 */
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: APP_VERSION,
      uptime: process.uptime(),
      memory: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      timestamp: new Date().toISOString(),
    });
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
      version: APP_VERSION,
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
              'User-Agent': 'EasyAgent/' + APP_VERSION,
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
        currentVersion: APP_VERSION,
        latestVersion,
        hasUpdate: isNewer(latestVersion, APP_VERSION),
        releaseUrl: `https://github.com/ht182400-creator/easyagent/releases/tag/${release.tag_name}`,
        publishedAt: release.published_at,
        body: release.body,
      });
    } catch (err) {
      res.json({
        currentVersion: APP_VERSION,
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

  // ========== 配置API ==========

  /** 获取配置 */
  app.get('/api/config', (_req, res) => {
    const cfg = configManager.getConfig();
    // 白名单方式返回配置，避免 ...cfg 暴露未来新增的敏感字段
    const safeConfig = {
      version: cfg.version,
      agent: cfg.agent,
      security: cfg.security,
      preferences: cfg.preferences,
      sandbox: cfg.sandbox,
      semantic: cfg.semantic,
      knowledge: cfg.knowledge,
      im: cfg.im,
      providers: cfg.providers.map((p) => ({
        ...p,
        apiKey: p.apiKey ? '••••••••' : '',
      })),
    };
    res.json(safeConfig);
  });

  /** 更新配置 (支持 agent/security/preferences) */
  app.put('/api/config', async (req, res) => {
    try {
      const { agent, security, preferences, ...rest } = req.body;
      // 合并设置到配置中
      const updateData: Record<string, unknown> = { ...rest };
      if (agent) updateData.agent = agent;
      if (security) updateData.security = security;
      if (preferences) updateData.preferences = preferences;

      configManager.updateConfig(updateData);
      await configManager.save();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /**
   * 获取仪表盘模板列表
   * 模板定义对话场景的预设提示
   */
  app.get('/api/config/templates', (_req, res) => {
    const templates = config.templates || DEFAULT_TEMPLATES;
    res.json({ success: true, templates });
  });

  /**
   * 获取允许的命令列表
   */
  app.get('/api/config/allowed-commands', (_req, res) => {
    const cmds = config.security?.allowedCommands || [];
    res.json({ success: true, commands: cmds });
  });

  /**
   * 更新允许的命令列表
   */
  app.put('/api/config/allowed-commands', async (req, res) => {
    try {
      const { commands } = req.body;
      if (!Array.isArray(commands)) {
        return res.status(400).json({ success: false, error: 'commands 必须是字符串数组' });
      }
      configManager.updateConfig({
        security: { ...config.security, allowedCommands: commands },
      });
      await configManager.save();
      res.json({ success: true, commands });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /**
   * 模型缓存: providerId → { models, timestamp }
   * 避免每次请求都调提供商 API
   */
  const modelCache = new Map<string, { models: ModelInfo[]; timestamp: number }>();
  const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  /** 模型简要信息 */
  interface ModelInfo {
    id: string;
    name: string;
    maxContextTokens: number;
    maxOutputTokens: number;
    supportsTools: boolean;
    supportsVision: boolean;
    pricing?: { input: number; output: number };
  }

  /**
   * 从 OpenAI 兼容 API 动态获取模型列表
   * 尝试 GET {baseURL}/models，失败则返回空
   */
  async function fetchModelsFromProvider(
    preset: (typeof PROVIDER_PRESETS)[number],
  ): Promise<ModelInfo[]> {
    // Ollama 使用特殊 API
    if (preset.id === 'ollama') {
      try {
        const res = await fetch('http://localhost:11434/api/tags');
        if (!res.ok) return [];
        const data = (await res.json()) as { models?: Array<{ name: string; size: number }> };
        return (data.models || []).map((m) => ({
          id: m.name,
          name: formatOllamaModelName(m.name),
          maxContextTokens: 32768,
          maxOutputTokens: 8192,
          supportsTools: true,
          supportsVision: false,
          pricing: { input: 0, output: 0 },
        }));
      } catch (err) {
        return [];
      }
    }

    // 其他 OpenAI 兼容提供商: GET {baseURL}/models
    if (!preset.apiKey || !preset.baseURL) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const baseUrl = preset.baseURL.replace(/\/v1\/?$/, '');
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${preset.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return [];

      const data = await res.json();
      const modelList: Array<{ id: string }> = data.data || data.models || [];
      return modelList
        .filter(
          (m) =>
            !m.id.toLowerCase().includes('embedding') && !m.id.toLowerCase().includes('moderation'),
        )
        .slice(0, 20) // 限制数量避免 UI 过长
        .map((m) => ({
          id: m.id,
          name: modelIdToName(m.id),
          maxContextTokens: inferContextSize(m.id),
          maxOutputTokens: 8192,
          supportsTools: true,
          supportsVision:
            m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('vl'),
          pricing: preset.models?.[0]?.pricing || { input: 0, output: 0 },
        }));
    } catch (err) {
      return [];
    }
  }

  /** 模型 ID → 可读名称 */
  function modelIdToName(id: string): string {
    return id
      .replace(/^([a-zA-Z]+)(\d)/, '$1 $2')
      .replace(/:(\d+)b$/i, ' $1B')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  /** 根据模型 ID 推断上下文大小 */
  function inferContextSize(id: string): number {
    if (id.includes('32k') || id.includes('32K')) return 32768;
    if (id.includes('128k') || id.includes('128K')) return 131072;
    if (id.includes('100k') || id.includes('100K')) return 102400;
    if (id.includes('200k') || id.includes('200K')) return 204800;
    return 32768; // 默认 32K
  }

  /**
   * 格式化预设模型为动态模型接口统一格式
   * 作为 API 无法动态获取时的兜底数据
   */
  function formatPresetModel(m: {
    id: string;
    name: string;
    maxContextTokens?: number;
    maxOutputTokens?: number;
    supportsTools?: boolean;
    supportsVision?: boolean;
    pricing?: { input: number; output: number };
  }): ModelInfo {
    return {
      id: m.id,
      name: m.name,
      maxContextTokens: m.maxContextTokens || 32768,
      maxOutputTokens: m.maxOutputTokens || 4096,
      supportsTools: m.supportsTools !== false,
      supportsVision: m.supportsVision || false,
      pricing: m.pricing,
    };
  }

  /** 带来源标记的模型 */
  interface MergedModel extends ModelInfo {
    fromDynamic: boolean;
  }

  /**
   * 合并动态获取的模型和预设模型列表
   * - 动态模型优先（相同ID时覆盖预设）
   * - 预设中独有的模型保留（展示历史版本）
   * - 每个模型标记 fromDynamic 来源
   */
  function mergeModels(dynamic: ModelInfo[], preset: ModelInfo[]): MergedModel[] {
    const merged = new Map<string, MergedModel>();
    // 先加入预设（低优先级）
    for (const m of preset) {
      merged.set(m.id, { ...m, fromDynamic: false });
    }
    // 动态模型覆盖（高优先级）
    for (const m of dynamic) {
      merged.set(m.id, { ...m, fromDynamic: true });
    }
    return Array.from(merged.values());
  }

  /**
   * 为提供商获取合并后的模型列表
   * 优先从缓存读动态数据，然后与预设合并
   */
  async function getMergedModels(p: (typeof PROVIDER_PRESETS)[number]): Promise<MergedModel[]> {
    const presetModels = (p.models || []).map(formatPresetModel);
    const cached = modelCache.get(p.id);
    let dynamicModels: ModelInfo[] = [];

    if (cached && Date.now() - cached.timestamp < MODEL_CACHE_TTL) {
      dynamicModels = cached.models;
    } else if (p.apiKey) {
      const fetched = await fetchModelsFromProvider(p);
      if (fetched.length > 0) {
        modelCache.set(p.id, { models: fetched, timestamp: Date.now() });
        dynamicModels = fetched;
      }
    }

    // 有动态数据时合并，否则仅用预设
    return dynamicModels.length > 0
      ? mergeModels(dynamicModels, presetModels)
      : presetModels.map((m) => ({ ...m, fromDynamic: false }));
  }

  /** 获取提供商预设列表（动态+预设合并，展示最新模型和历史版本） */
  app.get('/api/providers', async (_req, res) => {
    const results = await Promise.all(
      PROVIDER_PRESETS.map(async (p) => {
        const mergedModels = await getMergedModels(p);
        const hasDynamic = mergedModels.some((m) => m.fromDynamic);

        return {
          id: p.id,
          name: p.name,
          baseURL: p.baseURL || '',
          apiKeyEnv: p.apiKeyEnv || '',
          apiFormat: p.apiFormat || 'openai',
          hasKey: !!p.apiKey,
          isConnected: !!p.apiKey ? undefined : false,
          fromDynamic: hasDynamic,
          models: mergedModels.map((m) => ({
            id: m.id,
            name: m.name,
            maxContextTokens: m.maxContextTokens || 32768,
            maxOutputTokens: m.maxOutputTokens || 4096,
            supportsTools: m.supportsTools !== false,
            supportsVision: m.supportsVision || false,
            pricing: m.pricing,
            fromDynamic: m.fromDynamic,
          })),
        };
      }),
    );
    res.json(results);
  });

  /** 刷新模型目录（从远程重新下载最新模型数据） */
  app.post('/api/providers/catalog/refresh', async (_req, res) => {
    try {
      await modelRegistry.refresh();
      // 刷新后同步到 PROVIDER_PRESETS
      configManager.load().catch((err) => logger.error({ err }, '配置重新加载失败'));
      res.json({
        success: true,
        version: modelRegistry.getVersion(),
        generatedAt: modelRegistry.getGeneratedAt(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取模型目录状态 */
  app.get('/api/providers/catalog/status', (_req, res) => {
    res.json({
      ready: modelRegistry.isReady(),
      version: modelRegistry.getVersion(),
      generatedAt: modelRegistry.getGeneratedAt(),
      providers: modelRegistry.getCatalog()?.providers.length || null,
    });
  });

  /** 刷新指定提供商的模型列表(强制重新获取，合并预设) */
  app.post('/api/providers/:id/models/refresh', async (req, res) => {
    try {
      const { id } = req.params;
      const preset = PROVIDER_PRESETS.find((p) => p.id === id);
      if (!preset) return res.status(404).json({ success: false, error: `未知的提供商ID: ${id}` });

      // 强制刷新：清除缓存，重新获取
      modelCache.delete(id);
      const presetModels = (preset.models || []).map(formatPresetModel);
      const dynamicModels = preset.apiKey ? await fetchModelsFromProvider(preset) : [];

      if (dynamicModels.length > 0) {
        modelCache.set(id, { models: dynamicModels, timestamp: Date.now() });
      }

      // 合并动态+预设
      const merged =
        dynamicModels.length > 0
          ? mergeModels(dynamicModels, presetModels)
          : presetModels.map((m) => ({ ...m, fromDynamic: false }));

      res.json({
        success: true,
        models: merged,
        fromDynamic: dynamicModels.length > 0,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取所有可用模型(扁平列表，合并动态+预设，供 ChatInput 下拉框使用) */
  app.get('/api/providers/all-models', async (_req, res) => {
    try {
      const allModels: Array<{
        provider: string;
        providerName: string;
        modelId: string;
        modelName: string;
        supportsTools: boolean;
        supportsVision: boolean;
        fromDynamic: boolean;
      }> = [];

      for (const p of PROVIDER_PRESETS) {
        const mergedModels = await getMergedModels(p);
        for (const m of mergedModels) {
          allModels.push({
            provider: p.id,
            providerName: p.name,
            modelId: m.id,
            modelName: m.name,
            supportsTools: m.supportsTools !== false,
            supportsVision: m.supportsVision || false,
            fromDynamic: m.fromDynamic,
          });
        }
      }

      res.json({ success: true, models: allModels });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 设置API密钥 */
  app.put('/api/providers/:id/key', async (req, res) => {
    try {
      const { id } = req.params;
      const { apiKey } = req.body;
      configManager.setApiKey(id as Parameters<typeof configManager.setApiKey>[0], apiKey);
      await configManager.save();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 测试提供商连接 */
  app.post('/api/providers/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const providerConfig = configManager.getProvider(
        id as Parameters<typeof configManager.getProvider>[0],
      );
      if (!providerConfig) {
        // 查找预设中的环境变量名称，给用户明确指引
        const preset = PROVIDER_PRESETS.find((p) => p.id === id);
        const envHint = preset?.apiKeyEnv
          ? `请先配置 API 密钥：设置环境变量 ${preset.apiKeyEnv} 或在页面中手动输入密钥`
          : '请先在提供商页面中设置 API 密钥';
        return res.status(404).json({ success: false, error: `${envHint}` });
      }
      const adapter = AdapterFactory.create(providerConfig);
      await adapter.validateConnection();
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: (error as Error).message });
    }
  });

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
      const agent = new AgentEngine(providerConfig, toolRegistry, sessionManager, {
        model: model || config.currentModel.model,
        provider: provider || config.currentModel.provider,
      });
      const response = await agent.run(message, {
        sessionId: sessionId || `web_${Date.now()}`,
      });
      const usage = agent.getTokenUsage();
      res.json({ response, usage });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========== 插件与技能 API ==========

  /** 获取插件列表 */
  app.get('/api/plugins', (_req, res) => {
    const plugins = pluginManager.listPlugins().map((p) => ({
      name: p.plugin.name,
      version: p.plugin.version,
      description: p.plugin.description,
      author: p.plugin.author,
      enabled: p.enabled,
      sourcePath: p.sourcePath,
      loadedAt: p.loadedAt,
      error: p.error,
    }));
    res.json(plugins);
  });

  /** 加载插件 */
  app.post('/api/plugins/load', async (req, res) => {
    try {
      const { path: pluginPath } = req.body;
      if (!pluginPath) {
        return res.status(400).json({ error: '缺少 path 参数' });
      }
      // 安全检查：插件路径必须限定在用户插件目录内
      const pluginsDir = join(process.cwd(), '.easyagent', 'plugins');
      const resolvedPluginPath = resolve(pluginPath);
      if (!resolvedPluginPath.startsWith(pluginsDir)) {
        return res.status(403).json({ error: '安全限制: 插件必须位于 .easyagent/plugins 目录内' });
      }
      const plugin = await pluginManager.loadPlugin(resolvedPluginPath);
      res.json({
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 启用/禁用插件 */
  app.post('/api/plugins/:name/toggle', async (req, res) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;
      if (enabled) {
        await pluginManager.enablePlugin(name);
      } else {
        await pluginManager.disablePlugin(name);
      }
      res.json({ name, enabled });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 卸载插件 */
  app.delete('/api/plugins/:name', async (req, res) => {
    try {
      await pluginManager.unloadPlugin(req.params.name);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 获取技能列表（含激活状态和自定义技能） */
  app.get('/api/skills', (_req, res) => {
    res.json(getAllSkillsWithStatus());
  });

  /** 激活技能 */
  app.post('/api/skills/:name/activate', async (req, res) => {
    try {
      const { name } = req.params;

      // 查找技能
      let skill = getSkillByName(name) || pluginManager.getSkill(name);
      // 在自定义技能中查找
      if (!skill) {
        const custom = loadCustomSkills().find((s) => s.name === name);
        if (custom) skill = custom as unknown as typeof skill;
      }

      if (!skill) {
        res.status(404).json({ error: `技能 "${name}" 不存在` });
        return;
      }

      // 调用技能的 onActivate 回调（如果有）
      let enhancedContext = null;
      if (skill.onActivate) {
        const context = {
          availableTools: toolRegistry.list(),
          config: configManager.getAll(),
        };
        enhancedContext = await skill.onActivate(context);
      }

      // 记录激活状态
      pluginManager.activateUserSkill(name);
      logger.info({ skill: name }, '技能已激活');
      res.json({
        success: true,
        skill: {
          name: skill.name,
          description: skill.description,
          prompt: skill.prompt,
        },
        enhancedContext,
      });
    } catch (error) {
      logger.error({ skill: req.params.name, error }, '激活技能失败');
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 停用技能 */
  app.post('/api/skills/:name/deactivate', (req, res) => {
    const { name } = req.params;
    const removed = pluginManager.deactivateUserSkill(name);
    if (removed) {
      res.json({ success: true, message: `技能 "${name}" 已停用` });
    } else {
      res.status(404).json({ error: `技能 "${name}" 未被激活` });
    }
  });

  // ===================== 自定义技能 CRUD =====================

  /** 添加自定义技能 */
  app.post('/api/skills/custom', (req, res) => {
    try {
      const { name, description, prompt, tags, requiresConfirm } = req.body;
      if (!name || !description) {
        res.status(400).json({ error: '技能名称和描述不能为空' });
        return;
      }

      const skills = loadCustomSkills();
      if (skills.find((s) => s.name === name)) {
        res.status(409).json({ error: `技能 "${name}" 已存在` });
        return;
      }

      // 检查不与内置/插件技能冲突
      if (getSkillByName(name) || pluginManager.getSkill(name)) {
        res.status(409).json({ error: `技能 "${name}" 与内置或插件技能冲突` });
        return;
      }

      const newSkill: CustomSkill = { name, description, prompt, tags, requiresConfirm };
      skills.push(newSkill);
      saveCustomSkills(skills);
      logger.info({ skill: name }, '自定义技能已添加');
      res.json({ success: true, skill: { ...newSkill, source: 'custom', activated: false } });
    } catch (error) {
      logger.error({ error }, '添加自定义技能失败');
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 删除自定义技能 */
  app.delete('/api/skills/custom/:name', (req, res) => {
    const { name } = req.params;
    const skills = loadCustomSkills();
    const index = skills.findIndex((s) => s.name === name);
    if (index === -1) {
      res.status(404).json({ error: `自定义技能 "${name}" 不存在` });
      return;
    }
    skills.splice(index, 1);
    saveCustomSkills(skills);
    // 同时取消激活状态
    pluginManager.deactivateUserSkill(name);
    logger.info({ skill: name }, '自定义技能已删除');
    res.json({ success: true });
  });

  /** 更新自定义技能 */
  app.put('/api/skills/custom/:name', (req, res) => {
    const { name } = req.params;
    const skills = loadCustomSkills();
    const index = skills.findIndex((s) => s.name === name);
    if (index === -1) {
      res.status(404).json({ error: `自定义技能 "${name}" 不存在` });
      return;
    }
    skills[index] = { ...skills[index], ...req.body, name: skills[index].name };
    saveCustomSkills(skills);
    logger.info({ skill: name }, '自定义技能已更新');
    res.json({
      success: true,
      skill: { ...skills[index], source: 'custom', activated: pluginManager.isSkillActive(name) },
    });
  });

  /** 获取工具列表（分组信息由工具自身定义，启用状态来自持久化配置） */
  app.get('/api/tools', (_req, res) => {
    const tools = toolRegistry.list().map((t) => ({
      ...t,
      // group 由 getAllBuiltinTools() 自动标注，无需手动映射
      group: t.group || 'other',
      requiresConfirm: t.name === 'delete_file' || t.name === 'exec',
      builtin: true,
      // enabled 来自 ToolRegistry 的真实运行时状态
      enabled: t.enabled,
    }));
    res.json(tools);
  });

  /** 切换工具的启用/禁用状态 */
  app.post('/api/tools/:name', (req, res) => {
    const { name } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '缺少 enabled 参数 (true/false)' });
    }
    const ok = toolRegistry.setEnabled(name, enabled);
    if (!ok) {
      return res.status(404).json({ error: `工具 "${name}" 不存在` });
    }
    // 持久化禁用列表
    configManager.saveDisabledToolNames(toolRegistry.getDisabledNames());
    logger.info({ tool: name, enabled }, '工具状态已切换');
    res.json({ success: true, name, enabled });
  });

  // ========== IM 适配器管理 API ==========

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

  // ========== Docker 沙箱 API 🆕 ==========

  /** 初始化沙箱管理器 */
  const sandboxManager = SandboxManager.getInstance({
    maxSandboxes: 10,
    defaultTimeout: 300000,
    idleTimeout: 600000,
  });
  // 异步初始化 (不阻塞服务启动)
  sandboxManager.init().then((result) => {
    if (result.mode === 'docker') {
      logger.info({ version: result.version }, 'Docker 沙箱系统就绪');
    } else if (result.mode === 'local') {
      logger.warn({ version: result.version }, 'Docker 不可用，沙箱已降级为本地进程模式');
    } else {
      logger.warn('沙箱功能已禁用');
    }
  });

  /** 获取沙箱状态 */
  app.get('/api/sandbox/status', async (_req, res) => {
    try {
      const dockerCheck = await checkDockerAvailability();
      const overview = sandboxManager.getOverview();
      res.json({
        docker: dockerCheck,
        sandbox: overview,
        mode: overview.localMode ? 'local' : dockerCheck.available ? 'docker' : 'disabled',
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 创建沙箱 */
  app.post('/api/sandbox', async (req, res) => {
    try {
      const { image, workspace, readOnly, allowNetwork, memoryLimit, cpuLimit } = req.body;
      const sandbox = await sandboxManager.createSandbox({
        image: image || 'node:20-alpine',
        workspace: workspace || process.cwd(),
        readOnly: !!readOnly,
        allowNetwork: !!allowNetwork,
        limits: {
          memory: memoryLimit || '512m',
          cpuCores: cpuLimit || 0.5,
          maxPids: 50,
        },
      });
      res.json({ success: true, sandbox: sandbox.getStatus() });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 在沙箱中执行命令 */
  app.post('/api/sandbox/:id/exec', async (req, res) => {
    try {
      const { id } = req.params;
      const { command, timeout } = req.body;
      if (!command) {
        return res.status(400).json({ error: '缺少 command 参数' });
      }
      const sandbox = sandboxManager.getSandbox(id);
      if (!sandbox) {
        return res.status(404).json({ error: '沙箱不存在或已过期' });
      }
      const result = await sandbox.exec(command, timeout || 30000);
      res.json({ success: result.success, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 查看沙箱信息 */
  app.get('/api/sandbox/:id', (req, res) => {
    const { id } = req.params;
    const sandbox = sandboxManager.getSandbox(id);
    if (!sandbox) {
      return res.status(404).json({ error: '沙箱不存在或已过期' });
    }
    res.json(sandbox.getStatus());
  });

  /** 销毁沙箱 */
  app.delete('/api/sandbox/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await sandboxManager.destroySandbox(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 列出所有沙箱 */
  app.get('/api/sandbox', (_req, res) => {
    res.json(sandboxManager.listSandboxes());
  });

  // ========== 语义分析 API 🆕 ==========

  /** 获取代码库语义地图 */
  app.get('/api/semantic/map', (req, res) => {
    try {
      const workspace = (req.query.path as string) || process.cwd();
      const maxDepth = parseInt(req.query.depth as string) || 6;
      const maxFiles = parseInt(req.query.maxFiles as string) || 300;
      const forceRefresh = req.query.refresh === 'true';

      if (forceRefresh) {
        resetSemanticCache();
      }

      const map = buildSemanticMap(workspace, maxDepth, maxFiles);

      res.json({
        success: true,
        root: map.root,
        stats: map.stats,
        symbolCount: map.symbolIndex.size,
        topSymbols: [...map.symbolIndex.entries()]
          .filter(([, syms]) => syms.length > 1)
          .sort(([, a], [, b]) => b.length - a.length)
          .slice(0, 50)
          .map(([name, syms]) => ({
            name,
            count: syms.length,
            locations: syms.slice(0, 5).map((s) => s.filePath + ':' + s.line),
          })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 搜索符号 */
  app.get('/api/semantic/search', (req, res) => {
    try {
      const query = req.query.q as string;
      const workspace = (req.query.path as string) || process.cwd();
      const caseSensitive = req.query.case === 'true';
      const kind = req.query.kind as string | undefined;

      if (!query) {
        return res.status(400).json({ error: '缺少 q 参数' });
      }

      const map = buildSemanticMap(workspace);
      let results = searchSymbol(map, query, caseSensitive);

      if (kind) {
        results = results.filter((s) => s.kind === kind);
      }

      res.json({
        success: true,
        query,
        totalResults: results.length,
        results: results.slice(0, 100).map((s) => ({
          name: s.name,
          kind: s.kind,
          line: s.line,
          filePath: s.filePath,
          signature: s.signature,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 查找符号引用 */
  app.get('/api/semantic/references', (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const workspace = (req.query.path as string) || process.cwd();

      if (!symbol) {
        return res.status(400).json({ error: '缺少 symbol 参数' });
      }

      const map = buildSemanticMap(workspace);
      const refs = findReferences(map, symbol, workspace);

      res.json({
        success: true,
        symbol,
        totalReferences: refs.length,
        definitions: refs.filter((r) => r.kind === 'definition').length,
        usages: refs.filter((r) => r.kind === 'reference').length,
        references: refs.slice(0, 200).map((r) => ({
          filePath: r.filePath,
          line: r.line,
          kind: r.kind,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取代码库概览 */
  app.get('/api/semantic/overview', (req, res) => {
    try {
      const workspace = (req.query.path as string) || process.cwd();
      const overview = getCodebaseOverview(workspace);
      res.json({
        success: true,
        root: overview.root,
        stats: overview.stats,
        fileTree: overview.fileTree,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 分析单个文件 */
  app.get('/api/semantic/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: '缺少 path 参数' });
      }
      // 路径安全检查：确保不越出项目根目录
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(PROJECT_ROOT)) {
        return res.status(403).json({ error: '路径越界，仅允许访问项目目录内的文件' });
      }
      const { existsSync } = await import('node:fs');
      if (!existsSync(resolvedPath)) {
        return res.status(404).json({ error: '文件不存在' });
      }
      const info = analyzeFile(resolvedPath);
      res.json({
        success: true,
        filePath: info.filePath,
        language: info.language,
        symbols: info.symbols,
        imports: info.imports,
        exports: info.exports,
        lineCount: info.lineCount,
        size: info.size,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // ========== 文件浏览 API ==========

  /** 可导入的文件扩展名（文本类型） */
  const BROWSEABLE_EXTENSIONS = new Set([
    '.md',
    '.txt',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.xml',
    '.csv',
    '.tsv',
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.rs',
    '.go',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.css',
    '.scss',
    '.less',
    '.html',
    '.htm',
    '.sh',
    '.bat',
    '.ps1',
    '.env',
    '.gitignore',
    '.vue',
    '.svelte',
  ]);

  /** 忽略的目录名 */
  const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.codebuddy',
    'dist',
    '.next',
    '.nuxt',
    '__pycache__',
    '.venv',
    'venv',
    'target',
    '.svn',
    '.hg',
    '.easyagent',
  ]);

  /** 浏览工作区文件 */
  app.get('/api/files/browse', (req, res) => {
    try {
      const relPath = (req.query.path as string) || '';
      const fullPath = relPath ? resolve(PROJECT_ROOT, relPath) : PROJECT_ROOT;

      // 安全检查：确保不越出工作区
      if (!fullPath.startsWith(PROJECT_ROOT)) {
        return res.status(403).json({ success: false, error: '路径越界' });
      }
      if (!existsSync(fullPath)) {
        return res.status(404).json({ success: false, error: `路径不存在: ${relPath}` });
      }

      const entries = readdirSync(fullPath, { withFileTypes: true });
      const dirs: { name: string; itemCount: number }[] = [];
      const files: { name: string; ext: string; size: number; relativePath: string }[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

        const entryPath = join(fullPath, entry.name);
        const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          try {
            const subEntries = readdirSync(entryPath, { withFileTypes: true });
            const itemCount = subEntries.filter(
              (e) => !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name),
            ).length;
            dirs.push({ name: entry.name, itemCount });
          } catch (err) {
            dirs.push({ name: entry.name, itemCount: 0 });
          }
        } else if (entry.isFile()) {
          const ext = entry.name.includes('.')
            ? entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
            : '';
          if (BROWSEABLE_EXTENSIONS.has(ext)) {
            try {
              const stats = statSync(entryPath);
              files.push({
                name: entry.name,
                ext,
                size: stats.size,
                relativePath: entryRelPath,
              });
            } catch (err) {
              // 跳过无法读取的文件
            }
          }
        }
      }

      // 排序：目录在前，文件在后；各自按名称排序
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        currentPath: relPath || '',
        dirs,
        files,
        parentPath: relPath ? relPath.split('/').slice(0, -1).join('/') || '' : null,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // ========== 知识库 API（支持 project/global 双作用域） ==========

  /** 获取知识库文档列表 */
  app.get('/api/knowledge', (req, res) => {
    try {
      const { category, tag, scope } = req.query;
      const kbService = resolveKnowledgeService(scope as string);
      const docs = kbService.listDocuments({
        category: category as string | undefined,
        tag: tag as string | undefined,
      });
      const stats = kbService.getStats();
      const allTags = kbService.getAllTags();
      res.json({
        success: true,
        documents: docs,
        stats,
        tags: allTags,
        scope: kbService.getScope(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 添加知识库文档 */
  app.post('/api/knowledge', (req, res) => {
    try {
      const { title, content, filePath, category, tags, scope } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: '缺少 title 参数' });
      }
      const kbService = resolveKnowledgeService(scope);
      const result = kbService.addDocument({ title, content, filePath, category, tags });
      if (result.success) {
        const doc = kbService.getDocument(result.docId!);
        res.json({
          success: true,
          document: doc.doc,
          content: doc.content,
          scope: kbService.getScope(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 删除知识库文档 */
  app.delete('/api/knowledge/:id', (req, res) => {
    try {
      const { scope } = req.query;
      const kbService = resolveKnowledgeService(scope as string);
      const result = kbService.removeDocument(req.params.id);
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 搜索知识库 */
  app.get('/api/knowledge/search', (req, res) => {
    try {
      const { q, category, tag, maxResults, scope } = req.query;
      if (!q) {
        return res.status(400).json({ success: false, error: '缺少 q 参数' });
      }
      const kbService = resolveKnowledgeService(scope as string);
      const result = kbService.search({
        query: q as string,
        category: category as string | undefined,
        tag: tag as string | undefined,
        maxResults: maxResults ? parseInt(maxResults as string) : 20,
      });
      res.json({ success: true, ...result, scope: kbService.getScope() });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 从文件导入知识库（项目内相对路径） */
  app.post('/api/knowledge/import', (req, res) => {
    try {
      const { filePath, scope } = req.body;
      if (!filePath) {
        return res.status(400).json({ success: false, error: '缺少 filePath 参数' });
      }
      const kbService = resolveKnowledgeService(scope);
      const result = kbService.importFromFile(filePath);
      if (result.success) {
        const doc = kbService.getDocument(result.docId!);
        res.json({
          success: true,
          document: doc.doc,
          content: doc.content,
          scope: kbService.getScope(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 上传文件导入知识库（支持任意本地文件） */
  app.post('/api/knowledge/upload', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: '缺少上传文件' });
      }
      const { scope, category, tags: tagsStr } = req.body;
      const kbService = resolveKnowledgeService(scope);

      // 修复中文文件名乱码：multer/busboy 在某些环境下将 UTF-8 字节按 Latin-1 误解码
      let fileName = req.file.originalname;
      try {
        const decoded = Buffer.from(fileName, 'latin1').toString('utf8');
        // 仅当解码结果含中文字符且不同时才替换
        if (decoded !== fileName && /[\u4e00-\u9fff]/.test(decoded)) {
          fileName = decoded;
        } else {
          // 尝试 URL 解码（部分旧版浏览器使用 %E6%96 format）
          const urlDecoded = decodeURIComponent(fileName);
          if (urlDecoded !== fileName) fileName = urlDecoded;
        }
      } catch (err) {
        /* 保持原始文件名 */
      }
      const filePath = req.file.path;
      // 读取文件内容，尝试 UTF-8 优先，降级 GBK
      const raw = readFileSync(filePath);
      let content = raw.toString('utf-8');
      // 如果包含乱码字符 (\ufffd)，尝试 GBK 解码
      if (content.includes('\ufffd')) {
        try {
          const { decode } = require('iconv-lite');
          content = decode(raw, 'gbk');
        } catch (err) {
          /* 无 iconv-lite 则保留 UTF-8 结果 */
        }
      }
      const tags = tagsStr
        ? tagsStr
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];

      const result = kbService.importFromContent(fileName, content, category, tags);

      // 清理临时上传文件
      try {
        rmSync(filePath);
      } catch (err) {
        /* ignore */
      }

      if (result.success) {
        const doc = kbService.getDocument(result.docId!);
        res.json({
          success: true,
          document: doc.doc,
          content: doc.content,
          scope: kbService.getScope(),
        });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取知识库统计（支持合并双作用域） */
  app.get('/api/knowledge/stats/summary', (req, res) => {
    try {
      const { scope } = req.query;
      if (scope === 'global' || scope === 'project') {
        // 单一作用域
        const kbService = resolveKnowledgeService(scope);
        const stats = kbService.getStats();
        const tags = kbService.getAllTags();
        res.json({ success: true, ...stats, tags, scope: kbService.getScope() });
      } else {
        // 合并双作用域统计
        const projectStats = knowledgeService.getStats();
        const globalStats = globalKnowledgeService.getStats();
        const projectTags = knowledgeService.getAllTags();
        const globalTags = globalKnowledgeService.getAllTags();

        // 合并分类统计
        const categories: Record<string, number> = { ...projectStats.categories };
        for (const [cat, count] of Object.entries(globalStats.categories)) {
          categories[cat] = (categories[cat] || 0) + count;
        }

        res.json({
          success: true,
          totalDocs: projectStats.totalDocs + globalStats.totalDocs,
          totalSize: projectStats.totalSize + globalStats.totalSize,
          categories,
          tags: [...new Set([...projectTags, ...globalTags])].sort(),
          project: { totalDocs: projectStats.totalDocs, totalSize: projectStats.totalSize },
          global: { totalDocs: globalStats.totalDocs, totalSize: globalStats.totalSize },
          scope: 'merged',
        });
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取单个知识库文档（注意：必须注册在 stats/summary 之后，避免 :id 捕获 'stats'） */
  app.get('/api/knowledge/:id', (req, res) => {
    try {
      const { scope } = req.query;
      const kbService = resolveKnowledgeService(scope as string);
      const result = kbService.getDocument(req.params.id);
      if (result.success) {
        res.json({
          success: true,
          document: result.doc,
          content: result.content,
          scope: kbService.getScope(),
        });
      } else {
        // 如果当前作用域找不到，尝试另一个作用域
        const altService =
          kbService === knowledgeService ? globalKnowledgeService : knowledgeService;
        const altResult = altService.getDocument(req.params.id);
        if (altResult.success) {
          res.json({
            success: true,
            document: altResult.doc,
            content: altResult.content,
            scope: altService.getScope(),
          });
        } else {
          res.status(404).json({ success: false, error: result.error });
        }
      }
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  // ========== 自动化任务 API ==========

  /** 获取自动化任务列表 */
  app.get('/api/automations', (_req, res) => {
    try {
      const tasks = automationManager.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 创建自动化任务 */
  app.post('/api/automations', (req, res) => {
    try {
      const {
        id,
        name,
        prompt,
        scheduleType,
        rrule,
        scheduledAt,
        cwds,
        validFrom,
        validUntil,
        maxDurationMinutes,
        provider,
        model,
      } = req.body;
      if (!name) {
        return res.status(400).json({ error: '缺少 name 参数' });
      }
      if (!prompt) {
        return res.status(400).json({ error: '缺少 prompt 参数' });
      }
      const task = automationManager.createTask({
        id,
        name,
        prompt,
        scheduleType: scheduleType || 'recurring',
        rrule,
        scheduledAt,
        cwds: cwds || [process.cwd()],
        validFrom,
        validUntil,
        maxDurationMinutes,
        provider,
        model,
      });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 更新自动化任务 */
  app.put('/api/automations/:id', (req, res) => {
    try {
      const updated = automationManager.updateTask(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: '任务不存在' });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 删除自动化任务 */
  app.delete('/api/automations/:id', (req, res) => {
    try {
      const deleted = automationManager.deleteTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: '任务不存在' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 切换任务启用/暂停 */
  app.post('/api/automations/:id/toggle', (req, res) => {
    try {
      const { active } = req.body;
      const updated = automationManager.toggleTask(req.params.id, !!active);
      if (!updated) {
        return res.status(404).json({ error: '任务不存在' });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 立即执行任务 */
  app.post('/api/automations/:id/run', (req, res) => {
    try {
      const run = automationManager.runTaskNow(req.params.id);
      if (!run) {
        return res.status(404).json({ error: '任务不存在或无法执行' });
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 停止任务 */
  app.post('/api/automations/:id/stop', (req, res) => {
    try {
      const stopped = automationManager.stopTask(req.params.id);
      res.json({ success: true, stopped });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 获取执行历史 */
  app.get('/api/automations/history', (req, res) => {
    try {
      const { taskId, limit } = req.query;
      const history = automationManager.getHistory(
        taskId as string | undefined,
        limit ? parseInt(limit as string) : 50,
      );
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========== 静态文件服务 (Web Dashboard) ==========
  // 必须在所有 API 路由之后注册，避免 * 通配符拦截 API 请求
  // 从 server/dist 回退到 packages/web/dist（兼容多种启动目录）
  const webDistPath = join(__dirname, '..', '..', 'web', 'dist');

  // 捕获未匹配的 /api/* 路径返回 404（避免被 SPA fallback 吞掉）
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: `API端点不存在: ${_req.method} ${_req.path}` });
  });

  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    // SPA fallback: 非 API 路径返回 index.html
    app.get('*', (_req, res) => {
      const indexPath = join(webDistPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  // ========== WebSocket (增强协议) ==========

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  /** WebSocket 会话映射: ws → 订阅的 sessionId */
  const wsSubscriptions = new Map<WebSocket, string>();
  /** 订阅自动化进度推送的客户端集合 */
  const automationSubscriptions = new Set<WebSocket>();
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

  wss.on('connection', (ws: WebSocket, req) => {
    // WebSocket 基本认证：通过 query token 或 header 进行简单校验
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const reqToken = url.searchParams.get('token') || req.headers['x-auth-token'];
    const serverToken = process.env.EASYAGENT_WS_TOKEN;
    if (serverToken && reqToken !== serverToken) {
      logger.warn({ ip: req.socket.remoteAddress }, 'WebSocket 认证失败');
      safeSend(ws, { type: 'error', error: '认证失败' });
      ws.close(4001, 'Unauthorized');
      return;
    }
    logger.info({ ip: req.socket.remoteAddress }, 'WebSocket 客户端已连接');

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
            const agent = new AgentEngine(providerConfig, toolRegistry, sessionManager, {
              model: selectedModel,
              provider: provider || config.currentModel.provider,
            });

            // 监听 Agent 事件并转发
            agent.onEvent((event) => {
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

                case 'tool_end': {
                  safeSend(ws, {
                    type: 'tool_result',
                    toolCallId: event.toolCallId,
                    output: event.output || '',
                    error: event.error || null,
                  });
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
              });

              logger.info({ sid, chunkCount, responseLen: fullResponse.length }, 'Agent 执行完成');
              // 发送完成信号
              safeSend(ws, {
                type: 'text_done',
                sessionId: sid,
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
      wsAbortControllers.delete(ws);
    });

    ws.on('error', (err) => {
      logger.error({ error: err.message }, 'WebSocket 错误');
      wsSubscriptions.delete(ws);
      automationSubscriptions.delete(ws);
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
  };
}

// ========== 入口：直接运行时启动服务 ==========
const __filename = fileURLToPath(import.meta.url);
const isMainModule =
  process.argv[1] === __filename ||
  process.argv[1]?.endsWith('\\index.ts') ||
  process.argv[1]?.endsWith('/index.ts');

if (isMainModule) {
  createApp()
    .then(({ server, sessionManager, wss, automationManager }) => {
      // 启动服务器
      server.listen(PORT, HOST, () => {
        console.log(
          [
            '╔══════════════════════════════════════════╗',
            '║        EasyAgent Server v0.6.16           ║',
            `║  HTTP:      http://localhost:${PORT}        ║`,
            `║  WebSocket: ws://localhost:${PORT}/ws      ║`,
            '╚══════════════════════════════════════════╝',
          ].join('\n'),
        );
        logger.info({ port: PORT, host: HOST }, '服务器已启动');
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
