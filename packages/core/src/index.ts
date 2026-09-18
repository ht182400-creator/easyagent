/**
 * EasyAgent Core - 核心引擎入口
 * 导出所有核心模块
 */

// 类型
export type * from './types/index.js';

// 适配器
export {
  BaseAdapter,
  OpenAICompatibleAdapter,
  ErnieAdapter,
  HunyuanAdapter,
  AdapterFactory,
} from './adapters/index.js';

// Agent引擎
export { AgentEngine } from './agent/AgentEngine.js';
export type { AgentEventListener } from './agent/AgentEngine.js';

// 上下文工程（P0-4）：token 预算 / 工具分级 / 结果截断 / 历史压缩
export {
  ContextManager,
  getContextManager,
  resetContextManager,
  resolveContextOptions,
  CONTEXT_DIR_RELATIVE,
  estimateTokens,
  estimateMessagesTokens,
  estimateToolDefinitionsTokens,
  resolveModelScale,
  selectToolDefinitions,
  buildToolIndexText,
  truncateToolResult,
  compactHistory,
  ALWAYS_EXCLUDED_TOOLS,
  CORE_TOOL_NAMES,
  MEDIUM_EXCLUDED_TOOLS,
} from './agent/context/index.js';
export type {
  ContextAdjustment,
  ContextBuildInput,
  ContextBuildResult,
  ContextManagerOptions,
  ContextStats,
  ModelScale,
  TruncatedToolResult,
  ToolSelectionResult,
  CompactHistoryInput,
  CompactHistoryResult,
  TokenEstimatorOptions,
} from './agent/context/index.js';

// 多Agent协作协调器 🆕
export { MultiAgentCoordinator, PREDEFINED_ROLES } from './agent/MultiAgentCoordinator.js';
export type {
  AgentRole,
  SubTask,
  AgentInstance,
  CollaborationTask,
  CollaborationResult,
  CollaborationEvent,
  CollaborationEventType,
} from './agent/MultiAgentCoordinator.js';

// 工具系统 (69个工具，17个分组)
export {
  ToolRegistry,
  FileTools,
  FileExtraTools,
  SearchTools,
  ExecTools,
  CodeTools,
  ProjectTools,
  MemoryTools,
  getAllBuiltinTools,
} from './tools/index.js';
export type { ITool } from './tools/index.js';

// Git 高级工具 🆕
export {
  GitAdvancedTools,
  GitAutoCommitTool,
  GitRepoMapTool,
  GitStashTool,
  GitTagTool,
  GitCherryPickTool,
  GitReflogTool,
} from './tools/index.js';

// 会话管理
export { SessionManager } from './session/SessionManager.js';

// 数据库迁移机制 🆕（P1-5：PRAGMA user_version 版本戳 + 事务化迁移）
export { DatabaseMigrator, getUserVersion, tableExists, columnExists, addColumnIfMissing } from './db/DatabaseMigrator.js';
export type { Migration, MigrationResult } from './db/DatabaseMigrator.js';
export { SESSION_MIGRATIONS } from './db/sessionMigrations.js';

// 配置管理
export { ConfigManager, getConfigManager } from './config/ConfigManager.js';
export { PROVIDER_PRESETS } from './config/ProviderPresets.js';
export { ModelRegistry, getModelRegistry, resetModelRegistry } from './config/ModelRegistry.js';

// 工具函数
export { logger, createLogger, describeLogTarget, LogLevel } from './utils/logger.js';
export { encrypt, decrypt, hash } from './utils/encryption.js';
export { t, setLocale, getLocale, initI18n, zhCN, enUS } from './utils/i18n.js';
export type { Locale } from './utils/i18n.js';

// MCP 协议
export { MCPClient, MCPManager } from './mcp/index.js';
export type { MCPEventCallback } from './mcp/MCPClient.js';

// IM 适配器系统
export {
  BaseIMAdapter,
  TelegramAdapter,
  FeishuAdapter,
  WeChatAdapter,
  IMManager,
} from './im/index.js';
export type {
  IMPlatform,
  IMAdapterStatus,
  IMAdapterConfig,
  TelegramConfig,
  FeishuConfig,
  WeChatConfig,
  AnyIMConfig,
  IMMessage,
  IMAttachment,
  IMSendOptions,
  IMInlineButton,
  IMAdapterCallbacks,
  IMSessionMapping,
  IMAdapterEvent,
} from './im/index.js';
export type { MessageHandler, IMManagerOptions } from './im/index.js';

// 插件系统
export {
  PluginManager,
  getPluginManager,
  resetPluginManager,
  BUILTIN_SKILLS,
  CodeReviewSkill,
  UnitTestSkill,
  CodeExplainSkill,
  GenerateDocSkill,
  RefactorSkill,
  DebugSkill,
  getSkillsByTag,
  getSkillByName,
} from './plugins/index.js';
export type {
  IPlugin,
  IPluginContext,
  IPluginHook,
  ISkill,
  ISkillContext,
  LoadedPlugin,
  PluginManagerConfig,
  HookContext,
  HookEvent,
} from './plugins/index.js';

// Docker 沙箱系统 🆕
export { DockerSandbox, SandboxManager, checkDockerAvailability } from './sandbox/index.js';
export type {
  SandboxOptions,
  SandboxResult,
  SandboxLimits,
  SandboxInfo,
  SandboxStatus,
  SandboxManagerConfig,
} from './sandbox/index.js';

// 语义分析系统 🆕
export {
  buildSemanticMap,
  searchSymbol,
  findReferences,
  formatSemanticMap,
  getCodebaseOverview,
  analyzeFile,
  extractSymbols,
  collectSourceFiles,
  findRepoRoot,
} from './semantic/index.js';
export type {
  SymbolInfo,
  ReferenceInfo,
  FileSemanticInfo,
  SemanticMap,
  SupportedLanguage,
} from './semantic/index.js';

// 语义分析工具 🆕
export {
  SemanticTools,
  SemanticMapTool,
  SymbolSearchTool,
  ReferenceFindTool,
  CodebaseOverviewTool,
  FileStructureTool,
  resetSemanticCache,
} from './tools/index.js';

// 知识库服务 🆕
export { KnowledgeService } from './knowledge/index.js';
export type { DocIndex, KBStats, KBSearchResult, KBScope } from './knowledge/index.js';

// 自动化任务管理器 🆕
export { AutomationManager } from './automation/index.js';
export type {
  AutomationTask,
  AutomationRun,
  ScheduleType,
  TaskStatus,
  RunStatus,
  AutomationManagerOptions,
  AutomationEvents,
} from './automation/index.js';

// SWE-Bench 评测 🆕
export {
  SWEBenchEngine,
  scanSWEBenchData,
  BenchmarkRunner,
  loadBuiltinDataset,
  dryRunBenchmark,
} from './benchmark/index.js';
export type {
  SWEBenchProblem,
  EvaluationResult,
  EvaluationSession,
  EvaluationSummary,
  BenchmarkConfig,
  AgentBenchmarkConfig,
  BenchmarkProblemResult,
  BenchmarkAttempt,
  BenchmarkReport,
} from './benchmark/index.js';

// SWE-Bench 评测工具 🆕
export {
  BenchmarkTools,
  LoadBenchmarkTool,
  RunBenchmarkTool,
  BenchmarkReportTool,
  BenchmarkScanTool,
  resetBenchmarkEngine,
} from './tools/index.js';

// 用户行为分析 🆕 P2
export { AnalyticsEngine, getAnalyticsEngine, setAnalyticsEngine } from './analytics/index.js';
export type {
  AnalyticsEventType,
  AnalyticsEvent,
  NorthStarMetrics,
  DailyStats,
  UserFunnel,
  AnalyticsReport,
} from './analytics/index.js';
