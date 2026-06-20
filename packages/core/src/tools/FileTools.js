/**
 * 文件操作工具集
 * 提供文件读取、写入、编辑、删除等操作
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
/**
 * 安全路径验证
 * 确保操作目标在工作区范围内
 */
function safePath(workspace, targetPath) {
    const resolved = resolve(workspace, targetPath);
    const normalizedWorkspace = resolve(workspace);
    if (!resolved.startsWith(normalizedWorkspace)) {
        throw new Error(`安全限制: 无法访问工作区外的路径 "${targetPath}"`);
    }
    return resolved;
}
/**
 * 读取文件工具
 */
export const ReadFileTool = {
    name: 'read_file',
    description: '读取文件内容。支持按行号范围读取，适用于查看代码文件。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: '要读取的文件路径(相对于工作区)',
            },
            offset: {
                type: 'number',
                description: '起始行号(从1开始)',
            },
            limit: {
                type: 'number',
                description: '读取行数',
            },
        },
        required: ['filePath'],
    },
    async execute(params, context) {
        try {
            const filePath = safePath(context.workspace, params.filePath);
            if (!existsSync(filePath)) {
                return { success: false, content: `文件不存在: ${params.filePath}`, error: 'FILE_NOT_FOUND' };
            }
            const stat = statSync(filePath);
            if (stat.isDirectory()) {
                return { success: false, content: `${params.filePath} 是目录，不是文件`, error: 'IS_DIRECTORY' };
            }
            // 文件大小限制 (最大10MB)
            if (stat.size > 10 * 1024 * 1024) {
                return { success: false, content: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，限制10MB` };
            }
            const content = readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const offset = (params.offset || 1) - 1;
            const limit = params.limit || lines.length;
            const selectedLines = lines.slice(offset, offset + limit);
            const result = selectedLines
                .map((line, i) => `${String(offset + i + 1).padStart(6, ' ')}: ${line}`)
                .join('\n');
            return {
                success: true,
                content: result,
                metadata: {
                    path: relative(context.workspace, filePath),
                    totalLines: lines.length,
                    shownLines: selectedLines.length,
                    offset: offset + 1,
                    limit,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `读取文件失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 写入文件工具
 */
export const WriteFileTool = {
    name: 'write_file',
    description: '创建或覆写文件。会创建必要的父目录。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: '要写入的文件路径(相对于工作区)',
            },
            content: {
                type: 'string',
                description: '文件内容',
            },
        },
        required: ['filePath', 'content'],
    },
    async execute(params, context) {
        try {
            const filePath = safePath(context.workspace, params.filePath);
            const content = params.content;
            // 创建父目录
            const dir = dirname(filePath);
            const { mkdirSync } = await import('node:fs');
            mkdirSync(dir, { recursive: true });
            writeFileSync(filePath, content, 'utf-8');
            const lines = content.split('\n').length;
            const size = Buffer.byteLength(content, 'utf-8');
            return {
                success: true,
                content: `文件已写入: ${params.filePath} (${lines}行, ${size}字节)`,
                metadata: {
                    path: relative(context.workspace, filePath),
                    lines,
                    size,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `写入文件失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 精确编辑文件工具
 * 使用精确字符串替换
 */
export const EditFileTool = {
    name: 'edit_file',
    description: '精确编辑文件。提供原始字符串和替换字符串，只替换第一次出现的内容。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: '要编辑的文件路径(相对于工作区)',
            },
            oldString: {
                type: 'string',
                description: '要被替换的原始字符串(必须与文件中的内容完全一致)',
            },
            newString: {
                type: 'string',
                description: '替换后的新字符串',
            },
        },
        required: ['filePath', 'oldString', 'newString'],
    },
    async execute(params, context) {
        try {
            const filePath = safePath(context.workspace, params.filePath);
            const oldStr = params.oldString;
            const newStr = params.newString;
            if (!existsSync(filePath)) {
                return { success: false, content: `文件不存在: ${params.filePath}`, error: 'FILE_NOT_FOUND' };
            }
            const content = readFileSync(filePath, 'utf-8');
            // 检查oldString在文件中出现的次数
            const occurrences = content.split(oldStr).length - 1;
            if (occurrences === 0) {
                return {
                    success: false,
                    content: `未找到匹配的原始字符串。请确认oldString与文件内容完全一致。`,
                    error: 'NO_MATCH',
                };
            }
            if (occurrences > 1) {
                return {
                    success: false,
                    content: `原始字符串在文件中出现了${occurrences}次。请提供更具体的上下文使其唯一。`,
                    error: 'MULTIPLE_MATCHES',
                };
            }
            const newContent = content.replace(oldStr, newStr);
            writeFileSync(filePath, newContent, 'utf-8');
            return {
                success: true,
                content: `文件已编辑: ${params.filePath}`,
                metadata: {
                    path: relative(context.workspace, filePath),
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `编辑文件失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 删除文件工具
 */
export const DeleteFileTool = {
    name: 'delete_file',
    description: '删除指定文件。操作不可逆，请谨慎使用。',
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: '要删除的文件路径(相对于工作区)',
            },
        },
        required: ['filePath'],
    },
    async execute(params, context) {
        try {
            const filePath = safePath(context.workspace, params.filePath);
            if (!existsSync(filePath)) {
                return { success: false, content: `文件不存在: ${params.filePath}`, error: 'FILE_NOT_FOUND' };
            }
            unlinkSync(filePath);
            return {
                success: true,
                content: `文件已删除: ${params.filePath}`,
                metadata: { path: relative(context.workspace, filePath) },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `删除文件失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 列出目录工具
 */
export const ListDirTool = {
    name: 'list_dir',
    description: '列出目录内容，支持过滤模式。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            targetDirectory: {
                type: 'string',
                description: '目标目录路径(相对于工作区)',
            },
            ignoreGlobs: {
                type: 'array',
                items: { type: 'string', description: 'glob模式' },
                description: '忽略的glob模式列表',
            },
        },
        required: ['targetDirectory'],
    },
    async execute(params, context) {
        try {
            const dirPath = safePath(context.workspace, params.targetDirectory);
            if (!existsSync(dirPath)) {
                return { success: false, content: `目录不存在: ${params.targetDirectory}` };
            }
            const entries = readdirSync(dirPath, { withFileTypes: true });
            const result = entries
                .filter(e => !e.name.startsWith('.'))
                .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
                .join('\n');
            return {
                success: true,
                content: result || '(空目录)',
                metadata: {
                    path: relative(context.workspace, dirPath),
                    count: entries.length,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `列出目录失败: ${msg}`, error: msg };
        }
    },
};
/** 所有文件操作工具 */
export const FileTools = [ReadFileTool, WriteFileTool, EditFileTool, DeleteFileTool, ListDirTool];
//# sourceMappingURL=FileTools.js.map