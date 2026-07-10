/**
 * UI 状态管理 - 侧边栏、标签页、主题、Toast
 */
import { create } from 'zustand';

export interface Tab {
  id: string;
  type: 'chat' | 'settings' | 'providers' | 'sessions' | 'dashboard';
  title: string;
  icon?: string;
  sessionId?: string;
  closable: boolean;
}

interface UIState {
  /** 侧边栏是否展开 */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  /** 活动视图 (当无标签页时) */
  activeView: Tab['type'];
  setActiveView: (view: Tab['type']) => void;

  /** 标签页管理 */
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Tab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabTitle: (tabId: string, title: string) => void;

  /** 右侧面板 (文档浏览器等) */
  rightPanelVisible: boolean;
  rightPanelUrl: string;
  rightPanelTitle: string;
  openRightPanel: (url: string, title?: string) => void;
  closeRightPanel: () => void;
  toggleRightPanel: () => void;

  /** Toast 通知 */
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

let toastId = 0;
const generateToastId = () => `toast_${++toastId}`;

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  activeView: 'chat',
  setActiveView: (view) => set({ activeView: view }),

  tabs: [],
  activeTabId: null,

  openTab: (tab) => {
    const { tabs } = get();
    // 避免重复打开同一会话标签
    if (tab.sessionId) {
      const existing = tabs.find((t) => t.sessionId === tab.sessionId);
      if (existing) {
        set({ activeTabId: existing.id });
        return;
      }
    }
    // 避免重复打开同类型单例标签
    if (!tab.sessionId && !tab.closable) {
      const existing = tabs.find((t) => t.type === tab.type);
      if (existing) {
        set({ activeTabId: existing.id });
        return;
      }
    }
    set({ tabs: [...tabs, tab], activeTabId: tab.id });
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const newTabs = tabs.filter((t) => t.id !== tabId);
    let newActiveId = activeTabId;
    if (activeTabId === tabId) {
      // 优先激活右边，其次左边
      newActiveId = newTabs[Math.min(idx, newTabs.length - 1)]?.id || null;
    }
    set({ tabs: newTabs, activeTabId: newActiveId });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  updateTabTitle: (tabId, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)),
    })),

  /** 右侧面板管理 */
  rightPanelVisible: false,
  rightPanelUrl: '',
  rightPanelTitle: '',
  openRightPanel: (url, title = '') => set({ rightPanelVisible: true, rightPanelUrl: url, rightPanelTitle: title }),
  closeRightPanel: () => set({ rightPanelVisible: false }),
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),

  toasts: [],
  addToast: (toast) => {
    const id = generateToastId();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? 3000;
    if (duration > 0) {
      setTimeout(() => get().removeToast(id), duration);
    }
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
