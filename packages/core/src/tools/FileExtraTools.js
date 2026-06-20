/**
 * 文件操作工具扩展集
 * 提供文件信息、目录创建、文件移动、批量编辑等高级操作
 */
import { existsSync, statSync, renameSync, mkdirSync } from 'node:fs';
import { relative, resolve, dirname, basename } from 'node:path';
/** 安全路径 */
function safePath(workspace, targetPath) {
    const resolved = resolve(workspace, targetPath);
    if (!resolved.startsWith(resolve(workspace))) {
        throw new Error(`安全限制: 无法访问工作区外的路径 "${targetPath}"`);
    }
    return resolved;
}
/**
 * 获取文件详细信息工具
 * 返回大小、修改时间、权限、行数、MD5等
 */
export const FileInfoTool = {
    name: 'file_info',
    description: '获取文件的详细信息：大小、修改时间、行数、MIME类型等。用于了解文件而不读取全部内容。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            filePath: {
                type: 'string',
                description: '文件路径(相对于工作区)',
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
            const { readFileSync } = await import('node:fs');
            let lineCount = 0;
            if (stat.isFile() && stat.size < 50 * 1024 * 1024) {
                lineCount = readFileSync(filePath, 'utf-8').split('\n').length;
            }
            const ext = basename(filePath).split('.').pop() || '';
            const info = [
                `路径: ${relative(context.workspace, filePath)}`,
                `类型: ${stat.isDirectory() ? '目录' : '文件'}`,
                `大小: ${(stat.size / 1024).toFixed(1)} KB (${stat.size} bytes)`,
                `行数: ${lineCount || 'N/A'}`,
                `修改时间: ${stat.mtime.toISOString()}`,
                `创建时间: ${stat.birthtime.toISOString()}`,
                `扩展名: .${ext}`,
                `权限: ${stat.mode.toString(8).slice(-3)}`,
            ].join('\n');
            return { success: true, content: info, metadata: { path: relative(context.workspace, filePath), size: stat.size, lineCount } };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `获取文件信息失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 创建目录工具
 */
export const CreateDirTool = {
    name: 'create_dir',
    description: '创建目录(自动创建父目录)。如果目录已存在则静默成功。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: { dirPath: { type: 'string', description: '要创建的目录路径(相对于工作区)' } },
        required: ['dirPath'],
    },
    async execute(params, context) {
        try {
            const dirPath = safePath(context.workspace, params.dirPath);
            if (existsSync(dirPath)) {
                return { success: true, content: `目录已存在: ${params.dirPath}` };
            }
            mkdirSync(dirPath, { recursive: true });
            return { success: true, content: `目录已创建: ${params.dirPath}` };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `创建目录失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 移动/重命名文件工具
 */
export const MoveFileTool = {
    name: 'move_file',
    description: '移动或重命名文件/目录。sourcePath和destPath都相对于工作区。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            sourcePath: { type: 'string', description: '源文件路径(相对于工作区)' },
            destPath: { type: 'string', description: '目标文件路径(相对于工作区)' },
        },
        required: ['sourcePath', 'destPath'],
    },
    async execute(params, context) {
        try {
            const src = safePath(context.workspace, params.sourcePath);
            const dest = safePath(context.workspace, params.destPath);
            if (!existsSync(src)) {
                return { success: false, content: `源文件不存在: ${params.sourcePath}`, error: 'FILE_NOT_FOUND' };
            }
            mkdirSync(dirname(dest), { recursive: true });
            renameSync(src, dest);
            return { success: true, content: `已移动: ${params.sourcePath} → ${params.destPath}` };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `移动文件失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 批量正则替换工具
 * 支持在整个项目中批量替换文本
 */
export const BatchEditTool = {
    name: 'batch_edit',
    description: '在指定文件中执行正则替换。指定pattern和replacement，支持全局替换。可用于批量重构。',
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: '要编辑的文件路径(相对于工作区)' },
            pattern: { type: 'string', description: '正则表达式模式' },
            replacement: { type: 'string', description: '替换字符串(支持$1等捕获组)' },
            flags: { type: 'string', description: '正则标志(g=全局,i=忽略大小写,m=多行), 默认g' },
        },
        required: ['filePath', 'pattern', 'replacement'],
    },
    async execute(params, context) {
        try {
            const filePath = safePath(context.workspace, params.filePath);
            const { readFileSync, writeFileSync } = await import('node:fs');
            if (!existsSync(filePath)) {
                return { success: false, content: `文件不存在: ${params.filePath}`, error: 'FILE_NOT_FOUND' };
            }
            const content = readFileSync(filePath, 'utf-8');
            const pattern = params.pattern;
            const replacement = params.replacement;
            const flags = params.flags || 'g';
            const regex = new RegExp(pattern, flags);
            const matchCount = (content.match(regex) || []).length;
            if (matchCount === 0) {
                return { success: false, content: `未找到匹配 "${pattern}" 的内容` };
            }
            const newContent = content.replace(regex, replacement);
            writeFileSync(filePath, newContent, 'utf-8');
            return { success: true, content: `批量编辑完成: ${matchCount}处替换`, metadata: { matchCount } };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `批量编辑失败: ${msg}`, error: msg };
        }
    },
};
/** 文件操作扩展工具集 */
export const FileExtraTools = [FileInfoTool, CreateDirTool, MoveFileTool, BatchEditTool];
//# sourceMappingURL=FileExtraTools.js.map