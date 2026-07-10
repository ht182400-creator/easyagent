/**
 * 插件市场服务
 *
 * 负责：
 * - 从 GitHub 拉取插件列表并缓存
 * - 安装/卸载/更新插件
 * - 安装队列管理
 * - 版本比对
 *
 * @module PluginMarketService
 */
import { join, resolve } from 'node:path';
import {
  existsSync, mkdirSync, rmSync, readFileSync, writeFileSync,
  readdirSync, copyFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { getGitHubClient, type GitHubRepo } from '../utils/githubClient.js';
import { logger } from '@easyagent/core';

// ==================== 类型定义 ====================

/** 插件市场条目 (远程) */
export interface MarketPlugin {
  id: string;              // owner/repo
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  stars: number;
  updatedAt: string;
  repoUrl: string;
  iconUrl?: string;
  tags: string[];
  /** 权限声明 */
  permissions: PluginPermissionsSummary | null;
}

/** 权限摘要 (前端展示用) */
export interface PluginPermissionsSummary {
  filesystem?: { read: boolean; write: boolean };
  network?: { allowAll: boolean; domains: string[] };
  shell?: boolean;
  notifications?: boolean;
  clipboard?: boolean;
}

/** 已安装插件信息 */
export interface InstalledPluginInfo {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  installedAt: string;
  /** 来源：market | local */
  source: 'market' | 'local';
  /** 本地路径 */
  localPath: string;
  /** 是否有可用更新 */
  updateAvailable: boolean;
  latestVersion?: string;
}

/** 安装任务 */
export interface InstallJob {
  jobId: string;
  pluginId: string;
  version: string;
  status: 'pending' | 'downloading' | 'extracting' | 'loading' | 'done' | 'error';
  error?: string;
  progress: number;  // 0-100
}

/** 已安装插件持久化文件结构 */
interface InstalledManifest {
  plugins: {
    id: string;
    name: string;
    version: string;
    installedAt: string;
    source: 'market' | 'local';
  }[];
}

/** 插件市场缓存结构 */
interface MarketCache {
  plugins: MarketPlugin[];
  fetchedAt: number;
  etag?: string;
}

// ==================== 常量 ====================

/** 用户插件根目录（默认，可被构造函数覆盖） */
const USER_PLUGINS_DIR = join(homedir(), '.easyagent', 'plugins');

/** 市场缓存 TTL (1小时) */
const MARKET_CACHE_TTL = 60 * 60 * 1000;

// ==================== 服务实现 ====================

/** 插件加载/卸载回调类型 */
export type PluginLoadCallback = (pluginDir: string) => Promise<void>;
/** 卸载回调：接收 pluginId 或 name，返回卸载后真正使用的 plugin name（用于定位磁盘目录） */
export type PluginUnloadCallback = (nameOrId: string) => Promise<string | null>;

export class PluginMarketService {
  /** 插件安装目录 */
  private pluginsDir: string;
  /** 插件缓存目录 */
  private cacheDir: string;
  /** 已安装清单路径 */
  private installedPath: string;
  /** 市场缓存路径 */
  private marketCachePath: string;
  /** 安装任务队列 */
  private installJobs: Map<string, InstallJob> = new Map();
  /** 安装进度回调 */
  private progressCallbacks: Array<(job: InstallJob) => void> = [];
  /** 插件加载回调（安装完成后通知 PluginManager） */
  private onPluginLoad: PluginLoadCallback | null = null;
  /** 插件卸载回调（卸载时通知 PluginManager） */
  private onPluginUnload: PluginUnloadCallback | null = null;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir || USER_PLUGINS_DIR;
    this.cacheDir = join(this.pluginsDir, '.cache');
    this.installedPath = join(this.pluginsDir, 'installed.json');
    this.marketCachePath = join(this.cacheDir, 'market.json');
  }

  /**
   * 注册插件加载回调（安装完成后将插件注册到 PluginManager）
   */
  setPluginLoadCallback(callback: PluginLoadCallback): void {
    this.onPluginLoad = callback;
  }

  /**
   * 注册插件卸载回调（卸载时从 PluginManager 移除）
   */
  setPluginUnloadCallback(callback: PluginUnloadCallback): void {
    this.onPluginUnload = callback;
  }

  /**
   * 获取插件安装目录
   */
  getPluginsDir(): string {
    return this.pluginsDir;
  }

  /**
   * 获取插件市场列表
   *
   * @param forceRefresh - 是否强制刷新（跳过缓存）
   * @returns 插件市场条目数组
   */
  async listMarket(forceRefresh: boolean = false): Promise<MarketPlugin[]> {
    // 检查本地缓存
    if (!forceRefresh) {
      const cached = this.loadMarketCache();
      if (cached) return cached;
    }

    // 从 GitHub 拉取
    const client = getGitHubClient();
    const installedSet = this.getInstalledIds();

    // 强制刷新时，清空 GitHubClient 的内存缓存，确保拿到最新数据
    if (forceRefresh) {
      client.clearCache();
    }

    try {
      const repos = await client.searchPluginRepos(1, forceRefresh);

      const plugins: MarketPlugin[] = [];
      for (const repo of repos) {
        try {
          const latestRelease = await client.getLatestRelease(repo.full_name, forceRefresh);
          const manifest = await client.getManifest(repo.full_name, forceRefresh);

          // 必须存在 manifest.json 才认为是有效的 EasyAgent 插件
          if (!manifest) {
            logger.info(`[PluginMarket] 跳过 ${repo.full_name}: 无 manifest.json`);
            continue;
          }

          const version = latestRelease?.tag_name || '0.0.0';
          const downloads = latestRelease?.assets?.reduce(
            (sum, a) => sum + a.download_count, 0
          ) || 0;

          plugins.push({
            id: repo.full_name,
            name: manifest?.name as string || repo.name,
            description: manifest?.description as string || repo.description || '',
            author: repo.owner.login,
            version: version.replace(/^v/, ''),
            downloads,
            stars: repo.stargazers_count,
            updatedAt: repo.updated_at,
            repoUrl: repo.html_url,
            tags: repo.topics?.filter((t) => t !== 'easyagent-plugin') || [],
            permissions: this.extractPermissions(manifest?.permissions),
          });
        } catch (err) {
          logger.warn(`[PluginMarket] 解析仓库 ${repo.full_name} 失败: ${(err as Error).message}`);
        }
      }

      // 保存缓存
      this.saveMarketCache(plugins);
      return plugins;
    } catch (error) {
      logger.error(`[PluginMarket] 获取市场列表失败: ${(error as Error).message}`);
      // 降级：返回过期缓存
      return this.loadMarketCache(true) || [];
    }
  }

  /**
   * 获取单个插件详情（含 README HTML）
   *
   * @param pluginId - owner/repo
   * @returns 插件详情
   */
  async getPluginDetail(pluginId: string): Promise<{
    plugin: MarketPlugin | null;
    readmeHtml: string | null;
  }> {
    const client = getGitHubClient();

    try {
      const [latestRelease, manifest, readmeHtml] = await Promise.all([
        client.getLatestRelease(pluginId),
        client.getManifest(pluginId),
        client.getReadmeHtml(pluginId),
      ]);

      const version = latestRelease?.tag_name || '0.0.0';

      const plugin: MarketPlugin = {
        id: pluginId,
        name: (manifest?.name as string) || pluginId.split('/')[1],
        description: (manifest?.description as string) || '',
        author: pluginId.split('/')[0],
        version: version.replace(/^v/, ''),
        downloads: latestRelease?.assets?.reduce((sum, a) => sum + a.download_count, 0) || 0,
        stars: 0,
        updatedAt: latestRelease?.published_at || '',
        repoUrl: `https://github.com/${pluginId}`,
        tags: (manifest?.keywords as string[]) || [],
        permissions: this.extractPermissions(manifest?.permissions),
      };

      return { plugin, readmeHtml };
    } catch (error) {
      logger.error(`[PluginMarket] 获取插件详情失败 ${pluginId}: ${(error as Error).message}`);
      return { plugin: null, readmeHtml: null };
    }
  }

  /**
   * 安装插件
   *
   * @param pluginId - owner/repo
   * @param version - 指定版本 (可选，默认最新 Release)
   * @returns 安装任务 jobId
   */
  async installPlugin(pluginId: string, version?: string): Promise<string> {
    const jobId = `install_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: InstallJob = {
      jobId,
      pluginId,
      version: version || 'latest',
      status: 'pending',
      progress: 0,
    };

    this.installJobs.set(jobId, job);

    // 异步执行安装
    this.executeInstall(jobId).catch((err) => {
      logger.error(`[PluginMarket] 安装失败 ${pluginId}: ${err.message}`);
      this.updateJob(jobId, { status: 'error', error: err.message });
    });

    return jobId;
  }

  /**
   * 查询安装进度
   *
   * @param jobId - 安装任务 ID
   * @returns 安装任务信息
   */
  getInstallProgress(jobId: string): InstallJob | null {
    return this.installJobs.get(jobId) || null;
  }

  /**
   * 注册安装进度回调（用于 WebSocket 推送）
   */
  onProgress(callback: (job: InstallJob) => void): () => void {
    this.progressCallbacks.push(callback);
    return () => {
      this.progressCallbacks = this.progressCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * 卸载插件
   *
   * @param pluginId - owner/repo 或 plugin name（兼容前端传不同形式）
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    // 1. 通知 PluginManager 先卸载插件，同时获取实际使用的 plugin name（manifest.name）
    //    因为 repo 名（如 easyagent-plugin-obsidian-doc-viewer）和 manifest.name（如 obsidian-doc-viewer）不同
    //    删除磁盘目录必须用真正的目录名（即 plugin 目录的最后一段路径）
    let actualName: string | null = null;
    if (this.onPluginUnload) {
      try {
        actualName = await this.onPluginUnload(pluginId);
      } catch (err) {
        logger.warn(`[PluginMarket] 从 PluginManager 卸载失败: ${(err as Error).message}`);
      }
    }

    // 2. 优先用 PluginManager 反馈的 sourcePath basename 删目录（最准确）
    const candidateDirs: string[] = [];
    if (actualName) {
      // 通过 installed.json 查 sourcePath，或直接拼装
      candidateDirs.push(join(this.pluginsDir, actualName));
    }
    // 兜底：直接用 pluginIdToName 拼装
    const pluginName = this.pluginIdToName(pluginId);
    if (pluginName && !candidateDirs.includes(join(this.pluginsDir, pluginName))) {
      candidateDirs.push(join(this.pluginsDir, pluginName));
    }

    for (const dir of candidateDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
        logger.info(`[PluginMarket] 已删除插件目录: ${dir}`);
      }
    }

    // 3. 更新 installed.json：兼容多种 id/name 形式
    this.removeFromInstalled(pluginId, actualName ?? pluginName);
  }

  /**
   * 获取已安装插件列表
   */
  getInstalledPlugins(): InstalledPluginInfo[] {
    const installed = this.loadInstalledManifest();
    return installed.plugins.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      author: p.id.split('/')[0],
      description: '',
      enabled: true,
      installedAt: p.installedAt,
      source: p.source,
      localPath: join(this.pluginsDir, this.pluginIdToName(p.id)),
      updateAvailable: false,
    }));
  }

  /**
   * 检查全部已安装插件的更新
   */
  async checkAllUpdates(): Promise<Map<string, string | null>> {
    const client = getGitHubClient();
    const installed = this.loadInstalledManifest();
    const updates = new Map<string, string | null>();

    // 检查更新必须获取最新 Release，跳过内存缓存（避免旧缓存误报"已是最新"）
    client.clearCache();

    for (const p of installed.plugins) {
      try {
        const release = await client.getLatestRelease(p.id, true);
        if (release) {
          const latestVersion = release.tag_name.replace(/^v/, '');
          if (this.isNewer(latestVersion, p.version)) {
            updates.set(p.id, latestVersion);
          } else {
            updates.set(p.id, null);  // 已是最新
          }
        }
      } catch {
        updates.set(p.id, null);
      }
    }

    return updates;
  }

  /**
   * 获取已安装插件 ID 集合
   */
  getInstalledIds(): Set<string> {
    const installed = this.loadInstalledManifest();
    return new Set(installed.plugins.map((p) => p.id));
  }

  /**
   * 清除市场缓存（磁盘 + 内存），配合 listMarket(forceRefresh=true) 可获取最新数据
   */
  clearMarketCache(): void {
    // 清除磁盘缓存
    try {
      if (existsSync(this.marketCachePath)) {
        rmSync(this.marketCachePath, { force: true });
        logger.info('[PluginMarket] 磁盘市场缓存已清除');
      }
    } catch (err) {
      logger.warn(`[PluginMarket] 清除磁盘缓存失败: ${(err as Error).message}`);
    }

    // 清除内存缓存（GitHubClient 单例）
    try {
      const client = getGitHubClient();
      client.clearCache();
      logger.info('[PluginMarket] GitHubClient 内存缓存已清除');
    } catch (err) {
      logger.warn(`[PluginMarket] 清除内存缓存失败: ${(err as Error).message}`);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 执行安装流程
   */
  private async executeInstall(jobId: string): Promise<void> {
    const job = this.installJobs.get(jobId);
    if (!job) return;

    const client = getGitHubClient();
    const pluginName = this.pluginIdToName(job.pluginId);
    const pluginDir = join(this.pluginsDir, pluginName);

    try {
      // 1. 下载阶段 (0-40%)
      this.updateJob(jobId, { status: 'downloading', progress: 0 });
      logger.info(`[PluginMarket] 开始下载: ${job.pluginId}`);

      // 获取 Release 信息确定 tag（跳过缓存，确保安装最新版本）
      const release = await client.getLatestRelease(job.pluginId, true);
      const ref = release?.tag_name || 'main';

      this.updateJob(jobId, { progress: 20, version: ref });

      // 优先下载预构建产物 plugin.zip（由 GitHub Actions 在 Release 时自动构建上传）
      // plugin.zip 包含 manifest.json + plugin.js + dist/ 完整插件目录
      const pluginAsset = release?.assets?.find((a) => a.name === 'plugin.zip');

      if (pluginAsset) {
        // 方案 D: 下载预构建的 plugin.zip，解压后目录结构完整
        this.updateJob(jobId, { status: 'downloading', progress: 30 });
        logger.info(`[PluginMarket] 下载预构建产物 plugin.zip: ${pluginAsset.browser_download_url}`);

        const pluginBuffer = await this.downloadReleaseAsset(job.pluginId, pluginAsset.id);

        if (existsSync(pluginDir)) {
          rmSync(pluginDir, { recursive: true, force: true });
        }
        await this.ensureDir(pluginDir);

        const tmpDir = join(this.cacheDir, `_tmp_${pluginName}`);
        await this.extractZip(pluginBuffer, tmpDir, pluginDir);

        this.updateJob(jobId, { progress: 70 });
      } else {
        // 降级: 下载源码 zip（无 plugin.zip 时）— 旧版兼容
        this.updateJob(jobId, { status: 'downloading', progress: 30 });
        logger.info(`[PluginMarket] 无预构建产物，下载源码: ${job.pluginId} @ ${ref}`);

        const zipBuffer = await client.downloadRepoZip(job.pluginId, ref);
        this.updateJob(jobId, { progress: 40 });

        // 2. 解压阶段 (40-70%)
        this.updateJob(jobId, { status: 'extracting', progress: 50 });

        // 如果目标目录已存在，先清理（用于更新场景）
        if (existsSync(pluginDir)) {
          rmSync(pluginDir, { recursive: true, force: true });
        }
        await this.ensureDir(pluginDir);

        // 解压 zip 到临时目录
        const tmpDir = join(this.cacheDir, `_tmp_${pluginName}`);
        await this.extractZip(zipBuffer, tmpDir, pluginDir);
        this.updateJob(jobId, { progress: 70 });
      }

      // 3. 注册阶段 (70-90%)
      this.updateJob(jobId, { status: 'loading', progress: 80 });

      // 验证 manifest.json 存在
      const manifestPath = join(pluginDir, 'manifest.json');
      if (!existsSync(manifestPath)) {
        throw new Error('插件缺少 manifest.json 文件');
      }

      // 记录到 installed.json
      this.addToInstalled(job.pluginId, pluginName, ref);

      this.updateJob(jobId, { progress: 85 });

      // 4. 通知 PluginManager 加载插件 (85-95%)
      if (this.onPluginLoad) {
        try {
          await this.onPluginLoad(pluginDir);
          logger.info(`[PluginMarket] 插件已注册到 PluginManager: ${pluginName}`);
        } catch (err) {
          logger.error(`[PluginMarket] 注册到 PluginManager 失败: ${(err as Error).message}`);
          // 不阻断流程，插件文件已就绪
        }
      }

      this.updateJob(jobId, { progress: 95 });

      // 5. 完成 (100%)
      this.updateJob(jobId, { status: 'done', progress: 100 });
      logger.info(`[PluginMarket] 安装完成: ${job.pluginId} v${ref}`);

    } catch (error) {
      // 清理失败的安装
      try {
        if (existsSync(pluginDir)) {
          rmSync(pluginDir, { recursive: true, force: true });
        }
      } catch { /* 忽略清理错误 */ }
      throw error;
    }
  }

  /**
   * 下载 Release Asset（公开 URL，无需 GitHub Token）
   *
   * 直接使用 browser_download_url 下载。**注意**：当用户环境无法访问
   * github.com / codeload.github.com / raw.githubusercontent.com 等域名时
   * （国内网络环境常见），会报 fetch failed。安装流程请改用 `downloadReleaseAsset`。
   */
  private async downloadAsset(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`下载 Release Asset 失败 (${res.status}): ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * 通过 GitHub API 域下载 Release Asset（推荐）
   *
   * GitHub 在 release asset 上的 `browser_download_url`（github.com / codeload.github.com）
   * 走 302 重定向到 `release-assets.githubusercontent.com`，但 **github.com 系列域名在部分
   * 地区/网络环境无法直连**。而 `api.github.com/repos/{owner}/{repo}/releases/assets/{id}`
   * 会 302 重定向到同样的 CDN URL，但请求先走 `api.github.com`（API 域名通常可达），
   * 跟随重定向后到达 CDN 完成下载。
   *
   * @param fullName - owner/repo
   * @param assetId - GitHub asset ID（来自 release JSON 的 assets[].id）
   */
  private async downloadReleaseAsset(fullName: string, assetId: number): Promise<Buffer> {
    const url = `https://api.github.com/repos/${fullName}/releases/assets/${assetId}`;
    const headers: Record<string, string> = {
      'User-Agent': 'EasyAgent-Plugin-Market/1.0',
      'Accept': 'application/octet-stream',
    };
    // 如果配置了 Token，带上可走认证下载（避免匿名限流）
    try {
      const client = getGitHubClient();
      const token = (client as unknown as { token?: string | null }).token;
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // getGitHubClient 失败不影响下载
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`下载 Release Asset 失败 (${res.status}): ${res.statusText}${text ? ' - ' + text.slice(0, 200) : ''}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * 解压 zip 文件到目标目录
   */
  private async extractZip(
    buffer: Buffer,
    tmpDir: string,
    targetDir: string,
  ): Promise<void> {
    // 动态导入 adm-zip（避免顶层依赖）
    // 使用内置模块手动解压
    const { execSync } = await import('node:child_process');

    // 确保目录存在
    await this.ensureDir(tmpDir);

    // 写入临时 zip 文件
    const tmpZip = join(tmpDir, 'plugin.zip');
    writeFileSync(tmpZip, buffer);

    // 使用 PowerShell 解压（Windows 兼容）
    // 先用 PowerShell Expand-Archive
    try {
      execSync(
        `powershell -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${tmpDir}' -Force"`,
        { stdio: 'pipe', timeout: 30000 },
      );
    } catch {
      // 如果 PowerShell 解压失败，尝试 node 内置
      // 降级：直接提示需要解压工具
      logger.warn('[PluginMarket] PowerShell 解压失败，尝试 node 内置解压');
      // 临时方案：如果 zip 是 GitHub format，目录会有一层包装
    }

    // GitHub zipball 解压后会在第一层有一个 owner-repo-hash 目录（如 ht182400-creator-easyagent-plugin-obsidian-doc-viewer-xxxxxx/）
    // 本地 zip -r 产物（如 plugin.zip）则是平铺结构
    // 区分方法：检查解压后顶层是否有 manifest.json/plugin.js 标记文件，有则是平铺结构
    const { readdirSync, renameSync } = await import('node:fs');
    const dirs = readdirSync(tmpDir, { withFileTypes: true });
    const isFlatLayout = dirs.some(
      (d) => d.isFile() && (d.name === 'manifest.json' || d.name === 'plugin.js')
    );

    if (!isFlatLayout) {
      // GitHub zipball 模式：找唯一子目录
      const extractDir = dirs.find(
        (d) => d.isDirectory() && !d.name.startsWith('_') && d.name !== 'plugin.zip'
      );

      if (extractDir) {
        const srcDir = join(tmpDir, extractDir.name);
        await this.ensureDir(targetDir);
        this.copyDirSync(srcDir, targetDir);
      } else {
        // 没有子目录也没有 manifest.json（异常情况）
        await this.ensureDir(targetDir);
        for (const entry of dirs) {
          if (entry.name === 'plugin.zip' || entry.name.startsWith('_tmp_')) continue;
          const srcPath = join(tmpDir, entry.name);
          const destPath = join(targetDir, entry.name);
          if (entry.isDirectory()) {
            this.copyDirSync(srcPath, destPath);
          } else {
            copyFileSync(srcPath, destPath);
          }
        }
      }
    } else {
      // 平铺结构（如 plugin.zip）：拷贝所有顶层文件和目录
      await this.ensureDir(targetDir);
      for (const entry of dirs) {
        if (entry.name === 'plugin.zip' || entry.name.startsWith('_tmp_')) continue;
        const srcPath = join(tmpDir, entry.name);
        const destPath = join(targetDir, entry.name);
        if (entry.isDirectory()) {
          this.copyDirSync(srcPath, destPath);
        } else {
          copyFileSync(srcPath, destPath);
        }
      }
    }

    // 清理临时目录
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* 忽略 */ }
  }

  /**
   * 同步复制目录
   */
  private copyDirSync(src: string, dest: string): void {
    mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath);
      } else {
        copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 更新安装任务状态并触发回调
   */
  private updateJob(jobId: string, updates: Partial<InstallJob>): void {
    const job = this.installJobs.get(jobId);
    if (!job) return;

    Object.assign(job, updates);
    this.installJobs.set(jobId, job);

    // 触发进度回调
    for (const cb of this.progressCallbacks) {
      try {
        cb({ ...job });
      } catch { /* 忽略回调错误 */ }
    }
  }

  /**
   * 插件 ID 转目录名
   * ht182400-creator/easyagent-plugin-obsidian-doc-viewer → obsidian-doc-viewer
   */
  private pluginIdToName(pluginId: string): string {
    return pluginId.split('/')[1] || pluginId;
  }

  /**
   * 提取权限摘要
   */
  private extractPermissions(
    permissions: unknown,
  ): PluginPermissionsSummary | null {
    if (!permissions || typeof permissions !== 'object') return null;

    const p = permissions as Record<string, unknown>;
    return {
      filesystem: p.filesystem ? {
        read: !!(p.filesystem as Record<string, unknown>)?.read,
        write: !!(p.filesystem as Record<string, unknown>)?.write,
      } : undefined,
      network: p.network ? {
        allowAll: !!(p.network as Record<string, unknown>)?.allowAll,
        domains: ((p.network as Record<string, unknown>)?.domains as string[]) || [],
      } : undefined,
      shell: !!p.shell,
      notifications: !!p.notifications,
      clipboard: !!p.clipboard,
    };
  }

  /**
   * 加载已安装清单
   */
  private loadInstalledManifest(): InstalledManifest {
    try {
      if (existsSync(this.installedPath)) {
        const raw = readFileSync(this.installedPath, 'utf-8');
        return JSON.parse(raw) as InstalledManifest;
      }
    } catch (err) {
      logger.warn(`[PluginMarket] 读取 installed.json 失败: ${(err as Error).message}`);
    }
    return { plugins: [] };
  }

  /**
   * 保存已安装清单
   */
  private saveInstalledManifest(manifest: InstalledManifest): void {
    try {
      this.ensureDir(this.pluginsDir);
      writeFileSync(this.installedPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`[PluginMarket] 保存 installed.json 失败: ${(err as Error).message}`);
    }
  }

  /**
   * 添加已安装记录
   */
  private addToInstalled(pluginId: string, name: string, version: string): void {
    const manifest = this.loadInstalledManifest();
    const existing = manifest.plugins.find((p) => p.id === pluginId);
    if (existing) {
      existing.version = version;
      existing.installedAt = new Date().toISOString();
    } else {
      manifest.plugins.push({
        id: pluginId,
        name,
        version,
        installedAt: new Date().toISOString(),
        source: 'market',
      });
    }
    this.saveInstalledManifest(manifest);
  }

  /**
   * 移除已安装记录
   *
   * 兼容多种匹配形式：pluginId（owner/repo）、name（manifest.name 或 repo 名）、
   * pluginNameFromPm（PluginManager 反馈的真实目录 basename）
   */
  private removeFromInstalled(
    pluginId: string,
    pluginNameFromPm?: string | null,
  ): void {
    const manifest = this.loadInstalledManifest();
    const repoName = pluginId.includes('/') ? pluginId.split('/').pop() : null;
    const candidates = new Set<string>();
    candidates.add(pluginId);
    if (pluginNameFromPm) candidates.add(pluginNameFromPm);
    if (repoName) candidates.add(repoName);
    if (!pluginId.includes('/')) candidates.add(pluginId); // pluginId 本身就是 name 的情况

    const before = manifest.plugins.length;
    manifest.plugins = manifest.plugins.filter((p) => {
      // 不在 candidates 中才保留
      return !candidates.has(p.id) && !candidates.has(p.name);
    });
    const removed = before - manifest.plugins.length;
    if (removed > 0) {
      logger.info(`[PluginMarket] 从 installed.json 移除 ${removed} 条记录 (pluginId=${pluginId}, pmName=${pluginNameFromPm})`);
    }
    this.saveInstalledManifest(manifest);
  }

  /**
   * 加载市场缓存
   */
  private loadMarketCache(expired: boolean = false): MarketPlugin[] | null {
    try {
      if (existsSync(this.marketCachePath)) {
        const raw = readFileSync(this.marketCachePath, 'utf-8');
        const cache: MarketCache = JSON.parse(raw);

        if (!expired && Date.now() - cache.fetchedAt <= MARKET_CACHE_TTL) {
          return cache.plugins;
        }
      }
    } catch { /* 忽略 */ }
    return null;
  }

  /**
   * 保存市场缓存
   */
  private saveMarketCache(plugins: MarketPlugin[]): void {
    try {
      this.ensureDir(this.cacheDir);
      const cache: MarketCache = {
        plugins,
        fetchedAt: Date.now(),
      };
      writeFileSync(this.marketCachePath, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (err) {
      logger.error(`[PluginMarket] 保存市场缓存失败: ${(err as Error).message}`);
    }
  }

  /**
   * 版本比较: versionA > versionB ?
   */
  private isNewer(versionA: string, versionB: string): boolean {
    const normalize = (v: string) =>
      v.replace(/^v/, '')
        .split('.')
        .map((n) => parseInt(n, 10) || 0);

    const a = normalize(versionA);
    const b = normalize(versionB);

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] || 0) > (b[i] || 0)) return true;
      if ((a[i] || 0) < (b[i] || 0)) return false;
    }

    return false;
  }
}

/** 全局单例 */
let globalMarketService: PluginMarketService | null = null;

/**
 * 获取 PluginMarketService 单例
 *
 * @param pluginsDir - 插件安装目录（首次调用时设置，后续调用忽略）
 */
export function getPluginMarketService(pluginsDir?: string): PluginMarketService {
  if (!globalMarketService) {
    globalMarketService = new PluginMarketService(pluginsDir);
  }
  return globalMarketService;
}
