/**
 * 沙箱执行工具集
 * 提供安全的容器化代码执行能力
 *
 * 工具列表:
 * - sandbox_exec: 在Docker沙箱中安全执行代码
 * - sandbox_status: 查看沙箱状态和资源使用
 * - sandbox_cleanup: 清理沙箱资源
 */
import type { ITool } from './ToolRegistry.js';
/**
 * 沙箱执行工具
 * 在隔离的Docker容器中安全执行代码或命令
 */
export declare const SandboxExecTool: ITool;
/**
 * 沙箱状态工具
 * 查看当前所有活跃沙箱的状态
 */
export declare const SandboxStatusTool: ITool;
/**
 * 沙箱清理工具
 * 清理指定或所有沙箱资源
 */
export declare const SandboxCleanupTool: ITool;
/** 沙箱工具集 */
export declare const SandboxTools: ITool[];
//# sourceMappingURL=SandboxTools.d.ts.map