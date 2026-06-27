/**
 * 文件浏览器组件
 * 用于在知识库导入时浏览工作区文件树，选择文件
 */
import { useState, useEffect, useCallback } from 'react';
import { X, Folder, FolderOpen, File, FileText, ChevronRight, FolderTree } from 'lucide-react';
import { getApiBase } from '../request';

/** 文件条目 */
interface FileEntry {
  name: string;
  ext: string;
  size: number;
  relativePath: string;
}

/** 目录条目 */
interface DirEntry {
  name: string;
  itemCount: number;
}

/** API 响应 */
interface BrowseResponse {
  success: boolean;
  currentPath: string;
  dirs: DirEntry[];
  files: FileEntry[];
  parentPath: string | null;
}

interface FileBrowserProps {
  /** 当前选中的文件路径 */
  selectedPath: string;
  /** 选中文件回调 */
  onSelect: (relativePath: string) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 当前知识库作用域 */
  scope?: 'project' | 'global';
}

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 扩展名对应的图标颜色 */
function getExtColor(ext: string): string {
  const colors: Record<string, string> = {
    '.md': 'text-blue-400',
    '.json': 'text-yellow-400',
    '.ts': 'text-cyan-400',
    '.tsx': 'text-cyan-400',
    '.js': 'text-yellow-300',
    '.jsx': 'text-yellow-300',
    '.py': 'text-green-400',
    '.css': 'text-purple-400',
    '.html': 'text-orange-400',
  };
  return colors[ext] || 'text-gray-400';
}

export default function FileBrowser({ selectedPath, onSelect, onClose, scope }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedDir, setExpandedDir] = useState<string | null>(null);

  /** 加载目录内容 */
  const loadPath = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/files/browse?path=${encodeURIComponent(path)}`);
      const data: BrowseResponse = await res.json();
      if (data.success) {
        setCurrentPath(data.currentPath);
        setDirs(data.dirs);
        setFiles(data.files);
        setParentPath(data.parentPath);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError('网络错误，无法加载文件列表');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPath('');
  }, [loadPath]);

  /** 面包屑导航 */
  const pathSegments = currentPath ? currentPath.split('/') : [];
  const navigateToPath = (segments: string[]) => {
    const targetPath = segments.join('/');
    loadPath(targetPath);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-[560px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-primary-400" />
            <h3 className="font-semibold">浏览{scope === 'global' ? '用户目录' : '工作区'}文件</h3>
            {scope === 'global' && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">
                全局
              </span>
            )}
          </div>
          <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 面包屑 */}
        <div className="px-5 py-2 border-b border-gray-800 flex items-center gap-1 text-sm flex-wrap">
          <button className="text-primary-400 hover:underline" onClick={() => navigateToPath([])}>
            工作区
          </button>
          {pathSegments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="w-3 h-3 text-gray-600" />
              <button
                className="text-primary-400 hover:underline"
                onClick={() => navigateToPath(pathSegments.slice(0, i + 1))}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">加载中...</div>
          ) : error ? (
            <div className="flex items-center justify-center py-16 text-red-400">{error}</div>
          ) : (
            <div className="space-y-0.5">
              {/* 返回上级 */}
              {parentPath !== null && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors text-sm"
                  onClick={() => loadPath(parentPath)}
                >
                  <Folder className="w-4 h-4" />
                  <span>...</span>
                </button>
              )}

              {/* 目录 */}
              {dirs.map((dir) => (
                <button
                  key={dir.name}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition-colors text-sm"
                  onClick={() => loadPath(currentPath ? `${currentPath}/${dir.name}` : dir.name)}
                >
                  {expandedDir === dir.name ? (
                    <FolderOpen className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <Folder className="w-4 h-4 text-yellow-600" />
                  )}
                  <span className="flex-1 text-left">{dir.name}</span>
                  <span className="text-xs text-gray-600">{dir.itemCount} 项</span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                </button>
              ))}

              {/* 文件 */}
              {files.map((file) => (
                <button
                  key={file.relativePath}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                    selectedPath === file.relativePath
                      ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                      : 'hover:bg-gray-800 text-gray-300 hover:text-white'
                  }`}
                  onClick={() => onSelect(file.relativePath)}
                >
                  <FileText className={`w-4 h-4 ${getExtColor(file.ext)}`} />
                  <span className="flex-1 text-left truncate">{file.name}</span>
                  <span className="text-xs text-gray-600">{formatSize(file.size)}</span>
                </button>
              ))}

              {/* 空目录 */}
              {dirs.length === 0 && files.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-600 text-sm">
                  <Folder className="w-10 h-10 mb-2 opacity-40" />
                  此目录下无可导入的文件
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-600">
          支持导入：Markdown、代码文件、文本文件、配置文件等
        </div>
      </div>
    </div>
  );
}
