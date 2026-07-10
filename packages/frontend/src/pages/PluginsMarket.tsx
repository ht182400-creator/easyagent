/**
 * 第三方插件市场页面
 *
 * 包含三个标签页：
 * - 社区插件市场 (浏览、搜索、安装)
 * - 已安装插件 (启用/禁用、更新、卸载)
 * - 安全设置 (安全模式开关)
 *
 * @module PluginsMarket
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Download,
  Trash2,
  RefreshCw,
  Shield,
  ShieldOff,
  ExternalLink,
  Star,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Package,
  ArrowUpCircle,
  Zap,
  FolderOpen,
  FileText,
  Globe,
  Terminal,
} from 'lucide-react';
import { usePluginsStore, type PluginMarketEntry, type InstallProgress } from '../stores/pluginsStore';

// ===================== 类型定义 =====================

type TabKey = 'market' | 'installed' | 'security';

// ===================== 权限图标映射 =====================

const PERMISSION_ICONS: Record<string, React.ReactNode> = {
  filesystem_read: <FileText className="w-3.5 h-3.5" />,
  filesystem_write: <FolderOpen className="w-3.5 h-3.5" />,
  network: <Globe className="w-3.5 h-3.5" />,
  shell: <Terminal className="w-3.5 h-3.5" />,
};

// ===================== 组件 =====================

export default function PluginsMarket() {
  return (
    <div className="h-full flex flex-col p-6">
      <PluginMarketPage />
    </div>
  );
}

/**
 * 插件市场主页面
 */
function PluginMarketPage() {
  const {
    marketplace,
    installed,
    loading,
    searchQuery,
    installProgress,
    selectedPlugin,
    detailLoading,
    safeMode,
    fetchMarketplace,
    fetchInstalled,
    fetchPluginDetail,
    installPlugin,
    updatePlugin,
    uninstallPlugin,
    togglePlugin,
    checkUpdates,
    setSearchQuery,
    setSafeMode,
    clearSelectedPlugin,
  } = usePluginsStore();

  const [activeTab, setActiveTab] = useState<TabKey>('market');

  // 初始化加载数据
  useEffect(() => {
    fetchMarketplace();
    fetchInstalled();
    checkUpdates();
  }, []);

  // 过滤搜索
  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return marketplace;
    const q = searchQuery.toLowerCase();
    return marketplace.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.author.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [marketplace, searchQuery]);

  return (
    <>
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">第三方插件</h1>
          <p className="text-xs text-gray-500 mt-1">
            浏览、安装和管理社区插件，扩展 EasyAgent 的能力
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchMarketplace(true);
              fetchInstalled();
            }}
            disabled={loading}
            className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs"
            title="刷新插件列表"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="flex gap-1 mb-4 border-b border-white/5 pb-0">
        {[
          { key: 'market' as TabKey, label: '社区插件市场', count: marketplace.length },
          { key: 'installed' as TabKey, label: '已安装插件', count: installed.length },
          { key: 'security' as TabKey, label: '安全设置' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white/5 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.02]'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs text-gray-500">({tab.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'market' && (
          <MarketTab
            plugins={filteredPlugins}
            searchQuery={searchQuery}
            loading={loading}
            installProgress={installProgress}
            selectedPlugin={selectedPlugin}
            detailLoading={detailLoading}
            onSearch={setSearchQuery}
            onInstall={installPlugin}
            onViewDetail={fetchPluginDetail}
            onCloseDetail={clearSelectedPlugin}
          />
        )}
        {activeTab === 'installed' && (
          <InstalledTab
            plugins={installed}
            loading={loading}
            installProgress={installProgress}
            onToggle={togglePlugin}
            onUninstall={uninstallPlugin}
            onUpdate={updatePlugin}
            onCheckUpdates={checkUpdates}
          />
        )}
        {activeTab === 'security' && (
          <SecurityTab safeMode={safeMode} onToggle={setSafeMode} />
        )}
      </div>
    </>
  );
}

// ===================== 社区插件市场 =====================

interface MarketTabProps {
  plugins: PluginMarketEntry[];
  searchQuery: string;
  loading: boolean;
  installProgress: Map<string, InstallProgress>;
  selectedPlugin: { plugin: PluginMarketEntry | null; readmeHtml: string | null } | null;
  detailLoading: boolean;
  onSearch: (query: string) => void;
  onInstall: (pluginId: string) => Promise<string | null>;
  onViewDetail: (pluginId: string) => Promise<void>;
  onCloseDetail: () => void;
}

function MarketTab({
  plugins,
  searchQuery,
  loading,
  installProgress,
  selectedPlugin,
  detailLoading,
  onSearch,
  onInstall,
  onViewDetail,
  onCloseDetail,
}: MarketTabProps) {
  if (selectedPlugin) {
    return (
      <PluginDetailView
        detail={selectedPlugin}
        loading={detailLoading}
        installProgress={installProgress}
        onInstall={onInstall}
        onClose={onCloseDetail}
      />
    );
  }

  return (
    <div>
      {/* 搜索栏 */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜索社区插件..."
          className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
        />
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="ml-2 text-sm text-gray-400">正在加载插件列表...</span>
        </div>
      )}

      {/* 无结果 */}
      {!loading && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Package className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-sm">
            {searchQuery ? '未找到匹配的插件' : '暂无可用的社区插件'}
          </p>
          <p className="text-xs mt-1 text-gray-600">
            {searchQuery
              ? '尝试其他关键词'
              : '确保仓库已添加 easyagent-plugin Topic 标签'}
          </p>
        </div>
      )}

      {/* 插件网格 */}
      {!loading && plugins.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {plugins.map((plugin) => (
            <PluginCard
              key={plugin.id}
              plugin={plugin}
              installProgress={installProgress}
              onInstall={onInstall}
              onViewDetail={onViewDetail}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===================== 插件卡片 =====================

interface PluginCardProps {
  plugin: PluginMarketEntry;
  installProgress: Map<string, InstallProgress>;
  onInstall: (pluginId: string) => Promise<string | null>;
  onViewDetail: (pluginId: string) => Promise<void>;
}

function PluginCard({ plugin, installProgress, onInstall, onViewDetail }: PluginCardProps) {
  const [installing, setInstalling] = useState(false);
  // 查找这个插件的安装进度
  const progress = Array.from(installProgress.values()).find(
    (p) => p.pluginId === plugin.id,
  );

  const handleInstall = async () => {
    setInstalling(true);
    await onInstall(plugin.id);
    // 安装由 WebSocket 事件自动更新状态
  };

  const statusLabel = (() => {
    if (progress?.status === 'pending') return '准备中...';
    if (progress?.status === 'downloading') return `下载中 ${progress.progress}%`;
    if (progress?.status === 'extracting') return '解压中...';
    if (progress?.status === 'loading') return '注册中...';
    if (progress?.status === 'done') return '已安装';
    if (progress?.status === 'error') return '安装失败';
    if (plugin.installed) return '已安装';
    return null;
  })();

  const isProcessing = progress && !['done', 'error'].includes(progress.status);

  return (
    <div
      className="bg-white/[0.03] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-all cursor-pointer"
      onClick={() => onViewDetail(plugin.id)}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium truncate">{plugin.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">作者: {plugin.author}</p>
        </div>
        {/* 权限指示器 */}
        {plugin.permissions && (
          <div className="flex items-center gap-0.5 ml-2">
            {plugin.permissions.filesystem?.read && PERMISSION_ICONS.filesystem_read}
            {plugin.permissions.filesystem?.write && PERMISSION_ICONS.filesystem_write}
            {plugin.permissions.network?.allowAll && PERMISSION_ICONS.network}
            {plugin.permissions.shell && (
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            )}
          </div>
        )}
      </div>

      {/* 描述 */}
      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{plugin.description}</p>

      {/* 统计 */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3" />
          {formatNumber(plugin.downloads)}
        </span>
        <span className="flex items-center gap-1">
          <Star className="w-3 h-3" />
          {formatNumber(plugin.stars)}
        </span>
        <span>v{plugin.version}</span>
        {plugin.updatedAt && (
          <span>{formatDate(plugin.updatedAt)}</span>
        )}
      </div>

      {/* 标签 */}
      {plugin.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {plugin.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        {plugin.installed || progress?.status === 'done' ? (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="w-3 h-3" /> 已安装
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleInstall();
            }}
            disabled={isProcessing || installing}
            className={`btn btn-sm flex items-center gap-1 text-xs px-3 py-1 rounded ${
              isProcessing || installing
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isProcessing || installing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            {statusLabel || '安装'}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(plugin.repoUrl, '_blank');
          }}
          className="btn btn-sm btn-ghost flex items-center gap-1 text-xs"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ===================== 插件详情视图 =====================

interface PluginDetailViewProps {
  detail: { plugin: PluginMarketEntry | null; readmeHtml: string | null };
  loading: boolean;
  installProgress: Map<string, InstallProgress>;
  onInstall: (pluginId: string) => Promise<string | null>;
  onClose: () => void;
}

function PluginDetailView({ detail, loading, installProgress, onInstall, onClose }: PluginDetailViewProps) {
  const { plugin, readmeHtml } = detail;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="flex flex-col items-center py-12 text-gray-500">
        <XCircle className="w-8 h-8 mb-2" />
        <p>无法加载插件详情</p>
        <button onClick={onClose} className="btn btn-sm btn-ghost mt-2">
          返回列表
        </button>
      </div>
    );
  }

  const progress = Array.from(installProgress.values()).find(
    (p) => p.pluginId === plugin.id,
  );
  const isProcessing = progress && !['done', 'error'].includes(progress.status);

  return (
    <div className="max-w-3xl">
      {/* 返回按钮 */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
      >
        ← 返回插件列表
      </button>

      {/* 头部信息 */}
      <div className="bg-white/[0.03] border border-white/5 rounded-lg p-5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold">{plugin.name}</h2>
            <p className="text-sm text-gray-400 mt-1">
              作者: {plugin.author} · v{plugin.version} · ⭐ {plugin.stars} · ⬇ {formatNumber(plugin.downloads)}
            </p>
            <a
              href={plugin.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
            >
              <ExternalLink className="w-3 h-3" />
              {plugin.repoUrl.replace('https://github.com/', '')}
            </a>
          </div>

          {plugin.installed ? (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" /> 已安装
            </span>
          ) : (
            <button
              onClick={() => onInstall(plugin.id)}
              disabled={isProcessing}
              className="btn btn-primary flex items-center gap-1.5 px-4 py-2 rounded-lg"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isProcessing ? `安装中 ${progress?.progress || 0}%` : '安装'}
            </button>
          )}
        </div>

        <p className="text-sm text-gray-300">{plugin.description}</p>

        {/* 权限清单 */}
        {plugin.permissions && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <h4 className="text-xs font-medium text-gray-400 mb-2">权限声明</h4>
            <div className="grid grid-cols-2 gap-2">
              {plugin.permissions.filesystem?.read && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  {PERMISSION_ICONS.filesystem_read}
                  读取文件
                </div>
              )}
              {plugin.permissions.filesystem?.write && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                  {PERMISSION_ICONS.filesystem_write}
                  写入文件 ⚠
                </div>
              )}
              {plugin.permissions.network?.allowAll && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                  {PERMISSION_ICONS.network}
                  网络访问 ⚠
                </div>
              )}
              {plugin.permissions.shell && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  {PERMISSION_ICONS.shell}
                  Shell 执行 ⚠⚠
                </div>
              )}
            </div>
          </div>
        )}

        {/* 标签 */}
        {plugin.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {plugin.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-[11px] bg-blue-500/10 text-blue-400 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* README */}
      {readmeHtml && (
        <div className="bg-white/[0.03] border border-white/5 rounded-lg p-5">
          <h3 className="text-sm font-medium mb-3">README</h3>
          <div
            className="prose prose-invert prose-sm max-w-none [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_pre]:bg-black/30 [&_code]:bg-black/20 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_a]:text-blue-400"
            dangerouslySetInnerHTML={{ __html: readmeHtml }}
          />
        </div>
      )}
    </div>
  );
}

// ===================== 已安装插件 =====================

interface InstalledTabProps {
  plugins: ReturnType<typeof usePluginsStore.getState>['installed'];
  loading: boolean;
  installProgress: Map<string, InstallProgress>;
  onToggle: (name: string, enabled: boolean) => Promise<void>;
  onUninstall: (pluginId: string) => Promise<void>;
  onUpdate: (pluginId: string) => Promise<string | null>;
  onCheckUpdates: () => Promise<Map<string, string | null>>;
}

function InstalledTab({ plugins, loading, installProgress, onToggle, onUninstall, onUpdate, onCheckUpdates }: InstalledTabProps) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    await onCheckUpdates();
    setCheckingUpdate(false);
  };

  const handleUpdate = async (pluginId: string) => {
    setUpdatingIds((prev) => new Set(prev).add(pluginId));
    try {
      await onUpdate(pluginId);
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Package className="w-12 h-12 mb-3 opacity-50" />
        <p className="text-sm">尚未安装任何第三方插件</p>
        <p className="text-xs mt-1 text-gray-600">前往"社区插件市场"浏览和安装插件</p>
      </div>
    );
  }

  return (
    <div>
      {/* 操作栏 */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">已安装 {plugins.length} 个插件</p>
        <button
          onClick={handleCheckUpdates}
          disabled={checkingUpdate}
          className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className={`w-3 h-3 ${checkingUpdate ? 'animate-spin' : ''}`} />
          检查更新
        </button>
      </div>

      {/* 插件列表 */}
      <div className="space-y-2">
        {plugins.map((plugin) => (
          <div
            key={plugin.id}
            className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-lg p-4"
          >
            {/* 左侧信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">{plugin.name}</h4>
                <span className="text-xs text-gray-500">v{plugin.version}</span>
                <span
                  className={`flex items-center gap-1 text-xs ${
                    plugin.enabled ? 'text-green-400' : 'text-gray-500'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      plugin.enabled ? 'bg-green-400' : 'bg-gray-500'
                    }`}
                  />
                  {plugin.enabled ? '已启用' : '已禁用'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                作者: {plugin.author}
                {plugin.updateAvailable && (
                  <span className="ml-2 text-yellow-400 flex items-center gap-0.5">
                    <ArrowUpCircle className="w-3 h-3" />
                    v{plugin.latestVersion} 可用
                  </span>
                )}
              </p>
            </div>

            {/* 右侧操作 */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => onToggle(plugin.name, !plugin.enabled)}
                className={`btn btn-sm text-xs px-3 py-1 rounded ${
                  plugin.enabled
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300'
                    : 'bg-green-600/20 hover:bg-green-600/30 text-green-400'
                }`}
              >
                {plugin.enabled ? '禁用' : '启用'}
              </button>
              {plugin.updateAvailable && (
                <button
                  className="btn btn-sm bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs px-3 py-1 rounded flex items-center gap-1"
                  disabled={updatingIds.has(plugin.id)}
                  onClick={() => handleUpdate(plugin.id)}
                >
                  {updatingIds.has(plugin.id) ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="w-3 h-3" />
                  )}
                  {updatingIds.has(plugin.id) ? '更新中...' : '更新'}
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm(`确定要卸载 "${plugin.name}" 吗？`)) {
                    onUninstall(plugin.id);
                  }
                }}
                className="btn btn-sm btn-ghost text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> 卸载
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== 安全设置 =====================

interface SecurityTabProps {
  safeMode: boolean;
  onToggle: (enabled: boolean) => void;
}

function SecurityTab({ safeMode, onToggle }: SecurityTabProps) {
  return (
    <div className="max-w-xl space-y-6">
      {/* 安全模式 */}
      <div className="bg-white/[0.03] border border-white/5 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {safeMode ? (
              <ShieldOff className="w-5 h-5 text-yellow-400" />
            ) : (
              <Shield className="w-5 h-5 text-green-400" />
            )}
            <h3 className="font-medium">安全模式</h3>
          </div>
          <button
            onClick={() => onToggle(!safeMode)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              safeMode ? 'bg-yellow-500' : 'bg-white/10'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                safeMode ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        <p className="text-sm text-gray-400">
          开启安全模式后，所有第三方插件将被禁用。当插件导致启动异常时，EasyAgent 会自动进入安全模式。
        </p>
      </div>

      {/* 风险提示 */}
      <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium text-yellow-400">安全须知</h4>
            <ul className="mt-2 space-y-1.5 text-xs text-gray-400">
              <li>• 第三方插件运行在独立的 Worker 沙箱中，与主应用隔离</li>
              <li>• 安装前请查看插件的权限声明，谨慎授权危险权限</li>
              <li>• 安全模式下所有第三方插件将被禁用</li>
              <li>• 仅从可信来源安装插件，GitHub 仓库需添加 easyagent-plugin Topic</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================== 工具函数 =====================

/** 格式化数字 */
function formatNumber(num: number | undefined | null): string {
  if (num == null) return '0';
  if (num >= 10000) return `${(num / 1000).toFixed(1)}k`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

/** 格式化日期 */
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    return `${Math.floor(diffDays / 30)}月前`;
  } catch {
    return '';
  }
}
