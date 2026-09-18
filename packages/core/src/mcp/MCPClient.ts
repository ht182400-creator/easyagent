/**
 * MCP (Model Context Protocol) 客户端
 * 支持两种传输（P1-3 升级）：
 *   · stdio：JSON-RPC over stdio（原实现，逻辑保持不变）
 *   · Streamable HTTP：MCP 2025-06-18 规范（config.url 时启用，见 StreamableHttpTransport）
 * 协议规范: https://spec.modelcontextprotocol.io/
 */
import { spawn, ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { logger } from '../utils/logger.js';
import type { MCPServerConfig, MCPTool } from '../types/index.js';
import {
  StreamableHttpTransport,
  SUPPORTED_PROTOCOL_VERSIONS,
  LATEST_PROTOCOL_VERSION,
  type JsonRpcMessage,
} from './StreamableHttpTransport.js';

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

  /** Streamable HTTP 会话（config.url 模式下使用） */
  private httpTransport: StreamableHttpTransport | null = null;
  /** HTTP 模式的连接标志（stdio 模式以 process 存活为准） */
  private httpConnected = false;
  /** 协商后的协议版本（供诊断/日志） */
  negotiatedProtocolVersion: string | null = null;

  constructor(private config: MCPServerConfig) {
    this.serverName = config.name;
  }

  /** 启动 MCP 服务器连接并初始化（按配置自动选择 stdio / Streamable HTTP） */
  async connect(): Promise<MCPTool[]> {
    if (this.isConnected) {
      logger.warn({ server: this.serverName }, 'MCP 服务器已连接');
      return this.tools;
    }

    // 配置校验：url 与 command 二选一（url 优先）
    if (this.config.url) {
      return this.connectViaHttp();
    }
    if (this.config.command) {
      return this.connectViaStdio();
    }
    throw new Error(
      `MCP 服务器配置无效 (${this.serverName})：需要 command（stdio）或 url（Streamable HTTP）之一`,
    );
  }

  /**
   * Streamable HTTP 连接（2025-06-18 规范）
   * 流程：initialize（版本协商）→ 校验协商版本 → notifications/initialized → tools/list
   */
  private async connectViaHttp(): Promise<MCPTool[]> {
    logger.info({ server: this.serverName, url: this.config.url }, '连接 MCP 服务器（Streamable HTTP）');
    this.httpTransport = new StreamableHttpTransport(this.config.url!, this.config.headers || {});

    // ── initialize + 版本协商 ──
    // 客户端声明支持的最高版本；服务器返回它选择的版本，若我们不支持则必须断开
    let serverInfo: Record<string, unknown> | undefined;
    try {
      const result = (await this.httpRequest('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: 'EasyAgent', version: '0.6.40' },
      })) as { protocolVersion?: string; serverInfo?: Record<string, unknown> } | undefined;

      const negotiated = result?.protocolVersion;
      if (!negotiated || !SUPPORTED_PROTOCOL_VERSIONS.includes(negotiated as never)) {
        throw new Error(
          `MCP 服务器协议版本不支持: 服务器返回 ${negotiated ?? '（未返回）'}，` +
            `客户端支持 ${SUPPORTED_PROTOCOL_VERSIONS.join(' / ')}`,
        );
      }
      this.negotiatedProtocolVersion = negotiated;
      serverInfo = result?.serverInfo;
    } catch (err) {
      // 初始化失败：终止半建立的会话后向上抛
      await this.httpTransport.terminate();
      this.httpTransport = null;
      throw err;
    }

    // ── notifications/initialized（规范要求）──
    await this.httpNotify('notifications/initialized', {});

    // ── 工具列表 ──
    const result = (await this.httpRequest('tools/list', {})) as { tools?: Array<Record<string, unknown>> };
    this.tools = (result?.tools || []).map((t) => ({
      name: t.name as string,
      description: (t.description as string) || '',
      inputSchema: (t.inputSchema as Record<string, unknown>) || {},
      serverName: this.serverName,
    }));

    this.httpConnected = true;
    logger.info(
      {
        server: this.serverName,
        toolCount: this.tools.length,
        protocolVersion: this.negotiatedProtocolVersion,
        serverInfo: serverInfo?.name,
      },
      'MCP 服务器就绪（Streamable HTTP）',
    );
    return this.tools;
  }

  /** 原有 stdio 连接逻辑（纯保留，勿改动协议细节） */
  private async connectViaStdio(): Promise<MCPTool[]> {
    return new Promise((resolve, reject) => {
      try {
        logger.info({ command: this.config.command, args: this.config.args }, '启动 MCP 服务器');

        this.process = spawn(this.config.command!, this.config.args || [], {
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

        // 发送 initialize 请求（版本协商：旧版服务器可返回旧版本，客户端兼容接受）
        this.sendRequest('initialize', {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          clientInfo: { name: 'EasyAgent', version: '0.6.40' },
        })
          .then((result: any) => {
            // 校验协商版本（stdio 服务器可能仍返回 2024-11-05 —— 在支持列表内即接受）
            const negotiated = result?.protocolVersion as string | undefined;
            if (negotiated) {
              if (!SUPPORTED_PROTOCOL_VERSIONS.includes(negotiated as never)) {
                throw new Error(
                  `MCP 服务器协议版本不支持: ${negotiated}，` +
                    `客户端支持 ${SUPPORTED_PROTOCOL_VERSIONS.join(' / ')}`,
                );
              }
              this.negotiatedProtocolVersion = negotiated;
            }
            // 规范要求：initialize 成功后发送 notifications/initialized
            return this.sendNotification('notifications/initialized', {});
          })
          .then(() => this.sendRequest('tools/list', {}))
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
    if (this.config.url) {
      if (this.httpTransport) {
        await this.httpTransport.terminate();
      }
      this.httpTransport = null;
      this.httpConnected = false;
      this.tools = [];
      logger.info({ server: this.serverName }, 'MCP 已断开');
      return;
    }

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
    if (!this.isConnected) throw new Error(`MCP 服务器未连接: ${this.serverName}`);
    if (this.config.url) {
      return await this.httpRequest('tools/call', { name: toolName, arguments: args });
    }
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

  /** 是否已连接 */
  get isConnected(): boolean {
    if (this.config.url) {
      return this.httpConnected && this.httpTransport !== null;
    }
    return this.process !== null && !this.process.killed;
  }

  // ==================== Streamable HTTP 请求路径 ====================

  /** HTTP 模式：带通知回调的请求 */
  private async httpRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.httpTransport) throw new Error(`MCP 服务器未连接: ${this.serverName}`);
    const id = ++this.requestId;
    const message: JsonRpcMessage = { jsonrpc: '2.0', id, method, params };
    return await this.httpTransport.request(message, (m, p) => this.eventCallback?.(m, p));
  }

  /** HTTP 模式：发送通知 */
  private async httpNotify(method: string, params?: Record<string, unknown>): Promise<void> {
    if (!this.httpTransport) throw new Error(`MCP 服务器未连接: ${this.serverName}`);
    await this.httpTransport.notify({ jsonrpc: '2.0', method, params });
  }

  // ==================== stdio 请求路径（原逻辑） ====================

  /** 发送 JSON-RPC 请求（stdio） */
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

  /** 发送 JSON-RPC 通知（stdio，无 id 无响应） */
  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const message: JSONRPCMessage = { jsonrpc: '2.0', method, params };
    this.process?.stdin?.write(JSON.stringify(message) + '\n');
  }

  /** 处理服务器消息（stdio） */
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
}
