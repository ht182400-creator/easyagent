/**
 * 插件管理状态
 * 管理: 已安装插件、插件市场、启用/禁用、安装进度
 *
 * P0 升级: 对接真实后端 API，替代 Mock 数据
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiRequest } from '../request';
import { on } from '../events';

/** 插件市场条目 */
export interface PluginMarketEntry {
  id: string;
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
  /** 是否已安装 */
  installed: boolean;
}

/** 权限摘要 */
export interface PluginPermissionsSummary {
  filesystem?: { read: boolean; write: boolean };
  network?: { allowAll: boolean; domains: string[] };
  shell?: boolean;
  notifications?: boolean;
  clipboard?: boolean;
}

/** 已安装插件信息 */
export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  enabled: boolean;
  installedAt: string;
  source: 'market' | 'local';
  localPath: string;
  /** 是否有可用更新 */
  updateAvailable: boolean;
  latestVersion?: string;
  /** 提供的工具列表 */
  tools: string[];
  /** 提供的技能列表 */
  skills: string[];
  /** 钩子配置 */
  hooks: {
    event: string;
    enabled: boolean;
    priority: number;
  }[];
  /** 错误信息 */
  error?: string;
}

/** 安装进度 */
export interface InstallProgress {
  jobId: string;
  pluginId: string;
  progress: number;
  status: 'pending' | 'downloading' | 'extracting' | 'loading' | 'done' | 'error';
  message?: string;
}

/** 插件详情 */
export interface PluginDetail {
  plugin: PluginMarketEntry | null;
  readmeHtml: string | null;
}

interface PluginsState {
  /** 已安装插件 */
  installed: InstalledPlugin[];
  /** 插件市场列表 */
  marketplace: PluginMarketEntry[];
  /** 加载状态 */
  loading: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 当前选中的插件详情 */
  selectedPlugin: PluginDetail | null;
  /** 详情加载状态 */
  detailLoading: boolean;
  /** 安装进度映射 */
  installProgress: Map<string, InstallProgress>;
  /** 安全模式 */
  safeMode: boolean;
  /** 禁止自动重新加载插件 */
  noAutoReload: boolean;

  // Actions
  fetchInstalled: () => Promise<void>;
  fetchMarketplace: (forceRefresh?: boolean) => Promise<void>;
  fetchPluginDetail: (pluginId: string) => Promise<void>;
  installPlugin: (pluginId: string, version?: string) => Promise<string | null>;
  updatePlugin: (pluginId: string) => Promise<string | null>;
  uninstallPlugin: (pluginId: string) => Promise<void>;
  togglePlugin: (name: string, enabled: boolean) => Promise<void>;
  checkUpdates: () => Promise<Map<string, string | null>>;
  setSearchQuery: (query: string) => void;
  setSafeMode: (enabled: boolean) => void;
  updateInstallProgress: (progress: InstallProgress) => void;
  clearSelectedPlugin: () => void;
}

/**
 * 插件管理 Store
 * 管理已安装插件、插件市场、安装进度
 */
export const usePluginsStore = create<PluginsState>((set, get) => ({
  installed: [],
  marketplace: [],
  loading: false,
  searchQuery: '',
  selectedPlugin: null,
  detailLoading: false,
  installProgress: new Map(),
  safeMode: false,
  noAutoReload: false,

  /**
   * 获取已安装插件列表
   *
   * 修复：原代码两次调用 /api/plugins（无意义），且当 PluginManager 返回的数据
   * 没有 id 时硬塞 local:<name> 兜底，导致卸载时 pluginId 与 installed.json 不匹配。
   * 新版：/api/plugins 端点已扩展为根据 sourcePath 反查 installed.json 返回真实 id。
   */
  fetchInstalled: async () => {
    set({ loading: true });
    try {
      const loadedPlugins = await apiRequest<Array<{
        id?: string;
        name: string;
        version: string;
        description?: string;
        author?: string;
        enabled: boolean;
        sourcePath?: string;
        installedAt?: string;
        source?: 'market' | 'local';
      }>>('/api/plugins').catch(() => []);

      // 按 name 去重（同名插件不会重复加载）
      const merged = new Map<string, InstalledPlugin>();
      for (const p of loadedPlugins) {
        if (!p || !p.name) continue;
        const key = p.name;
        // 优先用后端返回的 id；如果后端没给（极少见），才用 name 兜底
        const id = p.id && !p.id.startsWith('local:') ? p.id : (p.id || p.name);
        merged.set(key, {
          id,
          name: p.name,
          version: p.version || '0.0.0',
          author: p.author || '',
          description: p.description || '',
          enabled: p.enabled !== false,
          installedAt: p.installedAt || '',
          source: p.source || 'local',
          localPath: p.sourcePath || '',
          updateAvailable: false,
          tools: [],
          skills: [],
          hooks: [],
        });
      }

      set({ installed: Array.from(merged.values()), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  /**
   * 获取插件市场列表（对接后端 API）
   *
   * @param forceRefresh - 是否强制刷新
   */
  fetchMarketplace: async (forceRefresh: boolean = false) => {
    set({ loading: true });
    try {
      const url = forceRefresh ? '/api/plugins/market?refresh=true' : '/api/plugins/market';
      const plugins: PluginMarketEntry[] = await apiRequest(url);

      // 注入已安装状态 — 兼容多种 id 形式：installed 中 id 可能是 "local:<name>"，
      // 而 marketplace 中 id 是插件名（如 "obsidian-doc-viewer"）。统一用 name 来匹配。
      const { installed } = get();
      const installedNames = new Set(
        installed.map((p) => p.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
      );
      const installedIds = new Set(
        installed.map((p) => p.id).filter((id): id is string => typeof id === 'string' && id.length > 0),
      );
      const enriched = (Array.isArray(plugins) ? plugins : []).map((p) => ({
        ...p,
        // marketplace 条目的 id 通常是 owner/repo 或纯 name（取决于来源），所以同时按 id 和 name 判断
        installed: installedIds.has(p.id) || installedNames.has(p.id) || installedNames.has(p.name),
      }));

      set({ marketplace: enriched, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  /**
   * 获取插件详情（含 README HTML）
   *
   * @param pluginId - owner/repo
   */
  fetchPluginDetail: async (pluginId: string) => {
    set({ detailLoading: true, selectedPlugin: null });
    try {
      const detail = await apiRequest<PluginDetail>(
        `/api/plugins/market/${encodeURIComponent(pluginId)}`,
      );
      set({ selectedPlugin: detail, detailLoading: false });
    } catch {
      set({ detailLoading: false });
    }
  },

  /**
   * 安装插件
   *
   * @param pluginId - owner/repo
   * @param version - 指定版本（可选）
   * @returns jobId，用于跟踪安装进度
   */
  installPlugin: async (pluginId: string, version?: string) => {
    try {
      const { jobId } = await apiRequest<{ jobId: string }>('/api/plugins/install', {
        method: 'POST',
        body: JSON.stringify({ pluginId, version }),
      });

      // 初始化进度
      set((s) => {
        const newProgress = new Map(s.installProgress);
        newProgress.set(jobId, {
          jobId,
          pluginId,
          progress: 0,
          status: 'pending',
        });
        return { installProgress: newProgress };
      });

      // 兜底轮询：WebSocket 在 /plugins 页面不会自动建立（依赖 chatStore 主动 connect），
      // 因此如果用户在 /plugins 页面安装，进度推送事件不会被 chatStore 收到并 emit 到事件总线。
      // 这里通过 HTTP 轮询 /api/plugins/install/:jobId 来保证 UI 一定能进入 done/error 终态。
      pollInstallJob(jobId, pluginId).catch((err) => {
        console.warn('[pluginsStore] 轮询安装进度失败:', err);
      });

      return jobId;
    } catch (err) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: `插件安装失败: ${(err as Error).message}`,
      });
      return null;
    }
  },

  /**
   * 更新插件（重新安装到最新版本）
   *
   * @param pluginId - owner/repo
   * @returns jobId
   */
  updatePlugin: async (pluginId: string) => {
    try {
      // 更新 = 重新安装（不带版本号 = 取最新 Release）
      const jobId = await get().installPlugin(pluginId);
      if (jobId) {
        useAppStore.getState().addNotification({
          type: 'info',
          message: `正在更新插件...`,
        });
      }
      return jobId;
    } catch (err) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: `更新失败: ${(err as Error).message}`,
      });
      return null;
    }
  },

  /**
   * 卸载插件
   *
   * @param pluginId - owner/repo
   */
  uninstallPlugin: async (pluginId: string) => {
    try {
      await apiRequest(`/api/plugins/uninstall/${encodeURIComponent(pluginId)}`, {
        method: 'POST',
      });

      set((s) => ({
        installed: s.installed.filter((p) => p.id !== pluginId),
        marketplace: s.marketplace.map((p) =>
          p.id === pluginId ? { ...p, installed: false } : p,
        ),
      }));

      useAppStore.getState().addNotification({
        type: 'success',
        message: `插件已卸载`,
      });
    } catch (err) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: `卸载失败: ${(err as Error).message}`,
      });
    }
  },

  /**
   * 启用/禁用插件
   */
  togglePlugin: async (name: string, enabled: boolean) => {
    try {
      await apiRequest(`/api/plugins/${name}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });

      set((s) => ({
        installed: s.installed.map((p) =>
          p.name === name || p.id === name ? { ...p, enabled } : p,
        ),
      }));
    } catch {
      // 降级：本地状态先更新
      set((s) => ({
        installed: s.installed.map((p) =>
          p.name === name || p.id === name ? { ...p, enabled } : p,
        ),
      }));
    }
  },

  /**
   * 检查已安装插件更新
   */
  checkUpdates: async () => {
    try {
      const result = await apiRequest<{
        updates: Array<{ id: string; latestVersion: string | null; hasUpdate: boolean }>;
      }>('/api/plugins/update-check', { method: 'POST' });

      const updates = new Map<string, string | null>();
      if (result?.updates) {
        for (const u of result.updates) {
          updates.set(u.id, u.latestVersion);
        }
      }

      // 更新 installed 中的 updateAvailable 标志
      set((s) => ({
        installed: s.installed.map((p) => ({
          ...p,
          updateAvailable: updates.has(p.id) && updates.get(p.id) !== null,
          latestVersion: updates.get(p.id) || undefined,
        })),
      }));

      return updates;
    } catch {
      return new Map();
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSafeMode: (enabled) => {
    set({ safeMode: enabled });
    apiRequest('/api/plugins/safe-mode', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }).catch(() => {});
  },

  /**
   * 更新安装进度（由 WebSocket 事件驱动 / 轮询兜底驱动）
   *
   * 终态（done / error）后会清理 installProgress 中对应条目，避免残留锁定 UI
   */
  updateInstallProgress: (progress: InstallProgress) => {
    set((s) => {
      const newProgress = new Map(s.installProgress);
      newProgress.set(progress.jobId, progress);

      // 安装完成时刷新 marketplace 状态 + 通知用户
      if (progress.status === 'done') {
        newProgress.delete(progress.jobId); // 终态：清理进度条记录
        set((s2) => ({
          marketplace: s2.marketplace.map((p) =>
            p.id === progress.pluginId ? { ...p, installed: true } : p,
          ),
          installed: s2.installed.some((p) => p.id === progress.pluginId)
            ? s2.installed
            : [
                ...s2.installed,
                {
                  id: progress.pluginId,
                  name: progress.pluginId.split('/')[1] || progress.pluginId,
                  version: '0.0.0',
                  author: progress.pluginId.split('/')[0] || '',
                  description: '',
                  enabled: true,
                  installedAt: new Date().toISOString(),
                  source: 'market' as const,
                  localPath: '',
                  updateAvailable: false,
                  tools: [],
                  skills: [],
                  hooks: [],
                },
              ],
        }));
        // 异步重新拉取 installed 列表，更新真实版本号（首次安装或升级时均需要）
        // 解决"已装插件页版本号滞后于磁盘"的问题
        void get().fetchInstalled().then(() => {
          void get().checkUpdates();
        });
        useAppStore.getState().addNotification({
          type: 'success',
          message: `插件安装完成`,
        });
      }

      if (progress.status === 'error') {
        newProgress.delete(progress.jobId); // 终态：清理进度条记录
        useAppStore.getState().addNotification({
          type: 'error',
          message: `安装失败: ${progress.message || '未知错误'}`,
        });
      }

      return { installProgress: newProgress };
    });
  },

  clearSelectedPlugin: () => set({ selectedPlugin: null }),
}));

/** 插件状态颜色 */
export const PLUGIN_STATUS_COLORS: Record<string, string> = {
  enabled: '#10b981',
  disabled: '#6b7280',
  error: '#ef4444',
};

/**
 * 轮询兜底：HTTP GET /api/plugins/install/:jobId 直到 status 为 done/error
 *
 * 背景: WebSocket 在 /plugins 页面不会自动建立（chatStore 只在用户进入对话时连接），
 * 因此插件安装进度推送可能丢失。该轮询保证 UI 一定能进入终态。
 *
 * 策略: 每 1s 轮询一次，最多 60 次（60s）。终态时复用 updateInstallProgress 走相同更新路径。
 *
 * @param jobId - 安装任务 ID
 * @param pluginId - 插件 ID（owner/repo）
 */
async function pollInstallJob(jobId: string, pluginId: string): Promise<void> {
  const MAX_ATTEMPTS = 60; // 总超时 60s（安装一般 5-10s，留足容错）
  const INTERVAL_MS = 1000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));

    try {
      const job = await apiRequest<{
        jobId: string;
        pluginId: string;
        status: InstallProgress['status'];
        progress: number;
        error?: string;
      }>(`/api/plugins/install/${jobId}`);

      // 推送给 store，触发与 WebSocket 一致的更新路径
      usePluginsStore.getState().updateInstallProgress({
        jobId: job.jobId,
        pluginId: job.pluginId || pluginId,
        progress: job.progress ?? 0,
        status: job.status,
        message: job.error,
      });

      if (job.status === 'done' || job.status === 'error') {
        return; // 终态退出
      }
    } catch (err) {
      // 单次失败不打断轮询（可能是瞬时网络抖动）
      // 最后一次失败时记录到 console
      if (attempt === MAX_ATTEMPTS - 1) {
        console.warn(`[pluginsStore] 轮询安装任务 ${jobId} 最终失败:`, err);
      }
    }
  }

  // 60s 仍未结束：超时清理，避免进度条永久停留
  usePluginsStore.getState().updateInstallProgress({
    jobId,
    pluginId,
    progress: 0,
    status: 'error',
    message: '安装超时（60s），请检查后端日志或网络',
  });
}

/**
 * 初始化插件安装进度监听
 *
 * 订阅共享事件总线（由 chatStore 在收到 WebSocket 'plugin:install:progress' 事件时 emit）
 * 在 App 初始化时调用一次
 *
 * @returns 取消订阅函数
 */
export function initPluginProgressListener(): () => void {
  // 复用 chatStore 已有的 WebSocket 连接 — 避免重复连接同一地址
  // chatStore.handleWSMessage() 在收到 plugin:install:progress 时会 emit 到事件总线
  return on('plugin:install:progress', (payload) => {
    const data = payload as {
      jobId: string;
      pluginId: string;
      progress: number;
      status: InstallProgress['status'];
      message?: string;
    };
    usePluginsStore.getState().updateInstallProgress({
      jobId: data.jobId,
      pluginId: data.pluginId,
      progress: data.progress,
      status: data.status,
      message: data.message,
    });
  });
}
