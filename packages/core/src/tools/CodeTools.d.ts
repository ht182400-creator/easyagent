import type { ITool } from './ToolRegistry.js';
/**
 * 代码统计工具
 * 统计文件/目录的代码行数、文件数、语言分布等
 */
export declare const CodeStatsTool: ITool;
/**
 * 运行测试工具
 * 自动检测项目类型并运行测试（支持 npm run test / pytest / go test）
 */
export declare const RunTestsTool: ITool;
/**
 * 查找导入/依赖工具
 * 查找指定符号或模块在项目中的导入位置
 */
export declare const FindImportsTool: ITool;
/**
 * 查找定义工具
 * 搜索代码中的函数/类/变量定义
 */
export declare const FindDefinitionsTool: ITool;
/** 代码分析工具集 */
export declare const CodeTools: ITool[];
//# sourceMappingURL=CodeTools.d.ts.map