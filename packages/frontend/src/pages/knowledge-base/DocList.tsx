/**
 * 知识库页面 - 文档列表卡片（P2-1 拆分产物，自 KnowledgeBase.tsx 纯搬迁）
 *
 * 四态渲染：加载中 / 搜索结果 / 常规列表 / 空态。
 * 交互只上报（onView / onDelete），删除确认等逻辑留在主组件。
 *
 * @module pages/knowledge-base/DocList
 */

import { BookOpen, Search, Trash2, RefreshCw, FileText } from 'lucide-react';
import {
  KB_CATEGORIES,
  type KnowledgeDocument,
  type KBSearchResult,
} from '../../stores/knowledgeBaseStore';
import { CATEGORY_ICONS, formatSize } from './helpers';

/** 文档列表属性 */
export interface DocListProps {
  loading: boolean;
  /** 搜索输入（非空时展示搜索结果态） */
  searchInput: string;
  searchResults: KBSearchResult[];
  /** 按分类/标签过滤后的文档 */
  filteredDocs: KnowledgeDocument[];
  onView: (docId: string) => void;
  onDelete: (id: string, title: string) => void;
}

export function DocList({
  loading,
  searchInput,
  searchResults,
  filteredDocs,
  onView,
  onDelete,
}: DocListProps) {
  return (
    <div className="card">
      {loading ? (
        <div className="text-center py-8">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-600" />
          <p className="text-gray-500">加载中...</p>
        </div>
      ) : searchInput && searchResults.length > 0 ? (
        // 搜索结果
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Search className="w-5 h-5 text-green-400" />
            搜索结果 ({searchResults.length})
          </h3>
          <div className="space-y-2">
            {searchResults.map((r) => (
              <div
                key={r.document.id}
                className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 cursor-pointer transition-colors"
                onClick={() => onView(r.document.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{r.document.title}</h4>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400">
                        {Math.round(r.score * 100)}% 匹配
                      </span>
                      <span className="text-xs text-gray-600">
                        {KB_CATEGORIES.find((c) => c.id === r.document.category)?.label ||
                          r.document.category}
                      </span>
                    </div>
                    {r.snippet && <p className="text-sm text-gray-400 line-clamp-2">{r.snippet}</p>}
                    <p className="text-xs text-gray-600 mt-1">
                      {formatSize(r.document.size)} · {r.document.chunkCount} 块 ·{' '}
                      {new Date(r.document.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(r.document.id, r.document.title);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : searchInput ? (
        <div className="text-center py-8">
          <Search className="w-10 h-10 text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500">未找到匹配 "{searchInput}" 的文档</p>
        </div>
      ) : filteredDocs.length > 0 ? (
        // 正常文档列表
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-400" />
            文档列表 ({filteredDocs.length})
          </h3>
          <div className="space-y-2">
            {filteredDocs.map((doc) => {
              const catInfo = KB_CATEGORIES.find((c) => c.id === doc.category);
              const CatIcon = CATEGORY_ICONS[doc.category] || FileText;
              return (
                <div
                  key={doc.id}
                  className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 cursor-pointer transition-colors"
                  onClick={() => onView(doc.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div
                        className="p-2 bg-gray-750 rounded-lg flex-shrink-0"
                        style={{ color: catInfo?.color }}
                      >
                        <CatIcon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{doc.title}</h4>
                          <span className="text-xs text-gray-600">
                            {catInfo?.label || doc.category}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-1">
                          {doc.content?.slice(0, 150) || '(空内容)'}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          {doc.tags.map((t) => (
                            <span
                              key={t}
                              className="text-xs px-1.5 py-0.5 bg-gray-750 rounded text-gray-500"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-600 mt-1">
                          {formatSize(doc.size)} · {doc.chunkCount} 块 · {doc.source} ·{' '}
                          {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(doc.id, doc.title);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <BookOpen className="w-12 h-12 text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">暂无文档</p>
          <p className="text-sm text-gray-600 mt-1">点击"添加文档"开始构建知识库</p>
        </div>
      )}
    </div>
  );
}
