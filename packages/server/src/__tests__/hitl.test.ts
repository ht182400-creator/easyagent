/**
 * QuestionBroker 测试（人在环路 HITL，2026-09-19）
 *
 * 覆盖：广播提问 → 用户回答 → 交回工具；超时不挂起；cancelAll 释放等待。
 */
import { describe, it, expect, vi } from 'vitest';
import { QuestionBroker, createInteractiveAskUserTool } from '../hitl.js';

describe('QuestionBroker - Agent 提问与用户回答', () => {
  it('广播提问并在用户回答后返回该回答', async () => {
    const broadcast = vi.fn();
    const broker = new QuestionBroker({ broadcast, timeoutMs: 1000 });

    const promise = broker.ask({ question: '选 A 还是 B？', options: ['A', 'B'] });

    expect(broadcast).toHaveBeenCalledTimes(1);
    const q = broadcast.mock.calls[0][0];
    expect(q.question).toBe('选 A 还是 B？');
    expect(q.options).toEqual(['A', 'B']);
    expect(broker.list()).toHaveLength(1);

    expect(broker.answer(q.id, 'A')).toBe(true);
    await expect(promise).resolves.toBe('A');
    expect(broker.list()).toHaveLength(0);
  });

  it('超时返回「自行决策」说明，且 Promise 落地（不挂起）', async () => {
    const broker = new QuestionBroker({ broadcast: () => {}, timeoutMs: 30 });

    const answer = await broker.ask({ question: '无人值守时的问题' });

    expect(answer).toContain('未回答');
    expect(answer).toContain('自行选择最合理的做法');
    expect(broker.list()).toHaveLength(0);
  });

  it('回答不存在或已回答的问题返回 false', async () => {
    const broker = new QuestionBroker({ broadcast: () => {}, timeoutMs: 1000 });

    expect(broker.answer('q_nope', 'x')).toBe(false);

    const p = broker.ask({ question: 'q' });
    const id = broker.list()[0].id;
    expect(broker.answer(id, 'y')).toBe(true);
    expect(broker.answer(id, 'z')).toBe(false); // 已回答过
    await expect(p).resolves.toBe('y');
  });

  it('cancelAll 释放全部等待（任务停止场景）', async () => {
    const broker = new QuestionBroker({ broadcast: () => {}, timeoutMs: 10_000 });

    const p1 = broker.ask({ question: 'a' });
    const p2 = broker.ask({ question: 'b' });
    expect(broker.list()).toHaveLength(2);

    expect(broker.cancelAll('任务已停止')).toBe(2);
    await expect(p1).resolves.toContain('任务已停止');
    await expect(p2).resolves.toContain('任务已停止');
    expect(broker.list()).toHaveLength(0);
  });

  it('可交互 ask_user 工具把用户回答作为工具结果返回', async () => {
    const broker = new QuestionBroker({ broadcast: () => {}, timeoutMs: 1000 });
    const tool = createInteractiveAskUserTool(broker);

    const pending = tool.execute(
      { question: '继续执行吗？', options: ['继续', '停止'] },
      { workspace: '.', sessionId: 's1' },
    );

    const id = broker.list()[0].id;
    expect(broker.answer(id, '继续')).toBe(true);

    const result = await pending;
    expect(result.success).toBe(true);
    expect(result.content).toContain('继续');
  });

  it('缺少 question 参数时直接失败（不进入等待）', async () => {
    const broker = new QuestionBroker({ broadcast: () => {}, timeoutMs: 1000 });
    const tool = createInteractiveAskUserTool(broker);

    const result = await tool.execute({}, { workspace: '.', sessionId: 's1' });

    expect(result.success).toBe(false);
    expect(broker.list()).toHaveLength(0);
  });
});
