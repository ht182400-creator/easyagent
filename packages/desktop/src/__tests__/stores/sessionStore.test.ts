/**
 * 会话 Store 单元测试
 * 覆盖: 会话CRUD、乐观更新、回滚、搜索
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 工厂之前初始化
const { mockApiRequest } = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
}));

vi.mock('@/request', () => ({
  apiRequest: mockApiRequest,
  setApiBase: vi.fn(),
  getApiBase: vi.fn(() => ''),
}));

// Mock appStore 的通知
const mockAddNotification = vi.fn();
vi.mock('@/stores/appStore', () => ({
  useAppStore: {
    getState: () => ({ addNotification: mockAddNotification }),
  },
}));

import { useSessionStore } from '@/stores/sessionStore';

/** 构造测试用的会话元数据 */
function makeSession(overrides: Partial<ReturnType<typeof useSessionStore.getState>['sessions'][number]> = {}) {
  return {
    id: 'session-1',
    workspace: '/test/workspace',
    metadata: {
      title: '测试会话',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      status: 'active' as const,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    },
    ...overrides,
  };
}

describe('sessionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({
      sessions: [],
      loading: false,
      searchQuery: '',
      activeSessionId: null,
    });
  });

  // ==================== 初始状态 ====================

  describe('初始状态', () => {
    it('会话列表初始为空', () => {
      expect(useSessionStore.getState().sessions).toEqual([]);
    });

    it('初始加载状态为 false', () => {
      expect(useSessionStore.getState().loading).toBe(false);
    });

    it('初始搜索关键词为空', () => {
      expect(useSessionStore.getState().searchQuery).toBe('');
    });

    it('初始活跃会话为 null', () => {
      expect(useSessionStore.getState().activeSessionId).toBeNull();
    });
  });

  // ==================== fetchSessions ====================

  describe('fetchSessions', () => {
    it('成功获取应填充会话列表', async () => {
      const mockData = [makeSession(), makeSession({ id: 'session-2', metadata: { ...makeSession().metadata, title: '会话2' } })];
      mockApiRequest.mockResolvedValue(mockData);

      await useSessionStore.getState().fetchSessions();
      const state = useSessionStore.getState();

      expect(state.sessions).toHaveLength(2);
      expect(state.sessions[0].id).toBe('session-1');
      expect(state.loading).toBe(false);
    });

    it('请求期间 loading 应为 true', async () => {
      mockApiRequest.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([makeSession()]), 50))
      );

      const promise = useSessionStore.getState().fetchSessions();
      expect(useSessionStore.getState().loading).toBe(true);
      await promise;
    });

    it('网络失败应保持空列表', async () => {
      mockApiRequest.mockRejectedValue(new Error('网络错误'));
      await useSessionStore.getState().fetchSessions();
      const state = useSessionStore.getState();

      expect(state.sessions).toEqual([]);
      expect(state.loading).toBe(false);
    });

    it('返回非数组数据应设为空列表', async () => {
      mockApiRequest.mockResolvedValue(null);
      await useSessionStore.getState().fetchSessions();
      expect(useSessionStore.getState().sessions).toEqual([]);
    });
  });

  // ==================== deleteSession ====================

  describe('deleteSession', () => {
    it('应立即从列表移除 (乐观更新)', async () => {
      useSessionStore.setState({
        sessions: [makeSession(), makeSession({ id: 'session-2' })],
      });

      const promise = useSessionStore.getState().deleteSession('session-1');
      // 乐观更新：立即从列表移除
      expect(useSessionStore.getState().sessions).toHaveLength(1);
      expect(useSessionStore.getState().sessions[0].id).toBe('session-2');

      await promise;
    });

    it('API 失败应回滚列表', async () => {
      const s1 = makeSession();
      const s2 = makeSession({ id: 'session-2' });
      useSessionStore.setState({ sessions: [s1, s2] });

      mockApiRequest.mockRejectedValue(new Error('删除失败'));

      await useSessionStore.getState().deleteSession('session-1');
      const state = useSessionStore.getState();

      // 应回滚到原始状态
      expect(state.sessions).toHaveLength(2);
      expect(state.sessions[0].id).toBe('session-1');
    });

    it('删除不存在的会话应无副作用', async () => {
      useSessionStore.setState({ sessions: [makeSession()] });

      await useSessionStore.getState().deleteSession('non-existent');
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });
  });

  // ==================== archiveSession ====================

  describe('archiveSession', () => {
    it('应立即将会话标记为 archived (乐观更新)', async () => {
      useSessionStore.setState({ sessions: [makeSession()] });

      const promise = useSessionStore.getState().archiveSession('session-1');
      const state = useSessionStore.getState();

      expect(state.sessions[0].metadata.status).toBe('archived');
      await promise;
    });

    it('API 失败应回滚状态', async () => {
      useSessionStore.setState({ sessions: [makeSession()] });
      mockApiRequest.mockRejectedValue(new Error('归档失败'));

      await useSessionStore.getState().archiveSession('session-1');
      expect(useSessionStore.getState().sessions[0].metadata.status).toBe('active');
    });

    it('归档不存在的会话应无副作用', async () => {
      useSessionStore.setState({ sessions: [makeSession()] });

      await useSessionStore.getState().archiveSession('non-existent');
      expect(useSessionStore.getState().sessions[0].metadata.status).toBe('active');
    });
  });

  // ==================== setSearchQuery ====================

  describe('setSearchQuery', () => {
    it('应更新搜索关键词', () => {
      useSessionStore.getState().setSearchQuery('测试');
      expect(useSessionStore.getState().searchQuery).toBe('测试');
    });

    it('应可清空搜索关键词', () => {
      useSessionStore.getState().setSearchQuery('关键词');
      useSessionStore.getState().setSearchQuery('');
      expect(useSessionStore.getState().searchQuery).toBe('');
    });
  });

  // ==================== setActiveSession ====================

  describe('setActiveSession', () => {
    it('应设置活跃会话 ID', () => {
      useSessionStore.getState().setActiveSession('session-abc');
      expect(useSessionStore.getState().activeSessionId).toBe('session-abc');
    });

    it('应可设为 null', () => {
      useSessionStore.getState().setActiveSession('session-abc');
      useSessionStore.getState().setActiveSession(null);
      expect(useSessionStore.getState().activeSessionId).toBeNull();
    });
  });

  // ==================== 异常边界 ====================

  describe('异常边界', () => {
    it('大量会话操作应正常', () => {
      const sessions = Array.from({ length: 100 }, (_, i) =>
        makeSession({ id: `session-${i}`, metadata: { ...makeSession().metadata, title: `会话 ${i}` } })
      );
      useSessionStore.setState({ sessions });
      expect(useSessionStore.getState().sessions).toHaveLength(100);
    });

    it('特殊字符的搜索关键词应正常', () => {
      const specialQueries = ['<script>', '&amp;', '你好👋', 'select * from'];
      for (const q of specialQueries) {
        useSessionStore.getState().setSearchQuery(q);
        expect(useSessionStore.getState().searchQuery).toBe(q);
      }
    });
  });
});
