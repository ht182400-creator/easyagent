import type { ITool } from './ToolRegistry.js';
/**
 * AI辅助自动提交
 * 分析当前变更, 生成合适的commit message并提交
 */
export declare const GitAutoCommitTool: ITool;
/**
 * 仓库结构地图
 * 生成可视化的文件树结构，含模块关系分析
 */
export declare const GitRepoMapTool: ITool;
/**
 * Git Stash 管理
 */
export declare const GitStashTool: ITool;
/**
 * Git Tag 管理
 */
export declare const GitTagTool: ITool;
/**
 * Cherry-pick 挑选提交
 */
export declare const GitCherryPickTool: ITool;
/**
 * Git Reflog 查看
 */
export declare const GitReflogTool: ITool;
/** 高级Git工具集 */
export declare const GitAdvancedTools: ITool[];
//# sourceMappingURL=GitAdvancedTools.d.ts.map