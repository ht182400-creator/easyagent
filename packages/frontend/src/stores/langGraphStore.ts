/**
 * LangGraph 可视化状态管理 — Zustand Store
 * 管理：图结构、场景列表、执行状态、日志、高亮、WebSocket 实时同步
 */
import { create } from 'zustand';
import { getApiBase, getWsBase } from '../request';

// ==================== 类型 ====================

/** 执行日志条目 */
export interface LangGraphLogEntry {
  node: string;
  type: 'enter' | 'info' | 'warn' | 'exit' | 'decision' | 'error';
  message: string;
}

/** 场景执行结果 */
export interface LangGraphResult {
  turnCount: number;
  messageCount: number;
  duration: string;
  output?: string;
  logs?: LangGraphLogEntry[];
  actualPath?: string[];
}

/** Checkpoint 会话摘要 */
export interface CheckpointSession {
  threadId: string;
  turnCount: number;
  updatedAt: string;
}

/** Checkpoint 会话详情 */
export interface CheckpointSessionDetail {
  id: string;
  state: Record<string, unknown>;
  checkpoints: Array<{
    id: string;
    nodeId: string;
    timestamp: string;
    step: number;
  }>;
}

// ==================== Store 类型 ====================

interface LangGraphState {
  // 图可视化
  highlightedNode: string | null;
  highlightedEdges: Set<string>;
  /** 场景执行结果映射 id → result */
  scenarioResults: Record<number, LangGraphResult>;
  /** 正在执行的场景集合 */
  runningScenarios: Set<number>;

  // Checkpoint 会话
  sessions: CheckpointSession[];
  sessionsLoading: boolean;
  selectedSession: CheckpointSessionDetail | null;
  selectedSessionLoading: boolean;

  // 当前引擎类型
  engineType: 'legacy' | 'langgraph';

  // WebSocket 连接
  ws: WebSocket | null;
  wsConnected: boolean;

  // Demo 终端输出
  demoOutput: string[];
  demoRunning: boolean;
  demoReady: boolean;

  // Actions
  highlightNode: (nodeId: string | null) => void;
  setHighlightedEdges: (edges: string[]) => void;
  runScenario: (id: number) => Promise<void>;
  setScenarioResult: (id: number, result: LangGraphResult) => void;
  setEngineType: (type: 'legacy' | 'langgraph') => void;

  // WebSocket actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;

  // Demo actions
  appendDemoOutput: (line: string) => void;
  clearDemoOutput: () => void;
  startDemo: () => Promise<void>;
  stopDemo: () => Promise<void>;
  checkDemoStatus: () => Promise<void>;

  // Checkpoint actions
  loadSessions: () => Promise<void>;
  loadSessionDetail: (id: string) => Promise<void>;
  resumeSession: (id: string, userMessage?: string) => Promise<void>;
}

// ==================== 工具 ====================

/** 各场景预设的遍历路径（模拟实时高亮动画用） */
const SCENARIO_PATHS: Record<number, string[]> = {
  1: ['START', 'think', 'route', 'END'],
  2: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
  3: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
  4: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
  5: ['START', 'think', 'route', 'END', 'START', 'think', 'route', 'END'],
  7: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
  8: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
  9: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
};

/** 获取场景的遍历路径（供实时高亮动画使用） */
function getScenarioTraversalPath(id: number): string[] {
  return SCENARIO_PATHS[id] || ['START', 'think', 'END'];
}

/** 3秒后自动取消高亮 */
function autoClearHighlight(
  set: (fn: (state: LangGraphState) => Partial<LangGraphState>) => void,
) {
  setTimeout(() => {
    set(() => ({
      highlightedNode: null,
      highlightedEdges: new Set(),
    }));
  }, 3000);
}

// ==================== Store ====================

export const useLangGraphStore = create<LangGraphState>((set, get) => ({
  highlightedNode: null,
  highlightedEdges: new Set(),
  scenarioResults: {},
  runningScenarios: new Set(),
  sessions: [],
  sessionsLoading: false,
  selectedSession: null,
  selectedSessionLoading: false,
  engineType: 'legacy',
  ws: null,
  wsConnected: false,
  demoOutput: [],
  demoRunning: false,
  demoReady: false,

  /** 高亮节点（3秒自动取消） */
  highlightNode: (nodeId) => {
    set((state) => {
      // 高亮相连边
      const nodeMap = new Map(state.sessions.map(() => [])); // placeholder
      const edges = new Set<string>();
      if (nodeId) {
        // 高亮所有出入边
        const allEdges = [
          ['START', 'think'], ['think', 'route'], ['route', 'act'],
          ['route', 'END'], ['act', 'observe'], ['observe', 'think'],
        ];
        allEdges.forEach(([f, t]) => {
          if (f === nodeId || t === nodeId) edges.add(`${f}→${t}`);
        });
      }
      return { highlightedNode: nodeId, highlightedEdges: nodeId ? edges : new Set() };
    });
    if (nodeId) autoClearHighlight(set);
  },

  /** 设置高亮边 */
  setHighlightedEdges: (edgeKeys) => {
    set({ highlightedEdges: new Set(edgeKeys) });
    autoClearHighlight(set);
  },

  /** 执行单个场景，含实时节点高亮动画 */
  runScenario: async (id) => {
    const state = get();
    if (state.runningScenarios.has(id)) return;

    set((s) => ({
      runningScenarios: new Set([...s.runningScenarios, id]),
    }));

    try {
      // 模拟实时节点遍历高亮
      const traversalPath = getScenarioTraversalPath(id);
      for (const nodeId of traversalPath) {
        // 高亮当前正在执行的节点
        set((s) => {
          const edges = new Set<string>();
          const allEdges = [
            ['START', 'think'], ['think', 'route'], ['route', 'act'],
            ['route', 'END'], ['act', 'observe'], ['observe', 'think'],
          ];
          allEdges.forEach(([f, t]) => {
            if (f === nodeId || t === nodeId) edges.add(`${f}→${t}`);
          });
          return { highlightedNode: nodeId, highlightedEdges: nodeId ? edges : new Set() };
        });
        // 模拟执行延迟（200ms），营造实时感
        await new Promise((r) => setTimeout(r, 200));
      }

      // 调用真实 API 获取结果
      const baseUrl = getApiBase();
      const resp = await fetch(`${baseUrl}/api/run/${id}`, { method: 'POST' });
      const data = await resp.json();

      if (data.error) throw new Error(data.error);

      const result: LangGraphResult = {
        turnCount: data.turnCount || 0,
        messageCount: data.messageCount || 0,
        duration: data.duration || '0ms',
        output: data.output,
        logs: data.logs || [],
        actualPath: data.actualPath || traversalPath,
      };

      set((s) => ({
        scenarioResults: { ...s.scenarioResults, [id]: result },
      }));
    } catch (err) {
      set((s) => ({
        scenarioResults: {
          ...s.scenarioResults,
          [id]: {
            turnCount: 0,
            messageCount: 0,
            duration: '失败',
            output: `执行失败: ${(err as Error).message}`,
            logs: [{ node: 'error', type: 'error', message: (err as Error).message }],
          },
        },
      }));
    } finally {
      // 执行完成后清除高亮
      set({ highlightedNode: null, highlightedEdges: new Set() });
      set((s) => ({
        runningScenarios: (() => {
          const next = new Set(s.runningScenarios);
          next.delete(id);
          return next;
        })(),
      }));
    }
  },

  /** 设置场景执行结果 */
  setScenarioResult: (id, result) => {
    set((s) => ({
      scenarioResults: { ...s.scenarioResults, [id]: result },
    }));
  },

  /** 设置当前引擎类型 */
  setEngineType: (type) => set({ engineType: type }),

  // ==================== WebSocket 实时高亮 ====================

  /** 建立 WebSocket 连接，监听 LangGraph 节点状态变化 */
  connectWebSocket: () => {
    const { ws } = get();
    // 避免重复连接
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const wsBase = getWsBase();
    // 将相对路径 /ws 转换为当前页面的完整 WebSocket URL
    const wsUrl = wsBase.startsWith('ws')
      ? wsBase
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${wsBase}`;

    try {
      const socket = new WebSocket(wsUrl);
      set({ ws: socket });

      socket.onopen = () => {
        set({ wsConnected: true });
        // 订阅 LangGraph 节点更新
        socket.send(JSON.stringify({ type: 'subscribe_langgraph' }));
      };

      /** 处理 LangGraph 节点状态 + Demo 终端输出消息 */
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'langgraph_node') {
            const nodeId = msg.nodeId as string;
            // 实时高亮当前执行节点（3秒自动消除）
            get().highlightNode(nodeId);
          } else if (msg.type === 'demo_output') {
            // Demo 终端输出 — 追加到输出列表
            const text = msg.text as string;
            const level = msg.level as string;
            get().appendDemoOutput(`[${level}] ${text}`);
            // 服务就绪时更新状态
            if (level === 'ready') {
              set({ demoReady: true, demoRunning: true });
            }
            if (level === 'exit' || level === 'error') {
              set({ demoRunning: false, demoReady: false });
            }
          }
        } catch {
          // 忽略非 JSON 消息
        }
      };

      socket.onclose = () => {
        set({ wsConnected: false, ws: null });
      };

      socket.onerror = () => {
        // WebSocket 连接失败，降级为静默模式（不影响功能）
        set({ wsConnected: false });
      };
    } catch {
      // 浏览器不支持 WebSocket 或连接失败
      set({ wsConnected: false });
    }
  },

  /** 断开 WebSocket 连接 */
  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'unsubscribe_langgraph' })); } catch { /* ignore */ }
      ws.close();
    }
    set({ ws: null, wsConnected: false });
  },

  // ==================== Checkpoint 会话 ====================

  /** 加载 Checkpoint 会话列表 */
  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const baseUrl = getApiBase();
      const resp = await fetch(`${baseUrl}/api/langgraph/sessions`);
      const data = await resp.json();
      set({ sessions: data.sessions || [], sessionsLoading: false });
    } catch {
      set({ sessions: [], sessionsLoading: false });
    }
  },

  /** 加载 Checkpoint 会话详情 */
  loadSessionDetail: async (id) => {
    set({ selectedSessionLoading: true });
    try {
      const baseUrl = getApiBase();
      const resp = await fetch(`${baseUrl}/api/langgraph/sessions/${id}`);
      const data = await resp.json();
      set({ selectedSession: data, selectedSessionLoading: false });
    } catch {
      set({ selectedSession: null, selectedSessionLoading: false });
    }
  },

  /** 恢复 Checkpoint 会话 */
  resumeSession: async (id, userMessage) => {
    try {
      const baseUrl = getApiBase();
      const resp = await fetch(`${baseUrl}/api/langgraph/sessions/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await resp.json();
      return data;
    } catch (err) {
      throw err;
    }
  },

  // ==================== Demo 终端操作 ====================

  /** 追加 Demo 终端输出行 */
  appendDemoOutput: (line) => {
    set((s) => ({ demoOutput: [...s.demoOutput, line] }));
  },

  /** 清空终端输出 */
  clearDemoOutput: () => {
    set({ demoOutput: [], demoRunning: false, demoReady: false });
  },

  /** 一键启动 Demo 服务 */
  startDemo: async () => {
    set({ demoOutput: [], demoRunning: true, demoReady: false });
    try {
      const baseUrl = getApiBase();
      await fetch(`${baseUrl}/api/demo/start`, { method: 'POST' });
    } catch (err) {
      set({ demoOutput: [`❌ 启动请求失败: ${(err as Error).message}`], demoRunning: false });
    }
  },

  /** 停止 Demo 服务 */
  stopDemo: async () => {
    try {
      const baseUrl = getApiBase();
      await fetch(`${baseUrl}/api/demo/stop`, { method: 'POST' });
      set({ demoOutput: [...get().demoOutput, '\n⏹️ Demo 服务已停止'], demoRunning: false, demoReady: false });
    } catch (err) {
      set({ demoOutput: [...get().demoOutput, `❌ 停止失败: ${(err as Error).message}`] });
    }
  },

  /** 检查 Demo 服务状态 */
  checkDemoStatus: async () => {
    try {
      const baseUrl = getApiBase();
      const resp = await fetch(`${baseUrl}/api/demo/status`);
      const data = await resp.json();
      set({ demoRunning: data.running, demoReady: data.ready });
    } catch {
      // 忽略网络错误
    }
  },
}));
