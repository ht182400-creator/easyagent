/**
 * 工具系统状态管理
 * 管理: 工具列表、工具分组、工具执行状态、工具调用历史
 * 与 core 的 ToolRegistry 保持同步
 */
import { create } from 'zustand';
import { apiFetch } from '../api';

/** 工具分组信息 */
export interface ToolGroup {
  name: string;
  label: string;
  count: number;
  color: string;
}

/** 工具描述 */
export interface ToolInfo {
  name: string;
  description: string;
  group: string;
  requiresConfirm: boolean;
  /** 是否为内置工具 */
  builtin: boolean;
  /** 是否已启用 */
  enabled: boolean;
}

/** 工具执行记录 */
export interface ToolExecutionLog {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  result: string;
  success: boolean;
  sessionId: string;
  startTime: number;
  endTime: number;
  duration: number;
}

interface ToolsState {
  /** 所有工具 */
  tools: ToolInfo[];
  /** 工具分组 */
  groups: ToolGroup[];
  /** 加载状态 */
  loading: boolean;
  /** 执行历史 */
  executionLogs: ToolExecutionLog[];
  /** 最近一次工具执行 */
  lastExecution: ToolExecutionLog | null;

  // Actions
  fetchTools: () => Promise<void>;
  toggleTool: (toolName: string, enabled: boolean) => void;
  addExecutionLog: (log: Omit<ToolExecutionLog, 'id'>) => void;
  clearLogs: () => void;
  getToolsByGroup: (group: string) => ToolInfo[];
}

/**
 * 工具系统 Store
 * 管理工具列表、分组和执行历史
 */
export const useToolsStore = create<ToolsState>((set, get) => ({
  tools: [],
  groups: [
    { name: 'file', label: '文件操作', count: 0, color: '#3b82f6' },
    { name: 'search', label: '搜索', count: 0, color: '#8b5cf6' },
    { name: 'exec', label: '执行与Git', count: 0, color: '#ef4444' },
    { name: 'code', label: '代码分析', count: 0, color: '#10b981' },
    { name: 'quality', label: '代码质量', count: 0, color: '#f59e0b' },
    { name: 'project', label: '项目管理', count: 0, color: '#06b6d4' },
    { name: 'memory', label: '记忆', count: 0, color: '#ec4899' },
    { name: 'preview', label: '预览与交互', count: 0, color: '#14b8a6' },
    { name: 'media', label: '媒体', count: 0, color: '#f97316' },
    { name: 'database', label: '数据库', count: 0, color: '#6366f1' },
    { name: 'knowledge', label: '知识库', count: 0, color: '#84cc16' },
    { name: 'subagent', label: '子Agent', count: 0, color: '#d946ef' },
  ],
  loading: false,
  executionLogs: [],
  lastExecution: null,

  fetchTools: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<ToolInfo[]>('/api/tools');
      const tools: ToolInfo[] = Array.isArray(data) ? data : [];
      set({
        tools,
        loading: false,
        groups: get().groups.map((g) => ({
          ...g,
          count: tools.filter((t) => t.group === g.name).length,
        })),
      });
    } catch {
      set({ loading: false });
    }
  },

  toggleTool: (toolName, enabled) =>
    set((s) => ({
      tools: s.tools.map((t) =>
        t.name === toolName ? { ...t, enabled } : t
      ),
    })),

  addExecutionLog: (log) => {
    const newLog: ToolExecutionLog = {
      ...log,
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    set((s) => ({
      executionLogs: [newLog, ...s.executionLogs.slice(0, 199)], // 保留最近200条
      lastExecution: newLog,
    }));
  },

  clearLogs: () => set({ executionLogs: [], lastExecution: null }),

  getToolsByGroup: (group) => get().tools.filter((t) => t.group === group),
}));

/** 工具分组颜色映射 */
export const GROUP_COLORS: Record<string, string> = {
  file: '#3b82f6',
  search: '#8b5cf6',
  exec: '#ef4444',
  code: '#10b981',
  quality: '#f59e0b',
  project: '#06b6d4',
  memory: '#ec4899',
  preview: '#14b8a6',
  media: '#f97316',
  database: '#6366f1',
  knowledge: '#84cc16',
  subagent: '#d946ef',
};
