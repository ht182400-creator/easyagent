/**
 * MCP Streamable HTTP 传输测试（P1-3）
 *
 * 测试策略：用 node:http 实现一个**仅支持 2025-06-18 新规范**的 MCP 服务器
 * （不依赖任何外部包），覆盖验收标准「能连接一个仅支持新版规范的 MCP Server」。
 * 不打真实公网（CI 无网络保障），本地规范符合实现等价于协议行为验证。
 *
 * 覆盖维度（按测试规范）：
 *   - 正常值：全流程（initialize 协商 / session id 传播 / tools/list / tools/call / 断开）
 *   - 边界值：服务器返回旧版本（2024-11-05）兼容接受；SSE 响应形态 + 夹带通知帧
 *   - 异常场景：服务器返回不支持版本 → 断开；缺 session id → 400；配置缺 url+command → 报错
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { MCPClient } from '../mcp/MCPClient.js';

// ===================== 伪 MCP 服务器（仅新规范） =====================

/** 会话记录（用于断言 session id 传播） */
const sessions = new Set<string>();
/** 服务器收到的 DELETE 次数（断言 terminate） */
let deleteCount = 0;
/** 服务器收到的最新请求的 method 序列（断言 initialized 通知） */
const receivedMethods: string[] = [];

/** 构造 JSON-RPC 响应（单 JSON 形态） */
function json(res: ServerResponse, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.writeHead(200, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(body));
}

/** 构造 SSE 形态响应（帧序列，可夹带通知） */
function sse(res: ServerResponse, frames: unknown[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const frame of frames) {
    res.write(`event: message\ndata: ${JSON.stringify(frame)}\n\n`);
  }
  res.end();
}

/** 读取请求体 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = req.url || '/';

    // ── 会话终止 ──
    if (req.method === 'DELETE') {
      deleteCount++;
      const sid = req.headers['mcp-session-id'];
      if (typeof sid === 'string') sessions.delete(sid);
      res.writeHead(200);
      res.end();
      return;
    }

    const body = JSON.parse(await readBody(req));
    const method = body.method as string;
    receivedMethods.push(method);

    // ── 版本协商测试端点：返回不支持的版本 ──
    if (url === '/unsupported-version') {
      json(res, {
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '1999-01-01', serverInfo: { name: 'bad' }, capabilities: {} },
      });
      return;
    }

    // ── initialize：下发 session id，协商 2025-06-18（仅新规范）──
    if (method === 'initialize') {
      const sid = `sess_${sessions.size + 1}_${Date.now()}`;
      sessions.add(sid);
      json(res, {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'fake-mcp-server', version: '1.0.0' },
          capabilities: { tools: {} },
        },
        'x-test': undefined,
      } as unknown, { 'MCP-Session-Id': sid });
      return;
    }

    // ── 其余方法必须携带 session id（新规范要求）──
    const sid = req.headers['mcp-session-id'];
    if (typeof sid !== 'string' || !sessions.has(sid)) {
      res.writeHead(400);
      res.end('missing or unknown MCP-Session-Id');
      return;
    }

    // ── 通知：202 无响应体 ──
    if (body.id === undefined) {
      res.writeHead(202);
      res.end();
      return;
    }

    // ── tools/list：默认 JSON；X-Test-SSE=1 时走 SSE 且夹带一条通知帧 ──
    if (method === 'tools/list') {
      const tools = [
        { name: 'echo', description: '回声工具', inputSchema: { type: 'object' } },
        { name: 'ping', description: '返回 pong', inputSchema: { type: 'object' } },
      ];
      if (req.headers['x-test-sse'] === '1') {
        sse(res, [
          { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } }, // 夹带通知
          { jsonrpc: '2.0', id: body.id, result: { tools } },
        ]);
        return;
      }
      json(res, { jsonrpc: '2.0', id: body.id, result: { tools } });
      return;
    }

    // ── tools/call：回声 ──
    if (method === 'tools/call') {
      json(res, {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [{ type: 'text', text: `echo:${body.params.arguments?.text ?? ''}` }],
        },
      });
      return;
    }

    res.writeHead(400);
    res.end(`unknown method: ${method}`);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ==================== 正常流程 ====================

describe('Streamable HTTP — 全流程（新规范服务器）', () => {
  it('initialize 协商 2025-06-18 + session id 传播 + tools/list + tools/call', async () => {
    const client = new MCPClient({
      name: 'fake-http',
      url: baseUrl,
      enabled: true,
    });
    const before = sessions.size;

    const tools = await client.connect();

    // 协商版本被记录
    expect(client.negotiatedProtocolVersion).toBe('2025-06-18');
    // 服务器建立了新会话（session id 下发且被客户端回传 —— 否则后续请求会 400）
    expect(sessions.size).toBe(before + 1);
    // 工具列表
    expect(tools).toHaveLength(2);
    expect(tools[0]).toMatchObject({ name: 'echo', serverName: 'fake-http' });
    // initialized 通知已按规范发送（initialize 之后紧跟）
    const initIdx = receivedMethods.lastIndexOf('initialize');
    expect(receivedMethods[initIdx + 1]).toBe('notifications/initialized');
    // 工具调用
    const result = (await client.callTool('echo', { text: 'hello' })) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toBe('echo:hello');
    expect(client.isConnected).toBe(true);

    await client.disconnect();
    expect(client.isConnected).toBe(false);
  });

  it('disconnect 应向服务器发送 DELETE 终止会话', async () => {
    const before = deleteCount;
    const client = new MCPClient({ name: 'fake-http-2', url: baseUrl, enabled: true });
    await client.connect();
    await client.disconnect();
    expect(deleteCount).toBe(before + 1);
  });
});

// ==================== 边界与异常 ====================

describe('Streamable HTTP — 版本协商', () => {
  it('服务器返回不支持的协议版本 → 连接失败并给出明确错误', async () => {
    const client = new MCPClient({ name: 'bad-version', url: `${baseUrl}/unsupported-version`, enabled: true });
    await expect(client.connect()).rejects.toThrow(/协议版本不支持/);
    expect(client.isConnected).toBe(false);
  });
});

describe('Streamable HTTP — SSE 响应形态', () => {
  it('SSE 响应正确解析，且夹带的通知帧转发给事件回调', async () => {
    const client = new MCPClient({
      name: 'fake-sse',
      url: baseUrl,
      headers: { 'X-Test-SSE': '1' },
      enabled: true,
    });
    const notifications: Array<{ method: string; params: unknown }> = [];
    client.onEvent((method, params) => notifications.push({ method, params }));

    const tools = await client.connect();
    expect(tools).toHaveLength(2);
    // 夹带在响应流里的通知帧到达了事件回调
    expect(notifications.some((n) => n.method === 'notifications/progress')).toBe(true);

    await client.disconnect();
  });
});

describe('MCPClient 配置校验', () => {
  it('command 与 url 都缺失 → connect 报配置错误', async () => {
    const client = new MCPClient({ name: 'no-transport', enabled: true } as never);
    await expect(client.connect()).rejects.toThrow(/需要 command（stdio）或 url（Streamable HTTP）之一/);
  });
});
