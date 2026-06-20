/**
 * 沙箱管理 Store
 * 管理 Docker 沙箱的创建、执行、监控和销毁
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiFetch } from '../api';

/** 沙箱信息 */
export interface SandboxInfo {
  id: string;
  containerId: string | null;
  status: 'idle' | 'starting' | 'running' | 'stopped' | 'error';
  image: string;
  workspace: string;
  createdAt: string;
  limits: {
    cpuCores?: number;
    memory?: string;
    maxPids?: number;
  };
}

/** 沙箱执行结果 */
export interface SandboxExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  timedOut: boolean;
}

/** Docker 系统状态 */
export interface DockerStatus {
  docker: {
    available: boolean;
    version?: string;
    error?: string;
  };
  sandbox: {
    enabled: boolean;
    dockerAvailable: boolean;
    localMode?: boolean;
    activeCount: number;
    maxSandboxes: number;
    sandboxes: SandboxInfo[];
  };
  /** 运行模式: docker | local | disabled */
  mode?: 'docker' | 'local' | 'disabled';
}

/** 沙箱创建选项 */
export interface CreateSandboxOptions {
  image?: string;
  readOnly?: boolean;
  allowNetwork?: boolean;
  memoryLimit?: string;
  cpuLimit?: number;
}

interface SandboxState {
  /** Docker 状态 */
  dockerStatus: DockerStatus | null;
  /** 沙箱列表 */
  sandboxes: SandboxInfo[];
  /** 选中的沙箱 */
  selectedSandbox: SandboxInfo | null;
  /** 执行结果 */
  execResult: SandboxExecResult | null;
  /** 加载状态 */
  loading: boolean;
  /** 创建中 */
  creating: boolean;
  /** 执行中 */
  executing: boolean;
  /** 命令历史 */
  commandHistory: string[];

  // Actions
  /** 加载 Docker 状态 */
  loadStatus: () => Promise<void>;
  /** 创建沙箱 */
  createSandbox: (options: CreateSandboxOptions) => Promise<SandboxInfo | null>;
  /** 执行命令 */
  execCommand: (sandboxId: string, command: string, timeout?: number) => Promise<SandboxExecResult | null>;
  /** 获取沙箱信息 */
  getSandbox: (id: string) => Promise<SandboxInfo | null>;
  /** 销毁沙箱 */
  destroySandbox: (id: string) => Promise<void>;
  /** 销毁所有沙箱 */
  destroyAll: () => Promise<void>;
  /** 选择沙箱 */
  selectSandbox: (sandbox: SandboxInfo | null) => void;
  /** 清空执行结果 */
  clearExecResult: () => void;
}

export const useSandboxStore = create<SandboxState>((set, get) => ({
  dockerStatus: null,
  sandboxes: [],
  selectedSandbox: null,
  execResult: null,
  loading: false,
  creating: false,
  executing: false,
  commandHistory: [],

  /** 加载 Docker 状态 */
  loadStatus: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<DockerStatus & { sandbox: { sandboxes: any[] } }>('/api/sandbox/status');
      set({ dockerStatus: data, sandboxes: data.sandbox.sandboxes, loading: false });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      useAppStore.getState().addNotification({ type: 'error', message: `加载沙箱状态失败: ${msg}` });
      set({ loading: false });
    }
  },

  /** 创建沙箱 */
  createSandbox: async (options) => {
    set({ creating: true });
    try {
      const data = await apiFetch<{ success: boolean; error?: string; sandbox?: any }>('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: options.image || 'node:20-alpine',
          readOnly: options.readOnly,
          allowNetwork: options.allowNetwork,
          memoryLimit: options.memoryLimit || '512m',
          cpuLimit: options.cpuLimit || 0.5,
        }),
      });
      if (data.success) {
        const { sandboxes } = get();
        set({ sandboxes: [...sandboxes, data.sandbox], selectedSandbox: data.sandbox, creating: false });
        useAppStore.getState().addNotification({ type: 'success', message: `沙箱 ${data.sandbox.id.slice(0, 12)} 已创建` });
        return data.sandbox;
      }
      throw new Error(data.error || '创建失败');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      useAppStore.getState().addNotification({ type: 'error', message: `创建沙箱失败: ${msg}` });
      set({ creating: false });
      return null;
    }
  },

  /** 在沙箱中执行命令 */
  execCommand: async (sandboxId, command, timeout) => {
    set({ executing: true });
    try {
      const result = await apiFetch<SandboxExecResult>(`/api/sandbox/${sandboxId}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, timeout: timeout || 30000 }),
      });
      const history = get().commandHistory;
      set({
        execResult: result,
        executing: false,
        commandHistory: [command, ...history].slice(0, 50),
      });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      useAppStore.getState().addNotification({ type: 'error', message: `命令执行失败: ${msg}` });
      set({ executing: false });
      return null;
    }
  },

  /** 获取沙箱信息 */
  getSandbox: async (id) => {
    try {
      const data = await apiFetch<any>(`/api/sandbox/${id}`);
      return data;
    } catch {
      return null;
    }
  },

  /** 销毁沙箱 */
  destroySandbox: async (id) => {
    try {
      const res = await apiFetch(`/api/sandbox/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { sandboxes, selectedSandbox } = get();
      const updated = sandboxes.filter(s => s.id !== id);
      set({
        sandboxes: updated,
        selectedSandbox: selectedSandbox?.id === id ? null : selectedSandbox,
      });
      useAppStore.getState().addNotification({ type: 'success', message: `沙箱已销毁` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      useAppStore.getState().addNotification({ type: 'error', message: `销毁沙箱失败: ${msg}` });
    }
  },

  /** 销毁所有沙箱 */
  destroyAll: async () => {
    const { sandboxes } = get();
    await Promise.all(sandboxes.map(s => get().destroySandbox(s.id)));
  },

  /** 选择沙箱 */
  selectSandbox: (sandbox) => {
    set({ selectedSandbox: sandbox, execResult: null });
  },

  /** 清空执行结果 */
  clearExecResult: () => set({ execResult: null }),
}));
