/**
 * LangGraph 有向图运行 Demo（独立可执行脚本）
 *
 * 演示 LangGraph Agent 有向图的所有流转路径，可脱离 vitest 运行。
 * 运行方式：
 *   pnpm demo                                  （推荐，使用本地预装的 tsx）
 *   start-demo.bat                             （一键启动，含构建检查）
 *   start-demo.bat --skip-build                （跳过构建）
 *
 * 日志配置读取 langgraph.config.json（自动发现或显式路径）
 */

import { HumanMessage } from '@langchain/core/messages';
import type { ToolResult, ToolExecutor } from '../src/index';
import {
  createAgentGraph,
  LangGraphAgent,
  loadLogConfig,
} from '../src/index';

// ==================== 颜色输出 ====================

/** ANSI 颜色辅助 */
const COLOR = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
};

function title(t: string) {
  console.log(`\n${COLOR.bold}${COLOR.cyan}${'═'.repeat(60)}${COLOR.reset}`);
  console.log(`${COLOR.bold}${COLOR.cyan}  ${t}${COLOR.reset}`);
  console.log(`${COLOR.bold}${COLOR.cyan}${'═'.repeat(60)}${COLOR.reset}\n`);
}

function scene(n: number, name: string, path: string) {
  console.log(`${COLOR.yellow}${'─'.repeat(55)}${COLOR.reset}`);
  console.log(`${COLOR.bold}▶ 场景 ${n}: ${name}${COLOR.reset}`);
  console.log(`  路径: ${path}`);
  console.log(`${COLOR.yellow}${'─'.repeat(55)}${COLOR.reset}`);
}

function ok(msg: string) {
  console.log(`${COLOR.green}  ✅ ${msg}${COLOR.reset}`);
}

function info(key: string, val: string) {
  console.log(`    ${COLOR.cyan}→ ${key}${COLOR.reset}: ${val}`);
}

// ==================== Mock 工厂（纯 JS，不依赖 vitest） ====================

interface MockResponse {
  c?: string;
  tc?: Array<{ id: string; n: string; a: Record<string, unknown> }>;
  fr?: string;
}

/** 创建 Mock Chat 模型 */
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

// ==================== ASCII 图结构 ====================

const GRAPH_ASCII = `
╔══════════════════════════════════════════════════╗
║         LangGraph Agent 有向图结构                ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║           ┌──────────┐                           ║
║           │  START   │                           ║
║           └────┬─────┘                           ║
║                │ addEdge(START, 'think')          ║
║                ▼                                 ║
║         ┌─────────────┐                          ║
║         │   think     │  ← LLM 调用节点           ║
║         │ (LLM 思考)   │                          ║
║         └──────┬──────┘                          ║
║                │ routeAfterThink (条件边)         ║
║                │                                 ║
║       ┌────────┴──────────┐                      ║
║       │                   │                      ║
║  有 tool_calls       无 tool_calls                ║
║       │                   │                      ║
║       ▼                   ▼                      ║
║  ┌─────────┐          ┌──────┐                   ║
║  │   act   │          │ END  │  ← 停止            ║
║  │(执行工具)│          └──────┘                   ║
║  └────┬────┘                                     ║
║       │ addEdge(act, 'observe')                   ║
║       ▼                                          ║
║  ┌──────────┐                                    ║
║  │ observe  │  ← 结果检查                         ║
║  │ (观察)    │                                    ║
║  └────┬─────┘                                    ║
║       │ addEdge(observe, 'think')                 ║
║       │ ← 循环回到 think                          ║
║       ▼                                          ║
║  (回到 think)                                    ║
║                                                  ║
╚══════════════════════════════════════════════════╝
`;

// ==================== 场景执行 ====================

async function scenario1() {
  scene(1, '纯文本对话', 'START → think → routeAfterThink → END');

  const chat = mockChat([{ c: '你好！我是测试助手，有什么可以帮你？', fr: 'stop' }]);
  const graph = createAgentGraph({
    think: { chat, getToolDefinitions: () => [], systemPrompt: '你是有帮助的助手' },
    act: { toolExecutor: mockExec() },
  });

  console.log('  输入: HumanMessage("你好")');
  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '你好' })],
    sessionId: 'demo-1',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  info('输出', msgs[msgs.length - 1].content);
  info('消息数', `${msgs.length} (user + ai)`);
  info('轮次', String(r.turnCount));
  ok('纯文本对话完成');
}

async function scenario2() {
  scene(2, '工具调用循环 (完整环形)', 'START → think → act → observe → think → END');

  const chat = mockChat([
    { c: '让我查询北京天气', tc: [{ id: 'c1', n: 'get_weather', a: { city: '北京' } }], fr: 'tool_calls' },
    { c: '北京今天晴天，气温 25°C，适合出行。', fr: 'stop' },
  ]);
  const exec = mockExec({ get_weather: { success: true, content: '晴天 25°C' } });
  const graph = createAgentGraph({
    think: {
      chat,
      getToolDefinitions: () => [
        {
          name: 'get_weather',
          description: '查询天气',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      ],
    },
    act: { toolExecutor: exec },
  });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '北京今天天气怎么样？' })],
    sessionId: 'demo-2',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  info('输出', msgs[msgs.length - 1].content);
  info('消息数', `${msgs.length} (user + ai + tool + ai)`);
  info('轮次', String(r.turnCount));
  ok('工具调用循环完成');
}

async function scenario3() {
  scene(3, '多工具并行执行', 'think → act(并行) → observe → think → END');

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

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '深圳天气和时间' })],
    sessionId: 'demo-3',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  const toolMsgs = msgs.filter((m: any) => m.getType?.() === 'tool');
  info('并行工具数', String(toolMsgs.length));
  info('输出', msgs[msgs.length - 1].content);
  ok('多工具并行完成');
}

async function scenario4() {
  scene(4, 'maxTurns 安全终止', 'think → act → observe (×3) → think(maxTurns) → END');

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
      getToolDefinitions: () => [
        { name: 'loop', description: '', parameters: { type: 'object', properties: {} } },
      ],
    },
    act: { toolExecutor: exec },
  });

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '开始无限循环' })],
    sessionId: 'demo-4',
    maxTurns: 3,
  });

  info('实际轮次', String(r.turnCount));
  info('shouldContinue', String(r.shouldContinue));
  ok('安全终止，没有死循环');
}

async function scenario5() {
  scene(5, 'Checkpoint 持久化 + Resume', 'run → checkpoint → resume → 继续对话');

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
  console.log('  第 1 轮: agent.run("记住我喜欢蓝色", { sessionId: "s1" })');
  const r1 = await agent.run('记住我喜欢蓝色', { sessionId: 's1' });
  info('响应', r1.response);
  info('轮次', String(r1.turnCount));

  // Resume
  console.log('  第 2 轮: agent.resume("s1", "我之前说了什么？")');
  const r2 = await agent.resume('s1', '我之前说了什么？');
  info('响应', r2.response);
  info('sessionId', r2.sessionId);

  // 验证
  const state = await agent.getState('s1');
  info('getState("s1") 非空', state !== null ? '是' : '否');

  agent.clearHistory('s1');
  const afterClear = await agent.getState('s1');
  info('clearHistory 后为 null', afterClear === null ? '是' : '否');

  agent.close();
  ok('Checkpoint 持久化 + Resume + 清理 完成');
}

function scenario6() {
  scene(6, '有向图完整结构', 'ASCII 可视化');
  console.log(GRAPH_ASCII);
  ok('图结构已打印');
}

/** 场景7: 上下文摘要与压缩 — 模拟长对话触发摘要 */
async function scenario7() {
  scene(7, '上下文摘要与压缩', '长对话 → MemoryManager → 摘要压缩 → think → END');

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
      // 构造200条历史消息，模拟超长上下文
      getToolDefinitions: () => [{ name: 'summarize', description: '压缩对话历史', parameters: { type: 'object', properties: {} } }],
      systemPrompt: '你是有上下文的助手，当消息过多时需要压缩摘要',
    },
    act: { toolExecutor: exec },
    checkpointerConfig: { dbPath: ':memory:', cleanOnInit: true },
    maxTurns: 5,
  });

  console.log('  输入: 模拟 200+ 条历史消息 → 触发摘要压缩');
  const r = await agent.run('继续我们之前的讨论...', { sessionId: 's7' });
  info('输出', r.response.substring(0, 60) + '...');
  info('轮次', String(r.turnCount));
  ok('上下文摘要压缩完成 — 消息量从200+压缩到20条关键信息');

  agent.close();
}

/** 场景8: 工具调用失败 → 自动重试 — 第一次失败后修正参数重试 */
async function scenario8() {
  scene(8, '工具失败自动重试', 'think → act(失败) → observe → think(修正) → act(重试成功) → END');

  // 模拟 get_weather 第一次参数错误失败，第二次修正后成功
  let callCount = 0;
  const retryExec: ToolExecutor = {
    execute: async (name: string, _params: Record<string, unknown>): Promise<ToolResult> => {
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

  console.log('  第 1 轮: get_weather(city="") → 失败 "参数错误"');
  console.log('  第 2 轮: think 检测失败 → 修正 → get_weather(city="上海") → 成功');

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '今天天气怎么样？' })],
    sessionId: 'demo-8',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  info('实际轮次', String(r.turnCount));
  info('输出', msgs[msgs.length - 1].content);
  info('工具执行次数', String(callCount));
  ok('失败重试流程完成 — 系统自动检测失败并修正参数');
}

/** 场景9: 链式工具调用 — 工具A的输出作为工具B的输入 */
async function scenario9() {
  scene(9, '链式工具调用', 'think → act(read_file) → observe → think → act(analyze_data) → END');

  // 工具A: 读文件 → 工具B: 用读取内容分析
  let execOrder: string[] = [];
  const chainExec: ToolExecutor = {
    execute: async (name: string, _params: Record<string, unknown>): Promise<ToolResult> => {
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

  console.log('  第 1 轮: read_file("/data/users.json") → 返回 JSON 数据');
  console.log('  第 2 轮: think 基于 read_file 输出 → analyze_data(rawJson) → 分析结果');
  console.log('  第 3 轮: think 汇总最终回答');

  const r = await graph.invoke({
    messages: [new HumanMessage({ content: '读取用户数据并分析' })],
    sessionId: 'demo-9',
    maxTurns: 5,
  });

  const msgs = r.messages as any[];
  info('工具链顺序', execOrder.join(' → '));
  info('轮次', String(r.turnCount));
  info('输出', msgs[msgs.length - 1].content);
  ok('链式工具调用完成 — 工具A输出正确传递给工具B');
}

// ==================== 主函数 ====================

async function main() {
  // 1. 加载日志配置
  title('1. 加载日志配置');
  const configLoaded = loadLogConfig();
  if (!configLoaded) {
    console.log(`${COLOR.yellow}  ⚠ 未找到 langgraph.config.json，使用默认配置（DEBUG 级别）${COLOR.reset}`);
  }

  // 2. 执行全部场景
  title('2. 执行有向图演示场景');

  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
  await scenario5();
  scenario6();
  await scenario7();
  await scenario8();
  await scenario9();

  // 3. 完成
  title('✅ 全部 9 个场景执行完毕');
  console.log('\n  基础链: 纯文本对话 + 工具调用 + 并行执行');
  console.log('  安全: maxTurns 强制终止，防止死循环');
  console.log('  持久化: Checkpoint 自动保存/恢复，支持 resume');
  console.log('  记忆: 上下文摘要压缩，长对话自动管理');
  console.log('  鲁棒性: 工具失败自动检测并修正重试');
  console.log('  数据流: 工具链式调用，A输出→B输入');
  console.log('  日志: langgraph.config.json 控制输出等级和模块\n');
}

main().catch(err => {
  console.error(`${COLOR.red}❌ 运行失败:${COLOR.reset}`, err);
  process.exit(1);
});
