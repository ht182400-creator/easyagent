/**
 * UI Store 单元测试
 * 覆盖侧边栏、标签页、Toast管理
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '@/stores/uiStore';

describe('uiStore', () => {
  beforeEach(() => {
    // 重置 store 到初始状态
    useUIStore.setState({
      sidebarOpen: true,
      activeView: 'chat',
      tabs: [],
      activeTabId: null,
      toasts: [],
    });
  });

  // ==================== 侧边栏 ====================

  describe('侧边栏管理', () => {
    it('初始化时侧边栏应展开', () => {
      const state = useUIStore.getState();
      expect(state.sidebarOpen).toBe(true);
    });

    it('toggleSidebar 应切换侧边栏状态', () => {
      const store = useUIStore.getState();
      store.toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('setSidebarOpen 应设置指定状态', () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);

      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it('多次 toggle 应保持状态一致性', () => {
      for (let i = 0; i < 10; i++) {
        useUIStore.getState().toggleSidebar();
      }
      // 偶数次 toggle 回到原位 (true)
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  // ==================== 活动视图 ====================

  describe('活动视图管理', () => {
    it('初始活动视图应为 chat', () => {
      expect(useUIStore.getState().activeView).toBe('chat');
    });

    it('setActiveView 应切换到指定视图', () => {
      useUIStore.getState().setActiveView('settings');
      expect(useUIStore.getState().activeView).toBe('settings');
    });

    it('应支持所有视图类型', () => {
      const views = ['chat', 'settings', 'providers', 'sessions', 'dashboard'] as const;
      for (const view of views) {
        useUIStore.getState().setActiveView(view);
        expect(useUIStore.getState().activeView).toBe(view);
      }
    });
  });

  // ==================== 标签页管理 ====================

  describe('标签页管理', () => {
    const createTab = (overrides = {}) => ({
      id: 'tab-1',
      type: 'chat' as const,
      title: '新对话',
      closable: true,
      ...overrides,
    });

    it('打开标签页应添加到 tabs 列表', () => {
      const tab = createTab();
      useUIStore.getState().openTab(tab);
      const state = useUIStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe('tab-1');
      expect(state.activeTabId).toBe('tab-1');
    });

    it('打开相同会话标签应激活已有标签', () => {
      const tab1 = createTab({ id: 'tab-1', sessionId: 'session-1' });
      const tab2 = createTab({ id: 'tab-2', sessionId: 'session-1' });
      useUIStore.getState().openTab(tab1);
      useUIStore.getState().openTab(tab2);
      const state = useUIStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.activeTabId).toBe('tab-1');
    });

    it('关闭标签应正确移除', () => {
      const tab1 = createTab({ id: 'tab-1' });
      const tab2 = createTab({ id: 'tab-2', type: 'settings' });
      useUIStore.getState().openTab(tab1);
      useUIStore.getState().openTab(tab2);
      expect(useUIStore.getState().tabs).toHaveLength(2);

      useUIStore.getState().closeTab('tab-1');
      const state = useUIStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0].id).toBe('tab-2');
      expect(state.activeTabId).toBe('tab-2');
    });

    it('关闭最后一个标签应清除 activeTabId', () => {
      const tab = createTab();
      useUIStore.getState().openTab(tab);
      useUIStore.getState().closeTab('tab-1');
      expect(useUIStore.getState().tabs).toHaveLength(0);
      expect(useUIStore.getState().activeTabId).toBeNull();
    });

    it('setActiveTab 应切换活动标签', () => {
      const tab1 = createTab({ id: 'tab-1' });
      const tab2 = createTab({ id: 'tab-2' });
      useUIStore.getState().openTab(tab1);
      useUIStore.getState().openTab(tab2);
      useUIStore.getState().setActiveTab('tab-1');
      expect(useUIStore.getState().activeTabId).toBe('tab-1');
    });

    it('updateTabTitle 应更新标签标题', () => {
      const tab = createTab({ id: 'tab-1', title: '新对话' });
      useUIStore.getState().openTab(tab);
      useUIStore.getState().updateTabTitle('tab-1', '测试标题');
      const state = useUIStore.getState();
      const updated = state.tabs.find((t) => t.id === 'tab-1');
      expect(updated?.title).toBe('测试标题');
    });

    it('不存在的标签更新标题应无副作用', () => {
      useUIStore.getState().updateTabTitle('non-existent', 'test');
      expect(useUIStore.getState().tabs).toHaveLength(0);
    });

    it('关闭中间标签应正确重排 activeTabId', () => {
      const tabs = [
        createTab({ id: 'tab-1' }),
        createTab({ id: 'tab-2' }),
        createTab({ id: 'tab-3' }),
      ];
      tabs.forEach((t) => useUIStore.getState().openTab(t));
      useUIStore.getState().setActiveTab('tab-2');
      useUIStore.getState().closeTab('tab-2');
      const state = useUIStore.getState();
      expect(state.activeTabId).toBe('tab-3');
    });
  });

  // ==================== 异常边界 ====================

  describe('异常边界', () => {
    it('关闭不存在的标签应无副作用', () => {
      useUIStore.getState().closeTab('non-existent');
      expect(useUIStore.getState().tabs).toHaveLength(0);
    });

    it('打开无 sessionId 且 closable=false 的同类型标签应去重', () => {
      const tab1 = { id: 'settings-1', type: 'settings' as const, title: '设置', closable: false };
      const tab2 = { id: 'settings-2', type: 'settings' as const, title: '设置2', closable: false };
      useUIStore.getState().openTab(tab1);
      useUIStore.getState().openTab(tab2);
      expect(useUIStore.getState().tabs).toHaveLength(1);
      expect(useUIStore.getState().activeTabId).toBe('settings-1');
    });

    it('大量标签页打开应正常工作', () => {
      for (let i = 0; i < 50; i++) {
        useUIStore.getState().openTab({
          id: `tab-${i}`,
          type: 'chat',
          title: `对话 ${i}`,
          sessionId: `session-${i}`,
          closable: true,
        });
      }
      expect(useUIStore.getState().tabs).toHaveLength(50);
    });
  });

  // ==================== Toast 通知 ====================

  describe('Toast 通知管理', () => {
    it('addToast 应添加通知并自动生成 ID', () => {
      useUIStore.getState().addToast({ type: 'success', message: '测试消息' });
      const state = useUIStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].type).toBe('success');
      expect(state.toasts[0].message).toBe('测试消息');
      expect(state.toasts[0].id).toMatch(/^toast_\d+$/);
    });

    it('removeToast 应移除指定通知', () => {
      useUIStore.getState().addToast({ type: 'info', message: '消息1' });
      const state = useUIStore.getState();
      const id = state.toasts[0].id;
      useUIStore.getState().removeToast(id);
      expect(useUIStore.getState().toasts).toHaveLength(0);
    });

    it('removeToast 移除不存在的通知应无副作用', () => {
      useUIStore.getState().addToast({ type: 'info', message: 'test' });
      useUIStore.getState().removeToast('non-existent');
      expect(useUIStore.getState().toasts).toHaveLength(1);
    });

    it('支持所有 Toast 类型', () => {
      const types = ['success', 'error', 'warning', 'info'] as const;
      types.forEach((type) => {
        useUIStore.getState().addToast({ type, message: `${type} 消息` });
      });
      const state = useUIStore.getState();
      expect(state.toasts).toHaveLength(4);
      expect(state.toasts.map((t) => t.type)).toEqual(types);
    });

    it('自定义 duration 的 Toast 应正常工作', () => {
      useUIStore.getState().addToast({
        type: 'warning',
        message: '持久',
        duration: 0, // 不自动消失
      });
      expect(useUIStore.getState().toasts).toHaveLength(1);
    });

    it('多个 Toast 应独立管理', () => {
      useUIStore.getState().addToast({ type: 'success', message: 'A' });
      useUIStore.getState().addToast({ type: 'error', message: 'B' });
      const id = useUIStore.getState().toasts[0].id;
      useUIStore.getState().removeToast(id);
      const state = useUIStore.getState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].message).toBe('B');
    });
  });
});
