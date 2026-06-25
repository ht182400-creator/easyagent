import { useState, useEffect, useMemo } from 'react';
import { Wrench, FileText, Search, Terminal, GitBranch, Globe, Code, Shield, FolderOpen, Brain, Eye, Image, Database, BookOpen, Bot, Play, X, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { getApiBase } from '../request';

/** 参数 Schema 中的属性定义 */
interface ParamProp {
  type?: string;
  description?: string;
  enum?: string[];
}

/** 工具完整信息 */
interface ToolInfo {
  name: string;
  description: string;
  group: string;
  requiresConfirm: boolean;
  builtin: boolean;
  enabled: boolean;
  parameters?: {
    type?: string;
    properties?: Record<string, ParamProp>;
    required?: string[];
  };
}

/** 工具图标映射 */
const toolIcons: Record<string, React.ElementType> = {
  read_file: FileText, write_file: FileText, edit_file: FileText,
  delete_file: FileText, list_dir: FileText, file_info: FileText,
  create_dir: FileText, move_file: FileText, batch_edit: FileText,
  grep: Search, glob: Search, web_search: Globe, web_fetch: Globe,
  exec: Terminal, git_status: GitBranch, git_diff: GitBranch,
  git_log: GitBranch, git_branch: GitBranch, git_blame: GitBranch,
  git_commit: GitBranch, git_auto_commit: GitBranch, git_repo_map: GitBranch,
  git_stash: GitBranch, git_tag: GitBranch, git_cherry_pick: GitBranch,
  git_reflog: GitBranch,
  code_stats: Code, run_tests: Play, find_imports: Code,
  find_definitions: Code, code_semantic_map: Code, code_symbol_search: Code,
  code_find_references: Code, code_overview: Code, code_file_structure: Code,
  lint_code: Shield, format_code: Shield, read_lints: Shield, type_check: Shield,
  read_config: FolderOpen, package_run: Play, env_info: FolderOpen,
  project_overview: FolderOpen, benchmark_load: Play, benchmark_run: Play,
  benchmark_report: Play, benchmark_scan: Play,
  remember: Brain, recall: Brain, forget: Brain,
  start_server: Eye, preview_url: Eye, diff_files: Eye, ask_user: Eye,
  read_image: Image, generate_image: Image, screenshot: Image,
  query_db: Database, db_schema: Database,
  knowledge_add: BookOpen, knowledge_search: BookOpen, knowledge_get: BookOpen,
  knowledge_list: BookOpen, knowledge_remove: BookOpen,
  delegate_task: Bot, list_subagents: Bot, install_runtime: Bot,
  sandbox_exec: Terminal, sandbox_status: Terminal, sandbox_cleanup: Terminal,
};

/** 工具分组的颜色、图标、标签 */
const groupMeta: Record<string, { label: string; color: string; borderColor: string; bgClass: string; icon: React.ElementType; desc: string }> = {
  file:       { label: '文件操作',   color: 'text-blue-400',   borderColor: 'border-blue-500/30',  bgClass: 'bg-blue-500/10',   icon: FileText,     desc: '读写、编辑、删除、列表' },
  search:     { label: '搜索匹配',   color: 'text-purple-400', borderColor: 'border-purple-500/30', bgClass: 'bg-purple-500/10', icon: Search,       desc: 'grep、glob、web搜索' },
  exec:       { label: '执行与Git',  color: 'text-rose-400',   borderColor: 'border-rose-500/30',   bgClass: 'bg-rose-500/10',   icon: Terminal,     desc: '命令执行、Git操作' },
  code:       { label: '代码分析',   color: 'text-emerald-400',borderColor: 'border-emerald-500/30',bgClass: 'bg-emerald-500/10',icon: Code,         desc: '语义分析、引用查找、结构' },
  quality:    { label: '代码质量',   color: 'text-amber-400',  borderColor: 'border-amber-500/30',  bgClass: 'bg-amber-500/10',  icon: Shield,       desc: 'Lint、格式化、类型检查' },
  project:    { label: '项目管理',   color: 'text-cyan-400',   borderColor: 'border-cyan-500/30',   bgClass: 'bg-cyan-500/10',   icon: FolderOpen,   desc: '配置、脚本、环境、评测' },
  memory:     { label: '记忆',       color: 'text-pink-400',   borderColor: 'border-pink-500/30',   bgClass: 'bg-pink-500/10',   icon: Brain,        desc: '记忆、回忆、遗忘' },
  preview:    { label: '预览与交互', color: 'text-teal-400',   borderColor: 'border-teal-500/30',   bgClass: 'bg-teal-500/10',   icon: Eye,          desc: '服务器、预览、差异对比' },
  media:      { label: '媒体',       color: 'text-orange-400', borderColor: 'border-orange-500/30', bgClass: 'bg-orange-500/10', icon: Image,        desc: '图片读取、生成、截图' },
  database:   { label: '数据库',     color: 'text-indigo-400', borderColor: 'border-indigo-500/30',bgClass: 'bg-indigo-500/10',icon: Database,     desc: '查询、Schema' },
  knowledge:  { label: '知识库',     color: 'text-lime-400',   borderColor: 'border-lime-500/30',   bgClass: 'bg-lime-500/10',   icon: BookOpen,     desc: '增删查改列表' },
  subagent:   { label: '子Agent',    color: 'text-fuchsia-400',borderColor: 'border-fuchsia-500/30',bgClass: 'bg-fuchsia-500/10',icon: Bot,         desc: '任务委派、子Agent管理' },
};

export default function Tools() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** 当前选中的分组过滤（null = 全部） */
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  /** 展开的工具名（显示参数详情） */
  const [expanded, setExpanded] = useState<string | null>(null);
  /** 搜索关键字 */
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const apiBase = getApiBase();
    fetch(`${apiBase}/api/tools`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ToolInfo[]) => {
        setTools(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || '加载失败');
        setLoading(false);
      });
  }, []);

  /**
   * 切换工具的启用/禁用状态
   */
  const handleToggle = async (toolName: string, enabled: boolean) => {
    setTools((prev) =>
      prev.map((t) => (t.name === toolName ? { ...t, enabled } : t))
    );
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/tools/${encodeURIComponent(toolName)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('[Tools] 切换工具状态失败:', err);
      setTools((prev) =>
        prev.map((t) => (t.name === toolName ? { ...t, enabled: !enabled } : t))
      );
    }
  };

  /** 计算分组统计数据 */
  const groups = useMemo(() => {
    const map: Record<string, { label: string; count: number; color: string; borderColor: string; bgClass: string; icon: React.ElementType }> = {};
    for (const t of tools) {
      const meta = groupMeta[t.group];
      if (!meta) continue;
      if (!map[t.group]) {
        map[t.group] = { label: meta.label, count: 0, color: meta.color, borderColor: meta.borderColor, bgClass: meta.bgClass, icon: meta.icon };
      }
      map[t.group].count++;
    }
    return Object.entries(map).map(([group, info]) => ({ group, ...info }));
  }, [tools]);

  /** 过滤后的工具列表 */
  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      if (activeGroup && t.group !== activeGroup) return false;
      if (searchText && !t.name.includes(searchText.toLowerCase()) && !t.description.includes(searchText)) return false;
      return true;
    });
  }, [tools, activeGroup, searchText]);

  /** 渲染 JSON Schema 参数 */
  const renderParams = (tool: ToolInfo) => {
    const params = tool.parameters;
    if (!params || !params.properties || Object.keys(params.properties).length === 0) {
      return <p className="text-xs text-gray-600 mt-1">无参数</p>;
    }
    const requiredSet = new Set(params.required || []);
    return (
      <div className="mt-3 pt-3 border-t border-gray-700/50">
        <h4 className="text-xs font-semibold text-gray-400 mb-2">参数列表</h4>
        <div className="space-y-1.5">
          {Object.entries(params.properties).map(([key, prop]: [string, ParamProp]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <code className={`shrink-0 font-mono ${requiredSet.has(key) ? 'text-primary-300' : 'text-gray-400'}`}>
                {key}
              </code>
              {requiredSet.has(key) && (
                <span className="shrink-0 text-[10px] px-1 rounded bg-red-500/20 text-red-400">必需</span>
              )}
              <span className="text-gray-500">{prop.type || 'string'}</span>
              <span className="text-gray-400 truncate">{prop.description}</span>
              {prop.enum && (
                <span className="text-[10px] text-gray-600">
                  ({prop.enum.join(' | ')})
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">工具系统</h1>
          <p className="text-gray-400 mt-1">Agent可用的工具列表，用于文件操作、搜索、执行命令等</p>
        </div>
        <div className="text-center py-16 text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">工具系统</h1>
          <p className="text-gray-400 mt-1">Agent可用的工具列表</p>
        </div>
        <div className="card border-red-500/30 bg-red-500/5">
          <p className="text-red-400">加载失败: {error}</p>
          <button className="btn btn-sm mt-2" onClick={() => window.location.reload()}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold">工具系统</h1>
        <p className="text-gray-400 mt-1">
          共 <span className="text-primary-300 font-semibold">{tools.length}</span> 个工具，
          Agent可调用它们完成文件操作、搜索、代码分析、Git管理等任务
        </p>
      </div>

      {/* 分组分类卡片（可点击过滤） */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-400">按分类筛选</span>
          {activeGroup && (
            <button
              className="text-xs text-primary-400 hover:text-primary-300 ml-auto"
              onClick={() => setActiveGroup(null)}
            >
              清除筛选
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {groups.map((g) => (
            <button
              key={g.group}
              onClick={() => setActiveGroup(activeGroup === g.group ? null : g.group)}
              className={`text-left rounded-lg p-3 border transition-all duration-150 cursor-pointer ${
                activeGroup === g.group
                  ? `${g.bgClass} ${g.borderColor}`
                  : 'bg-gray-800/50 border-gray-700/50 hover:border-gray-600/50 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <g.icon className={`w-4 h-4 ${g.color}`} />
                <span className="font-medium text-sm">{g.label}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{g.count} 个工具</p>
            </button>
          ))}
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="搜索工具名或描述..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-primary-500/50"
        />
        {searchText && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            onClick={() => setSearchText('')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 工具卡片网格 */}
      {filteredTools.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {searchText || activeGroup ? '没有匹配的工具，请调整筛选条件' : '暂无工具'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTools.map((tool) => {
            const Icon = toolIcons[tool.name] || Wrench;
            const meta = groupMeta[tool.group];
            const isExpanded = expanded === tool.name;

            return (
              <div
                key={tool.name}
                className={`card cursor-pointer transition-all duration-150 ${
                  isExpanded
                    ? 'ring-1 ring-primary-500/40 border-primary-500/30'
                    : 'hover:border-primary-500/20 hover:bg-gray-800/80'
                }`}
                onClick={() => setExpanded(isExpanded ? null : tool.name)}
              >
                {/* 工具头部 */}
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${meta?.bgClass || 'bg-gray-800'}`}>
                    <Icon className={`w-5 h-5 ${meta?.color || 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className={`text-sm font-mono ${isExpanded ? 'text-primary-300' : 'text-gray-200'}`}>
                        {tool.name}
                      </code>
                      {tool.requiresConfirm && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          需确认
                        </span>
                      )}
                      {meta && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.bgClass} ${meta.color} border ${meta.borderColor}`}>
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-1.5 line-clamp-2">{tool.description}</p>
                  </div>
                  <div className="shrink-0 mt-1 text-gray-600">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {/* 展开的参数详情 */}
                {isExpanded && (
                  <div className="mt-2 animate-[fadeIn_150ms_ease-out]">
                    <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 flex-wrap">
                      <span>分组: <span className="text-gray-400">{meta?.label || tool.group}</span></span>
                      <span>内置: <span className="text-gray-400">{tool.builtin ? '是' : '否'}</span></span>
                      {/* 启用/禁用开关 */}
                      <span className="flex items-center gap-2">
                        <span>状态:</span>
                        <button
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                            tool.enabled ? 'bg-emerald-500' : 'bg-gray-600'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggle(tool.name, !tool.enabled);
                          }}
                          title={tool.enabled ? '点击禁用' : '点击启用'}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                              tool.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                            }`}
                          />
                        </button>
                        <span className={tool.enabled ? 'text-green-400' : 'text-gray-500'}>
                          {tool.enabled ? '已启用' : '已禁用'}
                        </span>
                      </span>
                    </div>
                    {renderParams(tool)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 统计信息 */}
      <div className="card">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary-400" />
          工具统计
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {groups.map((g) => (
            <button
              key={g.group}
              onClick={() => setActiveGroup(activeGroup === g.group ? null : g.group)}
              className={`bg-gray-800 rounded-lg p-4 text-left transition-all duration-150 cursor-pointer ${
                activeGroup === g.group ? 'ring-1 ring-primary-500/40' : 'hover:bg-gray-750'
              }`}
            >
              <g.icon className={`w-5 h-5 ${g.color} mb-2`} />
              <h4 className="font-medium text-sm">{g.label}</h4>
              <p className="text-xs text-gray-500 mt-1">{g.count} 个工具</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
