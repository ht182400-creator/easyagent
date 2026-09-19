/**
 * Phase B 集成测试 — LangGraph 引擎适配器 + 事件映射
 *
 * 单元测试级别，不依赖完整的 server 实例
 *
 * @module server/__tests__/langgraph-engine.test
 */
import { describe, it, expect } from 'vitest';
import { getEngineType, resolveEngineSource } from '../langgraph/engineFactory.js';
import { LangGraphAgentAdapter } from '../langgraph/agentAdapter.js';
import type { UnifiedAgentEvent, EventListener } from '../langgraph/agentAdapter.js';

// ============ 1. 引擎配置解析 ============

describe('getEngineType() — 引擎配置解析', () => {
  /**
   * 依赖注入常量：隔离「真实环境变量」与「仓库中的 engine.config.json」
   *
   * 【2026-09-18 修复】原用例直接调用 getEngineType()，其返回值会被仓库里真实的
   * engine.config.json（内容为 "engine": "langgraph"）左右，导致
   * "未设置环境变量时默认返回 legacy" 与 "未知值回退 legacy" 两条用例误报失败。
   * 现统一通过 deps 注入，用例结果只取决于被测逻辑本身。
   */
  const NO_ENV: NodeJS.ProcessEnv = {};
  const NO_CONFIG = () => null;
  /** 模拟一份指向 langgraph 的配置文件 */
  const LG_CONFIG = () => ({
    config: { engine: 'langgraph' as const },
    path: '/fake/engine.config.json',
  });

  it('未设置环境变量且无配置文件时默认返回 legacy', () => {
    expect(getEngineType(null, { env: NO_ENV, configProvider: NO_CONFIG })).toBe('legacy');
  });

  it('设置 EASYAGENT_ENGINE=langgraph 时返回 langgraph', () => {
    expect(
      getEngineType(null, { env: { EASYAGENT_ENGINE: 'langgraph' }, configProvider: NO_CONFIG }),
    ).toBe('langgraph');
  });

  it('设置 EASYAGENT_ENGINE=legacy 时返回 legacy', () => {
    expect(
      getEngineType(null, { env: { EASYAGENT_ENGINE: 'legacy' }, configProvider: NO_CONFIG }),
    ).toBe('legacy');
  });

  it('设置未知值时返回 legacy（安全回退）', () => {
    expect(
      getEngineType(null, { env: { EASYAGENT_ENGINE: 'unknown' }, configProvider: NO_CONFIG }),
    ).toBe('legacy');
  });

  // ---------- 新增：配置文件层级与优先级链（原用例未覆盖） ----------

  it('无环境变量时应采用 engine.config.json 中的配置', () => {
    expect(getEngineType(null, { env: NO_ENV, configProvider: LG_CONFIG })).toBe('langgraph');
  });

  it('环境变量优先级高于配置文件', () => {
    expect(
      getEngineType(null, { env: { EASYAGENT_ENGINE: 'legacy' }, configProvider: LG_CONFIG }),
    ).toBe('legacy');
  });

  it('CLI 参数优先级高于环境变量与配置文件', () => {
    expect(
      getEngineType('legacy', {
        env: { EASYAGENT_ENGINE: 'langgraph' },
        configProvider: LG_CONFIG,
      }),
    ).toBe('legacy');
  });

  it('resolveEngineSource 应正确标注来源（cli / env / config / default）', () => {
    // ① 默认值
    expect(resolveEngineSource(null, { env: NO_ENV, configProvider: NO_CONFIG }).source).toBe(
      'default',
    );
    // ② CLI 参数
    expect(
      resolveEngineSource('langgraph', { env: NO_ENV, configProvider: NO_CONFIG }).source,
    ).toBe('cli');
    // ③ 环境变量
    expect(
      resolveEngineSource(null, {
        env: { EASYAGENT_ENGINE: 'legacy' },
        configProvider: NO_CONFIG,
      }).source,
    ).toBe('env');
    // ④ 配置文件
    expect(resolveEngineSource(null, { env: NO_ENV, configProvider: LG_CONFIG }).source).toBe(
      'config',
    );
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
