import type { SandboxOptions, SandboxResult, SandboxInfo } from './DockerSandbox.js';
/** 本地进程沙箱实例 */
export declare class LocalSandbox {
    /** 沙箱唯一ID */
    readonly id: string;
    /** 沙箱状态 */
    private status;
    /** 创建选项 */
    private options;
    /** 镜像（仅用于展示，本地模式不拉取镜像） */
    private image;
    constructor(options?: SandboxOptions);
    /**
     * 启动沙箱（本地模式下无需启动容器，仅标记状态）
     */
    start(): Promise<void>;
    /**
     * 执行命令
     * 使用 child_process.spawn 直接执行，带超时和输出限制
     */
    exec(command: string, timeout?: number): Promise<SandboxResult>;
    /**
     * 获取沙箱状态
     */
    getStatus(): SandboxInfo;
    /**
     * 停止沙箱（本地模式无需清理进程，仅标记状态）
     */
    stop(): Promise<void>;
    /**
     * 检测本地执行环境是否可用
     */
    static checkAvailability(): {
        available: boolean;
        version?: string;
        error?: string;
    };
}
//# sourceMappingURL=LocalSandbox.d.ts.map