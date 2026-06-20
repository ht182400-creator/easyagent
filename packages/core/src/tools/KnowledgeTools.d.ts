import type { ITool } from './ToolRegistry.js';
/**
 * 添加文档到知识库
 * 支持 .md/.txt/.json/.csv 等文本文件
 */
export declare const KnowledgeAddTool: ITool;
/**
 * 检索知识库
 * 按关键词、分类、标签检索文档
 */
export declare const KnowledgeSearchTool: ITool;
/**
 * 获取知识库文档详情
 */
export declare const KnowledgeGetTool: ITool;
/**
 * 列出知识库所有文档
 */
export declare const KnowledgeListTool: ITool;
/**
 * 删除知识库文档
 */
export declare const KnowledgeRemoveTool: ITool;
/** 知识库工具集 */
export declare const KnowledgeTools: ITool[];
//# sourceMappingURL=KnowledgeTools.d.ts.map