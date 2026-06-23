/**
 * AppShell - 桌面应用主布局容器
 * 三栏结构: Sidebar | [TabBar + Content] | (可选面板)
 */
import { useUIStore } from '@/stores/uiStore';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { ContentRouter } from './ContentRouter';
import { StatusBar } from './StatusBar';
import type { FC } from 'react';

export const AppShell: FC = () => {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  return (
    <div className="flex h-full bg-surface-shell overflow-hidden">
      {/* 左侧边栏 */}
      <aside
        className="sidebar-transition flex-shrink-0 h-full border-r border-border-subtle"
        style={{ width: sidebarOpen ? 'var(--sidebar-width)' : 'var(--sidebar-collapsed-width)' }}
      >
        <Sidebar collapsed={!sidebarOpen} />
      </aside>

      {/* 右侧主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部标签栏 */}
        <TabBar />

        {/* 内容区域 */}
        <main className="flex-1 overflow-hidden bg-surface-main">
          <ContentRouter />
        </main>

        {/* 底部状态栏 */}
        <StatusBar />
      </div>
    </div>
  );
};
