/**
 * @easyagent/langgraph — LangGraph 工作流引擎
 * 
 * 公开 API 导出
 */
export { LangGraphAgent } from './Agent';
export type {
  AgentResult,
  AgentEvent,
  AgentEventListener,
  RunOptions,
  AgentConfig,
} from './Agent';

export { createAgentGraph } from './graph/agentGraph';
export type { AgentGraphConfig } from './graph/agentGraph';

export { AgentState } from './state/AgentState';
export type { AgentStateType } from './state/AgentState';

export { createThinkNode } from './nodes/thinkNode';
export type { ThinkNodeConfig } from './nodes/thinkNode';

export { createActNode } from './nodes/actNode';
export type { ActNodeConfig, ToolExecutor, ToolResult } from './nodes/actNode';

export { createObserveNode } from './nodes/observeNode';
export type { ObserveNodeConfig } from './nodes/observeNode';

export { routeAfterThink } from './edges/routeAfterThink';

export { SqliteCheckpointer } from './memory/Checkpointer';
export type { CheckpointerConfig, CheckpointSummary } from './memory/Checkpointer';

export { MemoryManager } from './memory/Memory';
export type { MemoryItem, MemoryConfig } from './memory/Memory';

// ---- 日志系统 ----
export {
  Logger,
  LogLevel,
  setGlobalLevel,
  setGlobalLevelByName,
  setModuleFilter,
  setOutputFile,
  setupFromEnv,
  // 配置加载器（推荐方式）
  loadLogConfig,
  setupLogConfig,
  saveDefaultConfig,
} from './logger';
export type { LogEntry, LoggerConfig, LogConfigFile, LangGraphConfig } from './logger';

// ---- 桥接模块 (Phase A — 集成 EasyAgent Core) ----
export { createAdapterBridge } from './bridge/adapterBridge';
export { createToolBridge } from './bridge/toolBridge';
export { createLangGraphAgent } from './bridge/AgentFactory';
export type { LangGraphAgentOptions } from './bridge/AgentFactory';
