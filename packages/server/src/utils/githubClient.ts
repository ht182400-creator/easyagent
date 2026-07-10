/**
 * GitHub API 客户端
 *
 * 负责与 GitHub API 交互，提供：
 * - 按 topic 搜索插件仓库
 * - 获取 Release 信息
 * - 下载 Release 资产
 * - 获取 README 内容
 *
 * 限流处理：
 * - 未认证: 60 req/hr → 自动降级使用本地缓存
 * - 认证 (GITHUB_TOKEN): 5000 req/hr → 正常请求
 *
 * @module githubClient
 */
import { logger } from '@easyagent/core';

// ==================== 类型定义 ====================

/** GitHub 仓库搜索结果 */
export interface GitHubRepo {
  id: number;
  full_name: string;          // owner/repo
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

/** GitHub Release 信息 */
export interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  zipball_url: string;
  assets: GitHubReleaseAsset[];
}

/** GitHub Release 资产 */
export interface GitHubReleaseAsset {
  id: number;
  name: string;
  size: number;
  download_count: number;
  browser_download_url: string;
}

/** GitHub README 响应 */
export interface GitHubReadme {
  content: string;   // Base64 编码
  encoding: string;
  html_url: string;
}

/** 缓存项 */
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  etag?: string;
}

// ==================== 常量 ====================

/** GitHub API 基础 URL */
const GITHUB_API = 'https://api.github.com';

/** 默认缓存 TTL (1小时，用于搜索等低频变更数据) */
const DEFAULT_CACHE_TTL = 60 * 60 * 1000;
/** Release/Manifest 缓存 TTL (5分钟，因为发版后会立即需要最新版本) */
const RELEASE_CACHE_TTL = 5 * 60 * 1000;

/** 未认证限流阈值 (60 req/hr) */
const RATE_LIMIT_THRESHOLD = 10;

// ==================== GitHub 客户端 ====================

export class GitHubClient {
  /** GitHub Personal Access Token */
  private token: string | null = null;
  /** 请求缓存 */
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  /** 剩余请求次数 (由 X-RateLimit-Remaining 更新) */
  private rateLimitRemaining: number = 60;
  /** 限流重置时间戳 */
  private rateLimitReset: number = 0;

  /**
   * 设置 GitHub Token
   * 可通过环境变量 GITHUB_TOKEN 或运行时设置
   */
  setToken(token: string): void {
    this.token = token;
    logger.info('[GitHubClient] Token 已设置，提升 API 限流到 5000 req/hr');
  }

  /**
   * 搜索具有 easyagent-plugin topic 的仓库
   *
   * @param page - 页码 (每页最多 100 条)
   * @param skipCache - 是否跳过缓存
   * @returns 仓库列表
   */
  async searchPluginRepos(page: number = 1, skipCache: boolean = false): Promise<GitHubRepo[]> {
    const cacheKey = `search:plugins:${page}`;
    const cached = this.getCache<GitHubRepo[]>(cacheKey);
    if (cached && !skipCache) {
      return cached;
    }

    const url = `${GITHUB_API}/search/repositories?q=topic:easyagent-plugin&sort=updated&order=desc&per_page=100&page=${page}`;
    const data = await this.request<{ items: GitHubRepo[] }>(url);
    const repos = data?.items || [];

    this.setCache(cacheKey, repos);
    return repos;
  }

  /**
   * 获取仓库的最新 Release
   *
   * @param fullName - owner/repo
   * @param skipCache - 是否跳过内存缓存
   * @returns Release 信息，无 Release 时返回 null
   */
  async getLatestRelease(fullName: string, skipCache: boolean = false): Promise<GitHubRelease | null> {
    const cacheKey = `release:${fullName}`;

    if (!skipCache) {
      const cached = this.getCache<GitHubRelease | null>(cacheKey, RELEASE_CACHE_TTL);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      const url = `${GITHUB_API}/repos/${fullName}/releases/latest`;
      const data = await this.request<GitHubRelease>(url);
      this.setCache(cacheKey, data);
      return data;
    } catch (error) {
      // 仓库可能没有 Release
      logger.warn(`[GitHubClient] ${fullName} 无 Release: ${(error as Error).message}`);
      this.setCache(cacheKey, null);
      return null;
    }
  }

  /**
   * 下载仓库的 zipball
   *
   * @param fullName - owner/repo
   * @param ref - 分支或 tag，默认为 main
   * @returns zip 文件的 Buffer
   */
  async downloadRepoZip(fullName: string, ref: string = 'main'): Promise<Buffer> {
    const url = `${GITHUB_API}/repos/${fullName}/zipball/${ref}`;
    return this.requestBuffer(url);
  }

  /**
   * 下载 Release 的 zipball
   *
   * @param fullName - owner/repo
   * @param tag - Release tag
   * @returns zip 文件的 Buffer
   */
  async downloadReleaseZip(fullName: string, tag: string): Promise<Buffer> {
    const url = `${GITHUB_API}/repos/${fullName}/zipball/${tag}`;
    return this.requestBuffer(url);
  }

  /**
   * 获取仓库 README (HTML 格式，便于前端展示)
   *
   * GitHub 的 `application/vnd.github.html+json` content-type 名义是 JSON，
   * 但实际响应体是顶层裸 HTML 字符串（不是 JSON 包装对象），
   * 因此不能直接用 res.json() 解析，必须用 res.text()。
   *
   * @param fullName - owner/repo
   * @returns HTML 格式的 README 内容
   */
  async getReadmeHtml(fullName: string): Promise<string | null> {
    const cacheKey = `readme:${fullName}`;
    const cached = this.getCache<string | null>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const url = `${GITHUB_API}/repos/${fullName}/readme`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.html+json',
      'User-Agent': 'EasyAgent-Plugin-Market/1.0',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(url, { headers });
      this.updateRateLimit(res.headers);

      if (!res.ok) {
        if (res.status === 403 && this.rateLimitRemaining <= 0) {
          throw new Error('GitHub API 限流已达上限，请配置 GITHUB_TOKEN 或稍后重试');
        }
        if (res.status === 404) {
          throw new Error(`资源不存在: ${url}`);
        }
        throw new Error(`GitHub API 请求失败 (${res.status}): ${res.statusText}`);
      }

      // 关键：用 res.text() 而非 res.json() — 实际响应是裸 HTML 字符串
      const html = await res.text();
      this.setCache(cacheKey, html);
      return html;
    } catch (error) {
      logger.warn(`[GitHubClient] ${fullName} 无 README: ${(error as Error).message}`);
      this.setCache(cacheKey, null);
      return null;
    }
  }

  /**
   * 获取仓库的 manifest.json 内容
   *
   * @param fullName - owner/repo
   * @param skipCache - 是否跳过内存缓存
   * @returns manifest 对象，失败返回 null
   */
  async getManifest(fullName: string, skipCache: boolean = false): Promise<Record<string, unknown> | null> {
    const cacheKey = `manifest:${fullName}`;

    if (!skipCache) {
      const cached = this.getCache<Record<string, unknown> | null>(cacheKey, RELEASE_CACHE_TTL);
      if (cached !== undefined) {
        return cached;
      }
    }

    try {
      const url = `${GITHUB_API}/repos/${fullName}/contents/manifest.json`;
      const data = await this.request<{ content: string; encoding: string }>(url);
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      const manifest = JSON.parse(decoded);
      this.setCache(cacheKey, manifest);
      return manifest;
    } catch (error) {
      logger.warn(`[GitHubClient] ${fullName} 无 manifest.json: ${(error as Error).message}`);
      this.setCache(cacheKey, null);
      return null;
    }
  }

  /**
   * 检查 API 限流状态
   */
  getRateLimit(): { remaining: number; reset: number } {
    return {
      remaining: this.rateLimitRemaining,
      reset: this.rateLimitReset,
    };
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('[GitHubClient] 缓存已清除');
  }

  // ==================== 私有方法 ====================

  /**
   * 发起 JSON 请求
   */
  private async request<T>(url: string, extraHeaders: Record<string, string> = {}): Promise<T> {
    const headers: Record<string, string> = {
      'User-Agent': 'EasyAgent-Plugin-Market/1.0',
      ...extraHeaders,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, { headers });

    // 更新限流信息
    this.updateRateLimit(res.headers);

    if (!res.ok) {
      if (res.status === 403 && this.rateLimitRemaining <= 0) {
        throw new Error('GitHub API 限流已达上限，请配置 GITHUB_TOKEN 或稍后重试');
      }
      if (res.status === 404) {
        throw new Error(`资源不存在: ${url}`);
      }
      throw new Error(`GitHub API 请求失败 (${res.status}): ${res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * 发起 Buffer 请求（下载文件）
   */
  private async requestBuffer(url: string): Promise<Buffer> {
    const headers: Record<string, string> = {
      'User-Agent': 'EasyAgent-Plugin-Market/1.0',
      // 不设置 Accept — GitHub API 的 /zipball 端点不认 application/octet-stream，会返回 415
      // fetch 默认 Accept 即可，GitHub 会 302 重定向到 codeload.github.com 返回 zip
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(url, { headers });

    this.updateRateLimit(res.headers);

    if (!res.ok) {
      throw new Error(`GitHub 下载失败 (${res.status}): ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * 更新限流状态
   */
  private updateRateLimit(headers: Headers): void {
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (remaining) {
      this.rateLimitRemaining = parseInt(remaining, 10);
    }
    if (reset) {
      this.rateLimitReset = parseInt(reset, 10) * 1000; // 转换为毫秒
    }
  }

  /**
   * Base64 解码助手（已不再被内部调用，保留以备未来扩展）
   *
   * 历史背景：旧版 `getReadmeHtml()` 曾用此方法解码 `application/vnd.github.html+json`
   * 返回的 JSON 包装对象 `{content, encoding}`。但实测 GitHub 该 content-type
   * 实际返回**裸 HTML 字符串**（顶层不是 JSON），新版 `getReadmeHtml()` 已改用
   * `res.text()` 直接读 HTML。manifest 路径仍使用内联 `Buffer.from`。
   */
  // private _decodeBase64Field(data: { content: string; encoding: string }): string {
  //   if (data.encoding === 'base64' && data.content) {
  //     return Buffer.from(data.content, 'base64').toString('utf-8');
  //   }
  //   return data.content;
  // }

  /**
   * 获取缓存值（自动检查 TTL）
   *
   * @param key - 缓存键
   * @param ttl - 自定义 TTL（默认使用 DEFAULT_CACHE_TTL）
   */
  private getCache<T>(key: string, ttl: number = DEFAULT_CACHE_TTL): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return undefined;

    if (Date.now() - entry.fetchedAt > ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  /**
   * 设置缓存值
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      fetchedAt: Date.now(),
    });
  }
}

/** 全局单例 */
let globalGitHubClient: GitHubClient | null = null;

/**
 * 获取 GitHubClient 单例
 * 自动从环境变量读取 GITHUB_TOKEN
 */
export function getGitHubClient(): GitHubClient {
  if (!globalGitHubClient) {
    globalGitHubClient = new GitHubClient();
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) {
      globalGitHubClient.setToken(token);
    }
  }
  return globalGitHubClient;
}
