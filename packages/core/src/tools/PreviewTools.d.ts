import type { ITool } from './ToolRegistry.js';
/**
 * 启动本地开发服务器工具
 * 自动检测项目类型并启动开发服务器
 */
export declare const StartServerTool: ITool;
/**
 * 预览URL工具
 * 在IDE内置浏览器中打开URL预览
 */
export declare const PreviewURLTool: ITool;
/**
 * 比较两个文件差异工具
 * 输出 unified diff 格式的差异
 */
export declare const DiffFilesTool: ITool;
/**
 * 向用户提问确认工具
 * 当Agent需要用户决策时使用
 */
export declare const AskUserTool: ITool;
/** 预览与交互工具集 */
export declare const PreviewTools: ITool[];
//# sourceMappingURL=PreviewTools.d.ts.map