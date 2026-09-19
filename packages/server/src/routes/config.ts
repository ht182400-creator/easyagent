/**
 * 配置与提供商路由（P1-1 第三批拆分产物）
 *
 * ── ⚠️ 本模块的约定 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. **逐字段映射陷阱**：`/api/providers` 等接口是**逐字段重新挑选**而非整对象透传，
 *      新增模型/提供商字段必须同时改 `formatPresetModel`、`/api/providers`、
 *      `/api/providers/all-models` 三处，否则字段会静默丢失
 *      （实例：`unverified` 曾因此丢了两个版本，见 docs/71）；
 *   3. `/api/config` 的 GET 用**白名单**方式返回配置，避免 `...cfg` 暴露未来新增的
 *      敏感字段；`providers[].apiKey` 必须脱敏为 `••••••••`；
 *   4. 模型缓存（`modelCache`，TTL 5 分钟）随模块创建：createApp 多次调用时共享同一
 *      缓存 —— 这是有意为之，避免多实例重复拉取厂商 API（`/api/providers/:id/models/refresh`
 *      可强制清缓存）；
 *   5. Anthropic 的 `/v1/models` 需要 `x-api-key` + `anthropic-version` 头
 *      （Bearer 会被判未授权），别"统一"成 OpenAI 的鉴权方式。
 *
 * @module routes/config
 */

import type { Express } from 'express';
import { AdapterFactory, logger, PROVIDER_PRESETS, getModelRegistry } from '@easyagent/core';
import type { ConfigManager } from '@easyagent/core';

/** 配置路由依赖 */
export interface ConfigRoutesDeps {
  configManager: ConfigManager;
  /** `configManager.load()` 返回的配置快照（同一引用，非副本） */
  config: ReturnType<ConfigManager['getConfig']>;
  modelRegistry: ReturnType<typeof getModelRegistry>;
}

/** 仪表盘默认模板列表（config.templates 未配置时的兜底，随拆分自 index.ts 迁入） */
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

/**
 * 将 Ollama 模型标签名格式化为可读名称
 * 例如 qwen3.5:9b → Qwen 3.5 9B
 * （原 index.ts 模块级函数，仅被本模块的 fetchModelsFromProvider 使用）
 */
function formatOllamaModelName(tag: string): string {
  return tag
    .replace(/^([a-zA-Z]+)(\d)/, '$1 $2') // qwen3 → Qwen 3
    .replace(/(\d)\.(\d)/, '$1.$2') // 保留小数点
    .replace(/:(\d+)b$/i, ' $1B') // :9b → 9B
    .replace(/\b\w/g, (c) => c.toUpperCase()); // 首字母大写
}

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

/** 带来源标记的模型 */
interface MergedModel extends ModelInfo {
  fromDynamic: boolean;
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
 * 从 OpenAI 兼容 API 动态获取模型列表
 * 尝试 GET {baseURL}/models，失败则返回空
 *
 * 📌 **模块级导出**：除本模块路由外，`index.ts` 的启动初始化块
 * （模型目录过期时的「厂商 API 直连补齐」）也是消费者 —— 两处必须共用同一实现。
 */
export async function fetchModelsFromProvider(
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

  // 其他提供商：GET {baseURL}/v1/models
  if (!preset.apiKey || !preset.baseURL) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const baseUrl = preset.baseURL.replace(/\/v1\/?$/, '');

    /**
     * Anthropic 的 `/v1/models` 存在，但**鉴权方式与 OpenAI 不同**：
     * 需要 `x-api-key` + `anthropic-version`，用 Bearer 会被判为未授权。
     * 返回结构为 `{ data: [{ id, display_name, ... }] }`。
     *
     * 打通这条通道的意义：Anthropic 没有稳定公开的机器可读模型清单，
     * 预设里的 ID 只能靠人工维护 —— 能直连问厂商，就不必依赖手工更新。
     */
    const isAnthropic = preset.apiFormat === 'anthropic';
    const headers: Record<string, string> = isAnthropic
      ? {
          'x-api-key': preset.apiKey,
          'anthropic-version': '2023-06-01',
        }
      : { Authorization: `Bearer ${preset.apiKey}` };

    const res = await fetch(`${baseUrl}/v1/models`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const data = await res.json();
    const modelList: Array<{ id: string; display_name?: string }> = data.data || data.models || [];
    return modelList
      .filter(
        (m) =>
          !m.id.toLowerCase().includes('embedding') && !m.id.toLowerCase().includes('moderation'),
      )
      .slice(0, 20) // 限制数量避免 UI 过长
      .map((m) => ({
        id: m.id,
        // Anthropic 会返回 display_name（如 "Claude Opus 4.8"），有则优先使用
        name: m.display_name || modelIdToName(m.id),
        maxContextTokens: inferContextSize(m.id),
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: m.id.toLowerCase().includes('vision') || m.id.toLowerCase().includes('vl'),
        pricing: preset.models?.[0]?.pricing || { input: 0, output: 0 },
      }));
  } catch (err) {
    return [];
  }
}

/**
 * 注册配置与提供商路由
 *
 * @param app - Express 应用
 * @param deps - 显式注入的依赖
 */
export function registerConfigRoutes(app: Express, deps: ConfigRoutesDeps): void {
  const { configManager, config, modelRegistry } = deps;

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
    /**
     * 元数据未校准标记
     *
     * 由 ModelRegistry 的「厂商 API 直连」通道发现的新模型会带上它：
     * 厂商 `/models` 通常只返回模型 ID，不含价格/上下文等元数据，
     * 因此那些字段只是**保守默认值**。
     *
     * ⚠️ 必须透传到前端 —— 否则界面会把 $0、32K 这类默认值当作真实规格展示。
     */
    unverified?: boolean;
  }): ModelInfo {
    return {
      id: m.id,
      name: m.name,
      maxContextTokens: m.maxContextTokens || 32768,
      maxOutputTokens: m.maxOutputTokens || 4096,
      supportsTools: m.supportsTools !== false,
      supportsVision: m.supportsVision || false,
      pricing: m.pricing,
      unverified: m.unverified,
    };
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
            // 透传「元数据未校准」标记：前端据此区分展示，
            // 不能把厂商 API 发现时填入的保守默认值当作真实规格呈现
            unverified: m.unverified,
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
    const freshness = modelRegistry.getFreshness();
    res.json({
      ready: modelRegistry.isReady(),
      version: modelRegistry.getVersion(),
      generatedAt: modelRegistry.getGeneratedAt(),
      providers: modelRegistry.getCatalog()?.providers.length || null,
      // 数据来源：排障第一问 —— "模型列表不新"时先确认数据到底从哪来
      // （远程源 / 自建镜像 / 本地缓存 / 内置兜底）
      source: modelRegistry.getSource(),
      // 新鲜度：下载成功 ≠ 数据新鲜（目录可能长期未重新生成）
      stale: freshness.stale,
      ageDays: freshness.ageDays,
      maxAgeDays: freshness.maxAgeDays,
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
        unverified?: boolean;
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
            // 供模型下拉框标注「未校准」（元数据为保守默认值）
            unverified: m.unverified,
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
}
