/**
 * 设置状态管理
 * 管理: Agent配置、安全设置、偏好
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiFetch } from '../api';

/** Agent配置 */
export interface AgentSettings {
  maxTurns: number;
  temperature: number;
  allowTools: boolean;
  model?: string;
}

/** 安全配置 */
export interface SecuritySettings {
  requireConfirmation: boolean;
  dailyTokenLimit: number;
}

/** 偏好设置 */
export interface Preferences {
  locale: 'zh-CN' | 'en-US';
  sendBehavior: 'enter' | 'ctrl_enter';
  enableDesktopNotifications: boolean;
  enableSound: boolean;
  autoScroll: boolean;
}

interface SettingsState {
  agent: AgentSettings;
  security: SecuritySettings;
  preferences: Preferences;
  saving: boolean;

  // Actions
  setAgentSettings: (settings: Partial<AgentSettings>) => void;
  setSecuritySettings: (settings: Partial<SecuritySettings>) => void;
  setPreferences: (prefs: Partial<Preferences>) => void;
  saveSettings: () => Promise<void>;
  loadSettings: () => Promise<void>;
}

/** 默认设置 */
const defaults = {
  agent: {
    maxTurns: 25,
    temperature: 0.7,
    allowTools: true,
  } as AgentSettings,
  security: {
    requireConfirmation: true,
    dailyTokenLimit: 1000000,
  } as SecuritySettings,
  preferences: {
    locale: 'zh-CN' as const,
    sendBehavior: 'enter' as const,
    enableDesktopNotifications: false,
    enableSound: false,
    autoScroll: true,
  } as Preferences,
};

/**
 * 设置管理 Store
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...defaults,
  saving: false,

  setAgentSettings: (settings) =>
    set((s) => ({ agent: { ...s.agent, ...settings } })),

  setSecuritySettings: (settings) =>
    set((s) => ({ security: { ...s.security, ...settings } })),

  setPreferences: (prefs) =>
    set((s) => ({
      preferences: { ...s.preferences, ...prefs },
    })),

  saveSettings: async () => {
    set({ saving: true });
    try {
      const { agent, security, preferences } = get();
      const res = await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, security, preferences }),
      });
      if (res.ok) {
        // 持久化到 localStorage 作为备份
        localStorage.setItem('easyagent-settings', JSON.stringify({ agent, security, preferences }));
        useAppStore.getState().addNotification({
          type: 'success',
          message: '设置已保存',
          duration: 2000,
        });
      }
    } catch (err) {
      console.error('保存设置失败:', err);
      // 降级：保存到 localStorage
      const { agent, security, preferences } = get();
      localStorage.setItem('easyagent-settings', JSON.stringify({ agent, security, preferences }));
      useAppStore.getState().addNotification({
        type: 'warning',
        message: '已保存到本地(服务端不可用)',
        duration: 3000,
      });
    } finally {
      set({ saving: false });
    }
  },

  loadSettings: async () => {
    try {
      const data = await apiFetch<any>('/api/config');
      if (data.agent) set((s) => ({ agent: { ...s.agent, ...data.agent } }));
      if (data.security) set((s) => ({ security: { ...s.security, ...data.security } }));
      if (data.preferences) set((s) => ({ preferences: { ...s.preferences, ...data.preferences } }));
    } catch {
      // 从 localStorage 恢复
      const saved = localStorage.getItem('easyagent-settings');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.agent) set((s) => ({ agent: { ...s.agent, ...data.agent } }));
          if (data.security) set((s) => ({ security: { ...s.security, ...data.security } }));
          if (data.preferences) set((s) => ({ preferences: { ...s.preferences, ...data.preferences } }));
        } catch { /* ignore */ }
      }
    }
  },
}));
