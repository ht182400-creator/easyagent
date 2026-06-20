/**
 * 工具系统导出
 * 54个内置工具，14个分组
 */
export { ToolRegistry } from './ToolRegistry.js';
export type { ITool } from './ToolRegistry.js';

// 文件操作工具 (5个)
export { FileTools, ReadFileTool, WriteFileTool, EditFileTool, DeleteFileTool, ListDirTool } from './FileTools.js';

// 文件扩展工具 (4个)
export { FileExtraTools, FileInfoTool, CreateDirTool, MoveFileTool, BatchEditTool } from './FileExtraTools.js';

// 搜索工具 (4个)
export { SearchTools, GrepTool, GlobTool, WebSearchTool, WebFetchTool } from './SearchTools.js';

// 执行与Git工具 (7个)
export { ExecTools, ExecTool, GitStatusTool, GitDiffTool, GitLogTool, GitBranchTool, GitBlameTool, GitCommitTool } from './ExecTools.js';

// 代码分析工具 (4个)
export { CodeTools, CodeStatsTool, RunTestsTool, FindImportsTool, FindDefinitionsTool } from './CodeTools.js';

// 代码质量工具 (4个)
export { QualityTools, LintCodeTool, FormatCodeTool, ReadLintsTool, TypeCheckTool } from './QualityTools.js';

// 项目管理工具 (4个)
export { ProjectTools, ReadConfigTool, NpmRunTool, EnvInfoTool, ProjectStatsTool } from './ProjectTools.js';

// 记忆工具 (3个)
export { MemoryTools, RememberTool, RecallTool, ForgetTool } from './MemoryTools.js';

// 预览与交互工具 (4个)
export { PreviewTools, StartServerTool, PreviewURLTool, DiffFilesTool, AskUserTool } from './PreviewTools.js';

// 媒体操作工具 (3个)
export { MediaTools, ReadImageTool, GenerateImageTool, ScreenshotTool } from './MediaTools.js';

// 数据库工具 (2个)
export { DatabaseTools, QueryDBTool, DBSchemaTool } from './DatabaseTools.js';

// 知识库工具 (5个)
export { KnowledgeTools, KnowledgeAddTool, KnowledgeSearchTool, KnowledgeGetTool, KnowledgeListTool, KnowledgeRemoveTool } from './KnowledgeTools.js';

// 子Agent工具 (3个)
export { SubAgentTools, DelegateTaskTool, ListSubAgentsTool, InstallRuntimeTool } from './SubAgentTools.js';

// 沙箱工具 (3个) 🆕
export { SandboxTools, SandboxExecTool, SandboxStatusTool, SandboxCleanupTool } from './SandboxTools.js';

// Git高级工具 (6个) 🆕
export { GitAdvancedTools, GitAutoCommitTool, GitRepoMapTool, GitStashTool, GitTagTool, GitCherryPickTool, GitReflogTool } from './GitAdvancedTools.js';

// 语义分析工具 (5个) 🆕
export { SemanticTools, SemanticMapTool, SymbolSearchTool, ReferenceFindTool, CodebaseOverviewTool, FileStructureTool, resetSemanticCache } from './SemanticTools.js';

// SWE-Bench 评测工具 (4个) 🆕
export { BenchmarkTools, LoadBenchmarkTool, RunBenchmarkTool, BenchmarkReportTool, BenchmarkScanTool, resetBenchmarkEngine } from './BenchmarkTools.js';

/**
 * 获取所有内置工具 (69个: 17分组)
 */
export function getAllBuiltinTools() {
  return [
    ...require('./FileTools.js').FileTools,
    ...require('./FileExtraTools.js').FileExtraTools,
    ...require('./SearchTools.js').SearchTools,
    ...require('./ExecTools.js').ExecTools,
    ...require('./CodeTools.js').CodeTools,
    ...require('./QualityTools.js').QualityTools,
    ...require('./ProjectTools.js').ProjectTools,
    ...require('./MemoryTools.js').MemoryTools,
    ...require('./PreviewTools.js').PreviewTools,
    ...require('./MediaTools.js').MediaTools,
    ...require('./DatabaseTools.js').DatabaseTools,
    ...require('./KnowledgeTools.js').KnowledgeTools,
    ...require('./SubAgentTools.js').SubAgentTools,
    ...require('./SandboxTools.js').SandboxTools,
    ...require('./GitAdvancedTools.js').GitAdvancedTools,
    ...require('./SemanticTools.js').SemanticTools,
    ...require('./BenchmarkTools.js').BenchmarkTools,
  ];
}
