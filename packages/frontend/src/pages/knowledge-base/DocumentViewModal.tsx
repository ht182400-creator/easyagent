/**
 * 知识库页面 - 文档详情弹窗（P2-1 拆分产物，自 KnowledgeBase.tsx 纯搬迁）
 *
 * @module pages/knowledge-base/DocumentViewModal
 */

import { X, Trash2 } from 'lucide-react';
import { KB_CATEGORIES, type KnowledgeDocument } from '../../stores/knowledgeBaseStore';
import { formatSize } from './helpers';

/** 文档详情弹窗属性 */
export interface DocumentViewModalProps {
  /** 正在查看的文档（null = 加载中） */
  viewDoc: KnowledgeDocument | null;
  /** 详情加载中 */
  loading: boolean;
  /** 当前作用域（显示"全局/项目"标签） */
  scope: 'project' | 'global';
  /** 删除文档（弹窗头部垃圾桶按钮） */
  onDelete: (id: string, title: string) => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

export function DocumentViewModal({
  viewDoc,
  loading,
  scope,
  onDelete,
  onClose,
}: DocumentViewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-bold truncate">{viewDoc?.title || '加载中...'}</h2>
          <div className="flex gap-2">
            {viewDoc && (
              <button
                className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                onClick={() => {
                  onDelete(viewDoc.id, viewDoc.title);
                  onClose();
                }}
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            )}
            <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={onClose}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400" />
              <span className="ml-3 text-gray-400">加载文档内容...</span>
            </div>
          ) : viewDoc ? (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs px-2 py-1 bg-primary-500/10 text-primary-400 rounded">
                  {KB_CATEGORIES.find((c) => c.id === viewDoc.category)?.label || viewDoc.category}
                </span>
                {viewDoc.tags?.map((t: string) => (
                  <span key={t} className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">
                    #{t}
                  </span>
                ))}
                <span className="text-xs px-2 py-1 bg-gray-800 text-gray-500 rounded">
                  {formatSize(viewDoc.size)} · {viewDoc.chunkCount} 块
                </span>
                <span className="text-xs px-2 py-1 bg-gray-800 text-gray-500 rounded">
                  来源: {viewDoc.source}
                </span>
                {/* 显示作用域标签 */}
                <span
                  className={`text-xs px-2 py-1 rounded ${scope === 'global' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}
                >
                  {scope === 'global' ? '全局' : '项目'}
                </span>
              </div>
              <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-800 rounded-lg p-4 overflow-x-auto">
                {viewDoc.content || '(空内容)'}
              </pre>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
