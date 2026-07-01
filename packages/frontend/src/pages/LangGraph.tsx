/**
 * LangGraph 可视化页面 — Phase C 核心入口
 * 展示有向图引擎状态 + 场景卡片 + Checkpoint 会话
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  GraphCanvas,
  ScenarioCard,
  FlowZoomModal,
  SessionDetailModal,
  DEFAULT_NODES,
  DEFAULT_EDGES,
} from '../components/LangGraph';
import type { Scenario, ScenarioResult } from '../components/LangGraph/types';
import { useLangGraphStore } from '../stores/langGraphStore';
import { useAppStore } from '../stores/appStore';
import { getApiBase } from '../request';
import { Play, RotateCcw, Database, Cpu, Activity, GitBranch, Monitor, Terminal, Zap, Square, ExternalLink } from 'lucide-react';

// ==================== 场景数据 ====================

const SCENARIOS: Scenario[] = [
  {
    id: 1, name: '纯文本对话', path: 'START → think → END',
    desc: '用户发送纯文本，LLM 直接回复，无工具调用', input: '"你好"', icon: '💬',
    traversalPath: ['START', 'think', 'route', 'END'],
    flowDesc: '单次直通 · 无循环',
  },
  {
    id: 2, name: '工具调用循环', path: 'START → think → act → observe → think → END',
    desc: 'LLM 调用天气查询工具，act 执行后 observe 观察，最终自然语言回答', input: '"北京今天天气怎么样？"', icon: '🔧',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    keyEdges: [['route', 'act'], ['observe', 'think']],
    flowDesc: '1 轮循环 · 工具→观察→再思考',
  },
  {
    id: 3, name: '多工具并行', path: 'think → act(并行) → observe → think → END',
    desc: 'LLM 同时调用天气+时间工具，act 并行执行，验证并发能力', input: '"深圳天气和时间"', icon: '⚡',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    keyEdges: [['route', 'act'], ['observe', 'think']],
    flowDesc: '1 轮循环 · 并行 2 工具', parallelAct: true,
  },
  {
    id: 4, name: 'maxTurns 安全终止', path: 'think → act → observe (×3) → END',
    desc: 'maxTurns=3，LLM 持续请求工具但系统强制终止，防止死循环', input: '"开始无限循环"', icon: '🛡️',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    keyEdges: [['observe', 'think'], ['route', 'act']],
    flowDesc: '3 轮循环 → maxTurns 截断',
  },
  {
    id: 5, name: 'Checkpoint + Resume', path: 'run → checkpoint → resume → 继续对话',
    desc: '第一轮对话后自动保存 checkpoint，第二轮 resume 恢复上下文', input: '"记住我喜欢蓝色" → Resume', icon: '💾',
    traversalPath: ['START', 'think', 'route', 'END', 'START', 'think', 'route', 'END'],
    keyEdges: [['START', 'think'], ['route', 'END']],
    flowDesc: '两段独立 · session 断点续传', isResume: true,
  },
  {
    id: 6, name: '图结构可视化', path: '全部节点和边的关系',
    desc: '完整展示有向图所有节点和边，清晰呈现环形控制流', input: '—', icon: '🗺️',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'END'],
    keyEdges: [['route', 'act'], ['route', 'END'], ['observe', 'think']],
    flowDesc: '全节点 · 条件分支 + 循环边', isFullGraph: true,
  },
  {
    id: 7, name: '上下文摘要与压缩', path: '长对话 → 摘要压缩 → think → END',
    desc: '模拟超长对话（200+条消息），MemoryManager 触发自动摘要压缩', input: '"继续讨论..." (含200条历史)', icon: '🧠',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    keyEdges: [['route', 'act'], ['observe', 'think']],
    flowDesc: '1 轮循环 · 摘要压缩工具',
  },
  {
    id: 8, name: '工具失败自动重试', path: 'think → act(失败) → observe → think(修正) → act(成功) → END',
    desc: '工具第1次调用失败，系统自动检测并修正参数重试，最终成功', input: '"今天天气怎么样？"', icon: '🔄',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    keyEdges: [['route', 'act'], ['observe', 'think']],
    flowDesc: '2 轮循环 · 失败→修正→重试成功', retryAct: true,
  },
  {
    id: 9, name: '链式工具调用', path: 'act(read_file) → observe → think → act(analyze_data) → END',
    desc: '工具A输出 → 工具B输入，验证工具间数据传递的链式流转', input: '"读取用户数据并分析"', icon: '⛓️',
    traversalPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    keyEdges: [['route', 'act'], ['observe', 'think']],
    flowDesc: '2 轮循环 · A输出→B输入链式', chainAct: true,
  },
];

const NODE_MAP = new Map(DEFAULT_NODES.map((n) => [n.id, n]));

// ==================== 主页面 ====================

/**
 * LangGraph 可视化页面
 * 展示有向图引擎的全貌：图结构 + 场景执行 + Checkpoint
 */
export default function LangGraphPage() {
  const {
    highlightedNode,
    highlightedEdges,
    scenarioResults,
    runningScenarios,
    engineType,
    sessions,
    sessionsLoading,
    wsConnected,
    demoOutput,
    demoRunning,
    demoReady,
    highlightNode,
    runScenario,
    setScenarioResult,
    setEngineType,
    loadSessions,
    connectWebSocket,
    disconnectWebSocket,
    startDemo,
    stopDemo,
    checkDemoStatus,
    clearDemoOutput,
  } = useLangGraphStore();

  const addNotification = useAppStore((s) => s.addNotification);

  const [zoomScenario, setZoomScenario] = React.useState<Scenario | null>(null);
  /** Checkpoint 会话详情弹窗 — 点击会话卡片时打开 */
  const [detailSessionId, setDetailSessionId] = React.useState<string | null>(null);
  /** 模式选择器 — 方便演示时快速切换 */
  type LangGraphMode = 'integrated' | 'demo-web' | 'demo-terminal' | null;
  const [selectedMode, setSelectedMode] = React.useState<LangGraphMode>(null);
  /** 终端演示模式下的滚动日志 */
  const [terminalLogs, setTerminalLogs] = React.useState<Array<{ time: string; text: string; level: 'info' | 'success' | 'error' | 'warn' }>>([]);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // 加载引擎类型和 Checkpoint 会话列表
  useEffect(() => {
    const baseUrl = getApiBase();
    fetch(`${baseUrl}/api/engine-type`)
      .then((r) => r.json())
      .then((data: { engineType: string }) => {
        if (data?.engineType) {
          setEngineType(data.engineType as 'legacy' | 'langgraph');
        }
      })
      .catch(() => { /* 默认 legacy */ });
  }, [setEngineType]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  /** WebSocket 实时高亮连接（Phase D 方向2） */
  useEffect(() => {
    connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

  /** 模式选择后初始化：独立 Demo 检查服务状态 */
  useEffect(() => {
    if (selectedMode === 'demo-web') {
      // 检查 Demo 服务是否已运行
      checkDemoStatus();
    }
  }, [selectedMode, checkDemoStatus]);

  // 追加终端日志（仅终端演示模式使用）
  const appendTerminalLog = useCallback((text: string, level: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setTerminalLogs((prev) => [...prev, { time, text, level }]);
  }, []);

  // 清空终端日志
  const clearTerminalLogs = useCallback(() => {
    setTerminalLogs([]);
  }, []);

  // 运行所有场景
  const runAllScenarios = useCallback(async () => {
    addNotification({ type: 'info', message: '开始执行场景...', duration: 3000 });

    // 终端演示模式：清空并输出启动横幅
    if (selectedMode === 'demo-terminal') {
      clearTerminalLogs();
      appendTerminalLog('=== LangGraph 终端演示 ===', 'info');
      appendTerminalLog(`引擎: ${engineType === 'langgraph' ? 'LangGraph' : 'Legacy'}`, 'info');
      appendTerminalLog('开始自动执行 9 个场景...', 'info');
    }

    // 场景 6 是纯静态数据
    const graphLogs = DEFAULT_NODES.map((n) => ({
      node: n.id,
      type: 'info' as const,
      message: `${n.label}: ${n.desc}`,
    }));
    setScenarioResult(6, {
      turnCount: 0,
      messageCount: 0,
      output: '图结构数据已加载',
      logs: graphLogs,
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'END'],
      duration: '0ms',
    });

    // 依次执行场景 1-5, 7-9
    const ids = [1, 2, 3, 4, 5, 7, 8, 9];
    for (const id of ids) {
      const scenario = SCENARIOS.find((s) => s.id === id);
      if (selectedMode === 'demo-terminal') {
        appendTerminalLog(`[场景 ${id}] ${scenario?.name || ''} 开始执行...`, 'info');
      }
      await runScenario(id);
      if (selectedMode === 'demo-terminal') {
        const result = useLangGraphStore.getState().scenarioResults[id];
        if (result?.duration === '失败') {
          appendTerminalLog(`[场景 ${id}] 执行失败: ${result.output || '未知错误'}`, 'error');
        } else {
          appendTerminalLog(`[场景 ${id}] ${scenario?.name || ''} 完成 · ${result?.duration || '0ms'}`, 'success');
        }
      }
    }

    if (selectedMode === 'demo-terminal') {
      appendTerminalLog('全部场景执行完毕', 'success');
    }
    addNotification({ type: 'success', message: '全部场景执行完成', duration: 3000 });
  }, [runScenario, setScenarioResult, addNotification, selectedMode, engineType, appendTerminalLog, clearTerminalLogs]);

  // 场景 6 的已完成结果（静态）
  const allResults = useMemo(() => {
    return { ...scenarioResults };
  }, [scenarioResults]);

  // 已完成/执行中的统计
  const completedCount = useMemo(
    () => SCENARIOS.filter((s) => allResults[s.id] && !runningScenarios.has(s.id)).length,
    [allResults, runningScenarios],
  );

  const runningCount = useMemo(() => runningScenarios.size, [runningScenarios]);

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="pb-4 border-b border-white/[0.06]">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-[#00e5ff] to-[#00ff88] bg-clip-text text-transparent">
            ◈ LangGraph 控制面板
          </span>
        </h1>
        <p className="text-[11px] text-[#4a5568] mt-1 font-mono">
          有向图执行引擎可视化 · Directed Graph Visualization
        </p>
      </div>

      {/* ===== 模式选择器 ===== */}
      {!selectedMode && (
        <div className="p-5 bg-[#0e1620] border border-[#1a2530] rounded-xl">
          <div className="text-xs text-[#00e5ff] font-medium tracking-wider mb-3">
            ◈ 选择使用模式
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 模式一：EasyAgent 集成可视化 */}
            <button
              onClick={() => setSelectedMode('integrated')}
              className="flex flex-col items-center gap-3 p-5 bg-[#111922] border border-[#1a2530] rounded-lg hover:border-[#00e5ff] hover:bg-[rgba(0,229,255,0.03)] hover:shadow-[0_0_30px_rgba(0,229,255,0.08)] transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.15)] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Monitor className="w-5 h-5 text-[#00e5ff]" />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-[#dde4ec] mb-1">集成可视化</div>
                <div className="text-[10px] text-[#4a5568] leading-relaxed">
                  在 EasyAgent 内查看<br />
                  有向图 + 场景执行 + 日志
                </div>
              </div>
              <span className="text-[10px] text-[#00e5ff]/50 font-mono group-hover:text-[#00e5ff] transition-colors">
                单击启动 →
              </span>
            </button>

            {/* 模式二：独立 Web Demo (iframe 内嵌) */}
            <button
              onClick={() => setSelectedMode('demo-web')}
              className="flex flex-col items-center gap-3 p-5 bg-[#111922] border border-[#1a2530] rounded-lg hover:border-[#ffb74d] hover:bg-[rgba(255,183,77,0.03)] hover:shadow-[0_0_30px_rgba(255,183,77,0.08)] transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[rgba(255,183,77,0.08)] border border-[rgba(255,183,77,0.15)] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-5 h-5 text-[#ffb74d]" />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-[#dde4ec] mb-1">独立 Demo</div>
                <div className="text-[10px] text-[#4a5568] leading-relaxed">
                  同窗口 iframe 内嵌<br />
                  Demo 原始风格展示
                </div>
              </div>
              <span className="text-[10px] text-[#ffb74d]/50 font-mono group-hover:text-[#ffb74d] transition-colors">
                内嵌显示 →
              </span>
            </button>

            {/* 模式三：终端演示 */}
            <button
              onClick={() => setSelectedMode('demo-terminal')}
              className="flex flex-col items-center gap-3 p-5 bg-[#111922] border border-[#1a2530] rounded-lg hover:border-[#00ff88] hover:bg-[rgba(0,255,136,0.03)] hover:shadow-[0_0_30px_rgba(0,255,136,0.08)] transition-all group text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.15)] flex items-center justify-center group-hover:scale-110 transition-transform">
                <Terminal className="w-5 h-5 text-[#00ff88]" />
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-[#dde4ec] mb-1">终端演示</div>
                <div className="text-[10px] text-[#4a5568] leading-relaxed">
                  一键执行 9 个场景<br />
                  终端风格日志输出
                </div>
              </div>
              <span className="text-[10px] text-[#00ff88]/50 font-mono group-hover:text-[#00ff88] transition-colors">
                手动运行 →
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ===== 已选择模式 — 上功能区 + 下内容区 ===== */}
      {selectedMode && (
        <>
          {/* 上 Frame：功能区状态栏 */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0e1620] border border-[#1a2530] rounded-lg">
            <span className="text-[10px] text-[#4a5568] font-mono">当前模式:</span>
            <span className={`text-[11px] font-semibold font-mono ${
              selectedMode === 'integrated' ? 'text-[#00e5ff]' :
              selectedMode === 'demo-web' ? 'text-[#ffb74d]' :
              'text-[#00ff88]'
            }`}>
              {selectedMode === 'integrated' ? '集成可视化' :
               selectedMode === 'demo-web' ? '独立 Demo' :
               '终端演示'}
            </span>

            {/* 集成/终端模式下显示引擎与状态 */}
            {(selectedMode === 'integrated' || selectedMode === 'demo-terminal') && (
              <>
                <span className="w-px h-3 bg-[#1a2530] mx-1" />
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <Cpu className="w-3 h-3 text-[#00e5ff]" />
                  <span className="text-[#7a8b9e]">
                    {engineType === 'langgraph' ? 'LangGraph' : 'Legacy'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  {runningCount > 0 ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#ffb74d] animate-pulse" />
                      <span className="text-[#ffb74d] font-mono">执行中 ({runningCount})</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_6px_rgba(0,255,136,0.5)]" />
                      <span className="text-[#4a5568] font-mono">就绪</span>
                    </>
                  )}
                </div>
              </>
            )}

            <span className="flex-1" />
            {/* 执行按钮 — 仅集成/终端模式显示 */}
            {(selectedMode === 'integrated' || selectedMode === 'demo-terminal') && (
              <button
                onClick={runAllScenarios}
                disabled={runningCount > 0}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#00ff88] text-[#00ff88] bg-[rgba(0,255,136,0.05)] text-xs font-mono hover:bg-[rgba(0,255,136,0.1)] transition-all disabled:opacity-40"
              >
                {runningCount > 0 ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {runningCount > 0 ? '执行中...' : '▶ 执行全部场景'}
              </button>
            )}
            {/* Demo 控制按钮 */}
            {selectedMode === 'demo-web' && (
              <>
                {!demoRunning && !demoReady && (
                  <button
                    onClick={startDemo}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#00ff88] text-[#00ff88] bg-[rgba(0,255,136,0.05)] text-xs font-mono hover:bg-[rgba(0,255,136,0.1)] transition-all"
                  >
                    <Play className="w-3 h-3" />
                    启动 Demo
                  </button>
                )}
                {demoRunning && (
                  <button
                    onClick={stopDemo}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#ff5252] text-[#ff5252] bg-[rgba(255,82,82,0.05)] text-xs font-mono hover:bg-[rgba(255,82,82,0.1)] transition-all"
                  >
                    <Square className="w-3 h-3" />
                    停止 Demo
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => {
                setSelectedMode(null);
                clearDemoOutput();
                SCENARIOS.forEach((s) => {
                  useLangGraphStore.getState().setScenarioResult(s.id, null as unknown as ScenarioResult);
                });
              }}
              className="text-[10px] text-[#4a5568] hover:text-[#ff5252] font-mono transition-colors"
            >
              切换模式
            </button>
          </div>

          {/* 下 Frame：内容区 — 根据模式切换 */}
          {selectedMode === 'demo-web' ? (
            /* ========== 独立 Demo 模式：终端启动面板 ========== */
            <div className="flex flex-col gap-3" style={{ minHeight: '70vh' }}>
              {/* 控制按钮区 */}
              <div className="flex items-center gap-3 p-3 bg-[#111922] border border-[#1a2530] rounded-lg">
                <Terminal className="w-4 h-4 text-[#ffb74d]" />
                <span className="text-[11px] text-[#dde4ec] font-mono">
                  终端控制台
                </span>
                {!demoRunning && !demoReady && (
                  <button
                    onClick={startDemo}
                    className="flex items-center gap-1.5 px-3 py-1.5 ml-auto rounded-md border border-[#00ff88] text-[#00ff88] bg-[rgba(0,255,136,0.05)] text-xs font-mono hover:bg-[rgba(0,255,136,0.1)] hover:shadow-[0_0_20px_rgba(0,255,136,0.12)] transition-all"
                  >
                    <Play className="w-3 h-3" />
                    一键启动 Demo
                  </button>
                )}
                {demoRunning && !demoReady && (
                  <span className="ml-auto text-[10px] text-[#ffb74d] font-mono animate-pulse">
                    启动中...
                  </span>
                )}
                {demoReady && (
                  <div className="ml-auto flex items-center gap-2">
                    <a
                      href="http://localhost:3455"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#00e5ff] text-[#00e5ff] bg-[rgba(0,229,255,0.05)] text-[10px] font-mono hover:bg-[rgba(0,229,255,0.1)] transition-all"
                    >
                      <ExternalLink className="w-3 h-3" />
                      打开 Demo
                    </a>
                    <button
                      onClick={stopDemo}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-[#ff5252] text-[#ff5252] bg-[rgba(255,82,82,0.05)] text-[10px] font-mono hover:bg-[rgba(255,82,82,0.1)] transition-all"
                    >
                      <Square className="w-3 h-3" />
                      停止
                    </button>
                  </div>
                )}
              </div>

              {/* 终端输出窗口 — 模拟 PowerShell 黑窗 */}
              <div
                className="flex-1 bg-[#0c0c0c] border border-[#1a2530] rounded-lg overflow-hidden flex flex-col"
                style={{ minHeight: '55vh' }}
              >
                {/* 终端标题栏 */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161616] border-b border-[#1a2530] select-none">
                  <span className="w-3 h-3 rounded-full bg-[#ff5252]" />
                  <span className="w-3 h-3 rounded-full bg-[#ffb74d]" />
                  <span className="w-3 h-3 rounded-full bg-[#00ff88]" />
                  <span className="flex-1 text-center text-[9px] text-[#4a5568] font-mono">
                    PowerShell — LangGraph Demo
                  </span>
                  {demoOutput.length > 0 && (
                    <button
                      onClick={clearDemoOutput}
                      className="text-[9px] text-[#4a5568] hover:text-[#7a8b9e] font-mono transition-colors"
                    >
                      清屏
                    </button>
                  )}
                </div>

                {/* 终端内容 */}
                <div
                  className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap"
                  style={{ background: '#0c0c0c' }}
                  ref={(el) => {
                    // 自动滚动到底部
                    if (el) {
                      el.scrollTop = el.scrollHeight;
                    }
                  }}
                >
                  {/* 初始提示 */}
                  {demoOutput.length === 0 && !demoRunning && (
                    <div className="text-[#4a5568] select-none">
                      <span className="text-[#00ff88]">PS D:\Work_Area\AI\Claude Code  CN\packages\langgraph&gt;</span>
                      <span className="animate-pulse">|</span>
                      {'\n\n'}点击 <span className="text-[#00ff88]">「一键启动 Demo」</span> 按钮执行{' '}
                      <span className="text-[#ffb74d]">start-demo.bat --web</span>
                      {'\n'}或手动运行: <span className="text-[#ffb74d]">packages\langgraph\start-demo.bat --web</span>
                    </div>
                  )}

                  {/* 终端输出行 */}
                  {demoOutput.map((line, i) => {
                    let lineColor = '#7a8b9e';
                    if (line.startsWith('[error]') || line.startsWith('❌')) lineColor = '#ff5252';
                    else if (line.startsWith('[warn]') || line.startsWith('⚠️')) lineColor = '#ffb74d';
                    else if (line.startsWith('[ready]') || line.startsWith('✅')) lineColor = '#00ff88';
                    else if (line.startsWith('[info]') || line.startsWith('▶')) lineColor = '#00e5ff';
                    else if (line.startsWith('[')) lineColor = '#4a5568';

                    return (
                      <div key={i} style={{ color: lineColor }}>
                        {line.replace(/^\[[^\]]+\]\s*/, '')}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Demo 就绪后的 iframe 预览 */}
              {demoReady && (
                <div className="bg-[#0e1620] border border-[#1a2530] rounded-xl overflow-hidden" style={{ minHeight: '60vh' }}>
                  <iframe
                    id="langgraph-demo-iframe"
                    src="http://localhost:3455"
                    title="LangGraph Demo"
                    className="w-full border-0"
                    style={{ minHeight: '60vh' }}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                </div>
              )}
            </div>
          ) : selectedMode === 'demo-terminal' ? (
            /* ========== 终端演示模式：紧凑图 + 终端日志 ========== */
            <>
              {/* 紧凑主图 */}
              <GraphCanvas
                nodes={DEFAULT_NODES}
                edges={DEFAULT_EDGES}
                highlightedNode={highlightedNode}
                highlightedEdges={highlightedEdges}
                onNodeClick={highlightNode}
                height={260}
                viewBox="0 20 800 330"
              />

              {/* 终端风格执行日志 */}
              <div className="bg-[#0c0c0c] border border-[#1a2530] rounded-lg overflow-hidden flex flex-col" style={{ minHeight: '45vh' }}>
                {/* 终端标题栏 */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161616] border-b border-[#1a2530] select-none">
                  <span className="w-3 h-3 rounded-full bg-[#ff5252]" />
                  <span className="w-3 h-3 rounded-full bg-[#ffb74d]" />
                  <span className="w-3 h-3 rounded-full bg-[#00ff88]" />
                  <span className="flex-1 text-center text-[9px] text-[#4a5568] font-mono">
                    PowerShell — LangGraph Scenario Runner
                  </span>
                  {terminalLogs.length > 0 && (
                    <button
                      onClick={clearTerminalLogs}
                      className="text-[9px] text-[#4a5568] hover:text-[#7a8b9e] font-mono transition-colors"
                    >
                      清屏
                    </button>
                  )}
                </div>

                {/* 终端内容 */}
                <div
                  className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
                  style={{ background: '#0c0c0c' }}
                  ref={(el) => {
                    if (el) {
                      el.scrollTop = el.scrollHeight;
                    }
                  }}
                >
                  {terminalLogs.length === 0 && runningCount === 0 && (
                    <div className="text-[#4a5568] select-none">
                      <span className="text-[#00ff88]">PS D:\Work_Area\AI\Claude Code  CN&gt;</span>
                      <span className="animate-pulse">|</span>
                      {'\n\n'}点击 <span className="text-[#00ff88]">「▶ 执行全部场景」</span> 开始终端演示
                    </div>
                  )}
                  {terminalLogs.map((log, i) => {
                    const color = {
                      info: '#00e5ff',
                      success: '#00ff88',
                      error: '#ff5252',
                      warn: '#ffb74d',
                    }[log.level];
                    return (
                      <div key={i} className="flex gap-2">
                        <span className="text-[#4a5568] shrink-0">[{log.time}]</span>
                        <span style={{ color }}>{log.text}</span>
                      </div>
                    );
                  })}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </>
          ) : (
            /* ========== 集成可视化模式：完整功能 ========== */
            <>
              {/* 主图 */}
              <GraphCanvas
                nodes={DEFAULT_NODES}
                edges={DEFAULT_EDGES}
                highlightedNode={highlightedNode}
                highlightedEdges={highlightedEdges}
                onNodeClick={highlightNode}
                height={420}
                viewBox="0 20 800 330"
              />

              {/* 场景卡片区 */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-medium text-[#00e5ff] tracking-wider">
                    ◈ 执行场景
                  </h2>
                  <span className="text-[11px] text-[#4a5568] font-mono">
                    {completedCount > 0 ? `${completedCount}/9 已完成` : '9 个场景'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {SCENARIOS.map((s) => (
                    <ScenarioCard
                      key={s.id}
                      scenario={s}
                      result={allResults[s.id] || null}
                      isRunning={runningScenarios.has(s.id)}
                      onRun={(id) => runScenario(id)}
                      onFlowClick={(scenario) => setZoomScenario(scenario)}
                      onToggle={(id, open) => {
                        if (open && !allResults[id]) {
                          highlightNode(s.traversalPath[0] || null);
                        }
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Checkpoint 会话区 */}
              <div className="mt-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <Database className="w-4 h-4 text-[#ffb74d]" />
                  <h2 className="text-sm font-medium text-[#ffb74d] tracking-wider">
                    ◈ Checkpoint 会话
                  </h2>
                  <span className="text-[11px] text-[#4a5568] font-mono ml-auto">
                    {sessions.length} 个会话
                  </span>
                </div>

                {sessionsLoading ? (
                  <div className="text-center py-6 text-[11px] text-[#4a5568] font-mono">
                    加载中...
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-6 text-[11px] text-[#4a5568] font-mono border border-dashed border-[#1a2530] rounded-lg">
                    暂无 Checkpoint 记录 — 启动 LangGraph 引擎后自动保存
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {sessions.slice(0, 6).map((s) => (
                      <div
                        key={s.threadId}
                        onClick={() => setDetailSessionId(s.threadId)}
                        className="p-3 bg-[#111922] border border-[#1a2530] rounded-lg hover:border-[#ffb74d]/40 hover:shadow-[0_0_12px_rgba(255,183,77,0.06)] transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-[#7a8b9e] font-mono truncate" title={s.threadId}>
                            {s.threadId.slice(0, 16)}...
                          </div>
                          <GitBranch className="w-3 h-3 text-[#4a5568] group-hover:text-[#ffb74d] transition-colors opacity-0 group-hover:opacity-100" />
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#4a5568]">
                          <span className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            {s.turnCount} 轮
                          </span>
                          <span>{s.updatedAt}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* 放大弹窗 */}
      <FlowZoomModal scenario={zoomScenario} onClose={() => setZoomScenario(null)} />

      {/* Checkpoint 会话详情弹窗 */}
      {detailSessionId && (
        <SessionDetailModal
          sessionId={detailSessionId}
          onClose={() => {
            setDetailSessionId(null);
          }}
        />
      )}
    </div>
  );
}
