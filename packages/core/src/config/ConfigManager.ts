/**
 * 配置管理器
 * 负责读取、验证和管理应用配置
 * 支持从文件、环境变量加载，加密存储敏感信息
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { AppConfig, ProviderConfig, ProviderId, ModelConfig } from '../types/index.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import { PROVIDER_PRESETS } from './ProviderPresets.js';
import { getModelRegistry } from './ModelRegistry.js';

/** 默认配置目录 */
const CONFIG_DIR = join(homedir(), '.easyagent');
/** 配置文件路径 */
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
/** 提供商配置文件 */
const PROVIDERS_FILE = join(CONFIG_DIR, 'providers.json');

/**
 * 从环境变量解析允许的命令列表
 * EASYAGENT_ALLOWED_COMMANDS="git,npm,node,python,go,docker"
 */
function parseAllowedCommandsFromEnv(): string[] {
  const envVal = process.env.EASYAGENT_ALLOWED_COMMANDS;
  if (envVal) {
    return envVal.split(',').map((c) => c.trim()).filter(Boolean);
  }
  return [];
}

/** 默认允许的命令(如无环境变量则使用此列表) */
const DEFAULT_ALLOWED_COMMANDS = [
  // 版本控制
  'git', 'svn',
  // 包管理
  'npm', 'pnpm', 'yarn', 'pip', 'pip3', 'cargo', 'go', 'gem', 'conda',
  // 运行时
  'node', 'python', 'python3', 'ruby', 'perl', 'php',
  // 编译工具
  'tsc', 'make', 'cmake', 'gcc', 'g++', 'clang',
  // 文件操作
  'ls', 'dir', 'cat', 'echo', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'find',
  'grep', 'head', 'tail', 'wc', 'sort', 'uniq', 'sed', 'awk',
  // 系统信息
  'whoami', 'hostname', 'uname', 'ps', 'top',
  // 网络
  'curl', 'wget',
  // 压缩
  'tar', 'zip', 'unzip', 'gzip', 'gunzip',
];

/** 默认应用配置 */
const DEFAULT_CONFIG: AppConfig = {
  currentModel: {
    provider: 'deepseek',
    model: 'deepseek-v4',
  },
  providers: [],
  agent: {
    maxTurns: 25,
    allowTools: true,
    temperature: 0.7,
  },
  security: {
    allowedCommands: parseAllowedCommandsFromEnv().length > 0 
      ? parseAllowedCommandsFromEnv() 
      : DEFAULT_ALLOWED_COMMANDS,
    requireConfirmation: true,
    dailyTokenLimit: 1_000_000,
  },
  knowledgeBase: {
    enabled: true,
    maxDocuments: 10000,
    chunkSize: 1000,
    embeddingModel: 'bge-large-zh-v1.5',
  },
};

export class ConfigManager {
  private config: AppConfig;
  private configPath: string;
  private providersPath: string;
  private toolSettingsPath: string;

  constructor(configDir?: string) {
    const dir = configDir || CONFIG_DIR;
    this.configPath = join(dir, 'config.json');
    this.providersPath = join(dir, 'providers.json');
    this.toolSettingsPath = join(dir, 'tool_settings.json');
    this.config = DEFAULT_CONFIG;

    // 确保配置目录存在
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 获取已禁用的工具名称列表
   */
  getDisabledToolNames(): string[] {
    try {
      if (existsSync(this.toolSettingsPath)) {
        const raw = readFileSync(this.toolSettingsPath, 'utf-8');
        const settings = JSON.parse(raw);
        return Array.isArray(settings.disabledTools) ? settings.disabledTools : [];
      }
    } catch {
      logger.warn('工具设置文件读取失败，使用默认值');
    }
    return [];
  }

  /**
   * 保存已禁用的工具名称列表
   */
  saveDisabledToolNames(names: string[]): void {
    try {
      writeFileSync(this.toolSettingsPath, JSON.stringify({ disabledTools: names }, null, 2), 'utf-8');
      logger.info({ count: names.length }, '工具禁用列表已保存');
    } catch (error) {
      logger.error({ error }, '工具设置保存失败');
    }
  }

  /**
   * 加载配置
   * 优先级: 环境变量 > 配置文件 > 默认值
   */
  async load(): Promise<AppConfig> {
    try {
      // 启动时异步更新模型目录（不阻塞配置加载）
      this.initModelRegistry().catch((err) => {
        logger.warn({ error: (err as Error).message }, '模型目录后台更新失败');
      });

      // 加载主配置
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8');
        const saved = JSON.parse(raw);
        this.config = { ...DEFAULT_CONFIG, ...saved };
      }

      // 加载提供商配置(加密存储)
      if (existsSync(this.providersPath)) {
        const raw = readFileSync(this.providersPath, 'utf-8');
        const encrypted = JSON.parse(raw);
        for (const [providerId, encryptedKey] of Object.entries(encrypted)) {
          const preset = PROVIDER_PRESETS.find(p => p.id === providerId);
          if (preset && typeof encryptedKey === 'string') {
            try {
              const apiKey = decrypt(encryptedKey);
              // 更新预设中的API密钥
              preset.apiKey = apiKey;
            } catch (err) {
              logger.warn({ providerId }, '提供商API密钥解密失败，可能需要重新设置');
            }
          }
        }
      }

      // 从环境变量覆盖API密钥
      for (const preset of PROVIDER_PRESETS) {
        if (preset.apiKeyEnv) {
          const envKey = process.env[preset.apiKeyEnv];
          if (envKey) {
            preset.apiKey = envKey;
          }
        }
      }

      // 合并远程模型目录到预设中
      this.mergeRemoteModels();

      this.config.providers = PROVIDER_PRESETS.filter(p => p.apiKey);
      
      // 环境变量覆盖当前模型
      const envModel = process.env.EASYAGENT_MODEL;
      if (envModel) {
        const [provider, model] = envModel.split('/');
        if (provider && model) {
          this.config.currentModel = {
            provider: provider as ProviderId,
            model,
          };
        }
      }

      // 环境变量覆盖Agent配置
      if (process.env.EASYAGENT_MAX_TURNS) {
        this.config.agent.maxTurns = parseInt(process.env.EASYAGENT_MAX_TURNS, 10);
      }
      if (process.env.EASYAGENT_TEMPERATURE) {
        this.config.agent.temperature = parseFloat(process.env.EASYAGENT_TEMPERATURE);
      }

      logger.info('配置加载完成');
      return this.config;
    } catch (error) {
      logger.error({ error }, '配置加载失败，使用默认配置');
      this.config = { ...DEFAULT_CONFIG };
      this.config.providers = PROVIDER_PRESETS.filter(p => p.apiKey);
      return this.config;
    }
  }

  /**
   * 初始化模型目录注册中心
   * 异步执行，不阻塞主流程
   */
  private async initModelRegistry(): Promise<void> {
    const registry = getModelRegistry();
    if (!registry.isReady()) {
      await registry.initialize();
      // 注册中心就绪后，刷新预设中的模型列表
      this.mergeRemoteModels();
      // 重新过滤可用提供商
      this.config.providers = PROVIDER_PRESETS.filter(p => p.apiKey);
    }
  }

  /**
   * 将远程模型目录合并到 PROVIDER_PRESETS 中
   * 远程数据优先，本地预设兜底
   */
  private mergeRemoteModels(): void {
    const registry = getModelRegistry();
    if (!registry.isReady()) return;

    for (const preset of PROVIDER_PRESETS) {
      const remoteEntry = registry.getProviderEntry(preset.id);
      if (remoteEntry?.models && remoteEntry.models.length > 0) {
        // 合并策略：远程模型覆盖预设中的同名模型，保留预设中独有的模型
        const remoteIds = new Set(remoteEntry.models.map(m => m.id));
        const merged: ModelConfig[] = [
          // 远程模型（最新）
          ...remoteEntry.models,
          // 预设中独有模型（如旧版本）
          ...preset.models.filter(m => !remoteIds.has(m.id)),
        ];
        preset.models = merged;
        // 如果远程指定了默认模型，更新它
        if (remoteEntry.defaultModel) {
          preset.defaultModel = remoteEntry.defaultModel;
        }
      }
    }
  }

  /**
   * 保存配置
   */
  async save(): Promise<void> {
    try {
      // 保存主配置(不含API密钥)
      const { providers, ...mainConfig } = this.config;
      writeFileSync(this.configPath, JSON.stringify(mainConfig, null, 2), 'utf-8');

      // 加密保存API密钥
      const encryptedKeys: Record<string, string> = {};
      for (const provider of providers) {
        if (provider.apiKey && !provider.apiKeyEnv) {
          encryptedKeys[provider.id] = encrypt(provider.apiKey);
        }
      }
      writeFileSync(this.providersPath, JSON.stringify(encryptedKeys, null, 2), 'utf-8');

      logger.info('配置已保存');
    } catch (error) {
      logger.error({ error }, '配置保存失败');
      throw error;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * 更新部分配置
   */
  updateConfig(partial: Partial<AppConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * 获取当前模型提供商配置
   * 优先从已保存的提供商查找，其次从预设中回退（如 Ollama 无需 API Key）
   */
  getCurrentProvider(): ProviderConfig | undefined {
    const saved = this.config.providers.find(
      p => p.id === this.config.currentModel.provider
    );
    if (saved) return saved;

    // 回退到预设（适用于无需 API Key 的本地提供商如 Ollama）
    const preset = PROVIDER_PRESETS.find(
      p => p.id === this.config.currentModel.provider
    );
    return preset;
  }

  /**
   * 切换当前模型
   */
  switchModel(provider: ProviderId, model: string): void {
    this.config.currentModel = { provider, model };
    logger.info({ provider, model }, '模型已切换');
  }

  /**
   * 获取提供商配置
   */
  getProvider(id: ProviderId): ProviderConfig | undefined {
    return this.config.providers.find(p => p.id === id);
  }

  /**
   * 获取所有可用提供商
   */
  getAvailableProviders(): ProviderConfig[] {
    return this.config.providers;
  }

  /**
   * 设置提供商的API密钥
   * 如果提供商不在可用列表中，从 PROVIDER_PRESETS 查找完整配置后加入
   */
  setApiKey(providerId: ProviderId, apiKey: string): void {
    const provider = this.config.providers.find(p => p.id === providerId);
    if (provider) {
      provider.apiKey = apiKey;
    } else {
      // 从预设中查找完整配置（baseURL、name、apiFormat、models），避免空 URL 导致连接失败
      const preset = PROVIDER_PRESETS.find(p => p.id === providerId);
      if (preset) {
        // 使用预设的完整配置，仅替换 apiKey
        const cloned: ProviderConfig = {
          ...preset,
          apiKey,
        };
        this.config.providers.push(cloned);
      } else {
        // 自定义提供商（不在预设中），使用默认 openai 格式
        this.config.providers.push({
          id: providerId,
          name: providerId,
          baseURL: 'https://api.openai.com/v1',
          apiKey,
          apiFormat: 'openai',
          models: [],
        });
      }
    }
  }

  /**
   * 获取所有提供商预设(用于UI展示)
   */
  getProviderPresets(): ProviderConfig[] {
    return PROVIDER_PRESETS.map(p => ({
      ...p,
      apiKey: p.apiKey ? '••••••••' : '', // 不暴露实际密钥
    }));
  }
}

/** 全局配置管理器单例 */
let configManager: ConfigManager | null = null;

/**
 * 获取配置管理器实例
 */
export function getConfigManager(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}
