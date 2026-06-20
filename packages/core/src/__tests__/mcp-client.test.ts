/**
 * MCP 客户端和管理器测试
 * 覆盖 MCPClient、MCPManager 的正常与异常场景
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

/** 创建临时测试目录 */
function createTestDir(): string {
  const dir = resolve(tmpdir(), `ea-mcp-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 创建临时 MCP 服务端脚本文件，解决 Windows cmd.exe 对 node -e 内联脚本的转义问题
 * @returns [脚本文件路径, 工作目录] 用于清理
 */
function createMcpScript(scriptCode: string): [string, string] {
  const dir = createTestDir();
  const scriptPath = join(dir, 'mcp-server.js');
  writeFileSync(scriptPath, scriptCode, 'utf-8');
  return [scriptPath, dir];
}

/** 清理临时目录 */
function cleanMcpDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch (err) { }
}

// ==================== MCPClient 测试 ====================
describe('MCPClient - 基础功能', () => {
  let MCPClient: any;

  beforeAll(async () => {
    const mod = await import('../mcp/MCPClient.js');
    MCPClient = mod.MCPClient;
  });

  it('应正确创建MCPClient实例并设置serverName', () => {
    const client = new MCPClient({
      name: 'test-server',
      command: 'echo',
      args: ['hello'],
      enabled: true,
    });
    expect(client.serverName).toBe('test-server');
    expect(client.isConnected).toBe(false);
  });

  it('未连接时getTools应返回空数组', () => {
    const client = new MCPClient({
      name: 'test-server',
      command: 'echo',
      args: [],
      enabled: true,
    });
    expect(client.getTools()).toEqual([]);
  });

  it('未连接时callTool应抛出异常', async () => {
    const client = new MCPClient({
      name: 'test-server',
      command: 'echo',
      args: [],
      enabled: true,
    });
    await expect(client.callTool('some-tool', {})).rejects.toThrow('MCP 服务器未连接');
  });

  it('connect应能连接到真实MCP echo服务器', async () => {
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0', id: m.id,
    result: { tools: [{ name: 'echo', description: 'Echo tool', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] }
  }) + '\\n');
});
`);
    const client = new MCPClient({
      name: 'echo-server', command: 'node', args: [scriptPath], enabled: true,
    });
    try {
      const tools = await client.connect();
      expect(tools.length).toBeGreaterThanOrEqual(1);
      const echoTool = tools.find((t: any) => t.name === 'echo');
      expect(echoTool).toBeDefined();
      expect(echoTool?.serverName).toBe('echo-server');
    } finally {
      await client.disconnect();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('connect后getTools应返回已连接的工具列表', async () => {
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'test', version: '1.0' } } }) + '\\n');
  } else if (m.method === 'tools/list') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'tool_a', description: 'A' }, { name: 'tool_b', description: 'B' }] } }) + '\\n');
  } else {
    // 处理 shutdown 等其他请求，避免 disconnect 挂起
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {} }) + '\\n');
  }
});
`);
    const client = new MCPClient({
      name: 'tools-server', command: 'node', args: [scriptPath], enabled: true,
    });
    try {
      const tools = await client.connect();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('tool_a');
      expect(tools[1].name).toBe('tool_b');
    } finally {
      await client.disconnect();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('重复connect应返回相同工具列表(不重新初始化)', async () => {
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'single_tool' }] } }) + '\\n');
});
`);
    const client = new MCPClient({
      name: 'reconnect-server', command: 'node', args: [scriptPath], enabled: true,
    });
    try {
      const tools1 = await client.connect();
      const tools2 = await client.connect(); // 第二次
      expect(tools2).toEqual(tools1);
    } finally {
      await client.disconnect();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('disconnect应清空工具列表', async () => {
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'tmp_tool' }] } }) + '\\n');
});
`);
    const client = new MCPClient({
      name: 'disc-server', command: 'node', args: [scriptPath], enabled: true,
    });
    try {
      await client.connect();
      await client.disconnect();
      expect(client.isConnected).toBe(false);
      expect(client.getTools()).toEqual([]);
    } finally {
      cleanMcpDir(dir);
    }
  }, 10000);

  it('onEvent应设置事件回调', () => {
    const client = new MCPClient({
      name: 'evt-server',
      command: 'echo',
      args: [],
      enabled: true,
    });
    let calledWith = '';
    client.onEvent((toolName: string, data: unknown) => {
      calledWith = toolName;
    });
    // 回调已设置，后续消息会触发
    expect(typeof client.eventCallback).toBe('function');
  });
});

describe('MCPClient - 异常场景', () => {
  let MCPClient: any;

  beforeAll(async () => {
    const mod = await import('../mcp/MCPClient.js');
    MCPClient = mod.MCPClient;
  });

  it('连接不存在的命令应失败', async () => {
    const client = new MCPClient({
      name: 'bad-server',
      command: 'non_existent_command_xyz_42',
      args: [],
      enabled: true,
    });
    await expect(client.connect()).rejects.toThrow();
  }, 10000);

  it('MCP服务器返回错误响应应被正确处理', async () => {
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, error: { code: -32603, message: 'Internal error' } }) + '\\n');
});
`);
    const client = new MCPClient({
      name: 'err-server', command: 'node', args: [scriptPath], enabled: true,
    });
    try {
      await expect(client.connect()).rejects.toThrow('Internal error');
    } finally {
      cleanMcpDir(dir);
    }
  }, 10000);

  it('callTool在未连接状态下应抛出异常', async () => {
    const client = new MCPClient({
      name: 'no-conn',
      command: 'echo',
      args: [],
      enabled: true,
    });
    await expect(client.callTool('tool', {})).rejects.toThrow('MCP 服务器未连接');
  });

  it('disconnect不存在的连接应无操作', async () => {
    const client = new MCPClient({
      name: 'null-server',
      command: 'echo',
      args: [],
      enabled: true,
    });
    await expect(client.disconnect()).resolves.toBeUndefined();
  });
});

// ==================== MCPManager 测试 ====================
describe('MCPManager - 连接管理', () => {
  let MCPManager: any;

  beforeAll(async () => {
    const mod = await import('../mcp/MCPManager.js');
    MCPManager = mod.MCPManager;
  });

  it('应正确创建MCPManager实例', () => {
    const manager = new MCPManager();
    expect(manager.getConnectedServers()).toEqual([]);
    expect(manager.getAllITools()).toEqual([]);
  });

  it('connect应连接MCP服务器并返回ITool格式', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'tool1', description: 'Tool 1' }] } }) + '\\n');
});
`);
    try {
      const tools = await manager.connect({
        name: 'test-mcp', command: 'node', args: [scriptPath], enabled: true,
      });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('mcp_test-mcp_tool1');
      expect(tools[0].description).toContain('[MCP:test-mcp]');
    } finally {
      await manager.disconnect('test-mcp');
      cleanMcpDir(dir);
    }
  }, 10000);

  it('重复连接同名服务器应断开旧连接', async () => {
    const manager = new MCPManager();
    const [scriptPath1, dir1] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'v1' }] } }) + '\\n');
});
`);
    const [scriptPath2, dir2] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'v2' }] } }) + '\\n');
});
`);
    try {
      await manager.connect({
        name: 'dup-server', command: 'node', args: [scriptPath1], enabled: true,
      });
      // 第二次连接
      const tools = await manager.connect({
        name: 'dup-server', command: 'node', args: [scriptPath2], enabled: true,
      });
      expect(tools[0].name).toContain('v2');
      expect(manager.getConnectedServers().length).toBe(1);
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir1);
      cleanMcpDir(dir2);
    }
  }, 15000);

  it('connect失败应清理已添加的client', async () => {
    const manager = new MCPManager();
    await expect(manager.connect({
      name: 'fail-server',
      command: 'non_existent_cmd_xyz_99',
      args: [],
      enabled: true,
    })).rejects.toThrow();
    expect(manager.getConnectedServers()).toEqual([]);
  }, 10000);

  it('disconnectAll应断开所有连接', async () => {
    const manager = new MCPManager();
    const [scriptPathA, dirA] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'a' }] } }) + '\\n');
});
`);
    const [scriptPathB, dirB] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'b' }] } }) + '\\n');
});
`);
    try {
      await manager.connect({
        name: 'srv-a', command: 'node', args: [scriptPathA], enabled: true,
      });
      await manager.connect({
        name: 'srv-b', command: 'node', args: [scriptPathB], enabled: true,
      });
      expect(manager.getConnectedServers().length).toBe(2);
      await manager.disconnectAll();
      expect(manager.getConnectedServers()).toEqual([]);
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dirA);
      cleanMcpDir(dirB);
    }
  }, 15000);
});

describe('MCPManager - 工具调用与转换', () => {
  let MCPManager: any;

  beforeAll(async () => {
    const mod = await import('../mcp/MCPManager.js');
    MCPManager = mod.MCPManager;
  });

  it('convertToITool应正确添加MCP前缀', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'my_tool', description: 'Desc', inputSchema: { type: 'object', properties: { param: { type: 'string' } }, required: ['param'] } }] } }) + '\\n');
});
`);
    try {
      const tools = await manager.connect({
        name: 'prefix-test', command: 'node', args: [scriptPath], enabled: true,
      });
      expect(tools[0].name).toBe('mcp_prefix-test_my_tool');
      expect(tools[0].parameters.required).toContain('param');
      expect(tools[0].parameters.properties.param).toEqual({ type: 'string' });
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('callTool应能调用已连接的MCP工具', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'tools/call') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Result: ' + JSON.stringify(m.params.arguments) }] } }) + '\\n');
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'echo' }] } }) + '\\n');
  }
});
`);
    try {
      const tools = await manager.connect({
        name: 'echo-srv', command: 'node', args: [scriptPath], enabled: true,
      });
      const result = await manager.callTool('mcp_echo-srv_echo', { input: 'hello' });
      expect(result.success).toBe(true);
      expect(result.content).toContain('hello');
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('callTool无效的工具名称应返回错误', async () => {
    const manager = new MCPManager();
    const result = await manager.callTool('invalid_name', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_MCP_TOOL');
  });

  it('callTool未连接的服务器应返回错误', async () => {
    const manager = new MCPManager();
    const result = await manager.callTool('mcp_gone-server_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toBe('MCP_NOT_CONNECTED');
  });

  it('getAllITools应返回所有已连接服务器的工具', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'tool_x' }, { name: 'tool_y' }] } }) + '\\n');
});
`);
    try {
      await manager.connect({
        name: 'multi-srv', command: 'node', args: [scriptPath], enabled: true,
      });
      const allTools = manager.getAllITools();
      expect(allTools.length).toBe(2);
      expect(allTools[0].name).toContain('mcp_multi-srv');
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('autoApprove应设置requiresConfirm为false', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'safe_tool' }, { name: 'danger_tool' }] } }) + '\\n');
});
`);
    try {
      const tools = await manager.connect({
        name: 'auto-srv', command: 'node', args: [scriptPath], enabled: true,
        autoApprove: ['safe_tool'],
      });
      const safeTool = tools.find((t: any) => t.name.includes('safe_tool'));
      const dangerTool = tools.find((t: any) => t.name.includes('danger_tool'));
      expect(safeTool.requiresConfirm).toBe(false);
      expect(dangerTool.requiresConfirm).toBe(true);
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir);
    }
  }, 10000);

  it('extractContent应正确提取MCP content数组格式', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'tools/call') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Line 1' }, { type: 'text', text: 'Line 2' }] } }) + '\\n');
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'extract' }] } }) + '\\n');
  }
});
`);
    try {
      const tools = await manager.connect({
        name: 'extract-srv', command: 'node', args: [scriptPath], enabled: true,
      });
      const result = await manager.callTool('mcp_extract-srv_extract', {});
      expect(result.success).toBe(true);
      expect(result.content).toContain('Line 1');
      expect(result.content).toContain('Line 2');
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir);
    }
  }, 10000);
});

describe('MCPManager - 边界与异常', () => {
  let MCPManager: any;

  beforeAll(async () => {
    const mod = await import('../mcp/MCPManager.js');
    MCPManager = mod.MCPManager;
  });

  it('空name参数的MCP工具名解析', async () => {
    const manager = new MCPManager();
    const result = await manager.callTool('mcp__tool', {});
    // serverName为空
    expect(result.success).toBe(false);
  });

  it('两个下划线的MCP工具名解析', async () => {
    const manager = new MCPManager();
    const result = await manager.callTool('not_mcp_server_tool', {});
    // 不以mcp开头
    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_MCP_TOOL');
  });

  it('单个字符串的extractContent应原样返回', async () => {
    const manager = new MCPManager();
    const [scriptPath, dir] = createMcpScript(`
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const m = JSON.parse(line);
  if (m.method === 'tools/call') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: 'simple string result' }) + '\\n');
  } else {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'strtool' }] } }) + '\\n');
  }
});
`);
    try {
      const tools = await manager.connect({
        name: 'str-srv', command: 'node', args: [scriptPath], enabled: true,
      });
      const result = await manager.callTool('mcp_str-srv_strtool', {});
      expect(result.success).toBe(true);
    } finally {
      await manager.disconnectAll();
      cleanMcpDir(dir);
    }
  }, 10000);
});
