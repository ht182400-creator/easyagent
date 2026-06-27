/**
 * TabBar - 顶部标签栏
 * 管理打开的标签页，支持拖拽、关闭、切换
 */
import { useCallback } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import type { FC } from 'react';

const TAB_ICON_MAP: Record<string, string> = {
  chat: '💬',
  settings: '⚙️',
  providers: '🔌',
  sessions: '📋',
  dashboard: '📊',
};

export const TabBar: FC = () => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useUIStore();

  const handleClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab],
  );

  if (tabs.length === 0) return null;

  return (
    <div
      className="flex items-center h-[var(--tab-height)] bg-surface-shell border-b border-border-subtle drag-region overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`no-drag flex items-center gap-1.5 px-3 py-1.5 h-full text-xs cursor-pointer select-none
              border-r border-border-subtle transition-colors duration-150 group max-w-[180px]
              ${
                isActive
                  ? 'bg-surface-main text-text-primary border-t-2 border-t-brand'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
              }`}
          >
            <span className="text-xs">{TAB_ICON_MAP[tab.type] || '📄'}</span>
            <span className="truncate">{tab.title}</span>
            {tab.closable && (
              <button
                onClick={(e) => handleClose(e, tab.id)}
                className="ml-1 p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-surface-overlay 
                  text-text-muted hover:text-text-primary transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
