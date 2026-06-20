/**
 * 项目管理工具集
 * 提供项目依赖管理、配置读取、环境检测等功能
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
/**
 * 读取项目配置工具
 * 自动检测并读取 package.json / tsconfig.json / pyproject.toml 等
 */
export const ReadConfigTool = {
    name: 'read_config',
    description: '读取项目配置文件(package.json, tsconfig.json, pyproject.toml, .env等)。方便了解项目依赖和配置。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            configFile: { type: 'string', description: '配置文件名, 如 package.json, tsconfig.json, 不指定则列出所有可用配置文件' },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const ws = context.workspace;
            const commonConfigs = ['package.json', 'tsconfig.json', '.eslintrc.json', '.prettierrc', 'pyproject.toml', 'Cargo.toml', 'go.mod', '.env.example', 'docker-compose.yml', 'Makefile'];
            if (params.configFile) {
                const filePath = resolve(ws, params.configFile);
                if (!existsSync(filePath)) {
                    return { success: false, content: `配置文件不存在: ${params.configFile}` };
                }
                const content = readFileSync(filePath, 'utf-8');
                return { success: true, content: `=== ${params.configFile} ===\n${content.slice(0, 10000)}` };
            }
            // 列出所有可用的配置文件
            const found = commonConfigs.filter((f) => existsSync(resolve(ws, f)));
            if (found.length === 0) {
                return { success: true, content: '工作区中未找到常见的配置文件' };
            }
            const info = found.map((f) => {
                const stat = require('node:fs').statSync(resolve(ws, f));
                return `  ${f} (${(stat.size / 1024).toFixed(1)}KB)`;
            }).join('\n');
            return { success: true, content: `可用的配置文件:\n${info}\n\n使用 configFile 参数读取指定文件内容` };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `读取配置失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 运行 npm/pip/cargo 等包管理器命令
 */
export const NpmRunTool = {
    name: 'package_run',
    description: '运行包管理器命令(npm/pip/cargo等)。适用 npm install/add/run、pip install、cargo build等。',
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            command: { type: 'string', description: '包管理器命令, 例如 npm install express, pip install requests, npm run build' },
            cwd: { type: 'string', description: '可选: 工作子目录, 默认为工作区根目录' },
        },
        required: ['command'],
    },
    async execute(params, context) {
        try {
            const { execSync } = await import('node:child_process');
            const cwd = params.cwd ? resolve(context.workspace, params.cwd) : context.workspace;
            const command = params.command;
            // 基本安全检查
            if (command.includes('sudo') || command.includes('chmod 777') || command.includes('rm -rf /')) {
                return { success: false, content: '拒绝执行危险命令', error: 'DANGEROUS_COMMAND' };
            }
            const output = execSync(command, { cwd, encoding: 'utf-8', timeout: 300000, maxBuffer: 1024 * 1024 * 5 });
            return { success: true, content: output.slice(-5000) || '命令执行成功(无输出)', metadata: { command, cwd: relative(context.workspace, cwd) } };
        }
        catch (error) {
            const msg = error.stdout || error.stderr || error.message || String(error);
            return { success: false, content: `包管理命令失败:\n${msg.slice(-3000)}`, error: 'PKG_CMD_FAILED' };
        }
    },
};
/**
 * 环境信息检测工具
 * 检测 Node/Python/Go 版本、OS、可用内存等
 */
export const EnvInfoTool = {
    name: 'env_info',
    description: '获取当前运行环境信息：操作系统、Node/Python/Go版本、内存、磁盘空间等。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {},
        required: [],
    },
    async execute(params, context) {
        try {
            const os = await import('node:os');
            const { execSync } = await import('node:child_process');
            const tryVersion = (cmd) => {
                try {
                    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
                }
                catch {
                    return '未安装';
                }
            };
            const info = [
                `操作系统: ${os.platform()} ${os.release()} (${os.arch()})`,
                `主机名: ${os.hostname()}`,
                `CPU: ${os.cpus()[0]?.model} (${os.cpus().length}核)`,
                `内存: 总计 ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)}GB, 可用 ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)}GB`,
                `工作区: ${context.workspace}`,
                `会话ID: ${context.sessionId}`,
                '',
                '运行环境:',
                `  Node.js: ${process.version}`,
                `  Python: ${tryVersion('python --version 2>&1 || python3 --version 2>&1')}`,
                `  Go: ${tryVersion('go version 2>&1')}`,
                `  Git: ${tryVersion('git --version 2>&1')}`,
                `  npm: ${tryVersion('npm --version 2>&1')}`,
            ].join('\n');
            return { success: true, content: info };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `获取环境信息失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 项目结构概览工具
 * 快速了解项目目录结构和技术栈
 */
export const ProjectStatsTool = {
    name: 'project_overview',
    description: '快速了解项目概览：技术栈、目录结构、关键文件。帮助理解项目整体情况。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {},
        required: [],
    },
    async execute(params, context) {
        try {
            const ws = context.workspace;
            const { readdirSync, statSync: fsStat } = await import('node:fs');
            const { join, relative: rel } = await import('node:path');
            // 检测技术栈
            const techStack = [];
            if (existsSync(join(ws, 'package.json'))) {
                const pkg = JSON.parse(readFileSync(join(ws, 'package.json'), 'utf-8'));
                techStack.push(`Node.js (${pkg.type || 'commonjs'})`);
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };
                if (deps.typescript)
                    techStack.push('TypeScript');
                if (deps.react)
                    techStack.push('React');
                if (deps.vue)
                    techStack.push('Vue');
                if (deps.express)
                    techStack.push('Express');
                if (deps.vite)
                    techStack.push('Vite');
                if (deps.tailwindcss)
                    techStack.push('Tailwind CSS');
                if (deps.electron)
                    techStack.push('Electron');
                if (deps.lucide)
                    techStack.push('Zustand');
            }
            if (existsSync(join(ws, 'go.mod')))
                techStack.push('Go');
            if (existsSync(join(ws, 'requirements.txt')) || existsSync(join(ws, 'pyproject.toml')))
                techStack.push('Python');
            if (existsSync(join(ws, 'Cargo.toml')))
                techStack.push('Rust');
            if (existsSync(join(ws, '.github')))
                techStack.push('GitHub CI');
            if (existsSync(join(ws, 'Dockerfile')))
                techStack.push('Docker');
            // 顶层目录结构
            const topEntries = readdirSync(ws, { withFileTypes: true })
                .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
                .map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ''}`);
            const result = [
                `技术栈: ${techStack.join(', ') || '未知'}`,
                `项目路径: ${ws}`,
                '',
                '顶层结构:',
                ...topEntries.map((e) => `  ${e}`),
            ].join('\n');
            return { success: true, content: result, metadata: { techStack } };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `项目概览失败: ${msg}`, error: msg };
        }
    },
};
/** 项目管理工具集 */
export const ProjectTools = [ReadConfigTool, NpmRunTool, EnvInfoTool, ProjectStatsTool];
//# sourceMappingURL=ProjectTools.js.map