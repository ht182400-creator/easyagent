/**
 * 知识库状态管理
 * 管理: 文档列表、分类、检索查询、文档导入
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';

/** 文档分类 */
export const KB_CATEGORIES = [
  { id: 'api', label: 'API文档', icon: 'Code', color: '#3b82f6' },
  { id: 'guide', label: '使用指南', icon: 'BookOpen', color: '#10b981' },
  { id: 'note', label: '笔记', icon: 'FileText', color: '#f59e0b' },
  { id: 'reference', label: '参考资料', icon: 'Link', color: '#8b5cf6' },
  { id: 'spec', label: '技术规格', icon: 'FileCheck', color: '#ef4444' },
  { id: 'general', label: '其他', icon: 'Folder', color: '#6b7280' },
] as const;

/** 知识库文档 */
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  size: number;
  chunkCount: number;
  addedAt: string;
  updatedAt: string;
}

/** 检索结果 */
export interface KBSearchResult {
  document: KnowledgeDocument;
  /** 相关性评分 (0-1) */
  score: number;
  /** 匹配的文本片段 */
  snippet: string;
}

interface KnowledgeBaseState {
  /** 文档列表 */
  documents: KnowledgeDocument[];
  /** 加载状态 */
  loading: boolean;
  /** 搜索关键词 */
  searchQuery: string;
  /** 搜索结果 */
  searchResults: KBSearchResult[];
  /** 选中分类筛选 */
  selectedCategory: string | null;
  /** 选中标签筛选 */
  selectedTag: string | null;
  /** 所有可用标签 */
  allTags: string[];
  /** 知识库统计 */
  stats: {
    totalDocs: number;
    totalSize: number;
    categories: Record<string, number>;
  };
  /** 当前作用域 */
  scope: 'project' | 'global';

  // Actions
  fetchDocuments: () => Promise<void>;
  addDocument: (doc: Omit<KnowledgeDocument, 'id' | 'addedAt' | 'updatedAt' | 'chunkCount'>) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  searchDocument: (query: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSelectedTag: (tag: string | null) => void;
  setScope: (scope: 'project' | 'global') => void;
  importFromFile: (filePath: string) => Promise<void>;
  uploadFile: (file: File, category?: string, tags?: string[]) => Promise<void>;
  /** 获取单个文档的完整内容 */
  getDocument: (id: string) => Promise<KnowledgeDocument | null>;
}

/**
 * 知识库 Store
 * 管理工作区知识库的文档存储和检索
 */
export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  documents: [],
  loading: false,
  searchQuery: '',
  searchResults: [],
  selectedCategory: null,
  selectedTag: null,
  allTags: [],
  stats: { totalDocs: 0, totalSize: 0, categories: {} },
  scope: 'project',

  fetchDocuments: async () => {
    set({ loading: true });
    const { scope } = get();
    try {
      const res = await fetch(`/api/knowledge?scope=${scope}`);
      if (res.ok) {
        const data = await res.json();
        // 兼容新旧格式: API返回 { success, documents, stats, tags }
        const docs: KnowledgeDocument[] = Array.isArray(data.documents) ? data.documents : Array.isArray(data) ? data : [];
        const serverTags: string[] = Array.isArray(data.tags) ? data.tags : [];
        const allTags = [...new Set([...serverTags, ...docs.flatMap((d) => d.tags)])].sort();
        const categories: Record<string, number> = {};

        if (data.stats && data.stats.categories) {
          // 使用服务端统计
          docs.forEach((d) => {
            categories[d.category] = (categories[d.category] || 0) + 1;
          });
          set({
            documents: docs,
            allTags,
            stats: {
              totalDocs: data.stats.totalDocs || docs.length,
              totalSize: data.stats.totalSize || docs.reduce((sum, d) => sum + d.size, 0),
              categories: data.stats.categories || categories,
            },
            loading: false,
          });
        } else {
          docs.forEach((d) => {
            categories[d.category] = (categories[d.category] || 0) + 1;
          });
          set({
            documents: docs,
            allTags,
            stats: {
              totalDocs: docs.length,
              totalSize: docs.reduce((sum, d) => sum + d.size, 0),
              categories,
            },
            loading: false,
          });
        }
      }
    } catch (err) {
      set({ loading: false });
    }
  },

  addDocument: async (doc) => {
    const { scope } = get();
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: doc.title,
          content: doc.content,
          filePath: doc.source !== '手动输入' && !doc.source.startsWith('上传:') ? doc.source : undefined,
          category: doc.category,
          tags: doc.tags,
          scope,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.document) {
          const newDoc: KnowledgeDocument = {
            ...data.document,
            content: data.content || doc.content,
            id: data.document.id,
            addedAt: data.document.addedAt || new Date().toISOString(),
            updatedAt: data.document.updatedAt || new Date().toISOString(),
            chunkCount: data.document.chunkCount || Math.ceil((data.document.size || doc.size) / 1000),
          };

          set((s) => ({
            documents: [newDoc, ...s.documents],
            allTags: [...new Set([...s.allTags, ...newDoc.tags])].sort(),
            stats: {
              totalDocs: s.stats.totalDocs + 1,
              totalSize: s.stats.totalSize + newDoc.size,
              categories: {
                ...s.stats.categories,
                [newDoc.category]: (s.stats.categories[newDoc.category] || 0) + 1,
              },
            },
          }));

          useAppStore.getState().addNotification({
            type: 'success',
            message: `"${newDoc.title}" 已添加到${scope === 'global' ? '全局' : '项目'}知识库`,
          });
          return;
        }
      }
      // 服务端失败时乐观更新
      const newDoc: KnowledgeDocument = {
        ...doc,
        id: `kb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        chunkCount: Math.ceil(doc.size / 1000),
      };

      set((s) => ({
        documents: [newDoc, ...s.documents],
        allTags: [...new Set([...s.allTags, ...doc.tags])].sort(),
        stats: {
          totalDocs: s.stats.totalDocs + 1,
          totalSize: s.stats.totalSize + doc.size,
          categories: {
            ...s.stats.categories,
            [doc.category]: (s.stats.categories[doc.category] || 0) + 1,
          },
        },
      }));

      useAppStore.getState().addNotification({
        type: 'success',
        message: `"${doc.title}" 已添加到知识库 (本地)`,
      });
    } catch (err) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: '添加文档失败，请确认后端服务在运行',
      });
    }
  },

  removeDocument: async (id) => {
    const doc = get().documents.find((d) => d.id === id);
    if (!doc) return;
    const { scope } = get();

    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      stats: {
        totalDocs: s.stats.totalDocs - 1,
        totalSize: s.stats.totalSize - doc.size,
        categories: {
          ...s.stats.categories,
          [doc.category]: Math.max(0, (s.stats.categories[doc.category] || 1) - 1),
        },
      },
    }));

    useAppStore.getState().addNotification({
      type: 'info',
      message: `"${doc.title}" 已从知识库移除`,
    });

    try {
      await fetch(`/api/knowledge/${id}?scope=${scope}`, { method: 'DELETE' });
    } catch (err) { /* ignore */ }
  },

  searchDocument: async (query) => {
    const { documents, scope } = get();
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }

    // 优先使用服务端搜索
    try {
      const params = new URLSearchParams({ q: query, maxResults: '20', scope });
      const res = await fetch(`/api/knowledge/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          const results: KBSearchResult[] = data.results.map((r: { document: KnowledgeDocument; score: number; snippet: string }) => ({
            document: r.document,
            score: r.score,
            snippet: r.snippet || r.document.content?.slice(0, 150) || '',
          }));
          set({ searchResults: results });
          return;
        }
      }
    } catch (err) { /* 降级到本地搜索 */ }

    // 本地搜索降级
    const q = query.toLowerCase();
    const results: KBSearchResult[] = documents
      .map((doc) => {
        let score = 0;
        let snippet = '';
        if (doc.title.toLowerCase().includes(q)) score += 0.4;
        if (doc.tags.some((t) => t.toLowerCase().includes(q))) score += 0.2;
        if (doc.category.toLowerCase().includes(q)) score += 0.1;
        const idx = doc.content.toLowerCase().indexOf(q);
        if (idx >= 0) {
          score += 0.3;
          const start = Math.max(0, idx - 50);
          const end = Math.min(doc.content.length, idx + q.length + 100);
          snippet = (start > 0 ? '...' : '') + doc.content.slice(start, end) + (end < doc.content.length ? '...' : '');
        }
        return { document: doc, score, snippet };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    set({ searchResults: results });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    if (query) {
      get().searchDocument(query);
    } else {
      set({ searchResults: [] });
    }
  },

  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSelectedTag: (tag) => set({ selectedTag: tag }),

  /**
   * 获取单个文档的完整内容（含 content 字段）
   * 列表接口不返回 content，需通过此方法单独加载
   */
  getDocument: async (id) => {
    const { scope } = get();
    try {
      const res = await fetch(`/api/knowledge/${encodeURIComponent(id)}?scope=${scope}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.document) {
          return { ...data.document, content: data.content || '' } as KnowledgeDocument;
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  },

  /**
   * 切换知识库作用域（项目/全局）
   * 切换后自动重新加载文档列表
   */
  setScope: (scope) => {
    set({ scope, documents: [], selectedCategory: null, selectedTag: null });
    get().fetchDocuments();
  },

  importFromFile: async (filePath) => {
    const { scope } = get();
    try {
      const res = await fetch('/api/knowledge/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, scope }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          await get().fetchDocuments();
          useAppStore.getState().addNotification({
            type: 'success',
            message: `文件 "${filePath}" 已导入${scope === 'global' ? '全局' : '项目'}知识库`,
          });
        } else {
          useAppStore.getState().addNotification({
            type: 'error',
            message: data?.error || '文件导入失败',
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        useAppStore.getState().addNotification({
          type: 'error',
          message: errData?.error || '文件导入失败',
        });
      }
    } catch (err) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: `导入失败: ${(err as Error).message}`,
      });
    }
  },

  /**
   * 上传文件到知识库（支持任意本地文件）
   */
  uploadFile: async (file, category, tags) => {
    const { scope } = get();
    const formData = new FormData();
    formData.append('file', file);
    if (scope) formData.append('scope', scope);
    if (category) formData.append('category', category);
    if (tags && tags.length > 0) formData.append('tags', tags.join(','));

    try {
      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success) {
          await get().fetchDocuments();
          useAppStore.getState().addNotification({
            type: 'success',
            message: `"${file.name}" 已上传到${scope === 'global' ? '全局' : '项目'}知识库`,
          });
        } else {
          useAppStore.getState().addNotification({
            type: 'error',
            message: data?.error || '文件上传失败',
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        useAppStore.getState().addNotification({
          type: 'error',
          message: errData?.error || '文件上传失败',
        });
      }
    } catch (err) {
      useAppStore.getState().addNotification({
        type: 'error',
        message: `上传失败: ${(err as Error).message}`,
      });
    }
  },
}));

// KB_CATEGORIES 已在顶部 export const 导出，此处无需重复
