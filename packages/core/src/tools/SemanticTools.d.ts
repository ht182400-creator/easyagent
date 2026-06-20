/**
 * 语义分析工具集
 * 提供代码库语义地图、符号搜索、引用分析等能力
 * 让LLM能够理解和分析大型代码库结构
 */
import type { ITool } from './ToolRegistry.js';
/** 清除缓存（测试用） */
export declare function resetSemanticCache(): void;
/**
 * 语义地图工具 - 构建代码库语义地图
 */
export declare const SemanticMapTool: ITool;
/**
 * 符号搜索工具 - 在代码库中搜索符号定义
 */
export declare const SymbolSearchTool: ITool;
/**
 * 引用查找工具 - 查找符号的所有引用位置
 */
export declare const ReferenceFindTool: ITool;
/**
 * 代码库概览工具 - 快速获取项目统计信息
 */
export declare const CodebaseOverviewTool: ITool;
/**
 * 文件结构分析工具 - 分析单个文件的语义结构
 */
export declare const FileStructureTool: ITool;
/** 语义分析工具集 */
export declare const SemanticTools: ITool[];
//# sourceMappingURL=SemanticTools.d.ts.map