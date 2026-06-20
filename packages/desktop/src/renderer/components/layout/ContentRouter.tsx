/**
 * ContentRouter - 内容区域路由
 * 根据活动标签页或导航视图切换显示内容
 */
import { useUIStore } from '@/stores/uiStore';
import { ChatView } from '@/components/chat/ChatView';
import type { FC } from 'react';

/**
 * 占位视图 - 功能建设中
 */
const PlaceholderView: FC<{ title: string; emoji: string; desc: string }> = ({
  title,
  emoji,
  desc,
}) => (
  <div className="flex items-center justify-center h-full animate-fade-in">
    <div className="text-center space-y-4">
      <span className="text-5xl">{emoji}</span>
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="text-sm text-text-muted max-w-md">{desc}</p>
    </div>
  </div>
);

export const ContentRouter: FC = () => {
  const { tabs, activeTabId, activeView } = useUIStore();

  // 优先使用标签页的路由
  if (activeTabId) {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab) {
      switch (activeTab.type) {
        case 'chat':
          return <ChatView sessionId={activeTab.sessionId} />;
        case 'settings':
          return <PlaceholderView title="设置" emoji="⚙️" desc="全局配置、代理设置、快捷键配置 (即将上线)" />;
        case 'providers':
          return <PlaceholderView title="模型管理" emoji="🔌" desc="管理 DeepSeek / 通义千问 / 文心一言 等 AI 模型提供商 (即将上线)" />;
        case 'sessions':
          return <PlaceholderView title="会话管理" emoji="📋" desc="浏览、搜索、归档历史会话 (即将上线)" />;
        case 'dashboard':
          return <PlaceholderView title="监控面板" emoji="📊" desc="Token用量统计、性能监控 (即将上线)" />;
      }
    }
  }

  // 回退到导航视图
  switch (activeView) {
    case 'chat':
      return <ChatView />;
    case 'settings':
      return <PlaceholderView title="设置" emoji="⚙️" desc="全局配置、代理设置、快捷键配置 (即将上线)" />;
    case 'providers':
      return <PlaceholderView title="模型管理" emoji="🔌" desc="管理 DeepSeek / 通义千问 / 文心一言 等 AI 模型提供商 (即将上线)" />;
    case 'sessions':
      return <PlaceholderView title="会话管理" emoji="📋" desc="浏览、搜索、归档历史会话 (即将上线)" />;
    case 'dashboard':
      return <PlaceholderView title="监控面板" emoji="📊" desc="Token用量统计、性能监控 (即将上线)" />;
    default:
      return <ChatView />;
  }
};
