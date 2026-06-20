/**
 * 沙箱管理器
 * 管理多个 Docker 沙箱实例的生命周期，支持:
 * - 多沙箱并发管理
 * - 资源池化与复用
 * - 自动清理超时沙箱
 * - 全局资源配额控制
 */
import { DockerSandbox, type SandboxOptions, type SandboxInfo } from './DockerSandbox.js';
import { LocalSandbox } from './LocalSandbox.js';
/** 沙箱管理器配置 */
export interface SandboxManagerConfig {
    /** 最大并发沙箱数 */
    maxSandboxes?: number;
    /** 沙箱默认超时(ms)，超时自动清理 */
    defaultTimeout?: number;
    /** 空闲沙箱最大存活时间(ms) */
    idleTimeout?: number;
    /** 是否启用沙箱 */
    enabled?: boolean;
    /** 默认Docker镜像 */
    defaultImage?: string;
}
/** 沙箱实例联合类型 */
export type SandboxInstance = DockerSandbox | LocalSandbox;
/**
 * 沙箱管理器 - 单例模式
 */
export declare class SandboxManager {
    /** 活跃沙箱 Map */
    private sandboxes;
    /** 清理定时器 */
    private cleanupTimer;
    /** 配置 */
    private config;
    /** Docker 是否可用 */
    private dockerAvailable;
    /** 是否使用本地进程模式（Docker不可用时的降级） */
    private localMode;
    private static instance;
    static getInstance(config?: SandboxManagerConfig): SandboxManager;
    static resetInstance(): void;
    private constructor();
    /**
     * 初始化沙箱管理器 - 检测Docker可用性，不可用时自动降级为本地进程模式
     */
    init(): Promise<{
        available: boolean;
        version?: string;
        mode: 'docker' | 'local' | 'disabled';
    }>;
    /**
     * 创建新的沙箱实例
     * Docker 可用时创建 Docker 容器，不可用时降级为本地进程
     */
    createSandbox(options?: SandboxOptions): Promise<SandboxInstance>;
    /**
     * 创建 Docker 沙箱
     */
    private createDockerSandbox;
    /**
     * 创建本地进程沙箱
     */
    private createLocalSandbox;
    /**
     * 获取沙箱实例
     */
    getSandbox(id: string): SandboxInstance | undefined;
    /**
     * 列出所有活跃沙箱
     */
    listSandboxes(): SandboxInfo[];
    /**
     * 停止并销毁沙箱
     */
    destroySandbox(id: string): Promise<void>;
    /**
     * 停止所有沙箱
     */
    destroyAll(): Promise<void>;
    /**
     * 获取系统概览
     */
    getOverview(): {
        enabled: boolean;
        dockerAvailable: boolean;
        localMode: boolean;
        activeCount: number;
        maxSandboxes: number;
        sandboxes: SandboxInfo[];
    };
    /**
     * 关闭管理器
     */
    shutdown(): Promise<void>;
    /**
     * 清理超时和空闲的沙箱
     */
    private cleanup;
}
//# sourceMappingURL=SandboxManager.d.ts.map