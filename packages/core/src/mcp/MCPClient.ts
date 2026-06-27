/**
 * MCP (Model Context Protocol) 客户端
 * 通过 JSON-RPC over stdio 与 MCP 服务器通信
 * 实现 MCP 协议规范: https://spec.modelcontextprotocol.io/
 */
import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { logger } from '../utils/logger.js';
import type { MCPServerConfig, MCPTool } from '../types/index.js';

/** JSON-RPC 2.0 消息 */
interface JSONRPCMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type MCPEventCallback = (toolName: string, data: unknown) => void;

/**
 * MCP 客户端 - 管理单个 MCP 服务器连接
 */
export class MCPClient {
  readonly serverName: string;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number | string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private tools: MCPTool[] = [];
  private buffer = '';
  private eventCallback: MCPEventCallback | null = null;

  constructor(private config: MCPServerConfig) {
    this.serverName = config.name;
  }

  /** 启动 MCP 服务器进程并初始化 */
  async connect(): Promise<MCPTool[]> {
    if (this.process) {
      logger.warn({ server: this.serverName }, 'MCP 服务器已连接');
      return this.tools;
    }

    return new Promise((resolve, reject) => {
      try {
        logger.info({ command: this.config.command, args: this.config.args }, '启动 MCP 服务器');

        this.process = spawn(this.config.command, this.config.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.config.env },
          shell: process.platform === 'win32',
        });

        // 逐行读取 stdout (JSON-RPC 消息)
        const rl = createInterface({ input: this.process.stdout!, crlfDelay: Infinity });
        rl.on('line', (line: string) => {
          this.handleMessage(line);
        });

        // 错误输出
        this.process.stderr?.on('data', (data: Buffer) => {
          logger.warn({ server: this.serverName, stderr: data.toString().trim() }, 'MCP stderr');
        });

        this.process.on('error', (err) => {
          logger.error({ server: this.serverName, error: err.message }, 'MCP 进程错误');
          reject(err);
        });

        this.process.on('close', (code) => {
          logger.info({ server: this.serverName, exitCode: code }, 'MCP 进程已关闭');
          // 进程退出时拒绝所有未决请求
          for (const [, handler] of this.pendingRequests) {
            handler.reject(new Error(`MCP 进程已退出 (code: ${code})`));
          }
          this.pendingRequests.clear();
          this.process = null;
        });

        // 发送 initialize 请求
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'EasyAgent', version: '0.2.0' },
        })
          .then(() => {
            // 请求工具列表
            return this.sendRequest('tools/list', {});
          })
          .then((result: any) => {
            this.tools = (result?.tools || []).map((t: any) => ({
              name: t.name,
              description: t.description || '',
              inputSchema: t.inputSchema || {},
              serverName: this.serverName,
            }));
            logger.info(
              { server: this.serverName, toolCount: this.tools.length },
              'MCP 服务器就绪',
            );
            resolve(this.tools);
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    if (!this.process) return;
    try {
      await this.sendRequest('shutdown', {});
    } catch (err) {
      /* ignore shutdown errors */
    }
    this.process.kill();
    this.process = null;
    this.tools = [];
    logger.info({ server: this.serverName }, 'MCP 已断开');
  }

  /** 获取工具列表 */
  getTools(): MCPTool[] {
    return [...this.tools];
  }

  /** 调用 MCP 工具 */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.process) throw new Error(`MCP 服务器未连接: ${this.serverName}`);
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
    return result;
  }

  /** 设置事件回调 */
  onEvent(callback: MCPEventCallback): void {
    this.eventCallback = callback;
  }

  /** 发送 JSON-RPC 请求 */
  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP 请求超时: ${method} (${this.serverName})`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process?.stdin?.write(JSON.stringify(message) + '\n');
    });
  }

  /** 处理服务器消息 */
  private handleMessage(line: string): void {
    try {
      const msg: JSONRPCMessage = JSON.parse(line);

      if (msg.id && this.pendingRequests.has(msg.id)) {
        // 响应消息
        const handler = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          handler.reject(new Error(msg.error.message || 'MCP 错误'));
        } else {
          handler.resolve(msg.result);
        }
      } else if (msg.method === 'notifications/initialized') {
        // 忽略初始化通知
      } else if (msg.method && this.eventCallback) {
        // 其他通知
        this.eventCallback(msg.method, msg.params);
      }
    } catch (err) {
      // 忽略非 JSON 行
    }
  }

  /** 是否已连接 */
  get isConnected(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
