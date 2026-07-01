/**
 * LangGraph Demo HTTP 服务器
 *
 * 提供 Web UI 来可视化有向图结构和运行 Demo 场景。
 * 启动方式：
 *   pnpm demo:web                              （启动服务 + 打开浏览器）
 *   npx tsx scripts/demo-server.ts             （只启动服务）
 *
 * API 端点：
 *   GET  /api/graph         → 图结构 JSON（节点 + 边）
 *   GET  /api/scenarios     → 场景列表（元数据）
 *   POST /api/run/:id       → 运行单个场景（1-6）
 *   POST /api/run-all       → 运行全部场景
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HumanMessage } from '@langchain/core/messages';
import type { ToolResult } from '../src/index';
import {
  createAgentGraph,
  LangGraphAgent,
  loadLogConfig,
  setGlobalLevelByName,
} from '../src/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
/**
 * LangGraph Demo 专用端口
 * 可通过环境变量 LANGGRAPH_PORT 覆盖，默认 3455（避免与 EasyAgent 主后端 3456 冲突）
 * 示例：set LANGGRAPH_PORT=3461 && npx tsx scripts/demo-server.ts
 */
const PORT = parseInt(process.env.LANGGRAPH_PORT || '3455', 10);

// ==================== 日志配置 ====================
// Web 模式下降低日志等级，避免 API 响应被日志污染
loadLogConfig();
setGlobalLevelByName('error');

// ==================== 类型定义 ====================

interface GraphNode {
  id: string;
  label: string;
  type: 'start' | 'process' | 'decision' | 'end';
  x: number;
  y: number;
  description: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
  type: 'solid' | 'dashed' | 'conditional';
  condition?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    name: string;
    totalNodes: number;
    totalEdges: number;
    maxTurns: number;
    hasCheckpointer: boolean;
  };
}

interface ScenarioMeta {
  id: number;
  name: string;
  path: string;
  description: string;
  input: string;
  icon: 'chat' | 'tools' | 'parallel' | 'shield' | 'database' | 'graph';
}

interface StepLog {
  node: string;
  type: 'enter' | 'info' | 'warn' | 'exit' | 'decision';
  message: string;
  detail?: Record<string, unknown>;
}

interface ScenarioResult {
  id: number;
  success: boolean;
  turnCount: number;
  messageCount: number;
  output: string;
  logs: StepLog[];
  duration: string;
  /** 实际遍历路径（节点 ID 序列），用于更新卡片流转图 */
  actualPath?: string[];
  error?: string;
}

// ==================== 图结构数据 ====================

const GRAPH_DATA: GraphData = {
  nodes: [
    { id: 'START', label: 'START', type: 'start', x: 400, y: 30, description: '入口节点，接收用户输入' },
    { id: 'think', label: 'think', type: 'process', x: 400, y: 140, description: 'LLM 思考节点\n调用大模型分析输入\n决定是否需要工具' },
    { id: 'route', label: 'route', type: 'decision', x: 400, y: 260, description: '条件路由\n根据 tool_calls 决策\n下一步走向' },
    { id: 'act', label: 'act', type: 'process', x: 150, y: 260, description: '工具执行节点\n并行/串行调用工具\n收集执行结果' },
    { id: 'observe', label: 'observe', type: 'process', x: 150, y: 370, description: '观察节点\n检查执行结果\n决定是否继续循环' },
    { id: 'END', label: 'END', type: 'end', x: 660, y: 260, description: '结束节点\n返回最终结果' },
  ],
  edges: [
    { from: 'START', to: 'think', label: 'addEdge', type: 'solid' },
    { from: 'think', to: 'route', label: 'addEdge', type: 'solid' },
    { from: 'route', to: 'act', label: '有 tool_calls', type: 'conditional', condition: 'tool_calls > 0' },
    { from: 'route', to: 'END', label: '无 tool_calls', type: 'conditional', condition: 'tool_calls = 0' },
    { from: 'act', to: 'observe', label: 'addEdge', type: 'solid' },
    { from: 'observe', to: 'think', label: '循环', type: 'dashed', condition: 'turnCount < maxTurns' },
  ],
  metadata: {
    name: 'LangGraph Agent',
    totalNodes: 6,
    totalEdges: 6,
    maxTurns: 25,
    hasCheckpointer: true,
  },
};

const SCENARIOS: ScenarioMeta[] = [
  {
    id: 1,
    name: '纯文本对话',
    path: 'START → think → END',
    description: '用户发送纯文本，LLM 直接回复，无工具调用',
    input: '"你好"',
    icon: 'chat',
  },
  {
    id: 2,
    name: '工具调用循环',
    path: 'START → think → act → observe → think → END',
    description: 'LLM 调用天气查询工具，act 执行后 observe 观察结果，最终返回自然语言回答',
    input: '"北京今天天气怎么样？"',
    icon: 'tools',
  },
  {
    id: 3,
    name: '多工具并行',
    path: 'think → act(并行) → observe → think → END',
    description: 'LLM 同时调用天气+时间两个工具，act 并行执行，验证并发能力',
    input: '"深圳天气和时间"',
    icon: 'parallel',
  },
  {
    id: 4,
    name: 'maxTurns 安全终止',
    path: 'think → act → observe (×3) → END',
    description: '设置 maxTurns=3，LLM 持续请求工具但系统在第 3 轮强制终止，防止死循环',
    input: '"开始无限循环"',
    icon: 'shield',
  },
  {
    id: 5,
    name: 'Checkpoint + Resume',
    path: 'run → checkpoint → resume → 继续对话',
    description: '第一轮对话后自动保存 checkpoint，第二轮 resume 恢复上下文，演示持久化能力',
    input: '"记住我喜欢蓝色" → Resume',
    icon: 'database',
  },
  {
    id: 6,
    name: '图结构可视化',
    path: '全部节点和边的关系',
    description: '完整展示 LangGraph Agent 有向图的所有节点和边，清晰呈现环形控制流',
    input: '—',
    icon: 'graph',
  },
  {
    id: 7,
    name: '上下文摘要与压缩',
    path: '长对话 → 摘要压缩 → think → END',
    description: '模拟超长对话（200+条消息），MemoryManager 触发自动摘要压缩，保留关键信息',
    input: '"继续讨论..." (含200条历史)',
    icon: 'chat',
  },
  {
    id: 8,
    name: '工具失败自动重试',
    path: 'think → act(失败) → observe → think(修正) → act(成功) → END',
    description: '工具第1次调用返回失败（参数错误），系统自动检测并修正参数重试',
    input: '"今天天气怎么样？"',
    icon: 'shield',
  },
  {
    id: 9,
    name: '链式工具调用',
    path: 'act(read_file) → observe → think → act(analyze_data) → END',
    description: '工具A(read_file)的输出作为工具B(analyze_data)的输入，验证工具间数据传递',
    input: '"读取用户数据并分析"',
    icon: 'tools',
  },
];

function getScenarioIcon(id: number): string {
  const icons: Record<number, string> = {
    1: '💬', 2: '🔧', 3: '⚡', 4: '🛡️', 5: '💾', 6: '🗺️',
    7: '🧠', 8: '🔄', 9: '⛓️',
  };
  return icons[id] || '📌';
}

// ==================== Mock 工厂 ====================

interface MockResponse {
  c?: string;
  tc?: Array<{ id: string; n: string; a: Record<string, unknown> }>;
  fr?: string;
}

function mockChat(responses: MockResponse[]) {
  let i = 0;
  return async (_messages: unknown[], _options?: unknown) => {
    const r = responses[i++] || { c: '', fr: 'stop' };
    return {
      content: r.c || '',
      toolCalls: r.tc?.map(t => ({
        id: t.id,
        type: 'function' as const,
        function: { name: t.n, arguments: JSON.stringify(t.a) },
      })),
      finishReason: r.fr || 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  };
}

/** 创建 Mock 工具执行器，返回符合 ToolExecutor 接口的对象 */
function mockExec(results: Record<string, ToolResult> = {}): { execute: ToolExecutor['execute'] } {
  return {
    execute: async (name: string, _params: Record<string, unknown>): Promise<ToolResult> => {
      const r = results[name];
      if (r) return r;
      return { success: true, content: `${name} 完成` };
    },
  };
}

// ==================== 场景执行器 ====================

async function runScenario1(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  const chat = mockChat([{ c: '你好！我是测试助手，有什么可以帮你？', fr: 'stop' }]);
  const graph = createAgentGraph({
    think: { chat, getToolDefinitions: () => [], systemPrompt: '你是有帮助的助手' },
    act: { toolExecutor: mockExec() },
  });

  logs.push({ node: 'START', type: 'enter', message: '接收用户输入 "你好"' });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '你好' })],
    sessionId: 'demo-1',
    maxTurns: 5,
  });

  logs.push({ node: 'think', type: 'enter', message: 'LLM 思考中...' });
  logs.push({
    node: 'think',
    type: 'info',
    message: 'LLM 返回纯文本',
    detail: { contentLen: 18, finishReason: 'stop' },
  });
  logs.push({ node: 'route', type: 'decision', message: '决策: 无 tool_calls → END' });

  const msgs = r.messages as any[];
  return {
    id: 1,
    success: true,
    turnCount: r.turnCount ?? 1,
    messageCount: msgs.length,
    output: msgs[msgs.length - 1].content,
    logs,
    actualPath: ['START', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario2(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  const chat = mockChat([
    { c: '让我查询北京天气', tc: [{ id: 'c1', n: 'get_weather', a: { city: '北京' } }], fr: 'tool_calls' },
    { c: '北京今天晴天，气温 25°C，适合出行。', fr: 'stop' },
  ]);
  const exec = mockExec({ get_weather: { success: true, content: '晴天 25°C' } });
  const graph = createAgentGraph({
    think: {
      chat,
      getToolDefinitions: () => [
        { name: 'get_weather', description: '查询天气', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
      ],
    },
    act: { toolExecutor: exec },
  });

  logs.push({ node: 'START', type: 'enter', message: '接收用户输入 "北京今天天气怎么样？"' });
  logs.push({
    node: 'think',
    type: 'info',
    message: 'LLM 返回 tool_calls: get_weather(city="北京")',
    detail: { toolName: 'get_weather', args: { city: '北京' } },
  });
  logs.push({ node: 'route', type: 'decision', message: '决策: 有 tool_calls → act' });
  logs.push({ node: 'act', type: 'enter', message: '执行工具 get_weather' });
  logs.push({ node: 'act', type: 'info', message: '工具结果: 晴天 25°C' });
  logs.push({ node: 'observe', type: 'enter', message: '观察执行结果' });
  logs.push({ node: 'observe', type: 'decision', message: '决策: 继续 → think' });
  logs.push({ node: 'think', type: 'enter', message: 'LLM 再次思考（含工具结果上下文）' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 返回最终自然语言回答' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 无 tool_calls → END' });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '北京今天天气怎么样？' })],
    sessionId: 'demo-2',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  return {
    id: 2,
    success: true,
    turnCount: r.turnCount ?? 2,
    messageCount: msgs.length,
    output: msgs[msgs.length - 1].content,
    logs,
    actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario3(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  const chat = mockChat([
    {
      c: '并发查询',
      tc: [
        { id: 'c1', n: 'get_weather', a: { city: '深圳' } },
        { id: 'c2', n: 'get_time', a: {} },
      ],
      fr: 'tool_calls',
    },
    { c: '深圳今天多云 30°C，当前时间 2026-06-28 14:30', fr: 'stop' },
  ]);
  const exec = mockExec({
    get_weather: { success: true, content: '多云 30°C' },
    get_time: { success: true, content: '2026-06-28 14:30' },
  });
  const graph = createAgentGraph({
    think: {
      chat,
      getToolDefinitions: () => [
        { name: 'get_weather', description: '', parameters: { type: 'object', properties: {} } },
        { name: 'get_time', description: '', parameters: { type: 'object', properties: {} } },
      ],
    },
    act: { toolExecutor: exec },
  });

  logs.push({ node: 'START', type: 'enter', message: '接收用户输入 "深圳天气和时间"' });
  logs.push({
    node: 'think',
    type: 'info',
    message: 'LLM 返回 2 个 tool_calls: get_weather + get_time',
    detail: { toolCount: 2, toolNames: ['get_weather', 'get_time'] },
  });
  logs.push({ node: 'route', type: 'decision', message: '决策: 有 tool_calls → act' });
  logs.push({ node: 'act', type: 'enter', message: '并行执行 2 个工具 (Promise.all)' });
  logs.push({ node: 'act', type: 'info', message: 'get_weather → 多云 30°C | get_time → 2026-06-28 14:30' });
  logs.push({ node: 'observe', type: 'enter', message: '观察并行执行结果' });
  logs.push({ node: 'observe', type: 'decision', message: '决策: 继续 → think' });
  logs.push({ node: 'think', type: 'enter', message: 'LLM 综合两个工具结果生成回答' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 无 tool_calls → END' });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '深圳天气和时间' })],
    sessionId: 'demo-3',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  return {
    id: 3,
    success: true,
    turnCount: r.turnCount ?? 2,
    messageCount: msgs.length,
    output: msgs[msgs.length - 1].content,
    logs,
    actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario4(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  const chat = mockChat(
    Array(10).fill({
      c: '仍在计算...',
      tc: [{ id: 'cx', n: 'loop', a: {} }],
      fr: 'tool_calls',
    })
  );
  const exec = mockExec({ loop: { success: true, content: 'looping' } });
  const graph = createAgentGraph({
    think: {
      chat,
      getToolDefinitions: () => [{ name: 'loop', description: '', parameters: { type: 'object', properties: {} } }],
    },
    act: { toolExecutor: exec },
  });

  logs.push({ node: 'START', type: 'enter', message: '接收输入 "开始无限循环"，maxTurns=3' });

  for (let i = 0; i < 3; i++) {
    logs.push({ node: 'think', type: 'enter', message: `第 ${i + 1} 轮 LLM 思考` });
    logs.push({ node: 'think', type: 'info', message: 'LLM 返回 tool_calls: loop()' });
    logs.push({ node: 'route', type: 'decision', message: i < 2 ? '决策: 有 tool_calls → act' : '决策: 轮次超限 (3/3) → END' });
    if (i < 2) {
      logs.push({ node: 'act', type: 'enter', message: '执行工具 loop' });
      logs.push({ node: 'observe', type: 'enter', message: '观察执行结果 → 继续循环' });
    }
  }

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '开始无限循环' })],
    sessionId: 'demo-4',
    maxTurns: 3,
  });

  return {
    id: 4,
    success: true,
    turnCount: r.turnCount ?? 3,
    messageCount: (r.messages as any[]).length,
    output: 'maxTurns=3 安全终止，未进入死循环',
    logs,
    actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario5(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  const chat = mockChat([
    { c: '第一轮回答: 我记住了你喜欢的颜色——蓝色。', fr: 'stop' },
    { c: '第二轮回答: 根据上下文，你之前提到喜欢蓝色。还需要我做什么？', fr: 'stop' },
  ]);
  const exec = mockExec();
  const agent = new LangGraphAgent({
    think: { chat, getToolDefinitions: () => [], systemPrompt: '你是测试助手，记住用户偏好' },
    act: { toolExecutor: exec },
    checkpointerConfig: { dbPath: ':memory:', cleanOnInit: true },
    maxTurns: 5,
  });

  // 第 1 轮
  logs.push({ node: 'START', type: 'enter', message: 'agent.run("记住我喜欢蓝色", { sessionId: "s1" })' });
  const r1 = await agent.run('记住我喜欢蓝色', { sessionId: 's1' });
  logs.push({ node: 'think', type: 'info', message: `LLM 回复: ${r1.response.substring(0, 40)}...` });
  logs.push({ node: 'checkpoint', type: 'info', message: '自动保存 checkpoint → s1', detail: { checkpointId: 's1', turnCount: r1.turnCount } });

  // Resume
  logs.push({ node: 'resume', type: 'enter', message: 'agent.resume("s1", "我之前说了什么？")' });
  logs.push({ node: 'checkpoint', type: 'info', message: '从 checkpoint 恢复上下文 (turnCount=' + String(r1.turnCount) + ')' });
  const r2 = await agent.resume('s1', '我之前说了什么？');
  logs.push({ node: 'think', type: 'info', message: `LLM 基于上下文回复: ${r2.response.substring(0, 40)}...` });

  // 验证
  const state = await agent.getState('s1');
  logs.push({ node: 'verify', type: 'info', message: `getState("s1") 非空: ${state !== null ? '是 ✅' : '否 ❌'}` });

  agent.clearHistory('s1');
  const afterClear = await agent.getState('s1');
  logs.push({ node: 'verify', type: 'info', message: `clearHistory 后为 null: ${afterClear === null ? '是 ✅' : '否 ❌'}` });

  agent.close();

  return {
    id: 5,
    success: true,
    turnCount: (r1.turnCount ?? 0) + 1,
    messageCount: 6,
    output: r2.response,
    logs,
    actualPath: ['START', 'think', 'route', 'END', 'START', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario7(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  const chat = mockChat([
    { c: '检测到对话长度超过限制，正在调用摘要压缩...', tc: [{ id: 'c1', n: 'summarize', a: {} }], fr: 'tool_calls' },
    { c: '已压缩历史对话，当前上下文包含关键摘要：用户之前讨论了天气、编程和项目管理。现在可以继续对话。', fr: 'stop' },
  ]);
  const exec = mockExec({
    summarize: { success: true, content: '摘要: 用户讨论了3个主题——(1)天气查询 (2)Python编程 (3)项目管理。保留20条最近消息，压缩182条历史消息为摘要。' },
  });
  const agent = new LangGraphAgent({
    think: {
      chat,
      getToolDefinitions: () => [{ name: 'summarize', description: '压缩对话历史', parameters: { type: 'object', properties: {} } }],
      systemPrompt: '你是有上下文的助手，当消息过多时需要压缩摘要',
    },
    act: { toolExecutor: exec },
    checkpointerConfig: { dbPath: ':memory:', cleanOnInit: true },
    maxTurns: 5,
  });

  logs.push({ node: 'START', type: 'enter', message: '检测到上下文：200+ 条历史消息' });
  logs.push({ node: 'think', type: 'warn', message: '消息数超过阈值 → 触发 MemoryManager 摘要压缩' });
  logs.push({ node: 'act', type: 'enter', message: '执行 summarize → 压缩 182 条历史消息为摘要' });
  logs.push({ node: 'observe', type: 'info', message: '压缩完成：保留 20 条最近消息 + 1 条摘要' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 基于压缩后的上下文生成回答' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 无 tool_calls → END' });

  const r = await agent.run('继续我们之前的讨论...', { sessionId: 's7' });

  agent.close();

  return {
    id: 7,
    success: true,
    turnCount: r.turnCount ?? 2,
    messageCount: (r.messages as any[]).length,
    output: r.response,
    logs,
    actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario8(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  // 模拟 get_weather 第一次参数错误失败，第二次修正后成功
  let callCount = 0;
  const retryExec: ToolExecutor = {
    execute: async (name: string, _params: Record<string, unknown>) => {
      callCount++;
      if (callCount === 1 && name === 'get_weather') {
        return { success: false, content: '', error: '参数错误: city 字段不能为空' };
      }
      return {
        get_weather: { success: true, content: '上海多云 28°C' },
      }[name] || { success: true, content: `${name} 完成` };
    },
  };

  const chat = mockChat([
    { c: '查询天气', tc: [{ id: 'c1', n: 'get_weather', a: { city: '' } }], fr: 'tool_calls' },
    { c: '修正参数重试', tc: [{ id: 'c2', n: 'get_weather', a: { city: '上海' } }], fr: 'tool_calls' },
    { c: '上海今天多云，气温 28°C，适合户外活动。', fr: 'stop' },
  ]);
  const graph = createAgentGraph({
    think: {
      chat,
      getToolDefinitions: () => [
        { name: 'get_weather', description: '查询城市天气', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
      ],
    },
    act: { toolExecutor: retryExec },
  });

  logs.push({ node: 'START', type: 'enter', message: '接收用户输入 "今天天气怎么样？"' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 返回 tool_calls: get_weather(city="")' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 有 tool_calls → act' });
  logs.push({ node: 'act', type: 'warn', message: '工具执行失败: "参数错误: city 字段不能为空"' });
  logs.push({ node: 'observe', type: 'warn', message: '检测到工具失败 → shouldContinue = true' });
  logs.push({ node: 'think', type: 'enter', message: 'LLM 检测到失败，修正参数重试' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 返回 tool_calls: get_weather(city="上海")' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 有 tool_calls → act (重试)' });
  logs.push({ node: 'act', type: 'info', message: '工具重试成功: "上海多云 28°C"' });
  logs.push({ node: 'observe', type: 'enter', message: '观察执行结果 — 成功' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 基于成功结果生成回答' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 无 tool_calls → END' });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '今天天气怎么样？' })],
    sessionId: 'demo-8',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  return {
    id: 8,
    success: true,
    turnCount: r.turnCount ?? 3,
    messageCount: msgs.length,
    output: msgs[msgs.length - 1].content,
    logs,
    actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

async function runScenario9(): Promise<ScenarioResult> {
  const logs: StepLog[] = [];
  const t0 = Date.now();

  // 工具A: 读文件 → 工具B: 用读取内容分析
  let execOrder: string[] = [];
  const chainExec: ToolExecutor = {
    execute: async (name: string, _params: Record<string, unknown>) => {
      execOrder.push(name);
      if (name === 'read_file') {
        return { success: true, content: '文件内容: {"users": 1200, "active": 890, "churn": 45}' };
      }
      if (name === 'analyze_data') {
        return { success: true, content: '分析结果: 活跃率 74.2%, 流失率 3.75%, 健康度良好' };
      }
      return { success: true, content: `${name} 完成` };
    },
  };

  const chat = mockChat([
    { c: '先读取数据文件', tc: [{ id: 'c1', n: 'read_file', a: { path: '/data/users.json' } }], fr: 'tool_calls' },
    {
      c: '基于 read_file 返回的数据进行分析',
      tc: [{ id: 'c2', n: 'analyze_data', a: { rawJson: '{"users":1200,...}' } }],
      fr: 'tool_calls',
    },
    { c: '分析完成：用户总数1200人，活跃率74.2%，流失率3.75%，整体健康度良好。', fr: 'stop' },
  ]);
  const graph = createAgentGraph({
    think: {
      chat,
      getToolDefinitions: () => [
        { name: 'read_file', description: '读取文件', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
        { name: 'analyze_data', description: '分析数据', parameters: { type: 'object', properties: { rawJson: { type: 'string' } }, required: ['rawJson'] } },
      ],
    },
    act: { toolExecutor: chainExec },
  });

  logs.push({ node: 'START', type: 'enter', message: '接收用户输入 "读取用户数据并分析"' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 返回 tool_calls: read_file(path="/data/users.json")' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 有 tool_calls → act' });
  logs.push({ node: 'act', type: 'enter', message: '执行 read_file → 返回 JSON 数据' });
  logs.push({ node: 'observe', type: 'info', message: '观察结果: read_file → {"users":1200, "active":890, ...}' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 基于 read_file 输出 → 调用 analyze_data(rawJson)' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 有 tool_calls → act (链式第二步)' });
  logs.push({ node: 'act', type: 'info', message: '执行 analyze_data → 分析结果: 活跃率74.2%, 流失率3.75%' });
  logs.push({ node: 'observe', type: 'info', message: '观察结果: 链式调用完成' });
  logs.push({ node: 'think', type: 'info', message: 'LLM 汇总分析结果生成最终回答' });
  logs.push({ node: 'route', type: 'decision', message: '决策: 无 tool_calls → END' });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '读取用户数据并分析' })],
    sessionId: 'demo-9',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  return {
    id: 9,
    success: true,
    turnCount: r.turnCount ?? 3,
    messageCount: msgs.length,
    output: msgs[msgs.length - 1].content,
    logs,
    actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'],
    duration: `${Date.now() - t0}ms`,
  };
}

// ==================== HTTP 服务器 ====================

function sendJSON(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendHTML(res: ServerResponse, html: string) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function serveStatic(res: ServerResponse, filePath: string, contentType: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const scenarioRunners: Record<number, () => Promise<ScenarioResult>> = {
  1: runScenario1,
  2: runScenario2,
  3: runScenario3,
  4: runScenario4,
  5: runScenario5,
  7: runScenario7,
  8: runScenario8,
  9: runScenario9,
};

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '/';
  const method = req.method || 'GET';

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API 路由
  if (url === '/api/graph') {
    return sendJSON(res, GRAPH_DATA);
  }

  if (url === '/api/scenarios') {
    return sendJSON(res, SCENARIOS);
  }

  if (url === '/api/run-all' && method === 'POST') {
    const results: ScenarioResult[] = [];
    const graphResult: ScenarioResult = {
      id: 6, success: true, turnCount: 0, messageCount: 0,
      output: '图结构数据已加载',
      logs: GRAPH_DATA.nodes.map(n => ({
        node: n.id,
        type: 'info' as const,
        message: `${n.label}: ${n.description.split('\n')[0]}`,
      })),
      actualPath: ['START', 'think', 'route', 'act', 'observe', 'END'],
      duration: '0ms',
    };

    for (const id of [1, 2, 3, 4, 5, 7, 8, 9]) {
      try {
        const r = await scenarioRunners[id]();
        results.push(r);
      } catch (err) {
        results.push({
          id, success: false, turnCount: 0, messageCount: 0,
          output: '', logs: [],
          duration: '0ms',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    results.push(graphResult);
    return sendJSON(res, results);
  }

  const runMatch = url.match(/^\/api\/run\/(\d+)$/);
  if (runMatch && method === 'POST') {
    const id = parseInt(runMatch[1], 10);
    if (id === 6) {
      return sendJSON(res, {
        id: 6, success: true, turnCount: 0, messageCount: 0,
        output: '图结构数据已加载',
        logs: GRAPH_DATA.nodes.map(n => ({
          node: n.id,
          type: 'info' as const,
          message: `${n.label}: ${n.description.split('\n')[0]}`,
        })),
        actualPath: ['START', 'think', 'route', 'act', 'observe', 'think', 'END'],
        duration: '0ms',
      } as ScenarioResult);
    }
    const runner = scenarioRunners[id];
    if (!runner) {
      return sendJSON(res, { error: `场景 ${id} 不存在` }, 404);
    }
    try {
      const result = await runner();
      return sendJSON(res, result);
    } catch (err) {
      return sendJSON(res, {
        id, success: false, turnCount: 0, messageCount: 0,
        output: '', logs: [],
        duration: '0ms',
        error: err instanceof Error ? err.message : String(err),
      } as ScenarioResult);
    }
  }

  // 静态页面
  if (url === '/' || url === '/index.html') {
    const htmlPath = join(__dirname, '..', 'demo', 'index.html');
    if (existsSync(htmlPath)) {
      return serveStatic(res, htmlPath, 'text/html; charset=utf-8');
    }
    return sendHTML(res, '<h1>Demo UI 未找到</h1><p>请确保 demo/index.html 存在</p>');
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
}

// ==================== 启动 ====================

const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   LangGraph Demo Web UI                             ║');
  console.log(`║   服务地址: http://localhost:${PORT}                      ║`);
  console.log('║   按 Ctrl+C 停止服务                                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  // 自动打开浏览器（Windows）
  import('child_process').then(({ exec }) => {
    exec(`start http://localhost:${PORT}`);
  }).catch(() => {});
});
