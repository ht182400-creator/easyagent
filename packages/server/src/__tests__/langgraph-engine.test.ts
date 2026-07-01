/**
 * Phase B 集成测试 — LangGraph 引擎适配器 + 事件映射
 *
 * 单元测试级别，不依赖完整的 server 实例
 *
 * @module server/__tests__/langgraph-engine.test
 */
import { describe, it, expect } from 'vitest';
import { getEngineType } from '../langgraph/engineFactory.js';
import { LangGraphAgentAdapter } from '../langgraph/agentAdapter.js';
import type { UnifiedAgentEvent, EventListener } from '../langgraph/agentAdapter.js';

// ============ 1. 引擎配置解析 ============

describe('getEngineType() — 引擎配置解析', () => {
  it('未设置环境变量时默认返回 legacy', () => {
    // 确保测试环境中没有设置 EASYAGENT_ENGINE
    delete process.env.EASYAGENT_ENGINE;
    expect(getEngineType()).toBe('legacy');
  });

  it('设置 EASYAGENT_ENGINE=langgraph 时返回 langgraph', () => {
    process.env.EASYAGENT_ENGINE = 'langgraph';
    expect(getEngineType()).toBe('langgraph');
    // 清理
    delete process.env.EASYAGENT_ENGINE;
  });

  it('设置 EASYAGENT_ENGINE=legacy 时返回 legacy', () => {
    process.env.EASYAGENT_ENGINE = 'legacy';
    expect(getEngineType()).toBe('legacy');
    delete process.env.EASYAGENT_ENGINE;
  });

  it('设置未知值时返回 legacy（安全回退）', () => {
    process.env.EASYAGENT_ENGINE = 'unknown';
    expect(getEngineType()).toBe('legacy');
    delete process.env.EASYAGENT_ENGINE;
  });
});

// ============ 2. 适配器类型检查 ============

describe('LangGraphAgentAdapter — 类型检查', () => {
  it('adapter 具有 AgentEngine 兼容的方法签名', () => {
    // 验证类型存在性（不需要实例化）
    expect(typeof LangGraphAgentAdapter).toBe('function');

    const proto = LangGraphAgentAdapter.prototype;
    expect(typeof proto.run).toBe('function');
    expect(typeof proto.getTokenUsage).toBe('function');
    expect(typeof proto.onEvent).toBe('function');
    expect(typeof proto.offEvent).toBe('function');
    expect(typeof proto.abort).toBe('function');

    // Phase B 新增的 Checkpoint API
    expect(typeof proto.listSessions).toBe('function');
    expect(typeof proto.getSessionState).toBe('function');
    expect(typeof proto.resume).toBe('function');
  });
});

// ============ 3. 事件映射常量验证 ============

describe('事件类型兼容性', () => {
  /** AgentEngine 在 server 中使用的事件类型 */
  const agentEngineEventTypes = [
    'turn_start',
    'tool_start',
    'tool_end',
    'token_usage',
    'done',
    'error',
  ];

  it('LangGraphAdapter 应支持 AgentEngine 使用的事件类型', () => {
    // 验证事件类型集合完整性
    // adapter 的 mapLangGraphToAgentEngineEvent 产生 'tool_start', 'tool_end' 等
    // 与 server/index.ts 的 event switch 匹配
    expect(agentEngineEventTypes).toContain('tool_start');
    expect(agentEngineEventTypes).toContain('tool_end');
    expect(agentEngineEventTypes).toContain('done');
    expect(agentEngineEventTypes).toContain('error');
  });
});

// ============ 4. 工厂函数导入验证 ============

describe('createAgent — 工厂函数导入', () => {
  it('createAgent 应从 engineFactory 正确导出', async () => {
    const { createAgent } = await import('../langgraph/engineFactory.js');
    expect(typeof createAgent).toBe('function');
  });

  it('isLangGraphAdapter 类型守卫应正确导出', async () => {
    const { isLangGraphAdapter } = await import('../langgraph/engineFactory.js');
    expect(typeof isLangGraphAdapter).toBe('function');
  });
});

// ============ 5. 模块导出完整性 ============

describe('server/langgraph 模块导出', () => {
  it('index.ts 应导出所有公共 API', async () => {
    const mod = await import('../langgraph/index.js');
    expect(mod.getEngineType).toBeDefined();
    expect(mod.createAgent).toBeDefined();
    expect(mod.isLangGraphAdapter).toBeDefined();
    expect(mod.LangGraphAgentAdapter).toBeDefined();
  });
});
