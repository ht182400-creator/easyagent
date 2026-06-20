import type { ITool } from './ToolRegistry.js';
/**
 * Lint检查工具
 * 自动检测项目类型并运行对应的Linter
 */
export declare const LintCodeTool: ITool;
/**
 * 代码格式化工具
 * 自动检测项目类型并运行格式化工具
 */
export declare const FormatCodeTool: ITool;
/**
 * 读取Linter诊断信息
 * 获取文件的LSP诊断信息(错误/警告/提示)
 */
export declare const ReadLintsTool: ITool;
/**
 * 类型检查工具
 * 针对TypeScript项目运行类型检查
 */
export declare const TypeCheckTool: ITool;
/** 代码质量工具集 */
export declare const QualityTools: ITool[];
//# sourceMappingURL=QualityTools.d.ts.map