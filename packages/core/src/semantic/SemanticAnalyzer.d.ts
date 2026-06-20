/** 支持的编程语言 */
export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'json' | 'tsx' | 'jsx' | 'css' | 'html' | 'markdown' | 'rust' | 'go' | 'java' | 'c' | 'cpp';
/** 符号提取结果 */
export interface SymbolInfo {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'import' | 'export' | 'enum' | 'method';
    line: number;
    column: number;
    filePath: string;
    signature?: string;
    visibility?: 'public' | 'private' | 'protected';
    context?: string;
}
/** 引用关系 */
export interface ReferenceInfo {
    symbol: string;
    filePath: string;
    line: number;
    kind: 'definition' | 'reference' | 'import';
}
/** 文件语义信息 */
export interface FileSemanticInfo {
    filePath: string;
    language: SupportedLanguage;
    symbols: SymbolInfo[];
    imports: string[];
    exports: string[];
    lineCount: number;
    size: number;
}
/** 语义地图 */
export interface SemanticMap {
    root: string;
    files: FileSemanticInfo[];
    symbolIndex: Map<string, SymbolInfo[]>;
    referenceGraph: Map<string, ReferenceInfo[]>;
    stats: {
        totalFiles: number;
        totalLines: number;
        totalSymbols: number;
        languages: Record<string, number>;
    };
}
/** 检测仓库根目录 */
export declare function findRepoRoot(startPath: string): string;
/**
 * 递归收集目录中所有源文件
 */
export declare function collectSourceFiles(root: string, maxDepth?: number): string[];
/**
 * 从文件内容中提取符号
 */
export declare function extractSymbols(filePath: string, language: SupportedLanguage): SymbolInfo[];
/**
 * 分析文件语义信息
 */
export declare function analyzeFile(filePath: string): FileSemanticInfo;
/**
 * 构建完整语义地图
 */
export declare function buildSemanticMap(rootPath: string, maxDepth?: number, maxFiles?: number): SemanticMap;
/**
 * 搜索符号定义
 */
export declare function searchSymbol(map: SemanticMap, query: string, caseSensitive?: boolean): SymbolInfo[];
/**
 * 查找符号的所有引用位置
 */
export declare function findReferences(map: SemanticMap, symbolName: string, workspaceRoot?: string): ReferenceInfo[];
/**
 * 生成语义地图的文本表示
 */
export declare function formatSemanticMap(map: SemanticMap): string;
/**
 * 快速获取代码库概览（不解析符号，仅统计和文件树）
 */
export declare function getCodebaseOverview(rootPath: string): {
    root: string;
    fileTree: string;
    stats: {
        totalFiles: number;
        totalLines: number;
        totalSize: number;
        languages: Record<string, number>;
    };
};
//# sourceMappingURL=SemanticAnalyzer.d.ts.map