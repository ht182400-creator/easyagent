import type { ITool } from './ToolRegistry.js';
/**
 * 读取项目配置工具
 * 自动检测并读取 package.json / tsconfig.json / pyproject.toml 等
 */
export declare const ReadConfigTool: ITool;
/**
 * 运行 npm/pip/cargo 等包管理器命令
 */
export declare const NpmRunTool: ITool;
/**
 * 环境信息检测工具
 * 检测 Node/Python/Go 版本、OS、可用内存等
 */
export declare const EnvInfoTool: ITool;
/**
 * 项目结构概览工具
 * 快速了解项目目录结构和技术栈
 */
export declare const ProjectStatsTool: ITool;
/** 项目管理工具集 */
export declare const ProjectTools: ITool[];
//# sourceMappingURL=ProjectTools.d.ts.map