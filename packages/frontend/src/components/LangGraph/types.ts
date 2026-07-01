/**
 * LangGraph 可视化组件共享类型
 */

/** 场景数据 */
export interface Scenario {
  id: number;
  name: string;
  path: string;
  desc: string;
  input: string;
  icon: string;
  traversalPath: string[];
  keyEdges?: [string, string][];
  flowDesc: string;
  /** 特殊标记 */
  parallelAct?: boolean;
  isResume?: boolean;
  isFullGraph?: boolean;
  retryAct?: boolean;
  chainAct?: boolean;
}

/** 迷你节点布局 */
export interface MiniNodePos {
  cx: number;
  cy: number;
  w: number;
  h: number;
  color: string;
  label: string;
}

/** 迷你图 Props */
export interface MiniFlowGraphProps {
  scenario: Scenario;
  actualPath?: string[] | null;
  width?: string | number;
  height?: string | number;
}

/** 执行结果 */
export interface ScenarioResult {
  turnCount: number;
  messageCount: number;
  duration: string;
  output?: string;
  logs?: LogEntry[];
  actualPath?: string[];
}

/** 日志条目 */
export interface LogEntry {
  node: string;
  type: 'enter' | 'info' | 'warn' | 'exit' | 'decision' | 'error';
  message: string;
}
