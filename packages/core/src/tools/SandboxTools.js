import { SandboxManager } from '../sandbox/SandboxManager.js';
import { checkDockerAvailability } from '../sandbox/DockerSandbox.js';
import { logger } from '../utils/logger.js';
/** 获取或创建沙箱管理器单例 */
let sandboxManager = null;
function getManager() {
    if (!sandboxManager) {
        sandboxManager = SandboxManager.getInstance({
            maxSandboxes: 10,
            defaultTimeout: 300000,
            idleTimeout: 600000,
        });
    }
    return sandboxManager;
}
/**
 * 沙箱执行工具
 * 在隔离的Docker容器中安全执行代码或命令
 */
export const SandboxExecTool = {
    name: 'sandbox_exec',
    description: `在隔离的Docker沙箱中安全执行代码或命令。适用于:
- 运行不受信任的代码
- 测试可能影响系统的操作
- 隔离执行环境，避免影响主机
- 资源受限的执行（CPU/内存/磁盘限制）

特性:
- 完整文件系统隔离
- CPU/内存硬限制
- 超时自动终止
- 无网络模式(可选)
- 只读文件系统(可选)`,
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: '要在沙箱中执行的命令或脚本',
            },
            image: {
                type: 'string',
                description: 'Docker镜像，默认 node:20-alpine。也可用 python:3.12-alpine 等',
                default: 'node:20-alpine',
            },
            language: {
                type: 'string',
                enum: ['bash', 'node', 'python', 'auto'],
                description: '代码语言，auto表示根据命令自动判断',
                default: 'auto',
            },
            timeout: {
                type: 'number',
                description: '执行超时(毫秒)，默认30000, 最大300000',
                default: 30000,
            },
            readOnly: {
                type: 'boolean',
                description: '是否只读挂载工作区（禁止修改文件）',
                default: false,
            },
            allowNetwork: {
                type: 'boolean',
                description: '是否允许网络访问',
                default: false,
            },
            memoryLimit: {
                type: 'string',
                description: '内存限制，如 "256m", "512m", "1g"',
                default: '512m',
            },
            cpuLimit: {
                type: 'number',
                description: 'CPU核心数限制',
                default: 0.5,
            },
        },
        required: ['command'],
    },
    async execute(params, context) {
        try {
            const command = params.command;
            const image = params.image || 'node:20-alpine';
            const timeout = Math.min(params.timeout || 30000, 300000);
            const readOnly = params.readOnly || false;
            const allowNetwork = params.allowNetwork || false;
            const memoryLimit = params.memoryLimit || '512m';
            const cpuLimit = params.cpuLimit || 0.5;
            // 检测 Docker（仅用于信息展示，不影响执行流程）
            const dockerCheck = await checkDockerAvailability();
            const useDocker = dockerCheck.available;
            // 初始化沙箱管理器（Docker不可用时自动降级为本地模式）
            const manager = getManager();
            const initResult = await manager.init();
            if (!initResult.available && initResult.mode === 'disabled') {
                return {
                    success: false,
                    content: '沙箱功能已被禁用，请在设置中启用',
                    error: 'SANDBOX_DISABLED',
                };
            }
            const options = {
                image,
                workspace: context.workspace,
                readOnly,
                allowNetwork,
                limits: {
                    cpuCores: cpuLimit,
                    memory: memoryLimit,
                    maxPids: 50,
                },
                timeout,
            };
            const sandbox = await manager.createSandbox(options);
            // 执行命令
            const result = await sandbox.exec(command, timeout);
            // 构建输出
            const lines = [];
            if (result.success) {
                lines.push(`✓ 沙箱执行成功 (${result.duration}ms)`);
            }
            else if (result.timedOut) {
                lines.push(`⏱ 执行超时 (${result.duration}ms / ${timeout}ms)`);
            }
            else {
                lines.push(`✗ 执行失败 (退出码: ${result.exitCode}, ${result.duration}ms)`);
            }
            lines.push(``);
            if (result.stdout) {
                lines.push(`--- stdout ---`);
                lines.push(result.stdout.slice(0, 5000));
                if (result.stdout.length > 5000) {
                    lines.push(`... (已截断，总长度 ${result.stdout.length} 字符)`);
                }
            }
            if (result.stderr) {
                lines.push(`--- stderr ---`);
                lines.push(result.stderr.slice(0, 2000));
            }
            if (!result.stdout && !result.stderr) {
                lines.push(`(无输出)`);
            }
            lines.push(``);
            lines.push(`沙箱信息:`);
            const status = sandbox.getStatus();
            if (status.containerId === 'local') {
                lines.push(`  模式: 本地进程 (Docker 不可用时的降级方案)`);
            }
            else {
                lines.push(`  容器ID: ${status.containerId?.slice(0, 12) || 'N/A'}`);
            }
            lines.push(`  镜像: ${image}`);
            lines.push(`  模式: ${readOnly ? '只读' : '读写'}, 网络: ${allowNetwork ? '允许' : '隔离'}`);
            // 清理沙箱
            await manager.destroySandbox(sandbox.id);
            return {
                success: result.success,
                content: lines.join('\n'),
                metadata: {
                    sandboxId: sandbox.id,
                    exitCode: result.exitCode,
                    duration: result.duration,
                    timedOut: result.timedOut,
                    mode: useDocker ? 'docker' : 'local',
                    dockerVersion: dockerCheck.version,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ error: msg }, '沙箱执行工具失败');
            return {
                success: false,
                content: `沙箱执行失败: ${msg}`,
                error: msg,
            };
        }
    },
};
/**
 * 沙箱状态工具
 * 查看当前所有活跃沙箱的状态
 */
export const SandboxStatusTool = {
    name: 'sandbox_status',
    description: '查看Docker沙箱系统状态，包括所有活跃沙箱、Docker版本、资源使用情况。',
    requiresConfirm: false,
    parameters: {
        type: 'object',
        properties: {},
        required: [],
    },
    async execute(params, context) {
        try {
            const manager = getManager();
            const overview = manager.getOverview();
            const dockerCheck = await checkDockerAvailability();
            const lines = [
                `🐳 Docker 沙箱系统状态`,
                ``,
                `Docker 版本: ${dockerCheck.version || '(不可用)'}`,
                `沙箱功能: ${overview.enabled ? '已启用' : '已禁用'}`,
                `活跃沙箱: ${overview.activeCount} / ${overview.maxSandboxes}`,
                ``,
            ];
            if (overview.sandboxes.length > 0) {
                lines.push(`活跃沙箱列表:`);
                for (const box of overview.sandboxes) {
                    const age = Math.round((Date.now() - box.createdAt.getTime()) / 1000);
                    lines.push(`  • ${box.id.slice(0, 12)}... | ${box.status} | ${box.image} | 运行 ${age}s`);
                }
            }
            else {
                lines.push(`当前无活跃沙箱`);
            }
            return {
                success: true,
                content: lines.join('\n'),
                metadata: {
                    dockerAvailable: dockerCheck.available,
                    dockerVersion: dockerCheck.version,
                    activeSandboxes: overview.activeCount,
                    maxSandboxes: overview.maxSandboxes,
                },
            };
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `查询沙箱状态失败: ${msg}`, error: msg };
        }
    },
};
/**
 * 沙箱清理工具
 * 清理指定或所有沙箱资源
 */
export const SandboxCleanupTool = {
    name: 'sandbox_cleanup',
    description: '清理Docker沙箱资源。可指定清理单个沙箱或全部。释放被占用的系统资源。',
    requiresConfirm: true,
    parameters: {
        type: 'object',
        properties: {
            sandboxId: {
                type: 'string',
                description: '要清理的沙箱ID。不指定则清理所有沙箱',
            },
        },
        required: [],
    },
    async execute(params, context) {
        try {
            const sandboxId = params.sandboxId;
            const manager = getManager();
            if (sandboxId) {
                const sandbox = manager.getSandbox(sandboxId);
                if (!sandbox) {
                    return { success: false, content: `沙箱不存在: ${sandboxId}` };
                }
                await manager.destroySandbox(sandboxId);
                return {
                    success: true,
                    content: `✓ 沙箱已清理: ${sandboxId}`,
                    metadata: { cleaned: 1 },
                };
            }
            else {
                const overview = manager.getOverview();
                const count = overview.activeCount;
                await manager.destroyAll();
                return {
                    success: true,
                    content: `✓ 已清理 ${count} 个沙箱`,
                    metadata: { cleaned: count },
                };
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { success: false, content: `沙箱清理失败: ${msg}`, error: msg };
        }
    },
};
/** 沙箱工具集 */
export const SandboxTools = [SandboxExecTool, SandboxStatusTool, SandboxCleanupTool];
//# sourceMappingURL=SandboxTools.js.map