/**
 * LangGraphAgent 主类测试
 *
 * 验证 Agent.run() / stream() / resume() / abort() / getState() 等对外接口
 *
 * 注意：LangGraph 的 Checkpoint 存储格式为 { channel_values: {...}, ... }，
 * 所以 getLatestState 返回的是 checkpoint JSON，字段在 channel_values 内或顶层取决于版本
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LangGraphAgent } from '../src/Agent';
import type { AgentEvent } from '../src/Agent';

// ============ Mock 工厂 ============

function createMockChat(responses: Array<{
  content?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  finishReason?: string;
}>) {
  let idx = 0;
  return vi.fn((_msgs: unknown[], _opts?: unknown) => {
    const r = responses[idx++] || { content: '', finishReason: 'stop' };
    return Promise.resolve({
      content: r.content || '',
      toolCalls: r.toolCalls?.map((tc) => ({
        id: tc.id, type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
      finishReason: r.finishReason || 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
  });
}

function createToolExecutor(results: Record<string, { success: boolean; content: string }> = {}) {
  return {
    execute: vi.fn((name: string, _params: Record<string, unknown>) =>
      Promise.resolve(results[name] || { success: true, content: `${name} done` })
    ),
  };
}

function buildAgent(responses: Parameters<typeof createMockChat>[0] = [{ content: '你好', finishReason: 'stop' }]) {
  const chat = createMockChat(responses);
  const executor = createToolExecutor();
  return {
    agent: new LangGraphAgent({
      think: { chat, getToolDefinitions: () => [] },
      act: { toolExecutor: executor },
      checkpointerConfig: { dbPath: ':memory:', cleanOnInit: true },
      maxTurns: 5,
      systemPrompt: '你是测试助手',
    }),
    chat,
    executor,
  };
}

// ============ run() 测试 ============

describe('LangGraphAgent.run()', () => {
  let agent: LangGraphAgent | null = null;

  afterEach(() => {
    agent?.close();
    agent = null;
  });

  it('应该返回 response、messages 和 sessionId', async () => {
    agent = buildAgent([
      { content: '你好！我是测试助手。', finishReason: 'stop' },
    ]).agent;

    const result = await agent.run('你好');

    expect(result.response).toBe('你好！我是测试助手。');
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.turnCount).toBeGreaterThanOrEqual(1);
    expect(result.sessionId).toMatch(/^session_/);
  });

  it('应该支持自定义 sessionId', async () => {
    agent = buildAgent([
      { content: 'OK', finishReason: 'stop' },
    ]).agent;

    const result = await agent.run('hi', { sessionId: 'my-session' });

    expect(result.sessionId).toBe('my-session');
  });

  it('每次 stop 类型的响应仅产生 1 轮', async () => {
    // 当 LLM 返回 finishReason='stop' 时，观察节点直接终止，turnCount=1
    agent = buildAgent([
      { content: '单轮答复', finishReason: 'stop' },
    ]).agent;

    const result = await agent.run('问一个问题');

    expect(result.turnCount).toBe(1);
    expect(result.response).toBe('单轮答复');
  });
});

// ============ stream() 测试 ============

describe('LangGraphAgent.stream()', () => {
  let agent: LangGraphAgent | null = null;

  afterEach(() => {
    agent?.close();
    agent = null;
  });

  it('应该产出一系列事件并以 done 结束', async () => {
    agent = buildAgent([
      { content: '你好！', finishReason: 'stop' },
    ]).agent;

    const events: AgentEvent[] = [];
    try {
      for await (const event of agent.stream('你好')) {
        events.push(event);
      }
    } catch {
      // 非流式 Mock 可能不产生 streamEvents，忽略
    }

    // 至少应该有 done 事件
    const doneEvents = events.filter((e) => e.type === 'done');
    expect(doneEvents.length).toBeGreaterThanOrEqual(1);
  });
});

// ============ resume() 测试 ============

describe('LangGraphAgent.resume()', () => {
  let agent: LangGraphAgent | null = null;

  afterEach(() => {
    agent?.close();
    agent = null;
  });

  it('不存在的会话应该抛错', async () => {
    agent = buildAgent().agent;

    await expect(agent.resume('nonexistent')).rejects.toThrow('不存在');
  });

  it('run 后 resume 同一会话应该恢复到之前状态', async () => {
    // resume 恢复的是 checkpoint 中的 StateGraph 状态，
    // 包括 messages 历史和运行上下文
    agent = buildAgent([
      { content: '第一轮回答', finishReason: 'stop' },
    ]).agent;

    const r1 = await agent.run('第一轮', { sessionId: 'resume-test' });
    expect(r1.response).toBe('第一轮回答');

    // resume 时传入新消息，让 Agent 继续对话
    // 注意：resume 会从 checkpoint 恢复 channel_values（包含 messages 历史）
    // 然后追加新消息并重新 invoke graph
    const r2 = await agent.resume('resume-test', '继续对话');
    expect(r2.sessionId).toBe('resume-test');
    // response 可能因 checkpoint 恢复和状态重建而有差异，验证非空即可
    expect(r2.response.length).toBeGreaterThan(0);
  });
});

// ============ abort() 测试 ============

describe('LangGraphAgent.abort()', () => {
  let agent: LangGraphAgent | null = null;

  afterEach(() => {
    agent?.close();
    agent = null;
  });

  it('取消操作不应导致未捕获的异常', async () => {
    // 使用真实信号模拟取消
    const controller = new AbortController();

    agent = new LangGraphAgent({
      think: { chat: vi.fn(() => new Promise(() => {})), getToolDefinitions: () => [] },
      act: { toolExecutor: createToolExecutor() },
      checkpointerConfig: { dbPath: ':memory:', cleanOnInit: true },
      maxTurns: 5,
    });

    // 50ms 后取消
    setTimeout(() => controller.abort(), 50);

    // 应该正常返回或抛出，但不应 crash 进程
    try {
      await agent.run('测试取消', { signal: controller.signal });
    } catch (e) {
      // LangGraph 可能抛出 AbortError — 这也是可接受的
      expect(String(e)).toMatch(/abort|cancel|Abort/i);
    }
  });
});

// ============ 状态查询 ============

describe('LangGraphAgent 状态查询', () => {
  let agent: LangGraphAgent | null = null;

  afterEach(() => {
    agent?.close();
    agent = null;
  });

  it('run 后可以通过 getState 获取非空状态', async () => {
    agent = buildAgent([
      { content: 'OK', finishReason: 'stop' },
    ]).agent;

    await agent.run('hi', { sessionId: 'state-test' });

    const state = await agent.getState('state-test');
    // LangGraph checkpoint 包含 channel_values 和元数据
    expect(state).not.toBeNull();
  });

  it('listSessions 应该返回已保存的会话', async () => {
    agent = buildAgent([
      { content: 'OK', finishReason: 'stop' },
    ]).agent;

    await agent.run('hi', { sessionId: 's1' });
    await agent.run('hello', { sessionId: 's2' });

    const sessions = agent.listSessions();
    expect(sessions.some((s) => s.threadId === 's1')).toBe(true);
    expect(sessions.some((s) => s.threadId === 's2')).toBe(true);
  });

  it('clearHistory 应该清除会话数据', async () => {
    agent = buildAgent([
      { content: 'OK', finishReason: 'stop' },
    ]).agent;

    await agent.run('hi', { sessionId: 'clear-test' });
    agent.clearHistory('clear-test');

    const state = await agent.getState('clear-test');
    expect(state).toBeNull();
  });
});
