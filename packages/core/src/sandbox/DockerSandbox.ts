/**
 * Docker沙箱隔离执行模块
 * 提供安全的容器化代码执行环境，支持资源限制、网络隔离、超时控制
 * 
 * 特性:
 * - Docker 容器隔离执行
 * - CPU/内存/磁盘/网络资源限制
 * - 执行超时控制
 * - 工作区卷挂载 (只读/读写)
 * - 环境变量注入
 * - 容器生命周期管理
 * - 健康检查与自动恢复
 */
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

// ==================== 类型定义 ====================

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
  volumes?: Array<{ host: string; container: string; ro?: boolean }>;
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

// ==================== Docker可用性检测 ====================

/** Docker 版本缓存 */
let dockerVersion: string | null = null;
let dockerChecked = false;

/**
 * 重置 Docker 检测缓存 (主要用于测试)
 */
export function resetDockerCache(): void {
  dockerVersion = null;
  dockerChecked = false;
}

/**
 * 检测 Docker 是否可用
 */
export async function checkDockerAvailability(): Promise<{ available: boolean; version?: string; error?: string }> {
  if (dockerChecked) {
    return { available: !!dockerVersion, version: dockerVersion || undefined };
  }
  
  try {
    const output = execSync('docker version --format "{{.Server.Version}}"', {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });
    dockerVersion = output.trim();
    dockerChecked = true;
    logger.info(`Docker 可用, 版本: ${dockerVersion}`);
    return { available: true, version: dockerVersion };
  } catch (error) {
    dockerChecked = true;
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn(`Docker 不可用: ${msg}`);
    return { available: false, error: msg };
  }
}

// ==================== DockerSandbox 类 ====================

/**
 * Docker 沙箱实例
 * 管理单个容器的完整生命周期
 */
export class DockerSandbox {
  /** 沙箱唯一ID */
  readonly id: string;
  /** Docker 容器ID */
  private containerId: string | null = null;
  /** 沙箱状态 */
  private status: SandboxStatus = 'idle';
  /** 创建选项 */
  private options: SandboxOptions;
  /** 镜像 */
  private image: string;

  constructor(options: SandboxOptions = {}) {
    this.id = `easyagent-sandbox-${randomUUID().slice(0, 8)}`;
    this.options = options;
    this.image = options.image || 'node:20-alpine';
  }

  /**
   * 启动沙箱容器
   */
  async start(): Promise<void> {
    const available = await checkDockerAvailability();
    if (!available.available) {
      throw new Error(`Docker 不可用: ${available.error || '请安装 Docker'}`);
    }

    this.status = 'starting';
    
    try {
      // 1. 检查/拉取镜像
      await this.ensureImage();
      
      // 2. 构建 docker run 参数
      const args = this.buildRunArgs();
      
      // 3. 启动容器
      this.containerId = await this.runContainer(args);
      this.status = 'running';
      
      logger.info({ sandboxId: this.id, containerId: this.containerId }, 'Docker 沙箱已启动');
    } catch (error) {
      this.status = 'error';
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ sandboxId: this.id, error: msg }, 'Docker 沙箱启动失败');
      throw error;
    }
  }

  /**
   * 在沙箱中执行命令
   */
  async exec(command: string, timeout?: number): Promise<SandboxResult> {
    if (!this.containerId) {
      throw new Error('沙箱未启动，请先调用 start()');
    }
    if (this.status !== 'running') {
      throw new Error(`沙箱状态异常: ${this.status}`);
    }

    const execTimeout = timeout || this.options.timeout || 30000;
    const startTime = Date.now();
    let timedOut = false;

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const proc = spawn('docker', [
          'exec', '-i', this.containerId!,
          'sh', '-c', command,
        ], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString('utf-8');
          // 限制输出大小 10MB
          if (stdout.length > 10 * 1024 * 1024) {
            proc.kill();
            reject(new Error('输出超过限制(10MB)'));
          }
        });

        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf-8');
          if (stderr.length > 5 * 1024 * 1024) {
            proc.kill();
            reject(new Error('错误输出超过限制(5MB)'));
          }
        });

        const timer = setTimeout(() => {
          timedOut = true;
          proc.kill('SIGKILL');
          // 也杀掉容器内的进程
          spawn('docker', ['exec', this.containerId!, 'pkill', '-9', '-P', '1'], { windowsHide: true });
        }, execTimeout);

        proc.on('close', (code) => {
          clearTimeout(timer);
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? -1 });
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });

      return {
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
        timedOut,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        stdout: '',
        stderr: msg,
        exitCode: -1,
        duration: Date.now() - startTime,
        timedOut,
      };
    }
  }

  /**
   * 获取沙箱状态
   */
  getStatus(): SandboxInfo {
    return {
      id: this.id,
      containerId: this.containerId,
      status: this.status,
      image: this.image,
      workspace: this.options.workspace || process.cwd(),
      createdAt: new Date(),
      limits: this.options.limits || {},
    };
  }

  /**
   * 停止并清理沙箱
   */
  async stop(): Promise<void> {
    if (this.containerId) {
      try {
        // 优雅停止 -> 强制停止 -> 删除
        execSync(`docker stop --time 10 ${this.containerId}`, { 
          timeout: 15000, windowsHide: true 
        });
      } catch { /* 容器可能已停止 */ }
      
      try {
        execSync(`docker rm -f ${this.containerId}`, { 
          timeout: 10000, windowsHide: true 
        });
      } catch { /* 容器可能已被删除 */ }
      
      this.containerId = null;
    }
    this.status = 'stopped';
    logger.info({ sandboxId: this.id }, 'Docker 沙箱已停止');
  }

  // ==================== 私有方法 ====================

  /**
   * 确保镜像存在
   */
  private async ensureImage(): Promise<void> {
    try {
      execSync(`docker image inspect ${this.image}`, { 
        encoding: 'utf-8', timeout: 5000, windowsHide: true 
      });
    } catch {
      logger.info({ image: this.image }, '拉取 Docker 镜像...');
      execSync(`docker pull ${this.image}`, { 
        stdio: 'inherit', timeout: 120000 
      });
      logger.info({ image: this.image }, 'Docker 镜像拉取完成');
    }
  }

  /**
   * 构建 docker run 参数
   */
  private buildRunArgs(): string[] {
    const args: string[] = ['run', '-d', '--rm'];

    // 容器名
    args.push('--name', this.id);

    // 资源限制
    const limits = this.options.limits || {};
    if (limits.cpuCores) {
      args.push('--cpus', String(limits.cpuCores));
    }
    if (limits.memory) {
      args.push('--memory', limits.memory);
    }
    if (limits.maxPids) {
      args.push('--pids-limit', String(limits.maxPids));
    }
    if (limits.diskWriteSpeed) {
      args.push('--device-write-bps', `/dev/sda:${limits.diskWriteSpeed}`);
    }

    // 网络隔离
    if (this.options.allowNetwork === false) {
      args.push('--network', 'none');
    }

    // 工作区挂载
    const workspace = this.options.workspace || process.cwd();
    const absWorkspace = resolve(workspace);
    const roFlag = this.options.readOnly ? ':ro' : '';
    args.push('-v', `${absWorkspace}:/workspace${roFlag}`);
    
    // 额外卷挂载
    if (this.options.volumes) {
      for (const vol of this.options.volumes) {
        const roFlag = vol.ro ? ':ro' : '';
        args.push('-v', `${vol.host}:${vol.container}${roFlag}`);
      }
    }

    // 工作目录
    args.push('-w', this.options.workdir || '/workspace');

    // 环境变量
    if (this.options.env) {
      for (const [key, value] of Object.entries(this.options.env)) {
        args.push('-e', `${key}=${value}`);
      }
    }
    // 始终传递安全相关环境变量
    args.push('-e', `SANDBOX_ID=${this.id}`);
    args.push('-e', `SANDBOX_MODE=${this.options.readOnly ? 'readonly' : 'readwrite'}`);

    // 安全选项
    args.push('--cap-drop=ALL');           // 移除所有能力
    args.push('--cap-add=DAC_OVERRIDE');   // 允许基本文件权限
    args.push('--security-opt=no-new-privileges');

    // 镜像 + 保持运行的命令
    args.push(this.image);
    args.push('tail', '-f', '/dev/null');  // 保持容器运行

    return args;
  }

  /**
   * 运行容器并返回 containerId
   */
  private async runContainer(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', args, { windowsHide: true });
      
      let output = '';
      
      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString('utf-8');
      });

      proc.stderr.on('data', (data: Buffer) => {
        logger.warn({ stderr: data.toString('utf-8') }, 'Docker 运行警告');
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const containerId = output.trim().slice(0, 64);
          if (containerId.length >= 12) {
            resolve(containerId);
          } else {
            reject(new Error(`无效的容器ID: ${output.trim()}`));
          }
        } else {
          reject(new Error(`Docker 容器启动失败 (exit code: ${code})`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Docker 进程启动失败: ${err.message}`));
      });
    });
  }
}
