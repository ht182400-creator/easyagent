/**
 * 沙箱管理器
 * 管理多个 Docker 沙箱实例的生命周期，支持:
 * - 多沙箱并发管理
 * - 资源池化与复用
 * - 自动清理超时沙箱
 * - 全局资源配额控制
 */
import {
  DockerSandbox,
  type SandboxOptions,
  type SandboxInfo,
  checkDockerAvailability,
} from './DockerSandbox.js';
import { LocalSandbox } from './LocalSandbox.js';
import { logger } from '../utils/logger.js';

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

/** 沙箱记录 */
interface SandboxRecord {
  sandbox: SandboxInstance;
  createdAt: Date;
  lastUsedAt: Date;
  timeout: number;
}

/**
 * 沙箱管理器 - 单例模式
 */
export class SandboxManager {
  /** 活跃沙箱 Map */
  private sandboxes: Map<string, SandboxRecord> = new Map();
  /** 清理定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  /** 配置 */
  private config: Required<SandboxManagerConfig>;
  /** Docker 是否可用 */
  private dockerAvailable = false;
  /** 是否使用本地进程模式（Docker不可用时的降级） */
  private localMode = false;

  private static instance: SandboxManager | null = null;

  static getInstance(config?: SandboxManagerConfig): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager(config);
    }
    return SandboxManager.instance;
  }

  static resetInstance(): void {
    SandboxManager.instance = null;
  }

  private constructor(config?: SandboxManagerConfig) {
    this.config = {
      maxSandboxes: config?.maxSandboxes ?? 10,
      defaultTimeout: config?.defaultTimeout ?? 300000, // 5分钟
      idleTimeout: config?.idleTimeout ?? 600000, // 10分钟
      enabled: config?.enabled ?? true,
      defaultImage: config?.defaultImage ?? 'node:20-alpine',
    };
  }

  /**
   * 初始化沙箱管理器 - 检测Docker可用性，不可用时自动降级为本地进程模式
   */
  async init(): Promise<{
    available: boolean;
    version?: string;
    mode: 'docker' | 'local' | 'disabled';
  }> {
    const result = await checkDockerAvailability();
    this.dockerAvailable = result.available;

    if (result.available) {
      // 启动定期清理 (每30秒)
      this.cleanupTimer = setInterval(() => this.cleanup(), 30000);
      logger.info({ version: result.version }, 'Docker 沙箱系统就绪');
      return { available: true, version: result.version, mode: 'docker' };
    }

    // Docker 不可用，尝试启用本地进程模式
    if (this.config.enabled) {
      this.localMode = true;
      this.cleanupTimer = setInterval(() => this.cleanup(), 30000);
      const localCheck = LocalSandbox.checkAvailability();
      logger.warn(
        { reason: result.error, fallback: localCheck.version },
        'Docker 不可用，已降级为本地进程模式',
      );
      return { available: true, version: localCheck.version, mode: 'local' };
    }

    logger.warn('Docker 不可用且沙箱已禁用');
    return { available: false, mode: 'disabled' };
  }

  /**
   * 创建新的沙箱实例
   * Docker 可用时创建 Docker 容器，不可用时降级为本地进程
   */
  async createSandbox(options: SandboxOptions = {}): Promise<SandboxInstance> {
    if (!this.dockerAvailable && !this.localMode) {
      throw new Error('沙箱不可用: Docker 未安装且未启用本地模式');
    }
    if (!this.config.enabled) {
      throw new Error('沙箱功能已被禁用');
    }

    // 检查并发限制
    if (this.sandboxes.size >= this.config.maxSandboxes) {
      // 尝试清理超时的沙箱
      await this.cleanup();
      if (this.sandboxes.size >= this.config.maxSandboxes) {
        throw new Error(`沙箱数量已达上限 (${this.config.maxSandboxes})`);
      }
    }

    // 选择沙箱类型
    if (this.dockerAvailable) {
      return this.createDockerSandbox(options);
    } else {
      return this.createLocalSandbox(options);
    }
  }

  /**
   * 创建 Docker 沙箱
   */
  private async createDockerSandbox(options: SandboxOptions): Promise<DockerSandbox> {
    const sandbox = new DockerSandbox({
      ...options,
      image: options.image || this.config.defaultImage,
    });

    try {
      await sandbox.start();

      const record: SandboxRecord = {
        sandbox,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        timeout: options.timeout || this.config.defaultTimeout,
      };

      this.sandboxes.set(sandbox.id, record);
      logger.info(
        { sandboxId: sandbox.id, total: this.sandboxes.size, mode: 'docker' },
        'Docker 沙箱已创建',
      );

      return sandbox;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'Docker 沙箱创建失败');
      await sandbox.stop().catch(() => {});
      throw error;
    }
  }

  /**
   * 创建本地进程沙箱
   */
  private async createLocalSandbox(options: SandboxOptions): Promise<LocalSandbox> {
    // 本地模式忽略镜像，使用主机环境
    const sandbox = new LocalSandbox({
      ...options,
      image: 'local', // 本地模式强制使用 local 镜像标记
    });

    try {
      await sandbox.start();

      const record: SandboxRecord = {
        sandbox,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        timeout: options.timeout || this.config.defaultTimeout,
      };

      this.sandboxes.set(sandbox.id, record);
      logger.info(
        { sandboxId: sandbox.id, total: this.sandboxes.size, mode: 'local' },
        '本地沙箱已创建',
      );

      return sandbox;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '本地沙箱创建失败');
      await sandbox.stop().catch(() => {});
      throw error;
    }
  }

  /**
   * 获取沙箱实例
   */
  getSandbox(id: string): SandboxInstance | undefined {
    const record = this.sandboxes.get(id);
    if (record) {
      record.lastUsedAt = new Date();
      return record.sandbox;
    }
    return undefined;
  }

  /**
   * 列出所有活跃沙箱
   */
  listSandboxes(): SandboxInfo[] {
    return Array.from(this.sandboxes.values()).map((r) => r.sandbox.getStatus());
  }

  /**
   * 停止并销毁沙箱
   */
  async destroySandbox(id: string): Promise<void> {
    const record = this.sandboxes.get(id);
    if (record) {
      await record.sandbox.stop();
      this.sandboxes.delete(id);
      logger.info({ sandboxId: id, remaining: this.sandboxes.size }, '沙箱已销毁');
    }
  }

  /**
   * 停止所有沙箱
   */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.sandboxes.keys());
    await Promise.all(ids.map((id) => this.destroySandbox(id)));
    logger.info('所有沙箱已销毁');
  }

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
  } {
    return {
      enabled: this.config.enabled,
      dockerAvailable: this.dockerAvailable,
      localMode: this.localMode,
      activeCount: this.sandboxes.size,
      maxSandboxes: this.config.maxSandboxes,
      sandboxes: this.listSandboxes(),
    };
  }

  /**
   * 关闭管理器
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await this.destroyAll();
  }

  // ==================== 私有方法 ====================

  /**
   * 清理超时和空闲的沙箱
   */
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, record] of this.sandboxes) {
      const age = now - record.createdAt.getTime();
      const idle = now - record.lastUsedAt.getTime();

      // 超时清理
      if (age > record.timeout) {
        logger.info({ sandboxId: id, age }, '沙箱超时，将被清理');
        toRemove.push(id);
      }
      // 空闲清理
      else if (idle > this.config.idleTimeout) {
        logger.info({ sandboxId: id, idleDuration: idle }, '沙箱空闲超时，将被清理');
        toRemove.push(id);
      }
    }

    if (toRemove.length > 0) {
      await Promise.all(toRemove.map((id) => this.destroySandbox(id)));
      logger.info({ cleaned: toRemove.length }, '已清理超时/空闲沙箱');
    }
  }
}
