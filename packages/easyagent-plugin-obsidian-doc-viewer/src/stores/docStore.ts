import { create } from 'zustand';
import type { AppSettings, DocNode, GraphData, GraphMode, SearchResult } from '../types';
import { buildGraphData, filterGraphByNeighbors } from '../services/graphBuilder';
import { createSearchIndex, searchDocuments } from '../services/searchIndex';
import { sampleDocs } from '../services/sampleData';
import { scanDirectoryStructure, loadFileContents, rebuildDocumentLinks, AbortError } from '../services/fileLoader';
import { analyzeKeywordCooccurrence } from '../services/keywordCooccurrence';
import { buildGroupColorMap } from '../utils/groupColor';

/**
 * 全局文档状态管理
 * 两阶段加载：阶段一快速渲染文件树 → 阶段二后台读取内容
 */
interface DocState {
  // 文档数据
  docs: Map<string, DocNode>;
  rootNodes: DocNode[];
  selectedDocId: string | null;
  graphData: GraphData;
  /** 分组（目录）→ 颜色 映射，文件树和图谱共用 */
  groupColorMap: Map<string, string>;
  searchResults: SearchResult[];
  searchQuery: string;

  // 设置与状态
  settings: AppSettings;
  /** 阶段一：全屏加载遮罩 */
  isLoading: boolean;
  /** 阶段二：后台内容加载，文件树已可见 */
  isContentLoading: boolean;
  loadingText: string;
  error: string | null;

  // 动作
  openDirectory: () => Promise<void>;
  loadSampleDocs: () => void;
  setDocs: (nodes: DocNode[], directoryName?: string) => void;
  selectDoc: (id: string | null) => void;
  search: (query: string) => void;
  setGraphMode: (mode: GraphMode) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  clearError: () => void;
}

/**
 * 从文档节点展平所有文件节点
 */
function flattenDocs(nodes: DocNode[]): DocNode[] {
  const flat: DocNode[] = [];
  const walk = (node: DocNode) => {
    if (node.type === 'file') flat.push(node);
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return flat;
}

export const useDocStore = create<DocState>((set, get) => ({
  docs: new Map(),
  rootNodes: [],
  selectedDocId: null,
  graphData: { nodes: [], links: [] },
  groupColorMap: new Map(),
  searchResults: [],
  searchQuery: '',

  settings: {
    directoryName: null,
    graphMode: 'global',
    searchLimit: 20,
    codeTheme: 'light',
  },
  isLoading: false,
  isContentLoading: false,
  loadingText: '',
  error: null,

  openDirectory: async () => {
    try {
      set({ isLoading: true, loadingText: '正在选择目录...', error: null });

      // ══════ 阶段一：快速扫描目录结构（不读内容） ══════
      const { rootNodes, flatNodes, fileHandles } = await scanDirectoryStructure(
        (_count, message) => set({ loadingText: message }),
      );

      if (flatNodes.length === 0) {
        set({ isLoading: false, loadingText: '', error: '所选目录中未找到任何 Markdown 文件' });
        return;
      }

      const directoryName = rootNodes[0]?.name || '未命名目录';

      // 立即渲染文件树（内容为空，图谱显示节点但无连线）
      get().setDocs(rootNodes, directoryName);

      // 切换为后台加载：关闭全屏遮罩，文件树可见
      set({
        isLoading: false,
        isContentLoading: true,
        loadingText: `正在读取 ${flatNodes.length} 个文件内容...`,
      });

      // ══════ 阶段二：后台批量并行读取文件内容 ══════
      const contentMap = await loadFileContents(
        fileHandles,
        8, // 8 个并发
        (_loaded, _total, message) => set({ loadingText: message }),
      );

      // 将读取到的内容填入对应节点
      for (const [id, content] of contentMap) {
        const doc = get().docs.get(id);
        if (doc) doc.content = content;
      }

      // 重建链接关系
      set({ loadingText: '正在解析文档链接关系...' });
      rebuildDocumentLinks(flatNodes);

      // 重建搜索索引与图谱（含关键字共现弱关联）
      const flatDocs = flattenDocs(rootNodes);
      createSearchIndex(flatDocs);
      const graphData = buildGraphWithWeakLinks(flatDocs);
      const groupColorMap = computeGroupColorMap(graphData.nodes);

      set({ graphData, groupColorMap });
    } catch (error) {
      if (error instanceof AbortError) {
        return;
      }
      console.error('打开目录失败:', error);
      set({ error: `打开目录失败: ${(error as Error).message}` });
    } finally {
      set({ isLoading: false, isContentLoading: false, loadingText: '' });
    }
  },

  loadSampleDocs: () => {
    const nodes = rebuildDocumentLinks([...sampleDocs]);
    get().setDocs(nodes, '示例数据');
  },

  setDocs: (nodes: DocNode[], directoryName?: string) => {
    const flatMap = new Map<string, DocNode>();
    const flatDocs = flattenDocs(nodes);
    flatDocs.forEach((doc) => flatMap.set(doc.id, doc));

    // 构建搜索索引（阶段一时内容为空，阶段二完成后会重建）
    createSearchIndex(flatDocs);

    const settings = get().settings;
    // 阶段一内容为空时不建弱关联（关键字提取无意义）
    const baseGraph = buildGraphData(flatDocs);
    const currentDocId = get().selectedDocId;
    const graphData =
      settings.graphMode === 'neighbors' && currentDocId
        ? filterGraphByNeighbors(baseGraph, currentDocId)
        : baseGraph;
    const groupColorMap = computeGroupColorMap(baseGraph.nodes);

    set({
      docs: flatMap,
      rootNodes: nodes,
      graphData,
      groupColorMap,
      selectedDocId: null,
      searchResults: [],
      searchQuery: '',
      settings: {
        ...settings,
        directoryName: directoryName ?? settings.directoryName,
      },
    });
  },

  selectDoc: (id) => {
    const { settings, docs } = get();
    const validId = id && docs.has(id) ? id : null;

    set({ selectedDocId: validId });

    // 如果处于邻居模式，需要重新计算图谱
    if (settings.graphMode === 'neighbors') {
      const flatDocs = Array.from(get().docs.values());
      const baseGraph = buildGraphWithWeakLinks(flatDocs);
      set({
        graphData: validId ? filterGraphByNeighbors(baseGraph, validId) : baseGraph,
        groupColorMap: computeGroupColorMap(baseGraph.nodes),
      });
    }
  },

  search: (query: string) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    const results = searchDocuments(query, get().settings.searchLimit);
    set({ searchResults: results });
  },

  setGraphMode: (mode: GraphMode) => {
    const { selectedDocId } = get();
    get().updateSettings({ graphMode: mode });

    const flatDocs = Array.from(get().docs.values());
    const baseGraph = buildGraphWithWeakLinks(flatDocs);

    set({
      graphData:
        mode === 'neighbors' && selectedDocId
          ? filterGraphByNeighbors(baseGraph, selectedDocId)
          : baseGraph,
      groupColorMap: computeGroupColorMap(baseGraph.nodes),
    });
  },

  updateSettings: (partial: Partial<AppSettings>) => {
    set((state) => ({ settings: { ...state.settings, ...partial } }));
  },

  clearError: () => set({ error: null }),
}));

/**
 * 构建图谱数据，包含关键字共现弱关联
 * @param docs 文档节点列表
 * @returns 包含强弱关联边的图谱数据
 */
function buildGraphWithWeakLinks(docs: DocNode[]): GraphData {
  // 分析关键字共现，建立弱关联边
  const weakPairs = analyzeKeywordCooccurrence(docs, 2);
  console.log(
    `[docStore] 关键字共现分析完成: ${weakPairs.length} 条弱关联 (阈值≥2 共同关键字)`,
  );
  return buildGraphData(docs, weakPairs);
}

/**
 * 根据图谱节点构建 group→color 映射（按节点首次出现顺序）
 */
function computeGroupColorMap(nodes: { group: string }[]): Map<string, string> {
  const groupList: string[] = [];
  const seen = new Set<string>();
  for (const n of nodes) {
    if (!seen.has(n.group)) {
      seen.add(n.group);
      groupList.push(n.group);
    }
  }
  return buildGroupColorMap(groupList);
}
