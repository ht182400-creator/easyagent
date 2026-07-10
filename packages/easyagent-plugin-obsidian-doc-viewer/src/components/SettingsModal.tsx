import { X, FolderOpen, Database, TestTube } from 'lucide-react';
import { useDocStore } from '../stores/docStore';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 设置面板
 * 支持目录信息查看、图谱模式、搜索限制、示例数据加载
 */
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    settings,
    updateSettings,
    openDirectory,
    loadSampleDocs,
    rootNodes,
    docs,
    isLoading,
  } = useDocStore();

  if (!open) return null;

  const fileCount = Array.from(docs.values()).filter((d) => d.type === 'file').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">设置</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {/* 当前目录 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-700">当前目录</h3>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <FolderOpen size={16} className="text-indigo-600" />
                <span className="font-medium">
                  {settings.directoryName || '未选择目录'}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Markdown 文件: <strong>{fileCount}</strong> 个
                {rootNodes.length > 0 && (
                  <span className="ml-3">
                    目录/文件节点: <strong>{rootNodes.length}</strong> 个
                  </span>
                )}
              </div>
              <button
                onClick={() => {
                  openDirectory();
                  onClose();
                }}
                disabled={isLoading}
                className="mt-3 w-full rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? '正在打开...' : '选择本地目录'}
              </button>
            </div>
          </section>

          {/* 图谱模式 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-700">图谱显示模式</h3>
            <div className="flex gap-2">
              <button
                onClick={() => updateSettings({ graphMode: 'global' })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  settings.graphMode === 'global'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                全局图谱
              </button>
              <button
                onClick={() => updateSettings({ graphMode: 'neighbors' })}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  settings.graphMode === 'neighbors'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                当前文档关联
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {settings.graphMode === 'global'
                ? '显示所有文档及其 WikiLink 关系'
                : '仅显示当前选中文档的出链与反链'}
            </p>
          </section>

          {/* 搜索限制 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-700">搜索结果数量限制</h3>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={settings.searchLimit}
              onChange={(e) => updateSettings({ searchLimit: Number(e.target.value) })}
              className="w-full accent-indigo-600"
            />
            <div className="mt-1 text-right text-xs text-slate-500">{settings.searchLimit} 条</div>
          </section>

          {/* 调试/示例 */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-slate-700">调试数据</h3>
            <button
              onClick={() => {
                loadSampleDocs();
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <TestTube size={16} />
              加载示例数据
            </button>
            <p className="mt-1 text-xs text-slate-500">
              当没有本地目录时，可使用内置示例数据验证功能。
            </p>
          </section>

          {/* 关于 */}
          <section className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Database size={14} />
              <span>数据仅存储在浏览器本地，不会上传到服务器。</span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
