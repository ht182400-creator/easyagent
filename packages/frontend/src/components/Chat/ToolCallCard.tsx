/**
 * 工具调用卡片 - 展示工具名称、输入参数、执行状态、输出结果
 */
import { useState } from 'react';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  FileCode,
  Search,
  Terminal,
  GitBranch,
} from 'lucide-react';
import type { ToolCallBlock } from '../../stores/chatStore';

/** 工具图标映射 */
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  read_file: FileCode,
  write_file: FileCode,
  edit_file: FileCode,
  list_dir: FileCode,
  search_content: Search,
  search_file: Search,
  web_fetch: Search,
  web_search: Search,
  exec: Terminal,
  git_status: GitBranch,
  git_diff: GitBranch,
  git_log: GitBranch,
  git: GitBranch,
};

/** 状态图标 */
function StatusIcon({ status }: { status: ToolCallBlock['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-gray-500" />;
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
    case 'done':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  }
}

/** 状态文案 */
function statusLabel(status: ToolCallBlock['status'], toolName: string): string {
  switch (status) {
    case 'pending':
      return `准备执行 ${toolName}...`;
    case 'running':
      return `正在执行 ${toolName}...`;
    case 'done':
      return `${toolName} 执行完成`;
    case 'error':
      return `${toolName} 执行失败`;
  }
}

/** 执行耗时 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 工具调用卡片组件
 * 可展开/折叠显示工具调用的输入参数和输出结果
 */
export function ToolCallCard({ toolCall }: { toolCall: ToolCallBlock }) {
  const [expanded, setExpanded] = useState(false);
  const isDone = toolCall.status === 'done' || toolCall.status === 'error';
  const Icon = TOOL_ICONS[toolCall.toolName] || Wrench;
  const duration =
    toolCall.startTime && toolCall.endTime ? toolCall.endTime - toolCall.startTime : null;

  return (
    <div
      className={`tool-call-card transition-all ${
        toolCall.status === 'error' ? 'border-red-500/20 bg-red-500/5' : ''
      }`}
    >
      {/* 头部 */}
      <button
        className="tool-header w-full text-left hover:text-gray-300 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={toolCall.status} />
        <Icon className="w-3.5 h-3.5" />
        <span className="flex-1">{statusLabel(toolCall.status, toolCall.toolName)}</span>
        {duration && <span className="text-xs opacity-60">{formatDuration(duration)}</span>}
        {isDone &&
          (expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          ))}
      </button>

      {/* 展开详情 */}
      {expanded && isDone && (
        <div className="mt-2 space-y-2 fade-in">
          {/* 输入参数 */}
          {Object.keys(toolCall.input).length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">输入参数:</div>
              <pre className="text-xs bg-gray-950/50 rounded-lg p-2 overflow-x-auto max-h-24">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}

          {/* 输出结果 */}
          {toolCall.output && (
            <div>
              <div className="text-xs text-gray-500 mb-1">
                输出结果
                {toolCall.status === 'error' && <span className="text-red-400 ml-1">(错误)</span>}:
              </div>
              <pre
                className={`text-xs rounded-lg p-2 overflow-x-auto max-h-48 ${
                  toolCall.status === 'error'
                    ? 'bg-red-500/5 border border-red-500/10 text-red-300'
                    : 'bg-gray-950/50 text-gray-300'
                }`}
              >
                {toolCall.output.length > 2000
                  ? toolCall.output.slice(0, 2000) + '\n... (结果已截断)'
                  : toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
