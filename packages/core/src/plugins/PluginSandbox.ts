/**
 * 插件沙箱管理器
 *
 * 使用 Node.js worker_threads 隔离第三方插件，提供：
 * 1. 进程级隔离：每个插件在独立 Worker 线程中运行
 * 2. RPC 通信：通过 MessagePort 代理工具执行和钩子触发
 * 3. 权限控制：基于 manifest.json 的权限声明进行访问控制
 * 4. 资源限制：CPU/内存限制防止失控插件
 * 5. 超时保护：防止无限循环或长时间阻塞
 *
 * 架构：
 * ┌──────────────────────────────────────────────────┐
 * │                   主线程（Main）                    │
 * │  ┌─────────────┐  ┌────────────────────────────┐  │
 * │  │PluginManager│──│     PluginSandbox           │  │
 * │  │             │  │  ┌───────────────────────┐  │  │
 * │  │ 代理工具执行 │  │  │ ProxyTool (包装器)      │  │  │
 * │  │ 代理钩子触发 │  │  │ → execute() → RPC →    │  │  │
 * │  └─────────────┘  │  └───────────────────────┘  │  │
 * │                    │           │ postMessage      │  │
 * │                    └───────────┼──────────────────┘  │
 * │                                │                      │
 * └────────────────────────────────┼──────────────────────┘
 *                                  │
 * ┌────────────────────────────────┼──────────────────────┐
 * │                   Worker 线程  │                       │
 * │  ┌─────────────────────────────┴────────────────────┐ │
 * │  │  PluginWorkerEntry (RPC 消息循环)                 │ │
 * │  │  - handleInit: 加载插件代码                       │ │
 * │  │  - handleExecuteTool: 执行插件工具                │ │
 * │  │  - handleTriggerHook: 触发插件钩子                │ │
 * │  │  - handleShutdown: 清理资源                       │ │
 * │  └──────────────────────────────────────────────────┘ │
 * └───────────────────────────────────────────────────────┘
 */

import { Worker } from 'worker_threads';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import type { PluginManifest } from './PluginManifest.js';
import type { PluginPermissions } from './PluginPermission.js';
import type { ITool } from '../tools/ToolRegistry.js';
import type { ToolResult } from '../types/index.js';

// ===================== 类型定义 =====================

/** Sandbox 初始化结果 */
export interface SandboxInitResult {
  name: string;
  version: string;
  description: string;
  author?: string;
  dependencies?: string[];
  tools: Array<{ name: string; description: string; group?: string }>;
  skills: Array<{ name: string; description: string; tags?: string[] }>;
  hooks: Array<{ event: string; priority?: number }>;
}

/** RPC 响应 */
interface RpcResponse {
  requestId: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Sandbox 配置 */
export interface SandboxConfig {
  /** 插件 manifest */
  manifest: PluginManifest;
  /** 插件根目录 */
  pluginDir: string;
  /** 允许的权限 (默认同 manifest) */
  allowedPermissions?: PluginPermissions;
  /** 工具执行超时(ms) */
  toolTimeout?: number;
  /** Worker 资源限制 */
  resourceLimits?: {
    maxOldGenerationSizeMb?: number;
    maxYoungGenerationSizeMb?: number;
    stackSizeMb?: number;
  };
}

// ===================== PluginSandbox =====================

/**
 * 插件沙箱
 * 每个沙箱实例管理一个 Worker 线程和一个插件的生命周期
 */
export class PluginSandbox {
  /** Worker 实例 */
  private worker: Worker | null = null;
  /** Pending RPC 请求 Map<requestId, { resolve, reject }> */
  private pending: Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }> = new Map();
  /** 请求计数器 */
  private requestCounter = 0;
  /** 沙箱配置 */
  private config: SandboxConfig;
  /** 沙箱状态 */
  private _status: 'idle' | 'loading' | 'ready' | 'error' | 'shutdown' = 'idle';
  /** 插件元信息 */
  private pluginInfo: SandboxInitResult | null = null;
  /** Worker 入口文件路径 */
  private workerEntryPath: string;

  constructor(config: SandboxConfig) {
    this.config = {
      toolTimeout: 30000,
      resourceLimits: {
        maxOldGenerationSizeMb: 256,
        maxYoungGenerationSizeMb: 64,
        stackSizeMb: 4,
      },
      ...config,
    };
    // 计算 Worker 入口文件的绝对路径
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.workerEntryPath = resolve(__dirname, 'PluginWorkerEntry.js');
  }

  // ===================== 生命周期 =====================

  /**
   * 启动沙箱并加载插件
   */
  async start(): Promise<SandboxInitResult> {
    if (this._status !== 'idle') {
      throw new Error(`沙箱状态为 ${this._status}，无法启动`);
    }

    this._status = 'loading';

    try {
      // 创建 Worker 线程
      this.worker = new Worker(this.workerEntryPath, {
        workerData: {
          pluginDir: this.config.pluginDir,
          permissions: this.config.allowedPermissions,
        },
        resourceLimits: this.config.resourceLimits,
        // 允许 stdin/stderr 输出调试信息
        stdout: true,
        stderr: true,
      });

      // 监听错误
      this.worker.on('error', (error) => {
        const errMsg = (error as Error).message;
        logger.error({ error: errMsg }, 'PluginWorker 错误');
        this._status = 'error';
        // 拒绝所有 pending 请求
        for (const [, { reject }] of this.pending) {
          reject(new Error(`Worker 错误: ${errMsg}`));
        }
        this.pending.clear();
      });

      this.worker.on('exit', (code) => {
        logger.info({ code }, 'PluginWorker 退出');
        if (this._status !== 'shutdown') {
          this._status = 'error';
        }
      });

      // 监听消息
      this.worker.on('message', (response: RpcResponse) => {
        const pending = this.pending.get(response.requestId);
        if (!pending) {
          logger.warn({ requestId: response.requestId }, '收到未匹配的 RPC 响应');
          return;
        }
        this.pending.delete(response.requestId);

        if (response.success) {
          pending.resolve(response.data);
        } else {
          pending.reject(new Error(response.error || '未知 Worker 错误'));
        }
      });

      // 发送 init 消息
      const entryPath = resolve(this.config.pluginDir, this.config.manifest.main);
      const result = await this.sendRpc('init', {
        pluginPath: entryPath,
      }) as SandboxInitResult;

      this.pluginInfo = result;
      this._status = 'ready';
      logger.info({ plugin: result.name, version: result.version }, '插件沙箱启动成功');

      return result;
    } catch (error) {
      this._status = 'error';
      throw error;
    }
  }

  /**
   * 关闭沙箱
   */
  async shutdown(): Promise<void> {
    if (!this.worker || this._status === 'shutdown') return;

    try {
      await this.sendRpc('shutdown', {});
    } catch {
      // shutdown 失败也继续终止
    }

    await this.worker.terminate();
    this._status = 'shutdown';
    logger.info({ plugin: this.config.manifest.name }, '插件沙箱已关闭');
  }

  // ===================== 代理方法 =====================

  /**
   * 获取插件提供的工具（代理 Worker 中的 getTools）
   */
  async getTools(): Promise<ITool[]> {
    const toolDefs = (await this.sendRpc('getTools', {})) as Array<Record<string, unknown>>;

    // 创建代理工具：execute 通过 RPC 转发到 Worker
    return toolDefs.map((def) => this.createProxyTool(def));
  }

  /**
   * 获取技能列表
   */
  async getSkills(): Promise<Array<Record<string, unknown>>> {
    return this.sendRpc('getSkills', {}) as Promise<Array<Record<string, unknown>>>;
  }

  /**
   * 获取钩子列表
   */
  async getHooks(): Promise<Array<Record<string, unknown>>> {
    return this.sendRpc('getHooks', {}) as Promise<Array<Record<string, unknown>>>;
  }

  /**
   * 触发钩子事件（代理到 Worker）
   */
  async triggerHook(event: string, context: unknown): Promise<unknown> {
    return this.sendRpc('triggerHook', { event, context });
  }

  // ===================== 属性访问器 =====================

  /** 沙箱状态 */
  get status(): string {
    return this._status;
  }

  /** 插件名称 */
  get name(): string {
    return this.config.manifest.name;
  }

  /** 插件版本 */
  get version(): string {
    return this.config.manifest.version;
  }

  /** 插件信息 */
  get info(): SandboxInitResult | null {
    return this.pluginInfo;
  }

  // ===================== 私有方法 =====================

  /**
   * 发送 RPC 消息到 Worker 并等待响应
   */
  private sendRpc(type: string, payload: Record<string, unknown>): Promise<unknown> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker 未启动'));
    }

    const requestId = `rpc_${++this.requestCounter}_${Date.now()}`;
    const timeout = this.config.toolTimeout || 30000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`RPC ${type} 超时 (${timeout}ms)`));
      }, timeout);

      this.pending.set(requestId, {
        resolve: (value: unknown) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.worker!.postMessage({ type, requestId, ...payload });
    });
  }

  /**
   * 创建代理工具（execute 通过 RPC 转发）
   */
  private createProxyTool(def: Record<string, unknown>): ITool {
    const sandbox = this;
    return {
      name: def.name as string,
      description: def.description as string,
      parameters: def.parameters as ITool['parameters'],
      requiresConfirm: (def.requiresConfirm as boolean) || false,
      group: def.group as string | undefined,
      async execute(params, context) {
        logger.info({ tool: def.name }, '沙箱代理执行工具');
        return sandbox.sendRpc('executeTool', {
          toolName: def.name,
          params,
          context,
        }) as Promise<ToolResult>;
      },
    };
  }
}

// ===================== 工厂函数 =====================

/**
 * 创建沙箱实例
 */
export function createSandbox(config: SandboxConfig): PluginSandbox {
  return new PluginSandbox(config);
}
