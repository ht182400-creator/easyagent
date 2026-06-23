/**
 * 模型提供商状态管理
 * 管理: 提供商列表、模型信息、API密钥、连接测试
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';

/** 模型定价 */
export interface ModelPricing {
  input: number;   // 每百万token价格(元)
  output: number;
}

/** 模型信息 */
export interface ModelInfo {
  id: string;
  name: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing?: ModelPricing;
}

/** 提供商信息 */
export interface Provider {
  id: string;
  name: string;
  baseURL: string;
  apiKeyEnv: string;
  apiFormat: string;
  models: ModelInfo[];
  hasKey?: boolean;
  isConnected?: boolean;
}

interface ProviderState {
  /** 提供商列表 */
  providers: Provider[];
  /** 加载状态 */
  loading: boolean;
  /** 当前选中的模型 */
  currentProvider: string;
  currentModel: string;
  /** 连接测试结果 */
  testResults: Record<string, boolean | null>;

  // Actions
  fetchProviders: () => Promise<void>;
  setApiKey: (providerId: string, apiKey: string) => Promise<void>;
  testConnection: (providerId: string) => Promise<boolean>;
  setCurrentModel: (provider: string, model: string) => void;
}

/**
 * 提供商状态 Store
 */
export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  loading: false,
  currentProvider: '',
  currentModel: '',
  testResults: {},

  fetchProviders: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/providers');
      const data = await res.json();
      const providers = Array.isArray(data) ? data : [];
      
      // 智能选择默认模型：优先选已配置密钥的提供商，其次选第一个
      const currentState = get();
      // 当前选中但该提供商无密钥 → 不算有效选择
      const currentHasKey = providers.find((p: Provider) => p.id === currentState.currentProvider)?.hasKey;
      const hasValidSelection = currentState.currentProvider && currentState.currentModel && currentHasKey;
      
      if (!hasValidSelection && providers.length > 0) {
        // 优先选有密钥的提供商（Ollama 本地模型总是有密钥）
        const withKey = providers.find((p: Provider) => p.hasKey);
        const target = withKey || providers[0];
        const defaultModel = target.models?.[0]?.id || '';
        set({
          providers,
          loading: false,
          currentProvider: target.id,
          currentModel: defaultModel,
        });
      } else {
        set({ providers, loading: false });
      }
    } catch (err) {
      console.error('获取提供商列表失败:', err);
      set({ loading: false });
      useAppStore.getState().addNotification({
        type: 'error',
        message: '获取模型提供商列表失败',
      });
    }
  },

  setApiKey: async (providerId, apiKey) => {
    try {
      await fetch(`/api/providers/${providerId}/key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      useAppStore.getState().addNotification({
        type: 'success',
        message: 'API密钥已保存',
      });
      await get().fetchProviders();
    } catch (err) {
      console.error('设置密钥失败:', err);
      useAppStore.getState().addNotification({
        type: 'error',
        message: 'API密钥设置失败',
      });
    }
  },

  testConnection: async (providerId) => {
    set((s) => ({ testResults: { ...s.testResults, [providerId]: null } }));
    try {
      const res = await fetch(`/api/providers/${providerId}/test`, { method: 'POST' });
      const data = await res.json();
      const success = !!data.success;
      set((s) => ({ testResults: { ...s.testResults, [providerId]: success } }));
      useAppStore.getState().addNotification({
        type: success ? 'success' : 'error',
        message: success ? `${providerId} 连接成功` : `${providerId} 连接失败`,
        duration: 3000,
      });
      return success;
    } catch (err) {
      set((s) => ({ testResults: { ...s.testResults, [providerId]: false } }));
      return false;
    }
  },

  setCurrentModel: (provider, model) => set({ currentProvider: provider, currentModel: model }),
}));
