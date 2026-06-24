/**
 * 应用全局状态管理
 * 管理: 主题、侧边栏、连接状态、通知
 */
import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type ViewMode = 'default' | 'compact';

interface AppState {
  /** 当前主题 */
  theme: Theme;
  /** 侧边栏是否折叠 */
  sidebarCollapsed: boolean;
  /** 侧边栏是否在移动端打开 */
  mobileSidebarOpen: boolean;
  /** 服务端连接状态 */
  serverConnected: boolean;
  /** 全局加载状态 */
  globalLoading: boolean;
  /** 全局通知 */
  notifications: AppNotification[];
  /** 视图模式 */
  viewMode: ViewMode;

  // Actions
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setServerConnected: (connected: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  setViewMode: (mode: ViewMode) => void;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  timestamp: number;
}

/**
 * 应用全局 Store
 */
export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('easyagent-theme') as Theme) || 'dark',
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  serverConnected: false,
  globalLoading: false,
  notifications: [],
  viewMode: 'default',

  setTheme: (theme) => {
    localStorage.setItem('easyagent-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setServerConnected: (connected) => set({ serverConnected: connected }),
  setGlobalLoading: (loading) => set({ globalLoading: loading }),
  setViewMode: (mode) => set({ viewMode: mode }),

  /** 
   * 添加通知（最多保留 10 条，超出的老通知自动丢弃）
   * @param notification 通知对象（不含 id/timestamp）
   * @param notification.duration 显示时长(ms)，默认 5000，设为 0 则不自动消失
   */
  addNotification: (notification) => {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newNotif = { ...notification, id, timestamp: Date.now() };
    // 最多保留 10 条通知，通过 .slice(-9) 实现（9 条旧 + 1 条新 = 10）
    set((s) => ({ notifications: [...s.notifications.slice(-9), newNotif] }));
    if (notification.duration !== 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, notification.duration || 5000);
    }
  },

  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}));

/**
 * 初始化主题
 */
export function initializeTheme() {
  const saved = localStorage.getItem('easyagent-theme') as Theme | null;
  const theme = saved || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}
