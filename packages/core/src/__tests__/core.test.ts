/**
 * EasyAgent Core 单元测试
 * 测试Agent引擎、工具系统、适配器等核心模块
 */
import { describe, it, expect } from 'vitest';

// 模拟 fetch API
if (!globalThis.fetch) {
  globalThis.fetch = async () => {
    throw new Error('fetch not available in test environment');
  };
}

describe('AgentEngine', () => {
  it('应该能够初始化Agent引擎', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = {
      providerName: 'test',
      currentModel: 'test-model',
      chat: async () => ({
        id: '1',
        model: 'test',
        content: 'Hello World',
        finishReason: 'stop' as const,
      }),
      chatStream: async function* () {
        yield { delta: 'Hello' };
        yield { delta: ' World' };
      },
      getModels: () => [],
      validateConnection: async () => true,
      switchModel: () => {},
      getModelInfo: () => undefined,
    };

    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);
    expect(agent.getState()).toBe('idle');
  });

  it('应该正确追踪Token用量', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = {
      providerName: 'test',
      currentModel: 'test-model',
      chat: async () => ({
        id: '1',
        model: 'test',
        content: 'Test response',
        finishReason: 'stop' as const,
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      chatStream: async function* () {
        yield { delta: 'Test' };
        yield { delta: ' response' };
      },
      getModels: () => [],
      validateConnection: async () => true,
      switchModel: () => {},
      getModelInfo: () => undefined,
    };

    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    await agent.run('test message');

    const usage = agent.getTokenUsage();
    expect(usage.totalTokens).toBeGreaterThan(0);
  });
});

describe('ToolRegistry', () => {
  it('应该能够注册和执行工具', async () => {
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const registry = new ToolRegistry();
    registry.register({
      name: 'test_tool',
      description: '测试工具',
      requiresConfirm: false,
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: '消息' },
        },
        required: ['message'],
      },
      execute: async (params: any) => ({
        success: true,
        content: `Echo: ${params.message}`,
      }),
    });

    const result = await registry.execute(
      'test_tool',
      { message: 'hello' },
      {
        workspace: '/tmp',
        sessionId: 'test',
      },
    );

    expect(result.success).toBe(true);
    expect(result.content).toBe('Echo: hello');
  });

  it('应该返回错误对于未知工具', async () => {
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const registry = new ToolRegistry();
    const result = await registry.execute(
      'unknown',
      {},
      {
        workspace: '/tmp',
        sessionId: 'test',
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('应该能够列出所有工具定义', async () => {
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const registry = new ToolRegistry();
    registry.register({
      name: 'tool1',
      description: '工具1',
      requiresConfirm: false,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ success: true, content: '' }),
    });

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('tool1');
  });
});

describe('SessionManager', () => {
  it('应该能够创建和获取会话', async () => {
    const { SessionManager } = await import('../session/SessionManager.js');

    const manager = new SessionManager('/tmp/easyagent-test');
    const session = manager.getOrCreate('test-session', {
      workspace: '/tmp',
      provider: 'deepseek',
      model: 'deepseek-chat',
    });

    expect(session.id).toBe('test-session');
    expect(session.messages).toHaveLength(0);
    expect(session.modelConfig.provider).toBe('deepseek');

    // 清理
    manager.delete('test-session');
    manager.close();
  });
});

describe('ConfigManager', () => {
  it('应该能够加载默认配置', async () => {
    const { ConfigManager } = await import('../config/ConfigManager.js');

    const manager = new ConfigManager('/tmp/easyagent-test-config');
    const config = await manager.load();

    expect(config.agent.maxTurns).toBe(25);
    expect(config.currentModel.provider).toBe('deepseek');
    expect(config.security.requireConfirmation).toBe(true);
  });
});

describe('OpenAICompatibleAdapter', () => {
  it('应该正确配置基础URL', async () => {
    const { OpenAICompatibleAdapter } = await import('../adapters/OpenAICompatibleAdapter.js');

    const adapter = new OpenAICompatibleAdapter({
      id: 'deepseek',
      name: 'DeepSeek',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'test-key',
      apiFormat: 'openai',
      models: [
        {
          id: 'deepseek-chat',
          name: 'V3',
          maxContextTokens: 65536,
          maxOutputTokens: 8192,
          supportsTools: true,
          supportsVision: false,
        },
      ],
    });

    expect(adapter.currentModel).toBe('deepseek-chat');
    expect(adapter.providerName).toBe('DeepSeek');
  });
});

describe('AdapterFactory', () => {
  it('应该为DeepSeek创建OpenAI兼容适配器', async () => {
    const { AdapterFactory } = await import('../adapters/index.js');
    const { OpenAICompatibleAdapter } = await import('../adapters/OpenAICompatibleAdapter.js');

    const config: any = {
      id: 'deepseek',
      name: 'DeepSeek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: 'test',
      apiFormat: 'openai',
      models: [],
    };

    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });

  it('应该为文心一言创建自定义适配器', async () => {
    const { AdapterFactory } = await import('../adapters/index.js');
    const { ErnieAdapter } = await import('../adapters/ErnieAdapter.js');

    const config: any = {
      id: 'ernie',
      name: '文心一言',
      baseURL: 'https://aip.baidubce.com',
      apiKey: 'key:secret',
      apiFormat: 'custom',
      models: [],
    };

    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeInstanceOf(ErnieAdapter);
  });
});
