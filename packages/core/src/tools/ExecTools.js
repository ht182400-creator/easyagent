/**
 * 命令执行与Git操作工具集
 * 提供Shell命令执行和Git相关操作
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const isWindows = process.platform === 'win32';
/**
 * 危险命令模式
 */
const DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//,
    /sudo\s+rm/,
    /:\s*\(\)\s*\{/,
    />\s*\/dev\/sda/,
    /mkfs\./,
    /dd\s+if=/,
    /chmod\s+777/,
    /git\s+push\s+--force/,
    /git\s+push\s+-f\s+origin/,
    /npm\s+unpublish/,
    /del\s+\/f\s+\/s\s+C:\\/i,
    /format\s+[a-z]:/i,
];
/**
 * 检查是否为危险命令
 */
function isDangerous(command) {
    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(command)) {
            return true;
        }
    }
    return false;
}
/**
 * 执行命令工具
 */
export const ExecTool = {
    name: 'exec',
    description: `执行Shell命令并返回输出结果。请谨慎使用，尤其是破坏性操作。
- 对于需要用户交互的命令，使用非交互模式
- 避免执行长时间运行的命令
- 工作目录已设置为当前项目根目录`,
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: '要执行的命令',
            },
            timeout: {
                type: 'number',
                description: '命令超时时间(毫秒)，默认30000',
            },
        },
        required: ['command'],
    },
    async execute(params, context) {
        try {
            const command = params.command;
            const timeout = params.timeout || 30000;
            // 危险命令检查
            if (isDangerous(command)) {
                return {
                    success: false,
                    content: `⚠️ 命令包含潜在危险操作，已被阻止。如确实需要，请手动在终端执行。\n命令: ${command}`,
                    error: 'DANGEROUS_COMMAND',
                };
            }
            const shell = isWindows ? 'powershell.exe' : '/bin/bash';
            const encoding = 'utf-8';
            const output = execSync(command, {
                encoding,
                cwd: context.workspace,
                timeout,
                maxBuffer: 10 * 1024 * 1024,
                shell,
                windowsHide: true,
            });
            const trimmed = output.trim();
            return {
                success: true,
                content: trimmed || '(命令执行成功，无输出)',
                metadata: {
                    command,
                    cwd: context.workspace,
                    outputLength: trimmed.length,
                },
            };
        }
        catch (error) {
            const err = error;
            const msg = err.stderr || err.stdout || err.message;
            return {
                success: false,
                content: `命令执行失败:\n${String(msg).substring(0, 2000)}`,
                error: err.message,
                metadata: {
                    exitCode: err.status,
                },
            };
        }
    },
};
/**
 * Git状态工具
 */
export const GitStatusTool = {
    name: 'git_status',
    description: '查看Git仓库状态，包括修改、暂存、未跟踪的文件。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Git仓库路径，默认为工作区',
            },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const repoPath = params.path ? params.path : context.workspace;
            if (!existsSync(repoPath)) {
                return { success: false, content: `路径不存在: ${repoPath}` };
            }
            const output = execSync('git status --short', {
                encoding: 'utf-8',
                cwd: repoPath,
                timeout: 10000,
            });
            const trimmed = output.trim();
            return {
                success: true,
                content: trimmed || '工作区干净，没有待提交的更改。',
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Git状态查询失败: ${msg}` };
        }
    },
};
/**
 * Git差异工具
 */
export const GitDiffTool = {
    name: 'git_diff',
    description: '查看Git仓库的代码差异。可以比较暂存区、工作区或两个提交之间。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            staged: {
                type: 'boolean',
                description: '是否只显示暂存区差异',
            },
            path: {
                type: 'string',
                description: '限定查看某个文件或目录的差异',
            },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const staged = params.staged;
            const targetPath = params.path || '.';
            const args = ['diff'];
            if (staged)
                args.push('--staged');
            args.push('--', targetPath);
            const output = execSync(`git ${args.join(' ')}`, {
                encoding: 'utf-8',
                cwd: context.workspace,
                timeout: 15000,
                maxBuffer: 5 * 1024 * 1024,
            });
            const trimmed = output.trim();
            return {
                success: true,
                content: trimmed || '没有差异。',
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Git差异查询失败: ${msg}` };
        }
    },
};
/**
 * Git日志工具
 */
export const GitLogTool = {
    name: 'git_log',
    description: '查看Git提交历史。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            count: {
                type: 'number',
                description: '显示的提交数量，默认10',
            },
            format: {
                type: 'string',
                enum: ['oneline', 'medium', 'full'],
                description: '输出格式',
            },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const count = params.count || 10;
            const format = params.format || 'oneline';
            const args = ['log', `-${count}`];
            if (format === 'oneline') {
                args.push('--oneline', '--decorate');
            }
            const output = execSync(`git ${args.join(' ')}`, {
                encoding: 'utf-8',
                cwd: context.workspace,
                timeout: 10000,
            });
            return {
                success: true,
                content: output.trim() || '暂无提交记录。',
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Git日志查询失败: ${msg}` };
        }
    },
};
/**
 * Git分支管理工具
 */
export const GitBranchTool = {
    name: 'git_branch',
    description: '查看和管理Git分支。可列出所有分支、创建新分支、删除分支、切换分支。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['list', 'create', 'delete', 'switch'], description: '操作: list(列表)/create(创建)/delete(删除)/switch(切换)' },
            branchName: { type: 'string', description: '分支名称(create/delete/switch时需要)' },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const action = params.action || 'list';
            const branchName = params.branchName;
            switch (action) {
                case 'list': {
                    const output = execSync('git branch -a', { encoding: 'utf-8', cwd: context.workspace, timeout: 10000 });
                    return { success: true, content: output.trim() };
                }
                case 'create': {
                    if (!branchName)
                        return { success: false, content: '请指定分支名称' };
                    execSync(`git branch ${branchName}`, { cwd: context.workspace, timeout: 10000 });
                    return { success: true, content: `已创建分支: ${branchName}` };
                }
                case 'delete': {
                    if (!branchName)
                        return { success: false, content: '请指定分支名称' };
                    execSync(`git branch -d ${branchName}`, { cwd: context.workspace, timeout: 10000 });
                    return { success: true, content: `已删除分支: ${branchName}` };
                }
                case 'switch': {
                    if (!branchName)
                        return { success: false, content: '请指定分支名称' };
                    execSync(`git checkout ${branchName}`, { cwd: context.workspace, timeout: 10000 });
                    return { success: true, content: `已切换到分支: ${branchName}` };
                }
                default:
                    return { success: false, content: `不支持的操作: ${action}` };
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Git分支操作失败: ${msg}` };
        }
    },
};
/**
 * Git Blame工具 - 查看代码所属
 */
export const GitBlameTool = {
    name: 'git_blame',
    description: '查看文件每一行的最后修改者和提交信息。用于了解代码历史归属。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            filePath: { type: 'string', description: '要查看的文件路径(相对于工作区)' },
            lineStart: { type: 'number', description: '起始行号(可选)' },
            lineEnd: { type: 'number', description: '结束行号(可选)' },
        },
        required: ['filePath'],
    },
    async execute(params, context) {
        try {
            const filePath = params.filePath;
            const args = ['blame', '--date=short'];
            if (params.lineStart && params.lineEnd) {
                args.push('-L', `${params.lineStart},${params.lineEnd}`);
            }
            args.push('--', filePath);
            const output = execSync(`git ${args.join(' ')}`, {
                cwd: context.workspace, encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024,
            });
            return { success: true, content: output.trim() || '无blame信息' };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Git blame查询失败: ${msg}` };
        }
    },
};
/**
 * Git提交工具 - 创建新提交
 */
export const GitCommitTool = {
    name: 'git_commit',
    description: '暂存文件变更并创建Git提交。会自动执行 git add 再 git commit。需要用户确认。',
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            message: { type: 'string', description: '提交信息' },
            files: { type: 'array', items: { type: 'string', description: '文件路径' }, description: '要暂存的文件路径列表(相对于工作区), 不指定则提交所有变更' },
            amend: { type: 'boolean', description: '是否修改上一次提交(amend), 默认false' },
        },
        required: ['message'],
    },
    async execute(params, context) {
        try {
            const message = params.message;
            const files = params.files;
            const amend = params.amend || false;
            // 暂存文件
            if (files && files.length > 0) {
                execSync(`git add ${files.join(' ')}`, { cwd: context.workspace, timeout: 10000 });
            }
            else {
                execSync('git add -A', { cwd: context.workspace, timeout: 10000 });
            }
            // 提交
            const commitArgs = ['commit', '-m', `"${message.replace(/"/g, '\\"')}"`];
            if (amend)
                commitArgs.push('--amend', '--no-edit');
            const output = execSync(`git ${commitArgs.join(' ')}`, { cwd: context.workspace, encoding: 'utf-8', timeout: 30000 });
            return { success: true, content: output.trim() || '提交成功' };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `Git提交失败: ${msg}` };
        }
    },
};
/** 执行与Git工具 */
export const ExecTools = [ExecTool, GitStatusTool, GitDiffTool, GitLogTool, GitBranchTool, GitBlameTool, GitCommitTool];
//# sourceMappingURL=ExecTools.js.map