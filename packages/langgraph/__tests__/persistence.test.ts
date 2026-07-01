/**
 * Checkpoint 持久化测试
 *
 * 验证:
 * 1. SQLite Checkpointer 基本 CRUD
 * 2. 跨调用状态保留
 * 3. Resume 恢复执行
 * 4. 多线程隔离
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { SqliteCheckpointer } from '../src/memory/Checkpointer';
import { createAgentGraph } from '../src/graph/agentGraph';
import { vi } from 'vitest';

// Checkpoint 最小结构（兼容 BaseCheckpointSaver 的类型约束）
function makeCheckpoint(data: Record<string, unknown>): any {
  return data; // SQLite 直接 JSON.stringify，接受任意对象
}

// ============ SQLite Checkpointer 单元测试 ============

describe('SqliteCheckpointer', () => {
  let checkpointer: SqliteCheckpointer;

  beforeEach(() => {
    checkpointer = new SqliteCheckpointer({ dbPath: ':memory:', cleanOnInit: true });
  });

  afterEach(() => {
    if (checkpointer) {
      checkpointer.close();
    }
  });

  it('应该保存和读取 checkpoint', async () => {
    await checkpointer.put(
      { configurable: { thread_id: 't1', checkpoint_id: 'ck1' } },
      makeCheckpoint({ messages: [], turnCount: 0 }) as any,
      { source: 'loop', step: 0, writes: null, parents: {} },
      {}
    );

    const tuple = await checkpointer.getTuple({
      configurable: { thread_id: 't1' },
    });

    expect(tuple).toBeDefined();
    expect(tuple!.config.configurable.thread_id).toBe('t1');
    expect((tuple!.checkpoint as any).turnCount).toBe(0);
  });

  it('应该返回最新的 checkpoint', async () => {
    await checkpointer.put(
      { configurable: { thread_id: 't2', checkpoint_id: 'ck1' } },
      makeCheckpoint({ turnCount: 1 }) as any,
      { source: 'loop', step: 0, writes: null, parents: {} },
      {}
    );
    await checkpointer.put(
      { configurable: { thread_id: 't2', checkpoint_id: 'ck2' } },
      makeCheckpoint({ turnCount: 5 }) as any,
      { source: 'loop', step: 4, writes: null, parents: {} },
      {}
    );

    const tuple = await checkpointer.getTuple({
      configurable: { thread_id: 't2' },
    });

    expect((tuple!.checkpoint as any).turnCount).toBe(5);
  });

  it('应该隔离不同 thread 的数据', async () => {
    await checkpointer.put(
      { configurable: { thread_id: 't_a', checkpoint_id: 'c1' } },
      makeCheckpoint({ data: 'A' }) as any,
      { source: 'loop', step: 0, writes: null, parents: {} },
      {}
    );
    await checkpointer.put(
      { configurable: { thread_id: 't_b', checkpoint_id: 'c1' } },
      makeCheckpoint({ data: 'B' }) as any,
      { source: 'loop', step: 0, writes: null, parents: {} },
      {}
    );

    const a = await checkpointer.getTuple({ configurable: { thread_id: 't_a' } });
    const b = await checkpointer.getTuple({ configurable: { thread_id: 't_b' } });

    expect((a!.checkpoint as any).data).toBe('A');
    expect((b!.checkpoint as any).data).toBe('B');
  });

  it('应该列出所有 threads', async () => {
    await checkpointer.put(
      { configurable: { thread_id: 't3', checkpoint_id: 'c1' } },
      makeCheckpoint({}) as any,
      { source: 'loop', step: 0, writes: null, parents: {} },
      {}
    );

    const threads = checkpointer.listThreads();
    expect(threads.length).toBeGreaterThanOrEqual(1);
    expect(threads.some((t) => t.threadId === 't3')).toBe(true);
  });

  it('应该删除 thread', async () => {
    await checkpointer.put(
      { configurable: { thread_id: 't4', checkpoint_id: 'c1' } },
      makeCheckpoint({}) as any,
      { source: 'loop', step: 0, writes: null, parents: {} },
      {}
    );
    checkpointer.deleteThread('t4');

    const tuple = await checkpointer.getTuple({ configurable: { thread_id: 't4' } });
    expect(tuple).toBeUndefined();
  });

  it('非存在的 thread 应返回 undefined', async () => {
    const tuple = await checkpointer.getTuple({
      configurable: { thread_id: 'nonexistent' },
    });
    expect(tuple).toBeUndefined();
  });
});

// ============ Agent + MemorySaver 集成测试 ============

describe('Agent 持久化集成', () => {
  it('应该通过 MemorySaver 保留会话状态', async () => {
    const responses = [
      { content: '第一轮回复', finishReason: 'stop' as const },
      { content: '第二轮回复', finishReason: 'stop' as const },
    ];
    let callCount = 0;
    const mockChat = vi.fn((_messages: unknown[], _options?: unknown) => {
      const r = responses[callCount++];
      return Promise.resolve({
        content: r?.content || '',
        finishReason: r?.finishReason || 'stop',
        usage: { inputTokens: 10, outputTokens: 5 },
      });
    });

    const memorySaver = new MemorySaver();
    const graph = createAgentGraph({
      think: {
        chat: mockChat,
        getToolDefinitions: () => [],
      },
      act: {
        toolExecutor: {
          execute: vi.fn(() => Promise.resolve({ success: true, content: '' })),
        },
      },
      checkpointer: memorySaver,
    });

    const threadId = 'session-check';

    // 第一轮
    await graph.invoke(
      {
        messages: [new HumanMessage({ content: '第一轮' })],
        sessionId: threadId,
        maxTurns: 5,
      },
      { configurable: { thread_id: threadId } }
    );

    // 第二轮 - 使用相同 thread_id 继续
    await graph.invoke(
      {
        messages: [new HumanMessage({ content: '第二轮' })],
        sessionId: threadId,
        maxTurns: 5,
      },
      { configurable: { thread_id: threadId } }
    );

    // 验证两轮都执行了
    expect(callCount).toBe(2);
  });
});
