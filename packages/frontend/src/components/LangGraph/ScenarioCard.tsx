/**
 * LangGraph 场景卡片组件
 * 展示单个执行场景：标题、路径、迷你流转图、终端日志
 * 从 demo/index.html 的 scenario-card 迁移而来
 */
import React, { useState, useCallback } from 'react';
import MiniFlowGraph from './MiniFlowGraph';
import type { Scenario } from './types';

// ==================== Props ====================

interface ScenarioCardProps {
  scenario: Scenario;
  onRun?: (id: number) => void;
  /** 执行结果 */
  result?: ScenarioResult | null;
  /** 是否正在执行 */
  isRunning?: boolean;
  /** 展开详情时触发 */
  onToggle?: (id: number, open: boolean) => void;
  /** 点击迷你流转图 → 打开放大弹窗 */
  onFlowClick?: (scenario: Scenario) => void;
}

export interface ScenarioResult {
  turnCount: number;
  messageCount: number;
  duration: string;
  output?: string;
  logs?: LogEntry[];
  actualPath?: string[];
}

export interface LogEntry {
  node: string;
  type: 'enter' | 'info' | 'warn' | 'exit' | 'decision' | 'error';
  message: string;
}

// ==================== 状态徽标映射 ====================

const LOG_CLASS_MAP: Record<string, string> = {
  enter:    '',
  info:     'text-[#00ff88]',
  warn:     'text-[#ffb74d]',
  exit:     '',
  decision: 'text-[#448aff]',
  error:    'text-[#ff5252]',
};

// ==================== HTML 转义 ====================

function escapeHtml(str: string): string {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

// ==================== 日志行渲染 ====================

function LogLine({ log }: { log: LogEntry }) {
  const colorClass = LOG_CLASS_MAP[log.type] || '';
  return (
    <div className="flex gap-2.5 py-0.5 items-baseline">
      <span className="text-[#4a5568] text-[10px] flex-shrink-0 min-w-[75px]">
        [{log.node}]
      </span>
      <span className={`text-[#7a8b9e] text-[11px] flex-1 break-all ${colorClass}`}>
        {escapeHtml(log.message)}
      </span>
    </div>
  );
}

// ==================== 主组件 ====================

/**
 * 场景卡片
 * 展示单个执行场景的完整信息
 */
export default function ScenarioCard({ scenario, onRun, result, isRunning, onToggle, onFlowClick }: ScenarioCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    onToggle?.(scenario.id, next);
  }, [expanded, scenario.id, onToggle]);

  const handleRun = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRun?.(scenario.id);
    },
    [scenario.id, onRun],
  );

  // 状态
  let badgeClass = 'bg-white/[0.04] text-[#4a5568]';
  let badgeText = '待执行';
  let cardExtraClass = '';

  if (isRunning) {
    badgeClass = 'bg-[rgba(255,183,77,0.1)] text-[#ffb74d]';
    badgeText = '执行中...';
    cardExtraClass = 'border-[#ffb74d] animate-border-pulse';
  } else if (result) {
    badgeClass = 'bg-[rgba(0,255,136,0.08)] text-[#00ff88]';
    badgeText = `✅ ${result.duration}`;
    cardExtraClass = 'border-[rgba(0,255,136,0.2)]';
  }

  return (
    <div
      className={`scenario-card bg-[#111922] border border-[#1a2530] rounded-lg overflow-hidden transition-all duration-300 cursor-pointer relative ${cardExtraClass}`}
      style={{
        opacity: 0,
        animation: `card-in 0.5s ease forwards`,
        animationDelay: `${scenario.id * 0.07}s`,
      }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        handleToggle();
      }}
    >
      {/* 顶部发光装饰线 */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00e5ff] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* 头部 */}
      <div className="flex items-start gap-3.5 p-4">
        {/* 图标 */}
        <div className="w-[42px] h-[42px] rounded-lg border border-[#1a2530] bg-[rgba(0,229,255,0.05)] flex items-center justify-center text-lg flex-shrink-0">
          {scenario.icon}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#dde4ec] mb-0.5">
            #{scenario.id} {scenario.name}
          </div>
          <div className="text-[11px] text-[#00e5ff]/70 truncate">{scenario.path}</div>
          <div className="text-[11px] text-[#4a5568] mt-1 leading-relaxed">{scenario.desc}</div>
        </div>

        {/* 状态徽标 */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap mt-0.5 flex-shrink-0 ${badgeClass}`}>
          {isRunning && <span className="w-2.5 h-2.5 border-1.5 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />}
          {badgeText}
        </span>
      </div>

      {/* 迷你流转图 — 点击打开放大弹窗，阻止冒泡到卡片展开 */}
      <div
        className="relative w-full h-[135px] overflow-hidden border-t border-b border-[#1a2530] bg-[radial-gradient(circle_at_50%_50%,rgba(0,229,255,0.02),transparent_70%)] cursor-zoom-in"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(0,229,255,0.02) 0%, transparent 70%)' }}
        onClick={(e) => {
          e.stopPropagation(); // 阻止冒泡到卡片 onClick → 不展开详情
          onFlowClick?.(scenario);
        }}
      >
        <MiniFlowGraph
          scenario={scenario}
          actualPath={result?.actualPath}
          width="100%"
          height="100%"
        />
        {/* 放大提示 */}
        <span className="absolute bottom-1.5 right-2 text-[9px] text-[#4a5568] opacity-0 group-hover:opacity-70 transition-opacity font-mono">
          🔍 点击放大
        </span>
      </div>

      {/* 图例 */}
      <div className="flex gap-3 px-3 py-1.5 text-[9.5px] text-[#4a5568] bg-black/[0.15]">
        <span className="flex items-center gap-1">
          <span className="w-[7px] h-[7px] rounded-sm bg-[rgba(0,229,255,0.3)] border border-[#00e5ff]" />
          流转节点
        </span>
        <span className="flex items-center gap-1">
          <span className="w-[7px] h-[7px] rounded-sm bg-white/[0.04] border border-[#1a2530]" />
          非流转节点
        </span>
        <span className="ml-auto text-[#00e5ff]">{scenario.flowDesc}</span>
      </div>

      {/* 展开详情 */}
      <div
        className="overflow-hidden transition-all duration-400"
        style={{ maxHeight: expanded ? '600px' : '0' }}
      >
        <div className="px-5 pb-4 pt-0 border-t border-[#1a2530]">
          {/* 结果摘要 */}
          {result && result.turnCount > 0 && (
            <div className="flex gap-5 mt-3 p-3 bg-[rgba(0,255,136,0.03)] border border-[rgba(0,255,136,0.1)] rounded-md">
              <div className="text-center">
                <div className="text-lg font-semibold text-[#00ff88]">{result.turnCount}</div>
                <div className="text-[10px] text-[#4a5568] mt-0.5">轮次</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-[#00ff88]">{result.messageCount}</div>
                <div className="text-[10px] text-[#4a5568] mt-0.5">消息数</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-[#00ff88]">{result.duration}</div>
                <div className="text-[10px] text-[#4a5568] mt-0.5">耗时</div>
              </div>
            </div>
          )}

          {/* 输出 */}
          {result?.output && (
            <div className="mt-3 p-2.5 bg-[rgba(0,229,255,0.03)] border-l-2 border-[#00e5ff] rounded-r-md text-xs text-[#dde4ec] leading-relaxed">
              {result.output}
            </div>
          )}

          {/* 终端日志 */}
          {result?.logs && result.logs.length > 0 && (
            <div className="mt-3.5 bg-[#060a0f] border border-[#1a2530] rounded-md overflow-hidden">
              {/* 终端头部 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-black/30 border-b border-[#1a2530]">
                <span className="w-2 h-2 rounded-full bg-[#ff5252]" />
                <span className="w-2 h-2 rounded-full bg-[#ffb74d]" />
                <span className="w-2 h-2 rounded-full bg-[#00ff88]" />
                <span className="text-[10px] text-[#4a5568] ml-1.5">
                  执行日志 · {result.logs.length} 条
                </span>
              </div>
              {/* 日志内容 */}
              <div className="p-3 text-xs leading-relaxed max-h-[280px] overflow-y-auto font-mono">
                {result.logs.map((log, i) => (
                  <LogLine key={i} log={log} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 展开/收起按钮 */}
      <button
        onClick={handleToggle}
        className="w-full py-2 border-t border-[#1a2530] text-[11px] text-[#4a5568] hover:text-[#00e5ff] transition-colors font-mono mt-1"
      >
        {expanded ? '收起 ▴' : '展开 ▾'}
      </button>

      {/* 内联动画 */}
      <style>{`
        @keyframes card-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes border-pulse {
          0%, 100% { border-color: #ffb74d; }
          50% { border-color: #00e5ff; }
        }
        .animate-border-pulse {
          animation: border-pulse 1.5s ease infinite;
        }
        .transition-all.duration-400 {
          transition-duration: 400ms;
        }
        .transition-opacity.duration-300 {
          transition-duration: 300ms;
        }
      `}</style>
    </div>
  );
}
