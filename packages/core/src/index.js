/**
 * EasyAgent Core - 核心引擎入口
 * 导出所有核心模块
 */
// 适配器
export { BaseAdapter, OpenAICompatibleAdapter, ErnieAdapter, HunyuanAdapter, AdapterFactory, } from './adapters/index.js';
// Agent引擎
export { AgentEngine } from './agent/AgentEngine.js';
// 多Agent协作协调器 🆕
export { MultiAgentCoordinator, PREDEFINED_ROLES, } from './agent/MultiAgentCoordinator.js';
// 工具系统 (69个工具，17个分组)
export { ToolRegistry, FileTools, FileExtraTools, SearchTools, ExecTools, CodeTools, ProjectTools, MemoryTools, getAllBuiltinTools, } from './tools/index.js';
// Git 高级工具 🆕
export { GitAdvancedTools, GitAutoCommitTool, GitRepoMapTool, GitStashTool, GitTagTool, GitCherryPickTool, GitReflogTool, } from './tools/index.js';
// 会话管理
export { SessionManager } from './session/SessionManager.js';
// 配置管理
export { ConfigManager, getConfigManager } from './config/ConfigManager.js';
export { PROVIDER_PRESETS } from './config/ProviderPresets.js';
export { ModelRegistry, getModelRegistry, resetModelRegistry } from './config/ModelRegistry.js';
// 工具函数
export { logger, createLogger, LogLevel } from './utils/logger.js';
export { encrypt, decrypt, hash } from './utils/encryption.js';
export { t, setLocale, getLocale, initI18n, zhCN, enUS } from './utils/i18n.js';
// MCP 协议
export { MCPClient, MCPManager } from './mcp/index.js';
// IM 适配器系统
export { BaseIMAdapter, TelegramAdapter, FeishuAdapter, WeChatAdapter, IMManager, } from './im/index.js';
// 插件系统
export { PluginManager, getPluginManager, resetPluginManager, BUILTIN_SKILLS, CodeReviewSkill, UnitTestSkill, CodeExplainSkill, GenerateDocSkill, RefactorSkill, DebugSkill, getSkillsByTag, getSkillByName, } from './plugins/index.js';
// Docker 沙箱系统 🆕
export { DockerSandbox, SandboxManager, checkDockerAvailability, } from './sandbox/index.js';
// 语义分析系统 🆕
export { buildSemanticMap, searchSymbol, findReferences, formatSemanticMap, getCodebaseOverview, analyzeFile, extractSymbols, collectSourceFiles, findRepoRoot, } from './semantic/index.js';
// 语义分析工具 🆕
export { SemanticTools, SemanticMapTool, SymbolSearchTool, ReferenceFindTool, CodebaseOverviewTool, FileStructureTool, resetSemanticCache, } from './tools/index.js';
// SWE-Bench 评测 🆕
export { SWEBenchEngine, scanSWEBenchData, } from './benchmark/index.js';
// SWE-Bench 评测工具 🆕
export { BenchmarkTools, LoadBenchmarkTool, RunBenchmarkTool, BenchmarkReportTool, BenchmarkScanTool, resetBenchmarkEngine, } from './tools/index.js';
//# sourceMappingURL=index.js.map