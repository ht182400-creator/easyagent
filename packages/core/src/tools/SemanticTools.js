import { logger } from '../utils/logger.js';
import { buildSemanticMap, searchSymbol, findReferences, formatSemanticMap, getCodebaseOverview, analyzeFile, } from '../semantic/index.js';
/** 缓存：避免重复构建大项目的语义地图 */
let _cachedMap = null;
let _cachedRoot = '';
let _cacheTime = 0;
const CACHE_TTL = 60000; // 60秒缓存
function getOrBuildMap(workspace, maxDepth = 6, maxFiles = 300) {
    const now = Date.now();
    if (_cachedMap && _cachedRoot === workspace && (now - _cacheTime) < CACHE_TTL) {
        return _cachedMap;
    }
    _cachedMap = buildSemanticMap(workspace, maxDepth, maxFiles);
    _cachedRoot = workspace;
    _cacheTime = now;
    return _cachedMap;
}
/** 清除缓存（测试用） */
export function resetSemanticCache() {
    _cachedMap = null;
    _cachedRoot = '';
    _cacheTime = 0;
}
/**
 * 语义地图工具 - 构建代码库语义地图
 */
export const SemanticMapTool = {
    name: 'code_semantic_map',
    description: '构建代码库的语义地图，包括文件树结构、符号定义（函数/类/接口/类型/变量）、引用关系和统计信息。帮助理解大型代码库的整体结构和组织方式。支持 JS/TS/Python/Rust/Go/Java 等语言。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: '要分析的代码库路径，默认为当前工作区',
            },
            maxDepth: {
                type: 'number',
                description: '最大目录深度，默认6',
            },
            maxFiles: {
                type: 'number',
                description: '最大文件数，默认300',
            },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const workspace = params.path || context?.workspace || process.cwd();
            const maxDepth = params.maxDepth || 6;
            const maxFiles = params.maxFiles || 300;
            const map = getOrBuildMap(workspace, maxDepth, maxFiles);
            const formatted = formatSemanticMap(map);
            return {
                success: true,
                content: formatted,
                metadata: {
                    workspace,
                    stats: map.stats,
                    symbolCount: map.symbolIndex.size,
                    cached: _cachedRoot === workspace,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '语义地图构建失败');
            return { success: false, content: `语义地图构建失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 符号搜索工具 - 在代码库中搜索符号定义
 */
export const SymbolSearchTool = {
    name: 'code_symbol_search',
    description: '在代码库中搜索符号（函数、类、接口、类型等）的定义位置。支持模糊搜索和精确匹配。可用于快速定位特定功能的实现位置。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '要搜索的符号名称（支持部分匹配）',
            },
            path: {
                type: 'string',
                description: '代码库路径，默认为当前工作区',
            },
            caseSensitive: {
                type: 'boolean',
                description: '是否区分大小写，默认false',
            },
            kind: {
                type: 'string',
                description: '过滤符号类型: function/class/interface/type/variable/enum/method',
                enum: ['function', 'class', 'interface', 'type', 'variable', 'enum', 'method'],
            },
        },
        required: ['query'],
    },
    async execute(params, context) {
        try {
            const query = params.query;
            const workspace = params.path || context?.workspace || process.cwd();
            const caseSensitive = params.caseSensitive || false;
            const kindFilter = params.kind;
            const map = getOrBuildMap(workspace);
            let results = searchSymbol(map, query, caseSensitive);
            if (kindFilter) {
                results = results.filter(s => s.kind === kindFilter);
            }
            const maxResults = 50;
            const limited = results.slice(0, maxResults);
            const lines = [
                `🔍 符号搜索: "${query}"`,
                `匹配结果: ${results.length} 个${results.length > maxResults ? ` (显示前${maxResults}个)` : ''}`,
                ``,
            ];
            if (limited.length === 0) {
                lines.push('未找到匹配的符号。');
            }
            else {
                for (const sym of limited) {
                    lines.push(`  ${sym.kind.toUpperCase().padEnd(10)} ${sym.name}${sym.signature ? ` ${sym.signature}` : ''} — ${sym.filePath}:${sym.line}`);
                }
            }
            return {
                success: true,
                content: lines.join('\n'),
                metadata: {
                    query,
                    totalResults: results.length,
                    shownResults: limited.length,
                    kindFilter,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '符号搜索失败');
            return { success: false, content: `符号搜索失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 引用查找工具 - 查找符号的所有引用位置
 */
export const ReferenceFindTool = {
    name: 'code_find_references',
    description: '查找指定符号在代码库中的所有引用位置。显示定义处和所有调用/使用位置，帮助理解代码的影响范围和依赖关系。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            symbol: {
                type: 'string',
                description: '要查找引用的符号名称（精确匹配）',
            },
            path: {
                type: 'string',
                description: '代码库路径，默认为当前工作区',
            },
        },
        required: ['symbol'],
    },
    async execute(params, context) {
        try {
            const symbol = params.symbol;
            const workspace = params.path || context?.workspace || process.cwd();
            const map = getOrBuildMap(workspace);
            const refs = findReferences(map, symbol, workspace);
            const definitions = refs.filter(r => r.kind === 'definition');
            const usages = refs.filter(r => r.kind === 'reference');
            const imports = refs.filter(r => r.kind === 'import');
            const lines = [
                `📎 符号引用分析: "${symbol}"`,
                `总引用数: ${refs.length} (${definitions.length} 定义, ${usages.length} 使用, ${imports.length} 导入)`,
                ``,
            ];
            if (definitions.length > 0) {
                lines.push('📝 定义:');
                for (const d of definitions.slice(0, 20)) {
                    lines.push(`  ${d.filePath}:${d.line}`);
                }
                lines.push('');
            }
            if (usages.length > 0) {
                lines.push('🔗 使用位置:');
                for (const u of usages.slice(0, 30)) {
                    lines.push(`  ${u.filePath}:${u.line}`);
                }
                if (usages.length > 30) {
                    lines.push(`  ... 还有 ${usages.length - 30} 处使用`);
                }
            }
            return {
                success: true,
                content: lines.join('\n'),
                metadata: {
                    symbol,
                    totalReferences: refs.length,
                    definitions: definitions.length,
                    usages: usages.length,
                    imports: imports.length,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '引用查找失败');
            return { success: false, content: `引用查找失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 代码库概览工具 - 快速获取项目统计信息
 */
export const CodebaseOverviewTool = {
    name: 'code_overview',
    description: '快速获取代码库的概览信息：文件结构树、语言分布、总行数/文件数统计。不解析符号，适合快速了解项目结构。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: '要分析的代码库路径，默认为当前工作区',
            },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const workspace = params.path || context?.workspace || process.cwd();
            const overview = getCodebaseOverview(workspace);
            const sizeMB = (overview.stats.totalSize / (1024 * 1024)).toFixed(2);
            const lines = [
                `📊 代码库概览`,
                `根目录: ${overview.root}`,
                ``,
                `📈 统计:`,
                `  文件数: ${overview.stats.totalFiles}`,
                `  总行数: ${overview.stats.totalLines.toLocaleString()}`,
                `  总大小: ${sizeMB} MB`,
                `  语言分布: ${Object.entries(overview.stats.languages)
                    .sort(([, a], [, b]) => b - a)
                    .map(([lang, count]) => `${lang}(${count})`)
                    .join(', ')}`,
                ``,
                `📁 文件结构:`,
                overview.fileTree,
            ];
            return {
                success: true,
                content: lines.join('\n'),
                metadata: {
                    workspace,
                    stats: overview.stats,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '代码库概览获取失败');
            return { success: false, content: `代码库概览获取失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 文件结构分析工具 - 分析单个文件的语义结构
 */
export const FileStructureTool = {
    name: 'code_file_structure',
    description: '分析单个文件的语义结构：列出文件中所有定义的函数、类、接口、类型、变量及其位置。帮助快速了解文件内部结构。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: '要分析的文件路径',
            },
        },
        required: ['filePath'],
    },
    async execute(params, context) {
        try {
            const filePath = params.filePath;
            const fs = await import('fs');
            if (!fs.existsSync(filePath)) {
                return { success: false, content: `文件不存在: ${filePath}` };
            }
            const info = analyzeFile(filePath);
            const relPath = filePath; // 使用绝对路径
            const lines = [
                `📄 文件结构分析: ${relPath}`,
                `语言: ${info.language}`,
                `行数: ${info.lineCount.toLocaleString()}`,
                `大小: ${(info.size / 1024).toFixed(1)} KB`,
                `符号数: ${info.symbols.length}`,
                ``,
            ];
            // 按类型分组显示
            const grouped = new Map();
            for (const sym of info.symbols) {
                if (!grouped.has(sym.kind))
                    grouped.set(sym.kind, []);
                grouped.get(sym.kind).push(sym);
            }
            for (const [kind, syms] of [...grouped.entries()].sort()) {
                lines.push(`  ${kind.toUpperCase()}:`);
                for (const sym of syms.slice(0, 20)) {
                    const sig = sym.signature ? ` ${sym.signature}` : '';
                    lines.push(`    L${String(sym.line).padStart(4)}: ${sym.name}${sig}`);
                }
                if (syms.length > 20) {
                    lines.push(`    ... 还有 ${syms.length - 20} 个${kind}`);
                }
                lines.push('');
            }
            if (info.imports.length > 0) {
                lines.push('📥 导入:');
                const uniqueImports = [...new Set(info.imports)].slice(0, 15);
                for (const imp of uniqueImports) {
                    lines.push(`  ${imp}`);
                }
            }
            if (info.exports.length > 0) {
                lines.push('');
                lines.push('📤 导出:');
                const uniqueExports = [...new Set(info.exports)].slice(0, 15);
                for (const exp of uniqueExports) {
                    lines.push(`  ${exp}`);
                }
            }
            return {
                success: true,
                content: lines.join('\n'),
                metadata: {
                    filePath,
                    language: info.language,
                    symbolCount: info.symbols.length,
                    lineCount: info.lineCount,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '文件结构分析失败');
            return { success: false, content: `文件结构分析失败: ${msg}`, error: msg };
        }
    },
};
/** 语义分析工具集 */
export const SemanticTools = [
    SemanticMapTool,
    SymbolSearchTool,
    ReferenceFindTool,
    CodebaseOverviewTool,
    FileStructureTool,
];
//# sourceMappingURL=SemanticTools.js.map