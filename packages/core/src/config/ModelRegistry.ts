/**
 * 模型目录注册中心
 * 负责从远程源下载最新模型信息并缓存到本地文件
 *
 * 设计思路：
 * - 启动时从远程 URL 下载模型目录 JSON → 缓存到 ~/.easyagent/models-catalog.json
 * - 缓存有效期 24 小时，过期后重新下载
 * - 网络失败时使用本地缓存 → 缓存不存在时回退到项目内置 models-catalog.json
 * - 内置也不可用时回退到 ProviderPresets 硬编码兜底
 * - 四级降级链：远程下载 → 本地缓存(24h) → 项目内置文件 → ProviderPresets 硬编码
 * - 所有模块统一从 ModelRegistry 读取模型列表，确保数据一致性
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import type { ProviderConfig, ModelConfig, ProviderId } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** 模型目录的远端 URL */
const CATALOG_URL =
  'https://raw.githubusercontent.com/ht182400-creator/easyagent/main/models-catalog.json';

/** 备用 URL（CDN） */
const CATALOG_URL_FALLBACK =
  'https://cdn.jsdelivr.net/gh/ht182400-creator/easyagent@main/models-catalog.json';

/** 缓存文件路径 */
const CACHE_DIR = join(homedir(), '.easyagent');
const CACHE_FILE = join(CACHE_DIR, 'models-catalog.json');

/** 缓存有效期：24 小时 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * 目录内容的新鲜度阈值（天）
 *
 * 注意与 CACHE_TTL 的区别：
 *   · CACHE_TTL（24h）管的是**本地缓存**多久重新下载一次
 *   · 本阈值管的是**目录文件本身**多久没重新生成
 * 两者不是一回事：缓存再勤快，若目录三个月没重新生成，拉到的也是三个月前的数据。
 */
const DEFAULT_CATALOG_MAX_AGE_DAYS = 30;

/** 目录新鲜度信息 */
export interface CatalogFreshness {
  /** 目录生成时间（ISO 字符串）；未知时为 null */
  generatedAt: string | null;
  /** 目录年龄（天）；无法解析时为 null */
  ageDays: number | null;
  /** 是否超过新鲜度阈值 */
  stale: boolean;
  /** 使用的阈值（天） */
  maxAgeDays: number;
}

/** 下载超时：15 秒 */
const FETCH_TIMEOUT = 15000;

/** 模型目录条目（文件格式） */
interface CatalogEntry {
  /** 提供商 ID */
  provider: ProviderId;
  /** 提供商显示名称 */
  providerName: string;
  /** API 基础 URL */
  baseURL: string;
  /** API 密钥环境变量名 */
  apiKeyEnv: string;
  /** API 格式 */
  apiFormat: 'openai' | 'anthropic' | 'custom';
  /** 默认模型 */
  defaultModel: string;
  /** 模型列表 */
  models: ModelConfig[];
  /** 更新时间戳 */
  updatedAt?: string;
}

/** 模型目录文件格式 */
interface ModelsCatalog {
  /** 文件版本 */
  version: string;
  /** 生成时间 */
  generatedAt: string;
  /** 提供商列表 */
  providers: CatalogEntry[];
}

/** 缓存元数据 */
interface CacheMeta {
  /** 下载时间戳 */
  downloadedAt: number;
  /** 来源 URL */
  source: string;
  /** 目录数据 */
  catalog: ModelsCatalog;
}

/**
 * 判断缓存是否过期
 */
function isCacheStale(cache: CacheMeta): boolean {
  return Date.now() - cache.downloadedAt > CACHE_TTL;
}

/**
 * 从 URL 下载数据
 * @param url - 下载 URL
 * @returns 响应文本，失败返回 null
 */
async function fetchWithTimeout(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'EasyAgent/1.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, '模型目录下载失败(HTTP错误)');
      return null;
    }
    return await res.text();
  } catch (error) {
    logger.warn({ url, error: (error as Error).message }, '模型目录下载失败(网络错误)');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 解析并校验目录文本
 *
 * @param raw - 原始 JSON 文本
 * @param label - 来源标签（仅用于日志定位问题源）
 * @returns 解析后的目录；失败返回 null
 */
function parseCatalog(raw: string, label: string): ModelsCatalog | null {
  try {
    const catalog = JSON.parse(raw) as ModelsCatalog;
    if (!catalog.providers || !Array.isArray(catalog.providers)) {
      logger.warn({ source: label }, '模型目录格式无效(缺少 providers 字段)');
      return null;
    }
    return catalog;
  } catch (error) {
    logger.error({ source: label, error: (error as Error).message }, '模型目录 JSON 解析失败');
    return null;
  }
}

/**
 * 自定义目录源（来自环境变量，优先级高于内置远程源）
 *
 * 背景：内置的两个远程源（GitHub raw / jsDelivr）在部分网络环境下**都不可达**
 * （尤其国内）。此时用户应能指向自建镜像（企业内网、Forgejo、OSS、对象存储…），
 * 而不是被锁死在"只能用缓存"。
 */
const CUSTOM_CATALOG_URL = process.env.EASYAGENT_MODELS_CATALOG_URL || '';
/** 本地目录文件（气隙环境 / 离线手动导入） */
const CUSTOM_CATALOG_FILE = process.env.EASYAGENT_MODELS_CATALOG_FILE || '';
/** 额外镜像（逗号分隔），会在内置源之前尝试 */
const CATALOG_MIRRORS = (process.env.EASYAGENT_MODELS_CATALOG_MIRRORS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** 目录加载结果（带来源，供状态展示与排障） */
export interface CatalogLoadResult {
  catalog: ModelsCatalog;
  /** 人类可读的来源描述 */
  source: string;
}

/**
 * 按**优先级**依次尝试各目录源
 *
 * ── 优先级设计（为什么是这个顺序）──
 *   1. 自定义 URL      —— 用户显式指定，直接反映其网络环境，最高优先
 *   2. 本地文件        —— 气隙/离线场景，同样是用户显式指定
 *   3. 额外镜像        —— 用户补充的镜像（如自建 Forgejo / OSS）
 *   4. GitHub raw      —— 内置主源
 *   5. jsDelivr CDN    —— 内置备用源
 *
 * 任何一步失败都**继续尝试下一步**，全部失败才返回 null（由上层退回本地缓存/内置数据）。
 * 这样"连不上 GitHub"不会变成"没有模型可选"，只是**用了哪个源**的问题。
 */
async function loadCatalogFromSources(): Promise<CatalogLoadResult | null> {
  // ① 自定义 URL
  if (CUSTOM_CATALOG_URL) {
    const raw = await fetchWithTimeout(CUSTOM_CATALOG_URL);
    const catalog = raw ? parseCatalog(raw, `自定义URL ${CUSTOM_CATALOG_URL}`) : null;
    if (catalog) return { catalog, source: `自定义URL ${CUSTOM_CATALOG_URL}` };
  }

  // ② 本地文件
  if (CUSTOM_CATALOG_FILE) {
    try {
      if (!existsSync(CUSTOM_CATALOG_FILE)) {
        logger.warn({ file: CUSTOM_CATALOG_FILE }, '自定义模型目录文件不存在');
      } else {
        const catalog = parseCatalog(
          readFileSync(CUSTOM_CATALOG_FILE, 'utf-8'),
          `本地文件 ${CUSTOM_CATALOG_FILE}`,
        );
        if (catalog) return { catalog, source: `本地文件 ${CUSTOM_CATALOG_FILE}` };
      }
    } catch (error) {
      logger.warn(
        { file: CUSTOM_CATALOG_FILE, error: (error as Error).message },
        '读取自定义模型目录文件失败',
      );
    }
  }

  // ③ 额外镜像
  for (const mirror of CATALOG_MIRRORS) {
    const raw = await fetchWithTimeout(mirror);
    const catalog = raw ? parseCatalog(raw, `镜像 ${mirror}`) : null;
    if (catalog) return { catalog, source: `镜像 ${mirror}` };
  }

  // ④ GitHub raw（内置主源）
  const primaryRaw = await fetchWithTimeout(CATALOG_URL);
  const primary = primaryRaw ? parseCatalog(primaryRaw, 'GitHub raw') : null;
  if (primary) return { catalog: primary, source: 'GitHub raw' };

  // ⑤ jsDelivr CDN（内置备用源）
  const fallbackRaw = await fetchWithTimeout(CATALOG_URL_FALLBACK);
  const fallback = fallbackRaw ? parseCatalog(fallbackRaw, 'jsDelivr CDN') : null;
  if (fallback) return { catalog: fallback, source: 'jsDelivr CDN' };

  logger.warn(
    { triedCustomUrl: !!CUSTOM_CATALOG_URL, triedFile: !!CUSTOM_CATALOG_FILE, mirrors: CATALOG_MIRRORS.length },
    '所有模型目录源均不可用，将退回本地缓存/内置数据',
  );
  return null;
}

/**
 * 读取本地缓存的模型目录
 */
function readLocalCache(): CacheMeta | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    const cache: CacheMeta = JSON.parse(raw);
    if (!cache.catalog || !cache.catalog.providers) return null;
    return cache;
  } catch (error) {
    logger.warn({ error: (error as Error).message }, '读取模型缓存失败');
    return null;
  }
}

/**
 * 将目录写入本地缓存
 */
function writeLocalCache(catalog: ModelsCatalog, source: string): void {
  try {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    const cache: CacheMeta = {
      downloadedAt: Date.now(),
      source,
      catalog,
    };
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    logger.info('模型目录已缓存到本地');
  } catch (error) {
    logger.warn({ error: (error as Error).message }, '写入模型缓存失败');
  }
}

/**
 * 尝试从项目目录读取内置的 models-catalog.json 作为兜底
 * 搜索路径：1) process.cwd()/models-catalog.json  2) ../../models-catalog.json (相对于 dist 目录)
 * @returns 模型目录，如果都不存在返回 null
 */
function readBundledCatalog(): ModelsCatalog | null {
  // 查找路径：项目根目录
  const searchPaths = [
    resolve(process.cwd(), 'models-catalog.json'),
    resolve(process.cwd(), '..', 'models-catalog.json'),
    resolve(process.cwd(), '..', '..', 'models-catalog.json'),
  ];

  for (const filePath of searchPaths) {
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8');
        const catalog: ModelsCatalog = JSON.parse(raw);
        if (catalog.providers && Array.isArray(catalog.providers)) {
          logger.info({ path: filePath }, '使用项目内置的模型目录作为兜底');
          return catalog;
        }
      }
    } catch (err) {
      // 继续尝试下一个路径
    }
  }
  return null;
}

/**
 * 模型目录注册中心
 * 单例模式，负责管理模型目录的下载和缓存
 */
export class ModelRegistry {
  private catalog: ModelsCatalog | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  /**
   * 当前目录数据的来源描述
   *
   * 排障关键信息：用户遇到"模型列表不新"时，第一件事就是确认
   * **数据到底来自哪里** —— 远程？缓存？内置兜底？
   * 不暴露来源会让这类问题只能靠猜。
   */
  private source: string | null = null;

  /**
   * 初始化：加载本地缓存，必要时从远程更新
   * @param forceRefresh - 是否强制刷新（跳过缓存有效期检查）
   */
  async initialize(forceRefresh = false): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize(forceRefresh);
    return this.initPromise;
  }

  private async doInitialize(forceRefresh: boolean): Promise<void> {
    try {
      // 1. 读取本地缓存
      const localCache = readLocalCache();

      // 2. 决定是否需要远程更新
      const needFetch = forceRefresh || !localCache || isCacheStale(localCache);

      if (needFetch) {
        logger.info('正在按优先级从各目录源获取最新模型目录...');
        const loaded = await loadCatalogFromSources();

        if (loaded) {
          this.catalog = loaded.catalog;
          this.source = loaded.source;
          writeLocalCache(loaded.catalog, loaded.source);
          logger.info(
            { version: loaded.catalog.version, providers: loaded.catalog.providers.length, source: loaded.source },
            '模型目录已更新',
          );
        } else if (localCache) {
          // 所有远程源都失败，使用本地缓存（**不因网络问题丢弃已有数据**）
          this.catalog = localCache.catalog;
          this.source = `${localCache.source}（缓存，远程不可达）`;
          logger.warn({ cachedSource: localCache.source }, '所有目录源不可达，使用本地缓存模型目录');
        } else {
          // 远程和缓存都失败，尝试项目内置的 models-catalog.json 兜底
          const bundled = readBundledCatalog();
          if (bundled) {
            this.catalog = bundled;
            this.source = '应用内置数据（无网络且无缓存）';
            // 将内置目录写入缓存，下次启动可直接使用
            writeLocalCache(bundled, 'bundled:models-catalog.json');
            logger.warn(
              { version: bundled.version, providers: bundled.providers.length },
              '无网络且无缓存，使用应用内置模型目录',
            );
          }
        }
      } else {
        // 缓存未过期，直接使用
        this.catalog = localCache!.catalog;
        this.source = `${localCache.source}（缓存）`;
        logger.info({ source: this.source }, '使用本地缓存模型目录');
      }

      this.initialized = true;
    } catch (error) {
      logger.error({ error: (error as Error).message }, '模型目录初始化失败');
      // 尝试从本地缓存恢复
      const localCache = readLocalCache();
      if (localCache) {
        this.catalog = localCache.catalog;
        this.source = `${localCache.source}（缓存，初始化异常）`;
        this.initialized = true;
      } else {
        // 最后尝试内置兜底
        const bundled = readBundledCatalog();
        if (bundled) {
          this.catalog = bundled;
          this.source = '应用内置数据（初始化异常且无缓存）';
          writeLocalCache(bundled, 'bundled:models-catalog.json');
          this.initialized = true;
        }
      }
    }
  }

  /**
   * 获取指定提供商的模型列表
   * @param providerId - 提供商 ID
   * @returns 模型列表，如果未初始化返回 null
   */
  getModels(providerId: ProviderId): ModelConfig[] | null {
    if (!this.catalog) return null;
    const entry = this.catalog.providers.find((p) => p.provider === providerId);
    return entry?.models || null;
  }

  /**
   * 获取指定提供商的完整目录条目
   * @param providerId - 提供商 ID
   * @returns 目录条目，如果未初始化返回 null
   */
  getProviderEntry(providerId: ProviderId): CatalogEntry | null {
    if (!this.catalog) return null;
    return this.catalog.providers.find((p) => p.provider === providerId) || null;
  }

  /**
   * 获取所有提供商的目录条目
   * @returns 所有条目的数组，如果未初始化返回 null
   */
  getAllEntries(): CatalogEntry[] | null {
    if (!this.catalog) return null;
    return this.catalog.providers;
  }

  /**
   * 获取完整的模型目录
   */
  getCatalog(): ModelsCatalog | null {
    return this.catalog;
  }

  /**
   * 获取目录版本信息
   */
  getVersion(): string | null {
    return this.catalog?.version || null;
  }

  /**
   * 获取上次更新时间
   */
  getGeneratedAt(): string | null {
    return this.catalog?.generatedAt || null;
  }

  /**
   * 获取当前目录数据的来源
   *
   * 例：`GitHub raw` / `自定义URL https://…` / `缓存，远程不可达`
   *
   * 用途：用户反馈"模型列表不新"时，先看这里就知道数据是从哪来的 ——
   * 是拿到了新的远程数据，还是一直在吃缓存/内置兜底。
   */
  getSource(): string | null {
    return this.source;
  }

  /**
   * 是否已初始化
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * 目录新鲜度
   *
   * ── 为什么需要它 ──
   * 客户端每次启动都会自动下载远程目录，但**下载成功 ≠ 数据新鲜**：
   * 若目录文件本身三个月没重新生成，客户端每天都在拉一份旧数据，
   * 厂商的新模型永远不出现 —— 而界面上看不出任何异常。
   *
   * 本方法把"目录有多旧"变成可断言的事实，供启动告警与 UI 提示使用。
   *
   * @param maxAgeDays - 允许的最大年龄（天），默认 30
   */
  getFreshness(maxAgeDays = DEFAULT_CATALOG_MAX_AGE_DAYS): CatalogFreshness {
    const generatedAt = this.catalog?.generatedAt || null;
    const parsed = generatedAt ? Date.parse(generatedAt) : NaN;
    const age = Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : (Date.now() - parsed) / 86_400_000;
    return {
      generatedAt,
      ageDays: Number.isFinite(age) ? Number(age.toFixed(1)) : null,
      stale: !Number.isFinite(age) || age > maxAgeDays,
      maxAgeDays,
    };
  }

  /**
   * 找出「已不在目录中」的模型 —— 用于识别厂商下线 / 改名
   *
   * ⚠️ 只做**提示**，不自动改用户配置：擅自切换模型会改变回答质量与费用，
   *    必须由用户确认。
   *
   * @param providerId - 提供商 ID
   * @param modelIds - 待检查的模型 ID 列表
   * @returns 目录中找不到的模型 ID
   */
  findMissingModels(providerId: string, modelIds: readonly string[]): string[] {
    const provider = this.catalog?.providers?.find((p) => p.provider === providerId);
    if (!provider) return [];
    const known = new Set((provider.models || []).map((m) => m.id));
    return modelIds.filter((id) => !known.has(id));
  }

  /**
   * 把厂商实时返回的模型列表**并入**目录（只增不改）
   *
   * ── 为什么需要它 ──
   * 内置的目录分发源（GitHub raw / jsDelivr）在部分网络环境下**都不可达**。
   * 但厂商自己的 API（`api.deepseek.com` 等）通常**可以直连**，而且是"厂商一发
   * 新模型、`/models` 立刻就有"的第一手数据。
   *
   * 于是形成互补：**元数据靠目录分发，模型列表靠厂商直连**。
   * 连不上 GitHub 时，用户配置了 API Key 的厂商仍能带来最新模型。
   *
   * ── 安全边界（重要）──
   *   · **只新增**，绝不删除或覆盖已有条目 —— 避免厂商端点临时抖动导致"模型消失"
   *   · 新增条目标记 `unverified: true`：厂商 `/models` 不返回价格/上下文等元数据，
   *     这里给保守默认值，界面上应能区分"已校准"与"未校准"，**不能假装元数据是准的**
   *
   * @param providerId - 提供商 ID
   * @param modelIds - 厂商返回的模型 ID 列表
   * @param sourceLabel - 来源描述（写入日志与来源字段，便于排障）
   * @returns 实际新增的模型数量
   */
  mergeModels(providerId: string, modelIds: readonly string[], sourceLabel: string): number {
    const entry = this.catalog?.providers?.find((p) => p.provider === providerId);
    if (!entry || !Array.isArray(entry.models)) return 0;

    const known = new Set(entry.models.map((m) => m.id));
    const added: string[] = [];
    for (const id of modelIds) {
      if (!id || known.has(id)) continue;
      entry.models.push({
        id,
        name: id,
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
        pricing: { input: 0, output: 0 },
        unverified: true,
      } as ModelConfig);
      known.add(id);
      added.push(id);
    }

    if (added.length > 0) {
      logger.info(
        { providerId, added: added.length, source: sourceLabel, models: added.slice(0, 10) },
        '已从厂商 API 并入新模型（元数据未校准，已标记 unverified）',
      );
    }
    return added.length;
  }

  /**
   * 强制刷新：忽略缓存，从远程重新下载
   */
  async refresh(): Promise<void> {
    this.initPromise = null;
    await this.initialize(true);
  }
}

/** 全局单例 */
let registryInstance: ModelRegistry | null = null;

/**
 * 获取模型目录注册中心实例
 */
export function getModelRegistry(): ModelRegistry {
  if (!registryInstance) {
    registryInstance = new ModelRegistry();
  }
  return registryInstance;
}

/**
 * 重置单例（主要用于测试）
 */
export function resetModelRegistry(): void {
  registryInstance = null;
}
