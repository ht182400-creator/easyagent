import type { ITool } from './ToolRegistry.js';
/**
 * 执行SQL查询工具
 * 通过 better-sqlite3 或 Node.js 内置模块执行只读SQL查询
 */
export declare const QueryDBTool: ITool;
/**
 * 查看数据库Schema
 * 列出表结构、索引、关系等
 */
export declare const DBSchemaTool: ITool;
/** 数据库操作工具集 */
export declare const DatabaseTools: ITool[];
//# sourceMappingURL=DatabaseTools.d.ts.map