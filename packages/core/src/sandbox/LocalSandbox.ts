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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { checkCommand } from './commandSafety.js';
import type {
  SandboxOptions,
  SandboxResult,
  SandboxStatus,
  SandboxInfo,
  SandboxLimits,
} from './DockerSandbox.js';

/**
 * Windows cmd.exe 内建命令（没有独立可执行文件，必须由 cmd 解释）
 *
 * ⚠️ 本地沙箱改为「不经 shell」执行后，`echo` / `dir` / `type` 这类内建命令会直接
 * ENOENT —— 这不是安全取舍而是可用性回归，故对它们保留经 cmd.exe 的兼容路径
 * （参数仍由我们逐个加引号，不会被 cmd 当语法解析）。
 */
const WINDOWS_CMD_BUILTINS = new Set([
  'echo',
  'dir',
  'type',
  'cd',
  'chdir',
  'set',
  'cls',
  'copy',
  'move',
  'del',
  'erase',
  'rd',
  'rmdir',
  'md',
  'mkdir',
  'ren',
  'rename',
  'ver',
  'vol',
  'date',
  'time',
  'title',
  'where',
  'find',
  'findstr',
  'more',
  'start',
  'tasklist',
  'taskkill',
  'path',
  'attrib',
]);

/**
 * Windows：解析需要经 cmd.exe 执行的批处理入口（.cmd / .bat）
 *
 * Node ≥ 18.20.2 / 20.12.2 起（CVE-2024-27980 缓解）**不允许**直接 spawn .cmd/.bat，
 * 而 `npm` / `npx` / `yarn` 在 Windows 上正是 .cmd → 必须走 cmd.exe。
 *
 * @returns 可交给 cmd.exe 的批处理路径；不需要或找不到时返回 null
 */
function resolveWindowsCmdShim(file: string): string | null {
  if (process.platform !== 'win32') return null;
  if (/\.(cmd|bat)$/i.test(file)) return file;
  // 已带原生扩展名或自带路径分隔符的，不做 PATH 探测
  if (/\.(exe|com)$/i.test(file) || file.includes('\\') || file.includes('/')) return null;

  const pathValue = process.env.PATH || process.env.Path || '';
  for (const dir of pathValue.split(';').filter(Boolean)) {
    for (const ext of ['.cmd', '.bat']) {
      const candidate = join(dir, `${file}${ext}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/** 为 cmd.exe 的参数加引号（内部双引号按 cmd 规则双写） */
function quoteForCmd(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** 仅在必要时加引号（给 cmd 内建命令名加引号会撞上 /s 的脱引号规则） */
function quoteIfNeeded(value: string): string {
  return value === '' || /[\s"&|<>^()]/.test(value) ? quoteForCmd(value) : value;
}

/**
 * 拼 cmd.exe 命令行（配合 `windowsVerbatimArguments: true` 原样传递，不让 Node 再加工）
 *
 * ⚠️ **外层必须再包一层引号**：`cmd /d /s /c` 会把「首尾引号」剥掉，
 * 这样 `"C:\Program Files\nodejs\npm.cmd" run dev` 这类含空格的路径才能正确执行；
 * 内建命令（echo/dir…）不加引号，避免 `"echo"` 被 /s 规则拆坏（实测 exit 1）。
 *
 * ⚠️ 残余风险：cmd.exe 对参数里的 `%VAR%` 仍会展开（引号内也展开）。该分支只在
 * Windows 的 .cmd/.bat 与内建命令场景走，参数仅影响子进程自身 argv，可接受。
 */
function buildCmdExeLine(file: string, args: string[]): string {
  const line = [file, ...args].map(quoteIfNeeded).join(' ');
  return `"${line}"`;
}

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
   * 校验命令并切分为 argv
   *
   * ── 安全模型（2026-09-19 根治）──
   * 执行时**不再经过 shell**（`spawn(file, args, { shell: false })`），
   * 因此"危险字符黑名单"已无必要：`()` `$` 反引号等只是普通字符，注入在结构上不可能。
   * 这里只拦「引号外的管道/重定向/链式」—— 不是因为它们危险，而是因为在无 shell 模式下
   * 它们不会按用户预期生效，提前给出明确报错比静默当成普通参数更好。
   *
   * @returns 可直接交给 spawn 的 argv
   * @throws 命令非法（引号外操作符 / 引号未闭合 / 空命令）
   */
  private validateCommand(command: string): string[] {
    const result = checkCommand(command, false);
    if (result.error || !result.argv) {
      throw new Error(result.error || '命令解析失败：无法切分命令');
    }
    return result.argv;
  }

  /**
   * 执行命令
   * 使用 child_process.spawn 直接执行，带超时和输出限制
   */
  async exec(command: string, timeout?: number): Promise<SandboxResult> {
    if (this.status !== 'running') {
      throw new Error('沙箱未启动，请先调用 start()');
    }

    // 校验并切分为 argv（不经 shell 执行，详见 validateCommand 注释）
    const argv = this.validateCommand(command);

    const execTimeout = timeout || this.options.timeout || 30000;
    const safeTimeout = Math.min(execTimeout, 300000); // 最大5分钟
    const startTime = Date.now();
    let timedOut = false;

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
        (resolve, reject) => {
          const isWindows = process.platform === 'win32';
          const [file, ...args] = argv;

          // 设置工作目录
          const cwd = this.options.workspace || process.cwd();

          // 设置环境变量
          const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
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

          // ── 不经 shell 执行（根治要点）──
          // argv 已由 parseCommandLine 切分好，直接 spawn(file, args)：
          // 没有 shell 就没有元字符语义，代码里的 () $ 反引号都是普通字符。
          // 例外：Windows 的 .cmd/.bat（npm/npx/yarn 等）Node 不允许直接 spawn，
          // 必须经 cmd.exe —— 参数由我们统一加引号后原样传入。
          const shim = isWindows ? resolveWindowsCmdShim(file) : null;
          // 需要经 cmd.exe 的两种情形：① .cmd/.bat（npm/npx 等，Node 不允许直接 spawn）
          // ② Windows 内建命令（echo/dir/type…，没有独立可执行文件）
          const viaCmd =
            shim || (isWindows && WINDOWS_CMD_BUILTINS.has(file.toLowerCase()))
              ? shim || file
              : null;
          const proc = viaCmd
            ? spawn(
                process.env.ComSpec || 'cmd.exe',
                ['/d', '/s', '/c', buildCmdExeLine(viaCmd, args)],
                {
                  cwd,
                  env,
                  stdio: ['ignore', 'pipe', 'pipe'],
                  windowsHide: true,
                  windowsVerbatimArguments: true,
                  shell: false,
                },
              )
            : spawn(file, args, {
                cwd,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
                shell: false,
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
                } catch (err) {
                  proc.kill();
                }
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
                } catch (err) {
                  proc.kill();
                }
              } else {
                proc.kill();
              }
              reject(new Error('错误输出超过限制(5MB)'));
            }
          });

          proc.on('close', (code, signal) => {
            clearTimeout(timer);
            if (killed) {
              // ⚠️ 必须让 Promise 落地：旧实现在此直接 return，导致超时（或输出超限）被 kill 后
              // Promise 永不 settle、请求一直挂着 —— 界面上的"超时 30s"形同虚设（2026-09-19 修复）
              reject(new Error(timedOut ? `命令执行超时（${safeTimeout}ms）` : '命令被终止'));
              return;
            }
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
      const err = error as NodeJS.ErrnoException;
      /**
       * ENOENT 翻译成人话：最常见的原因是**把代码片段当成命令输入**了
       * （用户实报：输入 `console.log("a|b;c")` → `spawn console.log(...) ENOENT`）
       */
      const msg =
        err?.code === 'ENOENT'
          ? `找不到可执行文件 "${argv[0]}"。沙箱里执行的是**系统命令**（如 node / npm / python / ls），` +
            `不是代码片段；要执行 JavaScript 请写成 node -e "console.log(1+1)"。命令: ${command.slice(0, 120)}`
          : error instanceof Error
            ? error.message
            : String(error);
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
