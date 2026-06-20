/**
 * 子Agent/任务委派工具集 v2
 * 提供多Agent协作、任务委派、并行执行等功能
 * 基于 MultiAgentCoordinator 实现真实的任务分解和Agent调度
 */
import type { ITool } from './ToolRegistry.js';
/** 重置协调器（测试用） */
export declare function resetCoordinator(): void;
/**
 * 任务委派工具 v2 - 由多Agent协调器处理
 * 支持自动任务分解、Agent匹配、并行执行
 */
export declare const DelegateTaskTool: ITool;
/**
 * 列出可用子Agent v2 - 基于预定义角色
 */
export declare const ListSubAgentsTool: ITool;
/**
 * 安装运行时工具
 * 安装指定版本的Node.js或Python运行时
 */
export declare const InstallRuntimeTool: ITool;
/** 子Agent任务委派工具集 */
export declare const SubAgentTools: ITool[];
//# sourceMappingURL=SubAgentTools.d.ts.map