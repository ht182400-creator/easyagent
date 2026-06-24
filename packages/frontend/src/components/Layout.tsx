/**
 * WorkBuddy 风格布局组件
 * 现代侧边栏 + 主内容区 + 通知管理
 * 特性: 品牌渐变、分组导航、连接状态、主题切换、响应式
 */
import { useState, useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, Cpu, History, Wrench,
  BookOpen, Clock, Settings, ChevronLeft, ChevronRight,
  Sparkles, Sun, Moon, X, Box, Map, Send, Activity,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';

/** 导航分组定义 */
const navGroups = [
  {
    label: '核心',
    items: [
      { path: '/', icon: LayoutDashboard, label: '首页' },
      { path: '/chat', icon: MessageSquare, label: '对话' },
    ],
  },
  {
    label: '管理',
    items: [
      { path: '/providers', icon: Cpu, label: '模型' },
      { path: '/sessions', icon: History, label: '会话' },
      { path: '/tools', icon: Wrench, label: '工具' },
      { path: '/skills', icon: Sparkles, label: '技能' },
    ],
  },
  {
    label: '扩展',
    items: [
      { path: '/knowledge', icon: BookOpen, label: '知识库' },
      { path: '/automation', icon: Clock, label: '自动化' },
      { path: '/token-usage', icon: Activity, label: '用量分析' },
      { path: '/im', icon: Send, label: 'IM' },
      { path: '/sandbox', icon: Box, label: '沙箱' },
      { path: '/semantic', icon: Map, label: '语义' },
    ],
  },
  {
    label: '系统',
    items: [
      { path: '/settings', icon: Settings, label: '设置' },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const {
    sidebarCollapsed, toggleSidebar,
    theme, setTheme, serverConnected,
    notifications, removeNotification,
  } = useAppStore();
  const location = useLocation();
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('v0.4.1');

  /** 从 API 获取当前版本号 */
  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then((data: { version: string }) => {
        if (data?.version) setAppVersion(`v${data.version}`);
      })
      .catch(() => { /* 使用默认版本号 */ });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ======== 侧边栏 ======== */}
      <aside
        className={`${
          sidebarCollapsed ? 'w-[68px]' : 'w-60'
        } bg-[#0c0e12]/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col transition-all duration-300 ease-out-expo relative z-10`}
      >
        {/* Logo 区域 */}
        <div className="flex items-center gap-3 h-16 px-4 border-b border-white/[0.06]">
          {/* 品牌 Logo */}
          <div className="relative w-9 h-9 shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 opacity-80 blur-sm" />
            <div className="relative w-full h-full rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
          </div>

          {!sidebarCollapsed && (
            <span className="font-bold text-base tracking-tight">
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                EasyAgent
              </span>
            </span>
          )}

          {/* 折叠按钮 */}
          <button
            onClick={toggleSidebar}
            className={`${sidebarCollapsed ? 'mx-auto' : 'ml-auto'} p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-gray-600 hover:text-gray-300`}
            title={sidebarCollapsed ? '展开' : '收起'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* 导航列表 */}
        <nav className="flex-1 py-4 px-3 space-y-5 overflow-y-auto overflow-overlay">
          {navGroups.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <div className="px-3 mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-gray-600">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onMouseEnter={() => setHoveredNav(item.path)}
                      onMouseLeave={() => setHoveredNav(null)}
                      className={({ isActive: active }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group relative ${
                          active
                            ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-400 border border-blue-500/15 shadow-sm'
                            : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04] border border-transparent'
                        }`
                      }
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <item.icon
                        className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${
                          hoveredNav === item.path && !isActive ? 'scale-110' : ''
                        }`}
                      />
                      {!sidebarCollapsed && (
                        <span className="text-[13px] font-medium whitespace-nowrap">{item.label}</span>
                      )}
                      {/* 激活指示器 */}
                      {isActive && sidebarCollapsed && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-gradient-to-b from-blue-400 to-purple-400" />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 底部状态区 */}
        <div className="border-t border-white/[0.06] p-3 space-y-2">
          {/* 主题切换 */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-colors text-gray-500 hover:text-gray-300"
            title={theme === 'dark' ? '亮色模式' : '深色模式'}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 shrink-0" />
            )}
            {!sidebarCollapsed && (
              <span className="text-xs">{theme === 'dark' ? '亮色模式' : '深色模式'}</span>
            )}
          </button>

          {/* 连接状态 */}
          <div className="flex items-center gap-2.5 px-3 py-1.5">
            <div
              className={`w-2 h-2 rounded-full ${
                serverConnected
                  ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
                  : 'bg-gray-600'
              }`}
            />
            {!sidebarCollapsed && (
              <span className="text-xs text-gray-600">
                {serverConnected ? '已连接' : '未连接'}
              </span>
            )}
          </div>

          {/* 版本号 */}
          {!sidebarCollapsed && (
            <div className="px-3 pb-1">
              <span className="text-[10px] text-gray-700 tracking-wide">{appVersion}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ======== 主内容区 ======== */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
        <main className="flex-1 overflow-auto">
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* ======== 通知浮层 ======== */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl border slide-up backdrop-blur-md ${
                notif.type === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : notif.type === 'warning'
                  ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                  : notif.type === 'success'
                  ? 'bg-green-500/10 border-green-500/20 text-green-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}
            >
              <span className="text-sm flex-1">{notif.message}</span>
              <button
                onClick={() => removeNotification(notif.id)}
                className="text-current opacity-50 hover:opacity-100 transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
