/**
 * 工具系统导出
 * 54个内置工具，14个分组
 */
export { ToolRegistry } from './ToolRegistry.js';
export type { ITool } from './ToolRegistry.js';
import type { ITool } from './ToolRegistry.js';

// 文件操作工具 (5个)
export {
  FileTools,
  ReadFileTool,
  WriteFileTool,
  EditFileTool,
  DeleteFileTool,
  ListDirTool,
} from './FileTools.js';

// 文件扩展工具 (4个)
export {
  FileExtraTools,
  FileInfoTool,
  CreateDirTool,
  MoveFileTool,
  BatchEditTool,
} from './FileExtraTools.js';

// 搜索工具 (4个)
export { SearchTools, GrepTool, GlobTool, WebSearchTool, WebFetchTool } from './SearchTools.js';

// 执行与Git工具 (7个)
export {
  ExecTools,
  ExecTool,
  GitStatusTool,
  GitDiffTool,
  GitLogTool,
  GitBranchTool,
  GitBlameTool,
  GitCommitTool,
} from './ExecTools.js';

// 代码分析工具 (4个)
export {
  CodeTools,
  CodeStatsTool,
  RunTestsTool,
  FindImportsTool,
  FindDefinitionsTool,
} from './CodeTools.js';

// 代码质量工具 (4个)
export {
  QualityTools,
  LintCodeTool,
  FormatCodeTool,
  ReadLintsTool,
  TypeCheckTool,
} from './QualityTools.js';

// 项目管理工具 (4个)
export {
  ProjectTools,
  ReadConfigTool,
  NpmRunTool,
  EnvInfoTool,
  ProjectStatsTool,
} from './ProjectTools.js';

// 记忆工具 (3个)
export { MemoryTools, RememberTool, RecallTool, ForgetTool } from './MemoryTools.js';

// 预览与交互工具 (4个)
export {
  PreviewTools,
  StartServerTool,
  PreviewURLTool,
  DiffFilesTool,
  AskUserTool,
} from './PreviewTools.js';

// 媒体操作工具 (3个)
export { MediaTools, ReadImageTool, GenerateImageTool, ScreenshotTool } from './MediaTools.js';

// 数据库工具 (2个)
export { DatabaseTools, QueryDBTool, DBSchemaTool } from './DatabaseTools.js';

// 知识库工具 (5个)
export {
  KnowledgeTools,
  KnowledgeAddTool,
  KnowledgeSearchTool,
  KnowledgeGetTool,
  KnowledgeListTool,
  KnowledgeRemoveTool,
} from './KnowledgeTools.js';

// 子Agent工具 (3个)
export {
  SubAgentTools,
  DelegateTaskTool,
  ListSubAgentsTool,
  InstallRuntimeTool,
} from './SubAgentTools.js';

// 沙箱工具 (3个) 🆕
export {
  SandboxTools,
  SandboxExecTool,
  SandboxStatusTool,
  SandboxCleanupTool,
} from './SandboxTools.js';

// Git高级工具 (6个) 🆕
export {
  GitAdvancedTools,
  GitAutoCommitTool,
  GitRepoMapTool,
  GitStashTool,
  GitTagTool,
  GitCherryPickTool,
  GitReflogTool,
} from './GitAdvancedTools.js';

// 语义分析工具 (5个) 🆕
export {
  SemanticTools,
  SemanticMapTool,
  SymbolSearchTool,
  ReferenceFindTool,
  CodebaseOverviewTool,
  FileStructureTool,
  resetSemanticCache,
} from './SemanticTools.js';

// SWE-Bench 评测工具 (4个) 🆕
export {
  BenchmarkTools,
  LoadBenchmarkTool,
  RunBenchmarkTool,
  BenchmarkReportTool,
  BenchmarkScanTool,
  resetBenchmarkEngine,
} from './BenchmarkTools.js';

/**
 * 获取所有内置工具 (69个: 17模块, 自动标注分组)
 * 每个工具在注册时自动标记其所属分组，无需手动维护映射表
 */
export function getAllBuiltinTools() {
  return [
    ...require('./FileTools.js').FileTools.map((t: ITool) => ({ ...t, group: 'file' })),
    ...require('./FileExtraTools.js').FileExtraTools.map((t: ITool) => ({ ...t, group: 'file' })),
    ...require('./SearchTools.js').SearchTools.map((t: ITool) => ({ ...t, group: 'search' })),
    ...require('./ExecTools.js').ExecTools.map((t: ITool) => ({ ...t, group: 'exec' })),
    ...require('./CodeTools.js').CodeTools.map((t: ITool) => ({ ...t, group: 'code' })),
    ...require('./QualityTools.js').QualityTools.map((t: ITool) => ({ ...t, group: 'quality' })),
    ...require('./ProjectTools.js').ProjectTools.map((t: ITool) => ({ ...t, group: 'project' })),
    ...require('./MemoryTools.js').MemoryTools.map((t: ITool) => ({ ...t, group: 'memory' })),
    ...require('./PreviewTools.js').PreviewTools.map((t: ITool) => ({ ...t, group: 'preview' })),
    ...require('./MediaTools.js').MediaTools.map((t: ITool) => ({ ...t, group: 'media' })),
    ...require('./DatabaseTools.js').DatabaseTools.map((t: ITool) => ({ ...t, group: 'database' })),
    ...require('./KnowledgeTools.js').KnowledgeTools.map((t: ITool) => ({
      ...t,
      group: 'knowledge',
    })),
    ...require('./SubAgentTools.js').SubAgentTools.map((t: ITool) => ({ ...t, group: 'subagent' })),
    ...require('./SandboxTools.js').SandboxTools.map((t: ITool) => ({ ...t, group: 'exec' })),
    ...require('./GitAdvancedTools.js').GitAdvancedTools.map((t: ITool) => ({
      ...t,
      group: 'exec',
    })),
    ...require('./SemanticTools.js').SemanticTools.map((t: ITool) => ({ ...t, group: 'code' })),
    ...require('./BenchmarkTools.js').BenchmarkTools.map((t: ITool) => ({
      ...t,
      group: 'project',
    })),
  ];
}
