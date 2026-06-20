/**
 * Sidebar - 左侧边栏
 * 显示会话列表、导航菜单、提供商状态
 */
import { useState, useCallback } from 'react';
import { MessageSquare, Settings, Database, Zap, Monitor, ChevronLeft, Plus, SidebarOpenIcon } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useSessionStore } from '@/stores/sessionStore';
import type { FC } from 'react';

interface SidebarProps {
  collapsed: boolean;
}

const NAV_ITEMS = [
  { id: 'chat' as const, label: '对话', icon: MessageSquare },
  { id: 'providers' as const, label: '模型', icon: Zap },
  { id: 'sessions' as const, label: '会话', icon: Database },
  { id: 'dashboard' as const, label: '监控', icon: Monitor },
  { id: 'settings' as const, label: '设置', icon: Settings },
];

export const Sidebar: FC<SidebarProps> = ({ collapsed }) => {
  const { activeView, setActiveView, toggleSidebar, sidebarOpen } = useUIStore();
  const sessions = useSessionStore((s) => s.sessions);
  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const setCurrentSessionId = useSessionStore((s) => s.setCurrentSessionId);
  const clearMessages = useSessionStore((s) => s.clearMessages);
  const openTab = useUIStore((s) => s.openTab);
  const [searchQuery, setSearchQuery] = useState('');

  const handleNavClick = useCallback(
    (id: typeof activeView) => {
      setActiveView(id);
    },
    [setActiveView],
  );

  const handleSessionClick = useCallback(
    (session: typeof sessions[0]) => {
      setCurrentSessionId(session.id);
      clearMessages();
      openTab({
        id: `session_${session.id}`,
        type: 'chat',
        title: session.title,
        sessionId: session.id,
        closable: true,
      });
    },
    [setCurrentSessionId, clearMessages, openTab],
  );

  const handleNewChat = useCallback(() => {
    setCurrentSessionId(null);
    clearMessages();
    setActiveView('chat');
  }, [setCurrentSessionId, clearMessages, setActiveView]);

  const filteredSessions = searchQuery
    ? sessions.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  return (
    <div className="flex flex-col h-full bg-surface-sidebar select-none">
      {/* 顶部 Logo 与折叠按钮 */}
      <div className="flex items-center justify-between h-12 px-3 border-b border-border-subtle drag-region">
        {!collapsed && (
          <span className="text-sm font-semibold text-text-primary truncate no-drag animate-fade-in">
            EasyAgent
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="no-drag p-1.5 rounded-md hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors ml-auto"
          title={sidebarOpen ? '折叠侧边栏' : '展开侧边栏'}
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <SidebarOpenIcon className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* 导航菜单 */}
      {!collapsed ? (
        <>
          <nav className="px-2 py-3 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150
                    ${isActive
                      ? 'bg-brand/10 text-brand border border-brand/20'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent'
                    }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 分隔线 + 新建对话 */}
          <div className="px-3 py-2">
            <div className="border-t border-border-subtle pt-3">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium 
                  bg-brand text-white hover:bg-brand-hover transition-colors"
              >
                <Plus className="w-4 h-4" />
                新建对话
              </button>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="px-3 pb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索会话..."
              className="w-full px-3 py-1.5 text-xs rounded-md bg-surface-raised border border-border-subtle
                text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus transition-colors"
            />
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto px-2">
            <div className="space-y-0.5">
              {filteredSessions.length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">
                  {searchQuery ? '无匹配会话' : '暂无会话'}
                </p>
              )}
              {filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSessionClick(session)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 group
                    ${currentSessionId === session.id
                      ? 'bg-surface-overlay text-text-primary'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
                    <span className="truncate flex-1">{session.title}</span>
                    <span className="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      {session.messageCount}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* 折叠状态：仅显示图标 */
        <nav className="flex flex-col items-center py-3 gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`p-2 rounded-lg transition-all duration-150 ${
                  isActive
                    ? 'bg-brand/10 text-brand'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
          <div className="w-8 border-t border-border-subtle my-1" />
          <button
            onClick={handleNewChat}
            className="p-2 rounded-lg text-text-secondary hover:text-brand hover:bg-surface-hover transition-colors"
            title="新建对话"
          >
            <Plus className="w-5 h-5" />
          </button>
        </nav>
      )}
    </div>
  );
};
