/**
 * MCP服务器管理状态
 * 管理: MCP服务器配置、连接状态、工具列表、审批设置
 *
 * 类型来源：
 * - {@link import('@easyagent/core/types').MCPServerConfig 核心 MCPServerConfig} — MCPServer 的权威数据源
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiRequest } from '../request';

/**
 * MCP服务器配置（JSON API 序列化版本）
 * @see {@link import('@easyagent/core/types').MCPServerConfig 核心 MCPServerConfig 类型}
 */
export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  autoApprove: string[];
}

/** MCP服务器运行时状态 */
export interface MCPServerRuntime {
  name: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  tools: string[];
  toolCount: number;
  uptime?: number;
  error?: string;
}

interface MCPState {
  /** 服务器配置列表 */
  servers: MCPServer[];
  /** 运行时状态 */
  runtimes: Record<string, MCPServerRuntime>;
  /** 所有MCP工具列表(含服务器名前缀) */
  tools: { name: string; serverName: string; description: string }[];
  /** 加载状态 */
  loading: boolean;
  /** 是否已启用MCP */
  mcpEnabled: boolean;

  // Actions
  fetchServers: () => Promise<void>;
  addServer: (server: MCPServer) => Promise<void>;
  removeServer: (name: string) => Promise<void>;
  toggleServer: (name: string, enabled: boolean) => Promise<void>;
  updateAutoApprove: (name: string, tools: string[]) => Promise<void>;
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  setMCPEnabled: (enabled: boolean) => void;
}

/**
 * MCP管理 Store
 * 管理MCP协议服务器的配置和连接状态
 */
export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [
    // 默认示例服务器配置
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      enabled: false,
      autoApprove: ['list_directory', 'read_file'],
    },
  ],
  runtimes: {},
  tools: [],
  loading: false,
  mcpEnabled: localStorage.getItem('easyagent-mcp-enabled') === 'true',

  fetchServers: async () => {
    set({ loading: true });
    try {
      const data = await apiRequest<MCPServer[]>('/api/mcp/servers');
      set({ servers: Array.isArray(data) ? data : [], loading: false });
    } catch (err) {
      // 使用默认配置
    } finally {
      set({ loading: false });
    }
  },

  addServer: async (server) => {
    const { servers } = get();
    if (servers.find((s) => s.name === server.name)) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: `服务器 "${server.name}" 已存在`,
      });
      return;
    }

    set((s) => ({ servers: [...s.servers, server] }));
    useAppStore.getState().addNotification({
      type: 'success',
      message: `MCP服务器 "${server.name}" 已添加`,
    });

    // 持久化
    try {
      await apiRequest('/api/mcp/servers', {
        method: 'POST',
        body: JSON.stringify(server),
      });
    } catch (err) { /* 本地存储 */ }
  },

  removeServer: async (name) => {
    set((s) => ({
      servers: s.servers.filter((sv) => sv.name !== name),
      runtimes: Object.fromEntries(
        Object.entries(s.runtimes).filter(([k]) => k !== name)
      ),
    }));
    useAppStore.getState().addNotification({
      type: 'info',
      message: `MCP服务器 "${name}" 已移除`,
    });

    try {
      await apiRequest(`/api/mcp/servers/${name}`, { method: 'DELETE' });
    } catch (err) { /* ignore */ }
  },

  toggleServer: async (name, enabled) => {
    set((s) => ({
      servers: s.servers.map((sv) =>
        sv.name === name ? { ...sv, enabled } : sv
      ),
    }));

    if (enabled) {
      await get().connectServer(name);
    } else {
      await get().disconnectServer(name);
    }
  },

  updateAutoApprove: async (name, tools) => {
    set((s) => ({
      servers: s.servers.map((sv) =>
        sv.name === name ? { ...sv, autoApprove: tools } : sv
      ),
    }));
  },

  connectServer: async (name) => {
    set((s) => ({
      runtimes: {
        ...s.runtimes,
        [name]: {
          name,
          status: 'connecting',
          tools: [],
          toolCount: 0,
        },
      },
    }));

    try {
      // 模拟连接流程
      await new Promise((r) => setTimeout(r, 500));

      set((s) => ({
        runtimes: {
          ...s.runtimes,
          [name]: {
            name,
            status: 'connected',
            tools: [`mcp_${name}_tool1`, `mcp_${name}_tool2`],
            toolCount: 2,
            uptime: Date.now(),
          },
        },
      }));

      useAppStore.getState().addNotification({
        type: 'success',
        message: `MCP "${name}" 已连接`,
        duration: 2000,
      });
    } catch (err) {
      set((s) => ({
        runtimes: {
          ...s.runtimes,
          [name]: {
            name,
            status: 'error',
            tools: [],
            toolCount: 0,
            error: '连接失败',
          },
        },
      }));
    }
  },

  disconnectServer: async (name) => {
    set((s) => ({
      runtimes: {
        ...s.runtimes,
        [name]: { name, status: 'disconnected', tools: [], toolCount: 0 },
      },
    }));
  },

  setMCPEnabled: (enabled) => {
    localStorage.setItem('easyagent-mcp-enabled', String(enabled));
    set({ mcpEnabled: enabled });
  },
}));

/** MCP状态颜色映射 */
export const MCP_STATUS_COLORS: Record<string, string> = {
  disconnected: '#6b7280',
  connecting: '#f59e0b',
  connected: '#10b981',
  error: '#ef4444',
};
