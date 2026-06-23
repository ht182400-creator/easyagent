/**
 * 会话状态管理
 * 管理: 会话CRUD、搜索过滤、归档
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';

/** 会话元数据 */
export interface SessionMeta {
  id: string;
  workspace: string;
  metadata: {
    title: string;
    createdAt: string;
    updatedAt: string;
    status: 'active' | 'archived' | 'completed';
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    messageCount?: number;
  };
}

interface SessionState {
  /** 会话列表 */
  sessions: SessionMeta[];
  /** 加载状态 */
  loading: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 当前活跃会话ID */
  activeSessionId: string | null;

  // Actions
  fetchSessions: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  archiveSession: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setActiveSession: (id: string | null) => void;
}

/**
 * 会话管理 Store
 */
export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  loading: false,
  searchQuery: '',
  activeSessionId: null,

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      set({ sessions: Array.isArray(data) ? data : [], loading: false });
    } catch (err) {
      console.error('获取会话列表失败:', err);
      set({ loading: false });
    }
  },

  deleteSession: async (id) => {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) }));
      useAppStore.getState().addNotification({
        type: 'info',
        message: '会话已删除',
        duration: 2000,
      });
    } catch (err) {
      console.error('删除会话失败:', err);
      useAppStore.getState().addNotification({
        type: 'error',
        message: '删除失败',
      });
    }
  },

  archiveSession: async (id) => {
    try {
      await fetch(`/api/sessions/${id}/archive`, { method: 'POST' });
      // 更新本地状态
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === id
            ? { ...sess, metadata: { ...sess.metadata, status: 'archived' as const } }
            : sess
        ),
      }));
      useAppStore.getState().addNotification({
        type: 'success',
        message: '会话已归档',
        duration: 2000,
      });
    } catch (err) {
      console.error('归档会话失败:', err);
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setActiveSession: (id) => set({ activeSessionId: id }),
}));
