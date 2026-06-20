/**
 * 插件管理状态
 * 管理: 已安装插件、插件市场、启用/禁用、钩子配置
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiFetch } from '../api';

/** 插件市场条目 */
export interface PluginMarketEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  /** 下载量 */
  downloads: number;
  /** 评分 */
  rating: number;
  /** 是否已安装 */
  installed: boolean;
  /** 分类标签 */
  tags: string[];
  /** 仓库URL */
  repoUrl: string;
}

/** 已安装插件信息 */
export interface InstalledPlugin {
  name: string;
  version: string;
  enabled: boolean;
  loadedAt?: number;
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

interface PluginsState {
  /** 已安装插件 */
  installed: InstalledPlugin[];
  /** 插件市场列表(模拟) */
  marketplace: PluginMarketEntry[];
  /** 加载状态 */
  loading: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 插件目录 */
  pluginDirs: string[];
  /** 是否启用热重载 */
  hotReload: boolean;

  // Actions
  fetchInstalled: () => Promise<void>;
  fetchMarketplace: () => Promise<void>;
  installPlugin: (name: string, version?: string) => Promise<void>;
  uninstallPlugin: (name: string) => Promise<void>;
  togglePlugin: (name: string, enabled: boolean) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setHotReload: (enabled: boolean) => void;
  addPluginDir: (dir: string) => void;
  removePluginDir: (dir: string) => void;
}

/**
 * 插件管理 Store
 * 管理已安装插件和插件市场
 */
export const usePluginsStore = create<PluginsState>((set, get) => ({
  installed: [],
  marketplace: [],
  loading: false,
  searchQuery: '',
  pluginDirs: ['.easyagent/plugins', '~/.easyagent/plugins'],
  hotReload: false,

  fetchInstalled: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<any[]>('/api/plugins');
      set({ installed: data, loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  fetchMarketplace: async () => {
    set({ loading: true });
    try {
      // 模拟插件市场数据
      const market: PluginMarketEntry[] = [
        {
          name: '@easyagent/skill-code-review',
          version: '1.2.0',
          description: '智能代码审查插件，支持安全性/性能/最佳实践检查',
          author: 'EasyAgent Team',
          downloads: 12500,
          rating: 4.8,
          installed: false,
          tags: ['code', 'review', 'quality'],
          repoUrl: 'https://github.com/easyagent/skill-code-review',
        },
        {
          name: '@easyagent/adapter-discord',
          version: '0.9.0',
          description: 'Discord IM平台适配器插件',
          author: 'Community',
          downloads: 3200,
          rating: 4.2,
          installed: false,
          tags: ['im', 'discord', 'adapter'],
          repoUrl: 'https://github.com/easyagent/adapter-discord',
        },
        {
          name: '@easyagent/skill-test-gen',
          version: '1.0.0',
          description: '自动测试用例生成插件，支持Jest/Vitest/Pytest',
          author: 'EasyAgent Team',
          downloads: 8700,
          rating: 4.6,
          installed: false,
          tags: ['testing', 'generation', 'quality'],
          repoUrl: 'https://github.com/easyagent/skill-test-gen',
        },
        {
          name: '@community/template-engine',
          version: '0.5.0',
          description: '项目模板引擎，快速脚手架生成',
          author: 'Community',
          downloads: 2100,
          rating: 3.9,
          installed: false,
          tags: ['template', 'scaffold', 'project'],
          repoUrl: 'https://github.com/community/easyagent-template',
        },
        {
          name: '@easyagent/skill-i18n',
          version: '1.1.0',
          description: '国际化翻译管理插件，自动翻译和同步多语言文件',
          author: 'EasyAgent Team',
          downloads: 5600,
          rating: 4.4,
          installed: false,
          tags: ['i18n', 'translation', 'localization'],
          repoUrl: 'https://github.com/easyagent/skill-i18n',
        },
        {
          name: '@easyagent/pro-vision',
          version: '0.8.0',
          description: '视觉能力增强插件，支持图片理解和生成',
          author: 'EasyAgent Team',
          downloads: 4300,
          rating: 4.5,
          installed: false,
          tags: ['vision', 'image', 'generation'],
          repoUrl: 'https://github.com/easyagent/pro-vision',
        },
      ];

      set({ marketplace: market, loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  installPlugin: async (name, version) => {
    set({ loading: true });

    try {
      // 模拟安装
      await new Promise((r) => setTimeout(r, 800));

      const newPlugin: InstalledPlugin = {
        name,
        version: version || 'latest',
        enabled: true,
        loadedAt: Date.now(),
        tools: [`${name.replace('@', '').replace('/', '_')}_tool`],
        skills: [],
        hooks: [],
      };

      set((s) => ({
        installed: [...s.installed, newPlugin],
        marketplace: s.marketplace.map((p) =>
          p.name === name ? { ...p, installed: true } : p
        ),
        loading: false,
      }));

      useAppStore.getState().addNotification({
        type: 'success',
        message: `插件 "${name}" 安装成功`,
      });
    } catch (err) {
      set({ loading: false });
      useAppStore.getState().addNotification({
        type: 'error',
        message: `插件 "${name}" 安装失败`,
      });
    }
  },

  uninstallPlugin: async (name) => {
    set((s) => ({
      installed: s.installed.filter((p) => p.name !== name),
      marketplace: s.marketplace.map((p) =>
        p.name === name ? { ...p, installed: false } : p
      ),
    }));

    useAppStore.getState().addNotification({
      type: 'info',
      message: `插件 "${name}" 已卸载`,
    });
  },

  togglePlugin: async (name, enabled) => {
    set((s) => ({
      installed: s.installed.map((p) =>
        p.name === name ? { ...p, enabled } : p
      ),
    }));

    useAppStore.getState().addNotification({
      type: 'info',
      message: `插件 "${name}" ${enabled ? '已启用' : '已禁用'}`,
      duration: 2000,
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setHotReload: (enabled) => set({ hotReload: enabled }),

  addPluginDir: (dir) =>
    set((s) => ({
      pluginDirs: s.pluginDirs.includes(dir)
        ? s.pluginDirs
        : [...s.pluginDirs, dir],
    })),

  removePluginDir: (dir) =>
    set((s) => ({
      pluginDirs: s.pluginDirs.filter((d) => d !== dir),
    })),
}));

/** 插件状态颜色 */
export const PLUGIN_STATUS_COLORS: Record<string, string> = {
  enabled: '#10b981',
  disabled: '#6b7280',
  error: '#ef4444',
};
