/**
 * langGraphStore 测试 — Phase C
 * 覆盖: 初始状态、highlightNode、场景执行、会话管理、引擎类型
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ==================== Mock fetch ====================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ==================== Mock request 模块 ====================

vi.mock('../../request', () => ({
  getApiBase: vi.fn(() => 'http://localhost:3456'),
  getWsBase: vi.fn(() => 'ws://localhost:3456/ws'),
}));

import { useLangGraphStore } from '../../stores/langGraphStore';

// ==================== 辅助 ====================

/** 重置 store 到初始状态 */
function resetStore() {
  useLangGraphStore.setState({
    highlightedNode: null,
    highlightedEdges: new Set(),
    scenarioResults: {},
    runningScenarios: new Set(),
    sessions: [],
    sessionsLoading: false,
    selectedSession: null,
    selectedSessionLoading: false,
    engineType: 'legacy',
  });
}

beforeEach(() => {
  resetStore();
  mockFetch.mockReset();
});

// ==================== 初始状态 (2) ====================

describe('langGraphStore — 初始状态', () => {
  it('初始 highlightedNode 为 null（用例1）', () => {
    const state = useLangGraphStore.getState();
    expect(state.highlightedNode).toBeNull();
  });

  it('初始 engineType 为 legacy（用例2）', () => {
    const state = useLangGraphStore.getState();
    expect(state.engineType).toBe('legacy');
  });

  it('初始 scenarioResults 为空对象', () => {
    const state = useLangGraphStore.getState();
    expect(state.scenarioResults).toEqual({});
  });

  it('初始 runningScenarios 为空 Set', () => {
    const state = useLangGraphStore.getState();
    expect(state.runningScenarios.size).toBe(0);
  });
});

// ==================== highlightNode 动作 (3) ====================

describe('langGraphStore — highlightNode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("highlightNode('think') 设置 highlightedNode（用例3）", () => {
    useLangGraphStore.getState().highlightNode('think');
    expect(useLangGraphStore.getState().highlightedNode).toBe('think');
  });

  it('highlightNode 同时设置 highlightedEdges（用例4）', () => {
    useLangGraphStore.getState().highlightNode('think');
    const edges = useLangGraphStore.getState().highlightedEdges;
    // think 的入边: START→think, observe→think; 出边: think→route
    expect(edges.has('START→think')).toBe(true);
    expect(edges.has('think→route')).toBe(true);
    expect(edges.has('observe→think')).toBe(true);
  });

  it('自动清除 (3s timeout)（用例5）', () => {
    useLangGraphStore.getState().highlightNode('think');
    expect(useLangGraphStore.getState().highlightedNode).toBe('think');

    vi.advanceTimersByTime(3000);
    expect(useLangGraphStore.getState().highlightedNode).toBeNull();
    expect(useLangGraphStore.getState().highlightedEdges.size).toBe(0);
  });

  it('highlightNode(null) 立即清除', () => {
    useLangGraphStore.getState().highlightNode('think');
    useLangGraphStore.getState().highlightNode(null);
    expect(useLangGraphStore.getState().highlightedNode).toBeNull();
  });
});

// ==================== 场景执行 (3) ====================

describe('langGraphStore — 场景执行', () => {
  it('runScenario 将场景加入 runningScenarios（用例6）', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ turnCount: 1, messageCount: 2, duration: '100ms' }),
    });

    // 触发执行但不等待完成 — 检查中间状态
    const promise = useLangGraphStore.getState().runScenario(1);

    // 异步验证 running 状态
    await Promise.resolve(); // 让微任务执行
    expect(useLangGraphStore.getState().runningScenarios.has(1)).toBe(true);

    await promise;
  });

  it('setScenarioResult 更新 scenarioResults（用例7）', () => {
    const result = {
      turnCount: 3,
      messageCount: 5,
      duration: '1.5s',
      output: '测试输出',
    };
    useLangGraphStore.getState().setScenarioResult(1, result);
    expect(useLangGraphStore.getState().scenarioResults[1]).toEqual(result);
  });

  it('runScenario 完成后从 runningScenarios 移除（用例8）', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ turnCount: 1, messageCount: 2, duration: '50ms' }),
    });

    await useLangGraphStore.getState().runScenario(2);
    expect(useLangGraphStore.getState().runningScenarios.has(2)).toBe(false);
    expect(useLangGraphStore.getState().scenarioResults[2]).toBeDefined();
  });

  it('runScenario 失败时仍从 runningScenarios 移除', async () => {
    mockFetch.mockRejectedValueOnce(new Error('网络错误'));

    await useLangGraphStore.getState().runScenario(3);
    expect(useLangGraphStore.getState().runningScenarios.has(3)).toBe(false);
    expect(useLangGraphStore.getState().scenarioResults[3]?.output).toContain('执行失败');
  });
});

// ==================== 会话管理 (2) ====================

describe('langGraphStore — 会话管理', () => {
  it('loadSessions 更新 sessions 列表（用例9）', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          sessions: [
            { threadId: 'thread-1', turnCount: 2, updatedAt: '2026-06-29' },
            { threadId: 'thread-2', turnCount: 5, updatedAt: '2026-06-28' },
          ],
        }),
    });

    await useLangGraphStore.getState().loadSessions();
    const sessions = useLangGraphStore.getState().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions[0].threadId).toBe('thread-1');
    expect(sessions[0].turnCount).toBe(2);
  });

  it('loadSessionDetail 设置 selectedSession（用例10）', async () => {
    const detailData = {
      id: 'thread-1',
      state: { messages: [] },
      checkpoints: [
        { id: 'cp-1', nodeId: 'think', timestamp: '2026-06-29', step: 1 },
        { id: 'cp-2', nodeId: 'route', timestamp: '2026-06-29', step: 2 },
      ],
    };
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve(detailData),
    });

    await useLangGraphStore.getState().loadSessionDetail('thread-1');
    const detail = useLangGraphStore.getState().selectedSession;
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe('thread-1');
    expect(detail!.checkpoints).toHaveLength(2);
  });
});

// ==================== 引擎类型 (2) ====================

describe('langGraphStore — 引擎类型', () => {
  it("setEngineType('langgraph') 更新 engineType（用例11）", () => {
    useLangGraphStore.getState().setEngineType('langgraph');
    expect(useLangGraphStore.getState().engineType).toBe('langgraph');
  });

  it("setEngineType('legacy') 更新 engineType（用例12）", () => {
    useLangGraphStore.getState().setEngineType('langgraph');
    useLangGraphStore.getState().setEngineType('legacy');
    expect(useLangGraphStore.getState().engineType).toBe('legacy');
  });
});
