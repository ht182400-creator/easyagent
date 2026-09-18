/**
 * MCP Streamable HTTP 传输（2025-06-18 规范，P1-3）
 *
 * ── 规范要点（实现依据）──
 *   1. 客户端向服务器端点 **POST JSON-RPC 消息**，`Accept: application/json, text/event-stream`；
 *   2. 服务器可用 **单 JSON 响应** 或 **SSE 流**（多帧 `data:` 行）返回；
 *   3. initialize 响应可能携带 `MCP-Session-Id` 头 —— 后续请求必须回带；
 *   4. 协议协商：客户端在 initialize 中发送其支持的最高协议版本，
 *      服务器返回它选择的版本 —— 客户端不支持该版本则必须断开；
 *   5. initialize 成功后客户端必须发送 `notifications/initialized` 通知；
 *   6. 后续请求携带 `MCP-Protocol-Version` 头（声明协商后的版本）；
 *   7. 通知（notification，无 id）POST 后服务器返回 202 Accepted；
 *   8. 会话终止：DELETE 端点（带 session id）。
 *
 * 未实现（记录为 TODO）：GET 长连接 SSE 通道（服务器主动推送）——
 * 当前场景（工具列表 + 工具调用，客户端驱动）不需要，避免引入常驻连接复杂度。
 *
 * @module mcp/StreamableHttpTransport
 */

import { logger } from '../utils/logger.js';

/** 客户端支持的协议版本（从新到旧） */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

/** 客户端在 initialize 中声明支持的最新版本 */
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** 单次请求超时（毫秒） */
const REQUEST_TIMEOUT_MS = 30_000;

/** JSON-RPC 消息（请求/响应/通知共用） */
export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** 传输层的通知回调（服务器主动消息） */
export type NotificationHandler = (method: string, params: unknown) => void;

/**
 * Streamable HTTP 会话
 *
 * 一个实例对应一个 MCP 服务器会话（含 session id 与协商版本）。
 */
export class StreamableHttpTransport {
  /** initialize 响应返回的会话 id（服务器未下发则为 null） */
  private sessionId: string | null = null;
  /** 协商后的协议版本（initialize 完成后非空） */
  negotiatedVersion: string | null = null;

  /**
   * @param url - MCP 服务器端点 URL
   * @param extraHeaders - 附加请求头（如 Authorization；session/protocol 头由本类管理，勿在此传）
   */
  constructor(
    private readonly url: string,
    private readonly extraHeaders: Record<string, string> = {},
  ) {}

  /**
   * 发送 JSON-RPC 请求并等待匹配响应
   *
   * @param message - 完整 JSON-RPC 请求（含 id）
   * @param onNotification - 等待期间收到的服务器通知回调（可空）
   * @returns 响应的 result
   * @throws 服务器返回 JSON-RPC error / HTTP 错误 / 会话失效 / 超时
   */
  async request(
    message: JsonRpcMessage,
    onNotification?: NotificationHandler,
  ): Promise<unknown> {
    const result = await this.send(message, onNotification);
    if (result.error) {
      throw new Error(result.error.message || `MCP JSON-RPC 错误 (code=${result.error.code})`);
    }
    return result.result;
  }

  /**
   * 发送通知（无 id，服务器返回 202 即成功）
   */
  async notify(message: JsonRpcMessage): Promise<void> {
    await this.send(message);
  }

  /**
   * 终止会话（DELETE 端点；服务器可能不支持 —— 静默忽略失败）
   */
  async terminate(): Promise<void> {
    try {
      await fetch(this.url, {
        method: 'DELETE',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      logger.debug({ url: this.url, error: (err as Error).message }, 'MCP 会话终止请求失败（忽略）');
    }
  }

  /**
   * 发送消息的核心实现：POST → 按响应形态（JSON / SSE / 202）解析
   */
  private async send(
    message: JsonRpcMessage,
    onNotification?: NotificationHandler,
  ): Promise<JsonRpcMessage> {
    const isNotification = message.id === undefined;

    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`MCP HTTP 请求失败: ${(err as Error).message} (${this.url})`);
    }

    // 会话失效：按规范客户端应重新 initialize（上层决定，这里给出明确错误）
    if (res.status === 404) {
      throw new Error('MCP 会话已失效（404）—— 请重新连接');
    }
    if (res.status === 400 || res.status === 405) {
      // 400/405 可能是"该端点不支持本方法"，也可能是不接受 POST —— 视为错误透出
      const body = await res.text().catch(() => '');
      throw new Error(`MCP 服务器拒绝请求（HTTP ${res.status}）: ${body.slice(0, 200)}`);
    }
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => '');
      throw new Error(`MCP HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    // 记录服务器下发的会话 id（仅在尚未持有时采用；已有会话时忽略变更）
    const sid = res.headers.get('mcp-session-id');
    if (sid && !this.sessionId) {
      this.sessionId = sid;
      logger.debug({ url: this.url }, 'MCP 会话已建立（MCP-Session-Id）');
    }

    // 通知（202 Accepted，无响应体）
    if (isNotification) {
      if (res.status !== 202) {
        logger.debug({ url: this.url, status: res.status }, 'MCP 通知返回了非 202 状态（容忍）');
      }
      return { jsonrpc: '2.0' };
    }

    // ── 响应形态分派 ──
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      return await this.readSseResponse(res, message.id!, onNotification);
    }
    if (contentType.includes('application/json')) {
      const msg = (await res.json()) as JsonRpcMessage;
      if (msg.method && onNotification) onNotification(msg.method, msg.params);
      return msg;
    }

    // 既非 JSON 也非 SSE：读出文本帮助定位（如服务器误配返回 HTML）
    const body = await res.text().catch(() => '');
    throw new Error(`MCP 响应形态不支持（content-type=${contentType}）: ${body.slice(0, 200)}`);
  }

  /**
   * 解析 SSE 流式响应，直到出现与请求 id 匹配的响应帧
   *
   * 规范允许服务器在响应流中夹带通知帧 —— 逐帧转发给 onNotification。
   */
  private async readSseResponse(
    res: Response,
    requestId: number | string,
    onNotification?: NotificationHandler,
  ): Promise<JsonRpcMessage> {
    const body = res.body;
    if (!body) throw new Error('MCP SSE 响应缺少 body');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    /** 从已累积的缓冲中逐帧解析 data: 行 */
    const tryParseFrames = (): JsonRpcMessage | null => {
      for (;;) {
        const idx = buffer.indexOf('\n\n');
        if (idx === -1) return null; // 帧未完整，等待更多数据
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // 一个帧可有多行 data:（拼接后为一条消息）
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('\n');
        if (!data) continue; // event: id: 等无 data 行的帧跳过

        try {
          const msg = JSON.parse(data) as JsonRpcMessage;
          if (msg.id === requestId) return msg; // 命中本请求的响应
          if (msg.method && onNotification) onNotification(msg.method, msg.params);
        } catch {
          logger.debug({ url: this.url }, 'MCP SSE 帧不是合法 JSON（跳过）');
        }
      }
    };

    // 先解析可能已在首块中的完整帧
    // （把 reader 读取放进循环：每块追加后立即尝试解析）
    const timeout = setTimeout(() => reader.cancel().catch(() => {}), REQUEST_TIMEOUT_MS);
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) throw new Error('MCP SSE 流在收到响应前结束');
        buffer += decoder.decode(value, { stream: true });
        const matched = tryParseFrames();
        if (matched) {
          if (matched.error) {
            throw new Error(matched.error.message || 'MCP JSON-RPC 错误');
          }
          return matched;
        }
      }
    } finally {
      clearTimeout(timeout);
      // 响应已取到所需内容即关闭流（规范允许客户端随时关闭 GET/POST 流）
      reader.cancel().catch(() => {});
    }
  }

  /**
   * 组装请求头（session / protocol-version 由本类统一管理）
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...this.extraHeaders,
    };
    if (this.sessionId) {
      headers['MCP-Session-Id'] = this.sessionId;
    }
    if (this.negotiatedVersion) {
      headers['MCP-Protocol-Version'] = this.negotiatedVersion;
    }
    return headers;
  }
}
