import { useEffect, useState, useRef, useCallback } from 'react';
import {
  BookOpen, Upload, Database, Search, FileText, FolderTree,
  Tag, Trash2, Plus, X, Filter, RefreshCw, ChevronDown,
  File, FileCode, Link, Folder, FolderOpen, Globe, Briefcase,
} from 'lucide-react';
import {
  useKnowledgeBaseStore,
  KB_CATEGORIES,
  type KnowledgeDocument,
  type KBSearchResult,
} from '../stores/knowledgeBaseStore';
import { useAppStore } from '../stores/appStore';
import FileBrowser from '../components/FileBrowser';

/** 功能卡片 */
const FEATURES = [
  { icon: Upload, title: '文档导入', desc: '支持 Markdown、代码文件、文本文件的文档导入和手动输入', color: 'text-blue-400', action: 'import' as const },
  { icon: Search, title: '智能搜索', desc: '基于标题、标签、分类和内容的多维度全文检索', color: 'text-green-400', action: 'search' as const },
  { icon: FolderTree, title: '分类管理', desc: '6个预设分类 + 自定义标签，轻松组织知识文档', color: 'text-purple-400', action: 'category' as const },
];

/** 分类图标映射 */
const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  api: FileCode,
  guide: BookOpen,
  note: FileText,
  reference: Link,
  spec: File,
  general: Folder,
};

/** 格式化文件大小 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function KnowledgeBase() {
  const {
    documents, loading, searchQuery, searchResults,
    selectedCategory, selectedTag, allTags, stats,
    fetchDocuments, addDocument, removeDocument,
    searchDocument, setSearchQuery, setSelectedCategory,
    setSelectedTag, importFromFile, uploadFile, scope, setScope,
    getDocument,
  } = useKnowledgeBaseStore();
  const addNotification = useAppStore((s) => s.addNotification);

  const [showAdd, setShowAdd] = useState(false);
  const [viewDoc, setViewDoc] = useState<KnowledgeDocument | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);  // 加载文档详情中
  const [searchInput, setSearchInput] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 功能卡片点击的滚动/操作目标 ref */
  const searchRef = useRef<HTMLDivElement>(null);
  const categoryFilterRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /** 点击功能介绍卡片：显示导入弹窗 / 聚焦搜索 / 滚动到分类区域 */
  const handleFeatureClick = useCallback((action: 'import' | 'search' | 'category') => {
    if (action === 'import') {
      resetForm();
      setShowAdd(true);
    } else if (action === 'search' && searchRef.current) {
      searchRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => searchInputRef.current?.focus(), 400);
    } else if (action === 'category' && categoryFilterRef.current) {
      categoryFilterRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 添加表单
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formTags, setFormTags] = useState('');
  const [addType, setAddType] = useState<'text' | 'file' | 'upload'>('text');
  const [formFilePath, setFormFilePath] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);

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

  const handleAdd = async () => {
    if (!formTitle.trim()) {
      addNotification({ type: 'warning', message: '请输入文档标题' });
      return;
    }
    if (addType === 'text' && !formContent.trim()) {
      addNotification({ type: 'warning', message: '请输入文档内容' });
      return;
    }
    if (addType === 'upload' && !uploadFileObj) {
      addNotification({ type: 'warning', message: '请选择要上传的文件' });
      return;
    }

    try {
      const tags = formTags.split(',').map((t) => t.trim()).filter(Boolean);

      if (addType === 'upload' && uploadFileObj) {
        // 文件上传
        await uploadFile(uploadFileObj, formCategory, tags);
      } else {
        await addDocument({
          title: formTitle,
          content: addType === 'text' ? formContent : '',
          category: formCategory,
          tags,
          source: addType === 'file' ? formFilePath : '手动输入',
          size: addType === 'text' ? formContent.length : uploadFileObj?.size || 0,
        });
      }
      setShowAdd(false);
      resetForm();
    } catch (err) {
      addNotification({ type: 'error', message: `添加失败: ${(err as Error).message}` });
    }
  };

  /**
   * 点击文档卡片 → 从服务端加载完整内容后打开预览弹窗
   */
  const handleViewDoc = async (docId: string) => {
    setLoadingDoc(true);
    setViewDoc(null);  // 先清空上一次的
    try {
      const fullDoc = await getDocument(docId);
      setViewDoc(fullDoc);
    } catch {
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

  const handleImportFile = async () => {
    if (!formFilePath.trim()) {
      addNotification({ type: 'warning', message: '请输入文件路径' });
      return;
    }
    try {
      await importFromFile(formFilePath);
      setShowAdd(false);
      resetForm();
    } catch (err) {
      addNotification({ type: 'error', message: `导入失败: ${(err as Error).message}` });
    }
  };

  /** 处理文件选择（通过系统文件对话框） */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFileObj(file);
      setUploadFileName(file.name);
      // 自动用文件名作为标题
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  /** 处理拖拽上传 */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadFileObj(file);
      setUploadFileName(file.name);
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^.]+$/, ''));
      }
    }
  };

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormCategory('general');
    setFormTags('');
    setFormFilePath('');
    setUploadFileName('');
    setUploadFileObj(null);
    setAddType('text');
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
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => { resetForm(); setShowAdd(true); }}
          >
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
            title={f.action === 'import' ? '点击打开添加文档弹窗' : f.action === 'search' ? '点击跳转到搜索栏' : '点击查看分类筛选'}
          >
            <f.icon className={`w-10 h-10 ${f.color} mx-auto mb-3 group-hover:scale-110 transition-transform`} />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-gray-400 mt-2 group-hover:text-gray-300 transition-colors">{f.desc}</p>
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
            <div className="text-2xl font-bold text-green-400">{stats.totalSize > 0 ? formatSize(stats.totalSize) : '0B'}</div>
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
              onClick={() => { setSearchInput(''); searchDocument(''); }}
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          )}
        </div>

        {/* 分类筛选 */}
        <div className="flex gap-1.5 flex-wrap" ref={categoryFilterRef}>
          <button
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${!selectedCategory && !selectedTag ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
            onClick={() => { setSelectedCategory(null); setSelectedTag(null); }}
          >
            全部
          </button>
          {KB_CATEGORIES.map((cat) => {
            const count = documents.filter((d) => d.category === cat.id).length;
            return (
              <button
                key={cat.id}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${selectedCategory === cat.id ? 'bg-primary-500/20 text-primary-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
                onClick={() => { setSelectedCategory(cat.id === selectedCategory ? null : cat.id); setSelectedTag(null); }}
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
                onClick={() => { setSelectedTag(tag === selectedTag ? null : tag); setSelectedCategory(null); }}
              >
                #{tag} {tagCount > 0 && <span className="opacity-60">({tagCount})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* 文档列表 */}
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
                  onClick={() => handleViewDoc(r.document.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{r.document.title}</h4>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400">
                          {Math.round(r.score * 100)}% 匹配
                        </span>
                        <span className="text-xs text-gray-600">
                          {KB_CATEGORIES.find((c) => c.id === r.document.category)?.label || r.document.category}
                        </span>
                      </div>
                      {r.snippet && (
                        <p className="text-sm text-gray-400 line-clamp-2">{r.snippet}</p>
                      )}
                      <p className="text-xs text-gray-600 mt-1">
                        {formatSize(r.document.size)} · {r.document.chunkCount} 块 · {new Date(r.document.updatedAt).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleDelete(r.document.id, r.document.title); }}
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
                    onClick={() => handleViewDoc(doc.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="p-2 bg-gray-750 rounded-lg flex-shrink-0" style={{ color: catInfo?.color }}>
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
                              <span key={t} className="text-xs px-1.5 py-0.5 bg-gray-750 rounded text-gray-500">#{t}</span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {formatSize(doc.size)} · {doc.chunkCount} 块 · {doc.source} · {new Date(doc.updatedAt).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleDelete(doc.id, doc.title); }}
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

      {/* 文档详情弹窗 */}
      {(viewDoc || loadingDoc) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { if (!loadingDoc) setViewDoc(null); }}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-bold truncate">{viewDoc?.title || '加载中...'}</h2>
              <div className="flex gap-2">
                {viewDoc && (
                  <button
                    className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                    onClick={() => { handleDelete(viewDoc.id, viewDoc.title); setViewDoc(null); }}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                )}
                <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={() => setViewDoc(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {loadingDoc ? (
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
                      <span key={t} className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">#{t}</span>
                    ))}
                    <span className="text-xs px-2 py-1 bg-gray-800 text-gray-500 rounded">
                      {formatSize(viewDoc.size)} · {viewDoc.chunkCount} 块
                    </span>
                    <span className="text-xs px-2 py-1 bg-gray-800 text-gray-500 rounded">
                      来源: {viewDoc.source}
                    </span>
                    {/* 显示作用域标签 */}
                    <span className={`text-xs px-2 py-1 rounded ${scope === 'global' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
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
      )}

      {/* 添加文档弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-400" />
                添加文档
              </h2>
              <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={() => setShowAdd(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 添加方式 */}
              <div className="flex gap-2">
                <button
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${addType === 'text' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
                  onClick={() => setAddType('text')}
                >
                  手动输入
                </button>
                <button
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${addType === 'file' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
                  onClick={() => setAddType('file')}
                >
                  项目文件
                </button>
                <button
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${addType === 'upload' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
                  onClick={() => setAddType('upload')}
                >
                  <Upload className="w-3.5 h-3.5 inline mr-1" />
                  上传文件
                </button>
              </div>

              {/* 标题 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">文档标题</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="给文档起个名字"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>

              {/* 内容 / 文件路径 / 上传 */}
              {addType === 'text' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">文档内容</label>
                  <textarea
                    className="input w-full h-32 resize-none font-mono text-sm"
                    placeholder="粘贴或输入文档内容..."
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                  />
                </div>
              ) : addType === 'file' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    文件路径（相对于{scope === 'global' ? '用户目录' : '项目根目录'}）
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input flex-1"
                      placeholder="例如: docs/README.md"
                      value={formFilePath}
                      onChange={(e) => setFormFilePath(e.target.value)}
                    />
                    {scope === 'project' && (
                      <button
                        type="button"
                        className="btn-secondary text-sm px-3 flex items-center gap-1 shrink-0"
                        onClick={() => setShowBrowser(true)}
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> 浏览...
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    {scope === 'project'
                      ? '路径相对于项目根目录。可直接输入，或点击"浏览..."从文件树中选择。'
                      : '路径相对于用户目录 ~。仅支持用户目录下的文件。'}
                  </p>
                  <button
                    className="mt-2 btn-secondary text-sm py-1.5 flex items-center gap-1"
                    onClick={handleImportFile}
                  >
                    <Upload className="w-3.5 h-3.5" /> 从文件导入
                  </button>
                </div>
              ) : (
                /* 上传文件 */
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">
                    上传文件（支持任意本地文件）
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".md,.txt,.json,.yaml,.yml,.toml,.xml,.csv,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.c,.cpp,.css,.html,.vue,.svelte,.sh,.bat,.ps1,.env"
                    onChange={handleFileSelect}
                  />
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${uploadFileName ? 'border-green-500/40 bg-green-500/5' : 'border-gray-700 hover:border-gray-600'}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {uploadFileName ? (
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="w-10 h-10 text-green-400" />
                        <span className="text-green-400 font-medium">{uploadFileName}</span>
                        <span className="text-xs text-gray-600">
                          {uploadFileObj ? `${(uploadFileObj.size / 1024).toFixed(1)}KB` : ''}
                        </span>
                        <span className="text-xs text-gray-500">点击或拖放更换文件</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="w-10 h-10 text-gray-600" />
                        <span className="text-gray-400">点击选择文件或拖放文件到此处</span>
                        <span className="text-xs text-gray-600">
                          支持 Markdown、代码文件、文本文件、配置文件等
                        </span>
                        <span className="text-xs text-gray-700">最大 10MB</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    上传的文件将导入到{scope === 'global' ? '全局' : '项目'}知识库中，可跨所有项目共享和检索。
                  </p>
                </div>
              )}

              {/* 分类 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">分类</label>
                <div className="grid grid-cols-3 gap-2">
                  {KB_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      className={`py-2 px-3 rounded-lg text-xs transition-colors ${formCategory === cat.id ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
                      onClick={() => setFormCategory(cat.id)}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 标签 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">标签 (逗号分隔)</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="例如: typescript, react, 教程"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => setShowAdd(false)}>取消</button>
              <button className="btn-primary flex items-center gap-2" onClick={handleAdd}>
                <Plus className="w-4 h-4" /> 添加文档
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 文件浏览器弹窗 */}
      {showBrowser && (
        <FileBrowser
          selectedPath={formFilePath}
          scope={scope}
          onSelect={(path) => {
            setFormFilePath(path);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </div>
  );
}
