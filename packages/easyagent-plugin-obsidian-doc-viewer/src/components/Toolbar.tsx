import { FolderOpen, Search, Network, Settings, Loader2 } from 'lucide-react';
import { useDocStore } from '../stores/docStore';

interface ToolbarProps {
  onOpenSettings: () => void;
}

/**
 * 顶部工具栏
 */
export function Toolbar({ onOpenSettings }: ToolbarProps) {
  const { selectDoc, openDirectory, isLoading, settings, rootNodes } = useDocStore();

  const hasDocs = rootNodes.length > 0;

  return (
    <header className="flex h-12 items-center justify-between border-b border-sidebar-border bg-white px-4">
      <div className="flex items-center gap-2">
        <Network size={18} className="text-indigo-600" />
        <span className="font-semibold text-slate-800">Doc Viewer</span>
        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
          MVP
        </span>
        {settings.directoryName && (
          <span className="ml-2 max-w-xs truncate text-xs text-slate-500">
            / {settings.directoryName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => selectDoc(null)}
          disabled={!hasDocs}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Search size={14} />
          搜索
        </button>
        <button
          onClick={openDirectory}
          disabled={isLoading}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
          打开目录
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          <Settings size={14} />
          设置
        </button>
      </div>
    </header>
  );
}
