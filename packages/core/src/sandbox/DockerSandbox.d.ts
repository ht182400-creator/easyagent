/** 沙箱资源限制 */
export interface SandboxLimits {
    /** CPU 核心数 (docker --cpus) */
    cpuCores?: number;
    /** 内存限制，如 "512m", "2g" (docker --memory) */
    memory?: string;
    /** 磁盘写入限制，如 "100m" (docker --device-write-bps) */
    diskWriteSpeed?: string;
    /** 最大进程数 (docker --pids-limit) */
    maxPids?: number;
}
/** 沙箱创建选项 */
export interface SandboxOptions {
    /** Docker 镜像，默认 "node:20-alpine" */
    image?: string;
    /** 工作区路径 (挂载到容器内) */
    workspace?: string;
    /** 容器内工作目录 */
    workdir?: string;
    /** 只读挂载? */
    readOnly?: boolean;
    /** 资源限制 */
    limits?: SandboxLimits;
    /** 环境变量 */
    env?: Record<string, string>;
    /** 命令执行超时 (毫秒) */
    timeout?: number;
    /** 是否允许网络访问 */
    allowNetwork?: boolean;
    /** 额外卷挂载 */
    volumes?: Array<{
        host: string;
        container: string;
        ro?: boolean;
    }>;
}
/** 沙箱执行结果 */
export interface SandboxResult {
    success: boolean;
    /** 标准输出 */
    stdout: string;
    /** 标准错误 */
    stderr: string;
    /** 退出码 */
    exitCode: number;
    /** 执行时长 (ms) */
    duration: number;
    /** 是否超时 */
    timedOut: boolean;
}
/** 沙箱状态 */
export type SandboxStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';
/** 沙箱信息 */
export interface SandboxInfo {
    id: string;
    containerId: string | null;
    status: SandboxStatus;
    image: string;
    workspace: string;
    createdAt: Date;
    limits: SandboxLimits;
}
/**
 * 重置 Docker 检测缓存 (主要用于测试)
 */
export declare function resetDockerCache(): void;
/**
 * 检测 Docker 是否可用
 */
export declare function checkDockerAvailability(): Promise<{
    available: boolean;
    version?: string;
    error?: string;
}>;
/**
 * Docker 沙箱实例
 * 管理单个容器的完整生命周期
 */
export declare class DockerSandbox {
    /** 沙箱唯一ID */
    readonly id: string;
    /** Docker 容器ID */
    private containerId;
    /** 沙箱状态 */
    private status;
    /** 创建选项 */
    private options;
    /** 镜像 */
    private image;
    constructor(options?: SandboxOptions);
    /**
     * 启动沙箱容器
     */
    start(): Promise<void>;
    /**
     * 在沙箱中执行命令
     */
    exec(command: string, timeout?: number): Promise<SandboxResult>;
    /**
     * 获取沙箱状态
     */
    getStatus(): SandboxInfo;
    /**
     * 停止并清理沙箱
     */
    stop(): Promise<void>;
    /**
     * 确保镜像存在
     */
    private ensureImage;
    /**
     * 构建 docker run 参数
     */
    private buildRunArgs;
    /**
     * 运行容器并返回 containerId
     */
    private runContainer;
}
//# sourceMappingURL=DockerSandbox.d.ts.map