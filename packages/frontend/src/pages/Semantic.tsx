/**
 * 代码库语义地图页面
 * 提供语义地图构建、符号搜索、引用分析、文件结构分析等能力
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  FileCode,
  GitBranch,
  Loader2,
  RefreshCw,
  Map,
  FolderTree,
  Code2,
  Hash,
  BarChart3,
  ExternalLink,
  Copy,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Filter,
  ArrowRight,
  FileText,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { useSemanticStore } from '../stores/semanticStore';

/** 符号类型颜色映射 */
const KIND_COLORS: Record<string, string> = {
  function: 'text-purple-400 bg-purple-500/10',
  class: 'text-amber-400 bg-amber-500/10',
  interface: 'text-cyan-400 bg-cyan-500/10',
  type: 'text-blue-400 bg-blue-500/10',
  variable: 'text-green-400 bg-green-500/10',
  enum: 'text-orange-400 bg-orange-500/10',
  method: 'text-pink-400 bg-pink-500/10',
  import: 'text-gray-400 bg-gray-500/10',
  export: 'text-emerald-400 bg-emerald-500/10',
};

/** 上次使用的工作目录 / 扫描参数（localStorage key） */
const SEMANTIC_WORKSPACE_KEY = 'easyagent:semantic-workspace';
const SEMANTIC_DEPTH_KEY = 'easyagent:semantic-depth';
const SEMANTIC_MAX_FILES_KEY = 'easyagent:semantic-max-files';

/** 扫描参数默认值（与服务端默认保持一致） */
const DEFAULT_DEPTH = 6;
const DEFAULT_MAX_FILES = 1000;

/** 读取 localStorage 中的正整数值（不可用 / 异常时回退默认值） */
function readStoredNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export default function SemanticPage() {
  const [activeTab, setActiveTab] = useState<'map' | 'search' | 'overview' | 'file'>('map');
  // 工作目录默认回填上次使用值：留空时服务端只能用默认目录扫描，
  // 若默认目录不含源码会得到"全 0 统计"，很容易被误判为功能坏了。
  const [workspacePath, setWorkspacePath] = useState(() => {
    try {
      return localStorage.getItem(SEMANTIC_WORKSPACE_KEY) || '';
    } catch {
      return '';
    }
  });
  // 扫描深度与文件上限：此前只有 API 能调，界面固定用服务端默认值，
  // 导致「超过上限的文件被静默丢弃」用户既看不到也改不了（2026-09-19 补齐）
  const [depth, setDepth] = useState(() => readStoredNumber(SEMANTIC_DEPTH_KEY, DEFAULT_DEPTH));
  const [maxFiles, setMaxFiles] = useState(() =>
    readStoredNumber(SEMANTIC_MAX_FILES_KEY, DEFAULT_MAX_FILES),
  );

  const {
    mapLoading,
    mapError,
    mapStats,
    root,
    topSymbols,
    searchQuery,
    searchResults,
    searchTotal,
    searching,
    refResults,
    refTotal,
    refLoading,
    overview,
    overviewLoading,
    fileAnalysis,
    fileAnalysisLoading,
    fetchSemanticMap,
    searchSymbols,
    findReferences,
    fetchOverview,
    analyzeSingleFile,
    clearResults,
  } = useSemanticStore();

  // 页面加载时自动获取概览
  useEffect(() => {
    fetchOverview(workspacePath || undefined);
  }, []);

  /** 构建地图（force=true 时跳过服务端 SWR 缓存与 mtime 增量缓存） */
  const buildMap = useCallback(
    (force: boolean) => {
      const path = workspacePath.trim();
      try {
        if (path) localStorage.setItem(SEMANTIC_WORKSPACE_KEY, path);
        localStorage.setItem(SEMANTIC_DEPTH_KEY, String(depth));
        localStorage.setItem(SEMANTIC_MAX_FILES_KEY, String(maxFiles));
      } catch {
        /* 隐私模式等不可写场景忽略 */
      }
      fetchSemanticMap(path || undefined, depth, maxFiles, force);
    },
    [workspacePath, depth, maxFiles, fetchSemanticMap],
  );

  const handleBuildMap = useCallback(() => buildMap(false), [buildMap]);
  const handleForceRebuild = useCallback(() => buildMap(true), [buildMap]);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
            <Map className="w-6 h-6 text-purple-400" />
            代码库语义地图
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            基于符号提取和模式匹配的代码语义分析，支持 JS/TS/Python/Rust/Go/Java
          </p>
        </div>
      </div>

      {/* 扫描参数：工作目录 + 深度 + 文件上限 */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-xs text-gray-500 mb-1.5">
            工作目录（留空使用服务端默认目录）
          </label>
          <input
            type="text"
            value={workspacePath}
            onChange={(e) => setWorkspacePath(e.target.value)}
            placeholder="输入代码库路径..."
            className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 
              placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/50"
          />
        </div>
        <div className="w-24">
          <label className="block text-xs text-gray-500 mb-1.5" title="目录递归深度">
            深度
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={depth}
            onChange={(e) => setDepth(Number.parseInt(e.target.value, 10) || DEFAULT_DEPTH)}
            className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 
              focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>
        <div className="w-32">
          <label
            className="block text-xs text-gray-500 mb-1.5"
            title="最多分析多少个文件，超出部分不纳入"
          >
            文件上限
          </label>
          <input
            type="number"
            min={1}
            max={50000}
            value={maxFiles}
            onChange={(e) => setMaxFiles(Number.parseInt(e.target.value, 10) || DEFAULT_MAX_FILES)}
            className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200 
              focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>
        <button
          onClick={handleBuildMap}
          disabled={mapLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 
            text-purple-400 hover:bg-purple-500/20 transition-colors text-sm font-medium disabled:opacity-50"
        >
          {mapLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          构建地图
        </button>
        <button
          onClick={handleForceRebuild}
          disabled={mapLoading}
          title="跳过服务端缓存与增量缓存，重新读取所有文件"
          className="px-4 py-2.5 rounded-lg bg-gray-800/40 border border-gray-700/40 text-gray-400 
            hover:text-gray-200 hover:bg-gray-800/70 transition-colors text-sm disabled:opacity-50"
        >
          强制重扫
        </button>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 p-1 bg-gray-900/30 rounded-lg border border-gray-800/30 w-fit">
        {[
          { id: 'map' as const, icon: Map, label: '语义地图' },
          { id: 'search' as const, icon: Search, label: '符号搜索' },
          { id: 'overview' as const, icon: FolderTree, label: '代码概览' },
          { id: 'file' as const, icon: FileCode, label: '文件分析' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              clearResults();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-gray-700/50 text-gray-200 shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="min-h-[400px]">
        {activeTab === 'map' && (
          <SemanticMapTab
            loading={mapLoading}
            error={mapError}
            stats={mapStats}
            root={root}
            topSymbols={topSymbols}
            onRebuild={handleBuildMap}
          />
        )}
        {activeTab === 'search' && (
          <SymbolSearchTab
            searching={searching}
            query={searchQuery}
            results={searchResults}
            total={searchTotal}
            onSearch={(q, cs, k) =>
              searchSymbols(q, workspacePath || undefined, cs, k, depth, maxFiles)
            }
            onFindRefs={(sym) => findReferences(sym, workspacePath || undefined, depth, maxFiles)}
            refResults={refResults}
            refTotal={refTotal}
            refLoading={refLoading}
          />
        )}
        {activeTab === 'overview' && (
          <OverviewTab
            loading={overviewLoading}
            overview={overview}
            onRefresh={() => fetchOverview(workspacePath || undefined)}
          />
        )}
        {activeTab === 'file' && (
          <FileAnalysisTab
            loading={fileAnalysisLoading}
            analysis={fileAnalysis}
            onAnalyze={(fp) => analyzeSingleFile(fp)}
          />
        )}
      </div>
    </div>
  );
}

/** ============ 语义地图 Tab ============ */
function SemanticMapTab({
  loading,
  error,
  stats,
  root,
  topSymbols,
  onRebuild,
}: {
  loading: boolean;
  error: string | null;
  stats: {
    totalFiles: number;
    totalLines: number;
    totalSymbols: number;
    languages: Record<string, number>;
    totalCandidates?: number;
    truncated?: boolean;
  } | null;
  root: string;
  topSymbols: Array<{ name: string; count: number; locations: string[] }>;
  onRebuild: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
          <p className="text-gray-500 text-sm">正在构建语义地图...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <XCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={onRebuild} className="text-purple-400 text-sm hover:underline">
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <Map className="w-12 h-12 text-gray-700 mx-auto" />
          <p className="text-gray-500">点击"构建地图"开始分析代码库</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 扫描到 0 文件：明确告知扫描根，避免"四张全 0 统计卡"式静默失败 */}
      {stats.totalFiles === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium">该目录下未找到可识别的源码文件</p>
            <p className="text-gray-400 mt-1">
              本次扫描根：
              <span className="font-mono text-gray-300 break-all">{root || '(未知)'}</span>
            </p>
            <p className="text-gray-500 mt-1">
              请在上方「工作目录」填写代码库路径（留空时使用服务端默认目录），再点「构建地图」。
            </p>
          </div>
        </div>
      )}

      {/* 达到文件上限：明确告知"还有多少没扫"，否则用户会以为地图是完整的 */}
      {stats.truncated && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-300 font-medium">已达到文件上限，本次地图不完整</p>
            <p className="text-gray-400 mt-1">
              本次扫描 <span className="text-gray-200">{stats.totalFiles}</span> / 候选{' '}
              <span className="text-gray-200">{stats.totalCandidates ?? '?'}</span>，其余{' '}
              <span className="text-amber-300">
                {Math.max((stats.totalCandidates ?? 0) - stats.totalFiles, 0)}
              </span>{' '}
              个文件未纳入分析。
            </p>
            <p className="text-gray-500 mt-1">在上方调大「文件上限」后重新构建，即可全部纳入。</p>
          </div>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={FolderTree}
          label="文件数"
          value={stats.totalFiles.toString()}
          color="blue"
        />
        <StatCard
          icon={Code2}
          label="总行数"
          value={stats.totalLines.toLocaleString()}
          color="green"
        />
        <StatCard icon={Hash} label="符号数" value={stats.totalSymbols.toString()} color="purple" />
        <StatCard
          icon={Layers}
          label="语言"
          value={Object.keys(stats.languages).length.toString()}
          color="amber"
        />
      </div>

      {/* 语言分布 */}
      <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          语言分布
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.languages)
            .sort(([, a], [, b]) => b - a)
            .map(([lang, count]) => (
              <span
                key={lang}
                className="px-3 py-1.5 rounded-md bg-gray-800/50 border border-gray-700/30 text-xs text-gray-300"
              >
                {lang} <span className="text-gray-500 ml-1">{count}</span>
              </span>
            ))}
        </div>
      </div>

      {/* 高频符号 */}
      {topSymbols.length > 0 && (
        <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-400" />
            高频符号（多处定义/引用）
          </h3>
          <div className="space-y-2">
            {topSymbols.slice(0, 30).map((sym) => (
              <div
                key={sym.name}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-gray-800/30 hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-purple-400 font-mono text-sm min-w-0 truncate">
                  {sym.name}
                </span>
                <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded shrink-0">
                  {sym.count}处
                </span>
                <span className="text-xs text-gray-500 truncate hidden md:block">
                  {sym.locations.slice(0, 3).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** ============ 符号搜索 Tab ============ */
function SymbolSearchTab({
  searching,
  query,
  results,
  total,
  onSearch,
  onFindRefs,
  refResults,
  refTotal,
  refLoading,
}: {
  searching: boolean;
  query: string;
  results: Array<{
    name: string;
    kind: string;
    line: number;
    filePath: string;
    signature?: string;
  }>;
  total: number;
  onSearch: (q: string, caseSensitive: boolean, kind?: string) => void;
  onFindRefs: (symbol: string) => void;
  refResults: Array<{ filePath: string; line: number; kind: string }>;
  refTotal: number;
  refLoading: boolean;
}) {
  const [input, setInput] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [activeRef, setActiveRef] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSearch(input.trim(), caseSensitive, kindFilter || undefined);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入符号名称搜索..."
            className="w-full bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 
              placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="rounded bg-gray-800 border-gray-600"
          />
          区分大小写
        </label>
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value)}
          className="bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-200"
        >
          <option value="">全部类型</option>
          <option value="function">函数</option>
          <option value="class">类</option>
          <option value="interface">接口</option>
          <option value="type">类型</option>
          <option value="variable">变量</option>
          <option value="enum">枚举</option>
          <option value="method">方法</option>
        </select>
        <button
          type="submit"
          disabled={searching || !input.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 
            text-purple-400 hover:bg-purple-500/20 transition-colors text-sm disabled:opacity-50"
        >
          {searching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          搜索
        </button>
      </form>

      {total > 0 && <p className="text-xs text-gray-500">找到 {total} 个结果</p>}

      {/* 搜索结果 */}
      {results.length > 0 && (
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {results.map((sym, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded-lg bg-gray-900/20 hover:bg-gray-900/40 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-1.5 py-0.5 rounded text-[0.65rem] font-medium shrink-0 ${KIND_COLORS[sym.kind] || 'text-gray-400 bg-gray-500/10'}`}
                >
                  {sym.kind}
                </span>
                <span className="text-sm font-mono text-gray-200 truncate">{sym.name}</span>
                <span className="text-xs text-gray-600 truncate hidden sm:block">
                  {sym.filePath}:{sym.line}
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveRef(sym.name);
                  onFindRefs(sym.name);
                }}
                className="text-xs text-gray-600 hover:text-purple-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0 flex items-center gap-1"
              >
                <GitBranch className="w-3.5 h-3.5" />
                查找引用
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 引用结果 */}
      {(refResults.length > 0 || refLoading) && (
        <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-5">
          <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-400" />
            引用分析: {activeRef}
            {refLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />}
            {!refLoading && <span className="text-xs text-gray-500">({refTotal} 处引用)</span>}
          </h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {refResults.slice(0, 50).map((ref, i) => (
              <div key={i} className="flex items-center gap-2 p-1.5 text-xs text-gray-400">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    ref.kind === 'definition' ? 'bg-purple-400' : 'bg-gray-600'
                  }`}
                />
                <span className="truncate">
                  {ref.filePath}:{ref.line}
                </span>
                <span className="text-gray-600 shrink-0">
                  {ref.kind === 'definition' ? '定义' : '引用'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** ============ 代码概览 Tab ============ */
function OverviewTab({
  loading,
  overview,
  onRefresh,
}: {
  loading: boolean;
  overview: {
    root: string;
    fileTree: string;
    stats: {
      totalFiles: number;
      totalLines: number;
      totalSize: number;
      languages: Record<string, number>;
      totalCandidates?: number;
      truncated?: boolean;
    };
  } | null;
  onRefresh: () => void;
}) {
  useEffect(() => {
    if (!overview && !loading) onRefresh();
  }, []);

  if (loading || !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  const sizeMB = (overview.stats.totalSize / (1024 * 1024)).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={FolderTree}
          label="文件数"
          value={overview.stats.totalFiles.toString()}
          color="blue"
        />
        <StatCard
          icon={Code2}
          label="总行数"
          value={overview.stats.totalLines.toLocaleString()}
          color="green"
        />
        <StatCard
          icon={Layers}
          label="语言"
          value={Object.keys(overview.stats.languages).length.toString()}
          color="amber"
        />
        <StatCard icon={Hash} label="总大小" value={`${sizeMB}MB`} color="purple" />
      </div>

      {/* 截断提示：概览与地图口径一致，避免"看起来全仓都扫了"的误解 */}
      {overview.stats.truncated && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-gray-400">
            已达文件上限：本次纳入 {overview.stats.totalFiles} / 候选{' '}
            {overview.stats.totalCandidates ?? '?'} 个文件，部分文件未统计。
          </p>
        </div>
      )}

      <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-5">
        <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-purple-400" />
          文件结构
        </h3>
        <pre className="text-xs text-gray-400 font-mono leading-relaxed whitespace-pre overflow-x-auto max-h-[500px] overflow-y-auto">
          {overview.fileTree}
        </pre>
      </div>
    </div>
  );
}

/** ============ 文件分析 Tab ============ */
function FileAnalysisTab({
  loading,
  analysis,
  onAnalyze,
}: {
  loading: boolean;
  analysis: {
    filePath: string;
    language: string;
    symbols: Array<{
      name: string;
      kind: string;
      line: number;
      filePath: string;
      signature?: string;
    }>;
    imports: string[];
    exports: string[];
    lineCount: number;
    size: number;
  } | null;
  onAnalyze: (filePath: string) => void;
}) {
  const [filePath, setFilePath] = useState('');

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (filePath.trim()) onAnalyze(filePath.trim());
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAnalyze} className="flex gap-2">
        <input
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="输入要分析的文件路径..."
          className="flex-1 bg-gray-900/50 border border-gray-700/50 rounded-lg px-4 py-2.5 text-sm text-gray-200 
            placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
        />
        <button
          type="submit"
          disabled={loading || !filePath.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 
            text-purple-400 hover:bg-purple-500/20 transition-colors text-sm disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileCode className="w-4 h-4" />
          )}
          分析
        </button>
      </form>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* 文件信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900/30 rounded-lg border border-gray-800/30 p-3">
              <p className="text-xs text-gray-500">语言</p>
              <p className="text-sm text-gray-200 font-medium">{analysis.language}</p>
            </div>
            <div className="bg-gray-900/30 rounded-lg border border-gray-800/30 p-3">
              <p className="text-xs text-gray-500">行数</p>
              <p className="text-sm text-gray-200 font-medium">
                {analysis.lineCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-900/30 rounded-lg border border-gray-800/30 p-3">
              <p className="text-xs text-gray-500">大小</p>
              <p className="text-sm text-gray-200 font-medium">
                {(analysis.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <div className="bg-gray-900/30 rounded-lg border border-gray-800/30 p-3">
              <p className="text-xs text-gray-500">符号数</p>
              <p className="text-sm text-gray-200 font-medium">{analysis.symbols.length}</p>
            </div>
          </div>

          {/* 符号分组 */}
          {analysis.symbols.length > 0 && (
            <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-5">
              <h3 className="text-sm font-medium text-gray-300 mb-3">符号结构</h3>
              {(() => {
                const grouped: Record<string, typeof analysis.symbols> = {};
                for (const s of analysis.symbols) {
                  if (!grouped[s.kind]) grouped[s.kind] = [];
                  grouped[s.kind].push(s);
                }
                return Object.entries(grouped).map(([kind, syms]) => (
                  <div key={kind} className="mb-3">
                    <p className="text-xs text-gray-500 mb-1.5 uppercase">
                      {kind} ({syms.length})
                    </p>
                    <div className="space-y-0.5">
                      {syms.slice(0, 15).map((sym, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 p-1.5 text-xs text-gray-400 hover:bg-gray-800/30 rounded"
                        >
                          <span className="text-gray-600 w-10 shrink-0">L{sym.line}</span>
                          <span className="font-mono text-gray-300">{sym.name}</span>
                          {sym.signature && (
                            <span className="text-gray-600 truncate">{sym.signature}</span>
                          )}
                        </div>
                      ))}
                      {syms.length > 15 && (
                        <p className="text-xs text-gray-600 pl-12">...还有 {syms.length - 15} 个</p>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* 导入导出 */}
          {(analysis.imports.length > 0 || analysis.exports.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.imports.length > 0 && (
                <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-4">
                  <h3 className="text-xs font-medium text-gray-500 mb-2 uppercase">导入</h3>
                  <div className="space-y-1">
                    {[...new Set(analysis.imports)].slice(0, 20).map((imp, i) => (
                      <p key={i} className="text-xs text-gray-400 font-mono truncate">
                        {imp}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {analysis.exports.length > 0 && (
                <div className="bg-gray-900/30 rounded-xl border border-gray-800/30 p-4">
                  <h3 className="text-xs font-medium text-gray-500 mb-2 uppercase">导出</h3>
                  <div className="space-y-1">
                    {[...new Set(analysis.exports)].slice(0, 20).map((exp, i) => (
                      <p key={i} className="text-xs text-gray-400 font-mono truncate">
                        {exp}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 统计卡片 */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const colors = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div className={`rounded-xl border p-4 ${colors[color]} bg-opacity-5`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-xs opacity-70">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
