import { Search, FileText } from 'lucide-react';
import { useDocStore } from '../stores/docStore';
import { highlightText } from '../services/searchIndex';

/**
 * 搜索面板组件
 * 支持标题 + 内容全文搜索，结果以卡片形式展示
 */
export function SearchPanel() {
  const { searchQuery, searchResults, search, selectDoc, settings } = useDocStore();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">搜索文档</h2>
      </div>

      <div className="px-5 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => search(e.target.value)}
            placeholder="输入关键词搜索标题或内容..."
            className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        {searchQuery && (
          <p className="mt-2 text-xs text-slate-500">
            找到 <strong>{searchResults.length}</strong> 个结果
            {searchResults.length >= settings.searchLimit && ' (已达上限)'}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto px-5 pb-4">
        {searchQuery && searchResults.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-400">未找到匹配文档</p>
        )}

        <ul className="space-y-3">
          {searchResults.map((result) => (
            <li
              key={result.id}
              onClick={() => selectDoc(result.id)}
              className="cursor-pointer rounded-md border border-slate-100 p-3 hover:border-indigo-200 hover:bg-indigo-50"
            >
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-800">{result.title}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{result.path}</p>
              <p
                className="mt-2 text-xs leading-relaxed text-slate-600"
                dangerouslySetInnerHTML={{
                  __html: highlightText(result.snippet, searchQuery),
                }}
              />
            </li>
          ))}
        </ul>

        {!searchQuery && (
          <div className="mt-8 text-center text-sm text-slate-400">
            <p>输入关键词开始搜索</p>
            <p className="mt-1">支持标题和内容全文搜索</p>
          </div>
        )}
      </div>
    </div>
  );
}
