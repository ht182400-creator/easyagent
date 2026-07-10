import { useState } from 'react';
import { FileTree } from './components/FileTree';
import { GraphView } from './components/GraphView';
import { MarkdownPreview } from './components/MarkdownPreview';
import { SearchPanel } from './components/SearchPanel';
import { Toolbar } from './components/Toolbar';
import { SettingsModal } from './components/SettingsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useDocStore } from './stores/docStore';
import { FolderOpen, AlertCircle, Loader2 } from 'lucide-react';

/**
 * 应用主组件
 * 三栏布局：左侧目录树 + 中间图谱 + 右侧预览/搜索
 * 加载分两阶段：
 *   - 阶段一（isLoading）：全屏遮罩，正在扫描目录
 *   - 阶段二（isContentLoading）：底部进度条，文件树已可见，后台读取内容
 */
function App() {
  const { rootNodes, selectedDocId, isLoading, isContentLoading, loadingText, error, clearError } =
    useDocStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasDocs = rootNodes.length > 0;

  return (
    <ErrorBoundary>
      <div className="relative flex h-screen flex-col bg-white text-slate-900">
        <Toolbar onOpenSettings={() => setSettingsOpen(true)} />

        {error && (
          <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-sm text-red-700">
            <AlertCircle size={16} />
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="font-medium hover:underline">
              关闭
            </button>
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：目录树 */}
          <aside className="w-64 flex-shrink-0 border-r border-sidebar-border bg-sidebar">
            <ErrorBoundary>
              <FileTree />
            </ErrorBoundary>
          </aside>

          {/* 中间：关系图谱 */}
          <main className="flex-1 border-r border-sidebar-border">
            {hasDocs ? (
              <ErrorBoundary>
                <GraphView />
              </ErrorBoundary>
            ) : (
              <EmptyState type="graph" />
            )}
          </main>

          {/* 右侧：预览 / 搜索 */}
          <aside className="w-[480px] flex-shrink-0 bg-white">
            {selectedDocId ? (
              <ErrorBoundary>
                <MarkdownPreview docId={selectedDocId} />
              </ErrorBoundary>
            ) : hasDocs ? (
              <ErrorBoundary>
                <SearchPanel />
              </ErrorBoundary>
            ) : (
              <EmptyState type="search" />
            )}
          </aside>
        </div>

        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* 阶段二：底部进度条，文件树已可见 */}
        {isContentLoading && (
          <div className="flex items-center gap-3 border-t border-indigo-100 bg-indigo-50 px-4 py-2 text-sm text-indigo-700">
            <Loader2 size={16} className="animate-spin" />
            <span>{loadingText}</span>
          </div>
        )}

        {/* 阶段一：全屏加载遮罩 */}
        {isLoading && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 text-white">
            <Loader2 size={40} className="animate-spin text-indigo-200" />
            <p className="mt-4 text-base font-medium">{loadingText || '处理中...'}</p>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

/**
 * 空状态提示
 */
function EmptyState({ type }: { type: 'graph' | 'search' }) {
  const { openDirectory } = useDocStore();

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
      <FolderOpen size={40} className="mb-3 text-slate-300" />
      <h3 className="text-base font-medium text-slate-700">
        {type === 'graph' ? '暂无文档可展示图谱' : '暂无文档可搜索'}
      </h3>
      <p className="mt-1 max-w-xs text-sm">
        点击右上角"打开目录"选择本地 Markdown 项目，或到"设置"中加载示例数据。
      </p>
      <button
        onClick={openDirectory}
        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
      >
        打开本地目录
      </button>
    </div>
  );
}

export default App;
