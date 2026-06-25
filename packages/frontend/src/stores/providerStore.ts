/**
 * 模型提供商状态管理
 * 管理: 提供商列表、模型信息、API密钥、连接测试
 *
 * 类型来源：
 * - ProviderId, ModelConfig → @easyagent/core/types（唯一数据源）
 * - Provider, ModelInfo → 本地定义（含UI专用字段 hasKey/isConnected）
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiRequest } from '../request';
import type { ProviderId } from '@easyagent/core/types';

/**
 * 模型定价
 * @see {@link import('@easyagent/core/types').ModelConfig.pricing 核心模型定价}
 */
export interface ModelPricing {
  input: number;   // 每百万token价格(元)
  output: number;
}

/**
 * 模型信息（UI 展示用，扁平化版本）
 * @see {@link import('@easyagent/core/types').ModelConfig 核心 ModelConfig 类型}
 * 差异：前端不含 provider 字段（包含在父级 Provider 中）
 */
export interface ModelInfo {
  id: string;
  name: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  pricing?: ModelPricing;
}

/**
 * 提供商信息（UI 展示用，含运行时状态）
 * @see {@link import('@easyagent/core/types').ProviderConfig 核心 ProviderConfig 类型}
 * 差异：id 使用共享 ProviderId 类型；增加 hasKey/isConnected 运行时状态
 */
export interface Provider {
  id: ProviderId;
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
      const providers = await apiRequest<Provider[]>('/api/providers');
      const list = Array.isArray(providers) ? providers : [];
      
      // 智能选择默认模型：优先选已配置密钥的提供商，其次选第一个
      const currentState = get();
      // 当前选中但该提供商无密钥 → 不算有效选择
      const currentHasKey = list.find((p: Provider) => p.id === currentState.currentProvider)?.hasKey;
      const hasValidSelection = currentState.currentProvider && currentState.currentModel && currentHasKey;
      
      if (!hasValidSelection && list.length > 0) {
        // 优先选有密钥的提供商（Ollama 本地模型总是有密钥）
        const withKey = list.find((p: Provider) => p.hasKey);
        const target = withKey || list[0];
        const defaultModel = target.models?.[0]?.id || '';
        set({
          providers: list,
          loading: false,
          currentProvider: target.id,
          currentModel: defaultModel,
        });
      } else {
        set({ providers: list, loading: false });
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
      await apiRequest(`/api/providers/${providerId}/key`, {
        method: 'PUT',
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
      const data = await apiRequest<{ success: boolean }>(`/api/providers/${providerId}/test`, {
        method: 'POST',
      });
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
