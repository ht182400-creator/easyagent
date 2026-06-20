import type { ITool } from './ToolRegistry.js';
/**
 * 存储记忆工具
 * 将信息持久化到工作区的 .easyagent/memory 目录
 */
export declare const RememberTool: ITool;
/**
 * 检索记忆工具
 * 从工作区记忆库中检索信息
 */
export declare const RecallTool: ITool;
/**
 * 忘记记忆工具
 */
export declare const ForgetTool: ITool;
/** 记忆/知识库工具集 */
export declare const MemoryTools: ITool[];
//# sourceMappingURL=MemoryTools.d.ts.map