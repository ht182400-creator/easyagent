/**
 * 知识库页面
 *
 * P2-1 拆分：添加文档弹窗 / 文档详情弹窗 / 文档列表 / 公共辅助已迁至
 * pages/knowledge-base/ 子模块，本文件保留编排与筛选逻辑（840 → ~300 行）。
 * 添加弹窗按 `{showAdd && ...}` 条件挂载 —— 每次打开即全新表单状态。
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Database, Search, Plus, X, Tag, Briefcase, Globe } from 'lucide-react';
import {
  useKnowledgeBaseStore,
  KB_CATEGORIES,
  type KnowledgeDocument,
} from '../stores/knowledgeBaseStore';
import { useAppStore } from '../stores/appStore';
import { FEATURES } from './knowledge-base/helpers';
import { AddDocumentModal } from './knowledge-base/AddDocumentModal';
import { DocumentViewModal } from './knowledge-base/DocumentViewModal';
import { DocList } from './knowledge-base/DocList';

export default function KnowledgeBase() {
  const {
    documents,
    loading,
    searchQuery,
    searchResults,
    selectedCategory,
    selectedTag,
    allTags,
    stats,
    fetchDocuments,
    removeDocument,
    searchDocument,
    setSearchQuery,
    setSelectedCategory,
    setSelectedTag,
    scope,
    setScope,
    getDocument,
  } = useKnowledgeBaseStore();
  const addNotification = useAppStore((s) => s.addNotification);

  const [showAdd, setShowAdd] = useState(false);
  const [viewDoc, setViewDoc] = useState<KnowledgeDocument | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false); // 加载文档详情中
  const [searchInput, setSearchInput] = useState('');

  /** 功能卡片点击的滚动/操作目标 ref */
  const searchRef = useRef<HTMLDivElement>(null);
  const categoryFilterRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /** 点击功能介绍卡片：显示导入弹窗 / 聚焦搜索 / 滚动到分类区域 */
  const handleFeatureClick = useCallback((action: 'import' | 'search' | 'category') => {
    if (action === 'import') {
      setShowAdd(true);
    } else if (action === 'search' && searchRef.current) {
      searchRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => searchInputRef.current?.focus(), 400);
    } else if (action === 'category' && categoryFilterRef.current) {
      categoryFilterRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim()) {
        searchDocument(searchInput);
      } else {
        setSearchQuery('');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchDocument, setSearchQuery]);

  const filteredDocs = selectedCategory
    ? documents.filter((d) => d.category === selectedCategory)
    : selectedTag
      ? documents.filter((d) => d.tags.includes(selectedTag))
      : documents;

  /**
   * 点击文档卡片 → 从服务端加载完整内容后打开预览弹窗
   */
  const handleViewDoc = async (docId: string) => {
    setLoadingDoc(true);
    setViewDoc(null); // 先清空上一次的
    try {
      const fullDoc = await getDocument(docId);
      setViewDoc(fullDoc);
    } catch (err) {
      addNotification({ type: 'error', message: '加载文档内容失败' });
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定要删除 "${title}" 吗？`)) return;
    if (viewDoc?.id === id) setViewDoc(null);
    await removeDocument(id);
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">知识库</h1>
          <p className="text-gray-400 mt-1">
            {scope === 'global'
              ? '全局知识库 — 跨项目共享的文档和知识，存储在用户目录'
              : '项目知识库 — 当前项目的文档和代码知识'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 作用域切换 */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            <button
              className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${scope === 'project' ? 'bg-primary-500/20 text-primary-400' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => setScope('project')}
              title="项目知识库：存储在项目 .easyagent/knowledge/ 目录"
            >
              <Briefcase className="w-3.5 h-3.5" />
              项目
            </button>
            <button
              className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${scope === 'global' ? 'bg-primary-500/20 text-primary-400' : 'text-gray-500 hover:text-gray-300'}`}
              onClick={() => setScope('global')}
              title="全局知识库：存储在用户 ~/.easyagent/knowledge/ 目录，跨所有项目共享"
            >
              <Globe className="w-3.5 h-3.5" />
              全局
            </button>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> 添加文档
          </button>
        </div>
      </div>

      {/* 功能介绍 - 可点击跳转 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card text-center cursor-pointer hover:border-primary-500/30 hover:bg-gray-800/80 transition-all group"
            onClick={() => handleFeatureClick(f.action)}
            title={
              f.action === 'import'
                ? '点击打开添加文档弹窗'
                : f.action === 'search'
                  ? '点击跳转到搜索栏'
                  : '点击查看分类筛选'
            }
          >
            <f.icon
              className={`w-10 h-10 ${f.color} mx-auto mb-3 group-hover:scale-110 transition-transform`}
            />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-gray-400 mt-2 group-hover:text-gray-300 transition-colors">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      {/* 统计卡片 */}
      <div className="card">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-primary-400" />
          知识库状态
        </h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-primary-400">{documents.length}</div>
            <div className="text-sm text-gray-400">已索引文档</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">
              {stats.totalSize > 0 ? `${(stats.totalSize / 1024).toFixed(1)}KB` : '0B'}
            </div>
            <div className="text-sm text-gray-400">存储大小</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-400">{allTags.length}</div>
            <div className="text-sm text-gray-400">标签数</div>
          </div>
        </div>
        {/* 分类分布 - 基于实际文档列表计算，避免服务端统计数据不一致 */}
        {(() => {
          const catCounts: Record<string, number> = {};
          documents.forEach((d) => {
            catCounts[d.category] = (catCounts[d.category] || 0) + 1;
          });
          const entries = Object.entries(catCounts);
          if (entries.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-2">
              {entries.map(([catId, count]) => {
                const catInfo = KB_CATEGORIES.find((c) => c.id === catId);
                return (
                  <span key={catId} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                    {catInfo?.label || catId}: {count}篇
                  </span>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* 搜索 + 筛选项 */}
      <div className="flex flex-wrap gap-3 items-center" ref={searchRef}>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            className="input w-full pl-10"
            placeholder="搜索知识库..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-700 rounded"
              onClick={() => {
                setSearchInput('');
                searchDocument('');
              }}
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          )}
        </div>

        {/* 分类筛选 */}
        <div className="flex gap-1.5 flex-wrap" ref={categoryFilterRef}>
          <button
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${!selectedCategory && !selectedTag ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
            onClick={() => {
              setSelectedCategory(null);
              setSelectedTag(null);
            }}
          >
            全部
          </button>
          {KB_CATEGORIES.map((cat) => {
            const count = documents.filter((d) => d.category === cat.id).length;
            return (
              <button
                key={cat.id}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${selectedCategory === cat.id ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
                onClick={() => {
                  setSelectedCategory(cat.id === selectedCategory ? null : cat.id);
                  setSelectedTag(null);
                }}
              >
                {cat.label} {count > 0 && <span className="opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 标签筛选 */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <Tag className="w-3.5 h-3.5 text-gray-500" />
          {allTags.map((tag) => {
            const tagCount = documents.filter((d) => d.tags.includes(tag)).length;
            return (
              <button
                key={tag}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${selectedTag === tag ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-500 hover:bg-gray-750'}`}
                onClick={() => {
                  setSelectedTag(tag === selectedTag ? null : tag);
                  setSelectedCategory(null);
                }}
              >
                #{tag} {tagCount > 0 && <span className="opacity-60">({tagCount})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 文档列表（四态：加载/搜索结果/常规/空） */}
      <DocList
        loading={loading}
        searchInput={searchInput}
        searchResults={searchResults}
        filteredDocs={filteredDocs}
        onView={handleViewDoc}
        onDelete={handleDelete}
      />

      {/* 文档详情弹窗 */}
      {(viewDoc || loadingDoc) && (
        <DocumentViewModal
          viewDoc={viewDoc}
          loading={loadingDoc}
          scope={scope}
          onDelete={handleDelete}
          onClose={() => setViewDoc(null)}
        />
      )}

      {/* 添加文档弹窗（条件挂载 = 每次打开全新表单；文件浏览器内聚于弹窗） */}
      {showAdd && <AddDocumentModal scope={scope} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
