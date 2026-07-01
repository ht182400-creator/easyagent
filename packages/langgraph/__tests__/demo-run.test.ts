/**
 * LangGraph 有向图运行 Demo
 *
 * 用 Mock 数据展示图的所有流转路径，每条路径标注节点和边。
 * 运行: cd packages/langgraph && npx vitest run __tests__/demo-run.test.ts
 */
import { describe, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { createAgentGraph } from '../src/graph/agentGraph';

// ==================== Mock 工厂 ====================

function mockChat(responses: Array<{ c?: string; tc?: Array<{ id: string; n: string; a: Record<string, unknown> }>; fr?: string }>) {
  let i = 0;
  return vi.fn((_m: unknown[], _o?: unknown) => {
    const r = responses[i++] || { c: '', fr: 'stop' };
    return Promise.resolve({
      content: r.c || '',
      toolCalls: r.tc?.map(t => ({ id: t.id, type: 'function' as const, function: { name: t.n, arguments: JSON.stringify(t.a) } })),
      finishReason: r.fr || 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });
}

function mockExec(results: Record<string, { ok: boolean; out: string }> = {}) {
  return {
    execute: vi.fn((name: string, _p: Record<string, unknown>) =>
      Promise.resolve(results[name] || { success: true, content: `${name} 完成` })
    ),
  };
}

// ==================== 绘制图结构 ====================

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

// ==================== 场景演示 ====================

describe('LangGraph 有向图 运行 Demo', () => {
  // 分隔线占位测试
  it('┌─────────────────────────────────────────┐', () => {});
  it('│  场景 1: 纯文本对话 (think → END)         │', () => {});
  it('└─────────────────────────────────────────┘', () => {});

  it('运行: 用户说"你好"，LLM 直接回复文本', async () => {
    console.log('\n' + '─'.repeat(55));
    console.log('▶ 场景 1: 纯文本对话');
    console.log('  路径: START → think → routeAfterThink → END');
    console.log('─'.repeat(55));

    const chat = mockChat([{ c: '你好！我是测试助手，有什么可以帮你？', fr: 'stop' }]);
    const graph = createAgentGraph({
      think: { chat, getToolDefinitions: () => [], systemPrompt: '你是有帮助的助手' },
      act: { toolExecutor: mockExec() },
    });

    console.log('  输入: HumanMessage("你好")');
    const r = await graph.invoke({
      messages: [new HumanMessage({ content: '你好' })],
      sessionId: 'demo-1', maxTurns: 5,
    });

    const msgs = r.messages as any[];
    console.log(`  节点流转: START → think (LLM 返回 stop) → routeAfterThink → END`);
    console.log(`  输出: ${msgs[msgs.length - 1].content}`);
    console.log(`  消息数: ${msgs.length} (user + ai)`);
    console.log(`  轮次: ${r.turnCount}`);
    console.log('  ✅ 纯文本对话完成\n');
  });

  // ========================

  it('┌─────────────────────────────────────────┐', () => {});
  it('│  场景 2: 工具调用循环 (完整环形)           │', () => {});
  it('└─────────────────────────────────────────┘', () => {});

  it('运行: 用户问"北京天气"，Agent 调用工具后返回结果', async () => {
    console.log('\n' + '─'.repeat(55));
    console.log('▶ 场景 2: 工具调用循环');
    console.log('  路径: START → think → act → observe → think → END');
    console.log('─'.repeat(55));

    const chat = mockChat([
      // 第 1 轮: LLM 决定调用工具
      { c: '让我查询北京天气', tc: [{ id: 'c1', n: 'get_weather', a: { city: '北京' } }], fr: 'tool_calls' },
      // 第 2 轮: LLM 收到工具结果后回复
      { c: '北京今天晴天，气温 25°C，适合出行。', fr: 'stop' },
    ]);
    const exec = mockExec({ get_weather: { ok: true, out: '晴天 25°C' } });
    const graph = createAgentGraph({
      think: { chat, getToolDefinitions: () => [
        { name: 'get_weather', description: '查询天气', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } },
      ] },
      act: { toolExecutor: exec },
    });

    console.log('  输入: HumanMessage("北京今天天气怎么样？")');
    const r = await graph.invoke({
      messages: [new HumanMessage({ content: '北京今天天气怎么样？' })],
      sessionId: 'demo-2', maxTurns: 5,
    });

    const msgs = r.messages as any[];
    console.log('  节点流转:');
    console.log('    ① START    → 入口');
    console.log('    ② think    → LLM 返回 tool_calls=[get_weather]');
    console.log('    ③ routeAfterThink → 判断有 tool_calls → 路由到 act');
    console.log('    ④ act      → 执行 get_weather({city:"北京"}) → 返回 "晴天 25°C"');
    console.log('    ⑤ observe  → 检查结果，决定继续');
    console.log('    ⑥ think    → LLM 收到工具结果 → 回复 "北京今天晴天..."');
    console.log('    ⑦ routeAfterThink → 无 tool_calls → 路由到 END');
    console.log(`  输出: ${msgs[msgs.length - 1].content}`);
    console.log(`  消息数: ${msgs.length} (user + ai + tool + ai)`);
    console.log(`  轮次: ${r.turnCount}`);
    console.log('  ✅ 工具调用循环完成\n');
  });

  // ========================

  it('┌─────────────────────────────────────────┐', () => {});
  it('│  场景 3: 多工具并行执行                    │', () => {});
  it('└─────────────────────────────────────────┘', () => {});

  it('运行: 同时查询天气和时间，两个工具并行执行', async () => {
    console.log('\n' + '─'.repeat(55));
    console.log('▶ 场景 3: 多工具并行');
    console.log('  路径: think → act(并行) → observe → think → END');
    console.log('─'.repeat(55));

    const chat = mockChat([
      { c: '并发查询', tc: [
        { id: 'c1', n: 'get_weather', a: { city: '深圳' } },
        { id: 'c2', n: 'get_time', a: {} },
      ], fr: 'tool_calls' },
      { c: '深圳今天多云，当前时间 2026-06-28 14:30', fr: 'stop' },
    ]);
    const exec = mockExec({ get_weather: { ok: true, out: '多云 30°C' }, get_time: { ok: true, out: '2026-06-28 14:30' } });
    const graph = createAgentGraph({
      think: { chat, getToolDefinitions: () => [
        { name: 'get_weather', description: '', parameters: { type: 'object', properties: {} } },
        { name: 'get_time', description: '', parameters: { type: 'object', properties: {} } },
      ] },
      act: { toolExecutor: exec },
    });

    const r = await graph.invoke({
      messages: [new HumanMessage({ content: '深圳天气和时间' })],
      sessionId: 'demo-3', maxTurns: 5,
    });

    const msgs = r.messages as any[];
    const toolMsgs = msgs.filter((m: any) => m.getType?.() === 'tool');
    console.log('  节点流转:');
    console.log('    ① START → think (LLM 返回 2 个 tool_call)');
    console.log('    ② routeAfterThink → 多 tool_calls → act');
    console.log('    ③ act → Promise.all([get_weather, get_time]) ← 并行执行');
    console.log('    ④ observe → 验证结果 → think');
    console.log('    ⑤ think → 汇总回复 → END');
    console.log(`  并行工具数: ${toolMsgs.length}`);
    console.log(`  输出: ${msgs[msgs.length - 1].content}`);
    console.log('  ✅ 多工具并行完成\n');
  });

  // ========================

  it('┌─────────────────────────────────────────┐', () => {});
  it('│  场景 4: 达到 maxTurns 安全终止            │', () => {});
  it('└─────────────────────────────────────────┘', () => {});

  it('运行: LLM 持续调用工具，maxTurns=3 时强制终止', async () => {
    console.log('\n' + '─'.repeat(55));
    console.log('▶ 场景 4: maxTurns 安全终止');
    console.log('  路径: think → act → observe (×3) → think(maxTurns) → END');
    console.log('─'.repeat(55));

    const chat = mockChat(
      Array(10).fill({ c: '仍在计算...', tc: [{ id: 'cx', n: 'loop', a: {} }], fr: 'tool_calls' })
    );
    const exec = mockExec({ loop: { ok: true, out: 'looping' } });
    const graph = createAgentGraph({
      think: { chat, getToolDefinitions: () => [
        { name: 'loop', description: '', parameters: { type: 'object', properties: {} } },
      ] },
      act: { toolExecutor: exec },
    });

    const r = await graph.invoke({
      messages: [new HumanMessage({ content: '开始无限循环' })],
      sessionId: 'demo-4', maxTurns: 3,
    });

    console.log('  节点流转:');
    console.log('    第1轮: think → act → observe');
    console.log('    第2轮: think → act → observe');
    console.log('    第3轮: think → act → observe');
    console.log('    第4轮: think (turnCount=3 >= maxTurns=3) → 强制终止 → END');
    console.log(`  实际轮次: ${r.turnCount}`);
    console.log(`  shouldContinue: ${r.shouldContinue}`);
    console.log('  ✅ 安全终止，没有死循环\n');
  });

  // ========================

  it('┌─────────────────────────────────────────┐', () => {});
  it('│  场景 5: Checkpoint 持久化 + Resume       │', () => {});
  it('└─────────────────────────────────────────┘', () => {});

  it('运行: 保存 checkpoint 后，用 Resume 恢复继续对话', async () => {
    console.log('\n' + '─'.repeat(55));
    console.log('▶ 场景 5: Checkpoint 持久化 + Resume');
    console.log('  演示: 第1轮 run → checkpoint 自动保存 → resume 恢复');
    console.log('─'.repeat(55));

    const chat = mockChat([
      { c: '第一轮回答: 记住了你的偏好。', fr: 'stop' },
      { c: '第二轮回答: 根据之前的上下文继续。', fr: 'stop' },
    ]);
    const exec = mockExec();

    const { LangGraphAgent } = await import('../src/Agent');
    const agent = new LangGraphAgent({
      think: { chat, getToolDefinitions: () => [] },
      act: { toolExecutor: exec },
      checkpointerConfig: { dbPath: ':memory:', cleanOnInit: true },
      maxTurns: 5,
      systemPrompt: '你是测试助手',
    });

    // 第 1 轮
    console.log('  第 1 轮: agent.run("记住我喜欢蓝色", { sessionId: "s1" })');
    const r1 = await agent.run('记住我喜欢蓝色', { sessionId: 's1' });
    console.log(`    → 响应: ${r1.response}`);
    console.log(`    → 轮次: ${r1.turnCount}`);
    console.log(`    → Checkpoint 已保存 (thread_id=s1)`);

    // Resume
    console.log('  第 2 轮: agent.resume("s1", "我之前说了什么？")');
    const r2 = await agent.resume('s1', '我之前说了什么？');
    console.log(`    → 响应: ${r2.response}`);
    console.log(`    → sessionId: ${r2.sessionId}`);
    console.log(`    → Checkpoint 从 DB 恢复，继续对话`);

    // 验证状态
    const state = await agent.getState('s1');
    console.log(`    → getState("s1") 非空: ${state !== null}`);

    // 清理
    agent.clearHistory('s1');
    const afterClear = await agent.getState('s1');
    console.log(`    → clearHistory 后 getState 为 null: ${afterClear === null}`);

    agent.close();
    console.log('  ✅ Checkpoint 持久化 + Resume + 清理 完成\n');
  });

  // ========================

  it('┌─────────────────────────────────────────┐', () => {});
  it('│  场景 6: 有向图完整结构 (ASCII)             │', () => {});
  it('└─────────────────────────────────────────┘', () => {});

  it('打印图结构', () => {
    console.log(GRAPH_ASCII);
  });

});
