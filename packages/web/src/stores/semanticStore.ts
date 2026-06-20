/**
 * 语义分析 Zustand Store
 * 管理代码库语义地图、符号搜索、引用分析状态
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';

/** 语义地图统计 */
interface SemanticStats {
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  languages: Record<string, number>;
}

/** 符号搜索结果 */
interface SymbolResult {
  name: string;
  kind: string;
  line: number;
  filePath: string;
  signature?: string;
}

/** 引用结果 */
interface ReferenceResult {
  filePath: string;
  line: number;
  kind: string;
}

/** 文件分析结果 */
interface FileAnalysisResult {
  filePath: string;
  language: string;
  symbols: SymbolResult[];
  imports: string[];
  exports: string[];
  lineCount: number;
  size: number;
}

interface SemanticState {
  // 语义地图
  mapLoading: boolean;
  mapError: string | null;
  mapStats: SemanticStats | null;
  root: string;
  topSymbols: Array<{ name: string; count: number; locations: string[] }>;

  // 符号搜索
  searchQuery: string;
  searchResults: SymbolResult[];
  searchTotal: number;
  searching: boolean;

  // 引用分析
  refResults: ReferenceResult[];
  refTotal: number;
  refLoading: boolean;

  // 代码概览
  overview: { root: string; fileTree: string; stats: SemanticStats } | null;
  overviewLoading: boolean;

  // 文件分析
  fileAnalysis: FileAnalysisResult | null;
  fileAnalysisLoading: boolean;

  // 操作
  fetchSemanticMap: (path?: string, depth?: number, maxFiles?: number, refresh?: boolean) => Promise<void>;
  searchSymbols: (query: string, path?: string, caseSensitive?: boolean, kind?: string) => Promise<void>;
  findReferences: (symbol: string, path?: string) => Promise<void>;
  fetchOverview: (path?: string) => Promise<void>;
  analyzeSingleFile: (filePath: string) => Promise<void>;
  clearResults: () => void;
}

export const useSemanticStore = create<SemanticState>((set) => ({
  mapLoading: false,
  mapError: null,
  mapStats: null,
  root: '',
  topSymbols: [],
  searchQuery: '',
  searchResults: [],
  searchTotal: 0,
  searching: false,
  refResults: [],
  refTotal: 0,
  refLoading: false,
  overview: null,
  overviewLoading: false,
  fileAnalysis: null,
  fileAnalysisLoading: false,

  fetchSemanticMap: async (path, depth, maxFiles, refresh) => {
    set({ mapLoading: true, mapError: null });
    try {
      const params = new URLSearchParams();
      if (path) params.set('path', path);
      if (depth) params.set('depth', String(depth));
      if (maxFiles) params.set('maxFiles', String(maxFiles));
      if (refresh) params.set('refresh', 'true');

      const res = await fetch(`/api/semantic/map?${params}`);
      const data = await res.json();

      if (data.success) {
        set({
          mapStats: data.stats,
          root: data.root,
          topSymbols: data.topSymbols || [],
          mapLoading: false,
        });
      } else {
        set({ mapError: data.error, mapLoading: false });
      }
    } catch (error) {
      set({ mapError: (error as Error).message, mapLoading: false });
    }
  },

  searchSymbols: async (query, path, caseSensitive, kind) => {
    set({ searching: true, searchQuery: query, searchResults: [] });
    try {
      const params = new URLSearchParams({ q: query });
      if (path) params.set('path', path);
      if (caseSensitive) params.set('case', 'true');
      if (kind) params.set('kind', kind);

      const res = await fetch(`/api/semantic/search?${params}`);
      const data = await res.json();

      if (data.success) {
        set({
          searchResults: data.results || [],
          searchTotal: data.totalResults || 0,
          searching: false,
        });
      } else {
        useAppStore.getState().addNotification({ type: 'error', message: data.error });
        set({ searching: false });
      }
    } catch (error) {
      useAppStore.getState().addNotification({ type: 'error', message: (error as Error).message });
      set({ searching: false });
    }
  },

  findReferences: async (symbol, path) => {
    set({ refLoading: true, refResults: [] });
    try {
      const params = new URLSearchParams({ symbol });
      if (path) params.set('path', path);

      const res = await fetch(`/api/semantic/references?${params}`);
      const data = await res.json();

      if (data.success) {
        set({
          refResults: data.references || [],
          refTotal: data.totalReferences || 0,
          refLoading: false,
        });
      } else {
        useAppStore.getState().addNotification({ type: 'error', message: data.error });
        set({ refLoading: false });
      }
    } catch (error) {
      useAppStore.getState().addNotification({ type: 'error', message: (error as Error).message });
      set({ refLoading: false });
    }
  },

  fetchOverview: async (path) => {
    set({ overviewLoading: true });
    try {
      const params = new URLSearchParams();
      if (path) params.set('path', path);

      const res = await fetch(`/api/semantic/overview?${params}`);
      const data = await res.json();

      if (data.success) {
        set({ overview: { root: data.root, fileTree: data.fileTree, stats: data.stats }, overviewLoading: false });
      } else {
        set({ overviewLoading: false });
      }
    } catch {
      set({ overviewLoading: false });
    }
  },

  analyzeSingleFile: async (filePath) => {
    set({ fileAnalysisLoading: true, fileAnalysis: null });
    try {
      const params = new URLSearchParams({ path: filePath });
      const res = await fetch(`/api/semantic/file?${params}`);
      const data = await res.json();

      if (data.success) {
        set({ fileAnalysis: data, fileAnalysisLoading: false });
      } else {
        useAppStore.getState().addNotification({ type: 'error', message: data.error });
        set({ fileAnalysisLoading: false });
      }
    } catch (error) {
      useAppStore.getState().addNotification({ type: 'error', message: (error as Error).message });
      set({ fileAnalysisLoading: false });
    }
  },

  clearResults: () => {
    set({
      searchQuery: '',
      searchResults: [],
      searchTotal: 0,
      refResults: [],
      refTotal: 0,
      fileAnalysis: null,
    });
  },
}));
