/**
 * 本地进程沙箱（Docker 不可用时的降级方案）
 * 
 * 功能特性:
 * - 基于 child_process.spawn 直接执行命令
 * - 超时控制 + SIGKILL 强制终止
 * - 输出大小限制（stdout 10MB, stderr 5MB）
 * - 工作目录隔离
 * - 环境变量注入
 * 
 * 安全注意事项:
 * - 无容器隔离，命令在主机直接执行
 * - 无 CPU/内存硬限制（仅超时+输出大小限制）
 * - 无文件系统隔离（通过工作目录限制范围）
 * - 适用于可信代码或开发测试场景
 */
import { spawn, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import type { SandboxOptions, SandboxResult, SandboxStatus, SandboxInfo, SandboxLimits } from './DockerSandbox.js';

/** 本地进程沙箱实例 */
export class LocalSandbox {
  /** 沙箱唯一ID */
  readonly id: string;
  /** 沙箱状态 */
  private status: SandboxStatus = 'idle';
  /** 创建选项 */
  private options: SandboxOptions;
  /** 镜像（仅用于展示，本地模式不拉取镜像） */
  private image: string;

  constructor(options: SandboxOptions = {}) {
    this.id = `easyagent-local-${randomUUID().slice(0, 8)}`;
    this.options = options;
    this.image = options.image || 'local';
  }

  /**
   * 启动沙箱（本地模式下无需启动容器，仅标记状态）
   */
  async start(): Promise<void> {
    this.status = 'running';
    logger.info({ sandboxId: this.id, workspace: this.options.workspace }, '本地沙箱已就绪');
  }

  /**
   * 验证命令是否安全，检测shell元字符以防止命令注入
   * @param command - 待执行的命令字符串
   * @throws 如果命令包含不安全的shell元字符
   */
  private validateCommand(command: string): void {
    if (this.containsShellMetacharacters(command)) {
      throw new Error(
        `命令包含不安全的 shell 元字符，已被拒绝执行。` +
        `允许的字符: 字母数字、空格、路径字符(/ \\ . : - _)、引号(用于路径)和常见参数标识符。` +
        `命令: ${command.slice(0, 200)}`
      );
    }
  }

  /**
   * 检测字符串是否包含危险的shell元字符
   * @param input - 待检测的字符串
   * @returns 如果包含危险字符返回true
   */
  private containsShellMetacharacters(input: string): boolean {
    // 检测以下危险字符和模式:
    // ;  - 命令分隔符
    // |  - 管道符
    // &  - 后台执行 / 命令链接
    // $  - 变量替换
    // `  - 命令替换（反引号）
    // ( ) - 子shell
    // && || - 逻辑链接符
    // > < - 重定向
    // \n \r - 换行注入
    // # - 注释（可用于截断命令）
    const dangerousPatterns = [
      /[;&|`$()><#\x00-\x08\x0B\x0C\x0E-\x1F]/,  // 单个危险字符 + 控制字符
      /&&/,   // 逻辑与
      /\|\|/, // 逻辑或
      /\n/,   // 换行符
      /\r/,   // 回车符
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(input)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 执行命令
   * 使用 child_process.spawn 直接执行，带超时和输出限制
   */
  async exec(command: string, timeout?: number): Promise<SandboxResult> {
    if (this.status !== 'running') {
      throw new Error('沙箱未启动，请先调用 start()');
    }

    // 验证命令安全性，防止shell元字符注入
    this.validateCommand(command);

    const execTimeout = timeout || this.options.timeout || 30000;
    const safeTimeout = Math.min(execTimeout, 300000); // 最大5分钟
    const startTime = Date.now();
    let timedOut = false;

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
        (resolve, reject) => {
          // 根据平台选择 shell: Windows 用 cmd.exe, Linux/Mac 用 sh
          const isWindows = process.platform === 'win32';
          const shell = isWindows ? 'cmd.exe' : '/bin/sh';
          const shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command];

          // 设置工作目录
          const cwd = this.options.workspace || process.cwd();

          // 设置环境变量
          const env: Record<string, string> = {
            ...process.env as Record<string, string>,
            ...(this.options.env || {}),
            SANDBOX_ID: this.id,
            SANDBOX_MODE: this.options.readOnly ? 'readonly' : 'readwrite',
          };

          // Windows下清理Node.js特定环境变量避免干扰
          if (isWindows) {
            // 保留基本PATH，移除Node.js特有的模块路径
            delete env.NODE_PATH;
            delete env.NODE_OPTIONS;
          }

          const proc = spawn(shell, shellArgs, {
            cwd,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            shell: false, // 已经指定了 shell，不需要 shell:true
          });

          let stdout = '';
          let stderr = '';
          let killed = false;

          // 超时定时器
          const timer = setTimeout(() => {
            timedOut = true;
            killed = true;
            // Windows: 需要 /T 杀掉整个进程树
            if (isWindows && proc.pid) {
              try {
                execSync(`taskkill /F /T /PID ${proc.pid}`, {
                  windowsHide: true,
                  timeout: 5000,
                });
              } catch (err) {
                proc.kill('SIGKILL');
              }
            } else {
              proc.kill('SIGKILL');
            }
          }, safeTimeout);

          proc.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString('utf-8');
            // 限制输出大小 10MB
            if (stdout.length > 10 * 1024 * 1024) {
              killed = true;
              clearTimeout(timer);
              if (isWindows && proc.pid) {
                try {
                  execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true });
                } catch (err) { proc.kill(); }
              } else {
                proc.kill();
              }
              reject(new Error('输出超过限制(10MB)'));
            }
          });

          proc.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString('utf-8');
            if (stderr.length > 5 * 1024 * 1024) {
              killed = true;
              clearTimeout(timer);
              if (isWindows && proc.pid) {
                try {
                  execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true });
                } catch (err) { proc.kill(); }
              } else {
                proc.kill();
              }
              reject(new Error('错误输出超过限制(5MB)'));
            }
          });

          proc.on('close', (code, signal) => {
            clearTimeout(timer);
            if (killed) return;
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              exitCode: code ?? (signal ? -1 : 0),
            });
          });

          proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        },
      );

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
      containerId: 'local', // 本地模式无容器ID
      status: this.status,
      image: this.image,
      workspace: this.options.workspace || process.cwd(),
      createdAt: new Date(),
      limits: this.options.limits || {},
    };
  }

  /**
   * 停止沙箱（本地模式无需清理进程，仅标记状态）
   */
  async stop(): Promise<void> {
    this.status = 'stopped';
    logger.info({ sandboxId: this.id }, '本地沙箱已停止');
  }

  /**
   * 检测本地执行环境是否可用
   */
  static checkAvailability(): { available: boolean; version?: string; error?: string } {
    try {
      const isWindows = process.platform === 'win32';
      const version = isWindows
        ? `Windows ${process.env.OS || ''}`
        : execSync('uname -r', { encoding: 'utf-8', timeout: 3000 }).trim();
      return { available: true, version: `本地进程 (${version})` };
    } catch (err) {
      return { available: true, version: `本地进程 (${process.platform})` };
    }
  }
}
