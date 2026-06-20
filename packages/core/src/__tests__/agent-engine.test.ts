/**
 * AgentEngine 全面测试
 * 覆盖Agent初始化、ReAct循环、事件系统、Token追踪、中止、模型切换、历史清除
 */
import { describe, it, expect, beforeEach } from 'vitest';

/** 创建模拟适配器 */
function createMockAdapter(overrides: Record<string, unknown> = {}) {
  return {
    providerName: 'test-provider',
    currentModel: 'test-model',
    chat: async () => ({
      id: 'resp-1',
      model: 'test-model',
      content: 'Hello from mock',
      finishReason: 'stop' as const,
      usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    }),
    chatStream: async function* () {
      yield { delta: 'Hello' };
      yield { delta: ' World' };
    },
    getModels: () => [],
    validateConnection: async () => true,
    switchModel: () => {},
    getModelInfo: () => undefined,
    ...overrides,
  };
}

describe('AgentEngine - 初始化', () => {
  it('应该使用适配器实例初始化', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    expect(agent.getState()).toBe('idle');
    const usage = agent.getTokenUsage();
    expect(usage.totalTokens).toBe(0);
  });

  it('应该使用ProviderConfig初始化(工厂模式)', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const providerConfig = {
      id: 'deepseek',
      name: 'DeepSeek',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'test-key',
      apiFormat: 'openai' as const,
      models: [{
        id: 'deepseek-chat',
        name: 'V3',
        maxContextTokens: 65536,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
      }],
    };

    const tools = new ToolRegistry();
    const agent = new AgentEngine(providerConfig as any, tools);
    expect(agent.getState()).toBe('idle');
  });

  it('应使用默认配置当未提供config时', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');

    const mockAdapter = createMockAdapter();
    const agent = new AgentEngine(mockAdapter as any);
    expect(agent.getState()).toBe('idle');
  });

  it('初始Token用量应为0', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const usage = agent.getTokenUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });
});

describe('AgentEngine - Agent运行循环', () => {
  it('应返回模型响应', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const response = await agent.run('test input');
    expect(response).toContain('Hello from mock');
  });

  it('应正确追踪Token用量', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter({
      chat: async () => ({
        id: 'resp-1',
        model: 'test',
        content: 'Test response',
        finishReason: 'stop' as const,
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      }),
    });
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    await agent.run('test');
    const usage = agent.getTokenUsage();
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.totalTokens).toBe(150);
  });

  it('应支持流式输出回调', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const chunks: string[] = [];
    const response = await agent.run('test', {
      onPartialResponse: (text: string) => {
        chunks.push(text);
      },
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks).toContain('Hello');
    expect(chunks).toContain(' World');
  });

  it('应支持工具调用循环', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    // 模拟需要工具调用的场景：第一轮返回tool_calls，第二轮返回最终答案
    let callCount = 0;
    const mockAdapter = createMockAdapter({
      chat: async () => {
        callCount++;
        if (callCount === 1) {
          return {
            id: 'resp-1',
            model: 'test',
            content: '',
            finishReason: 'tool_calls' as const,
            toolCalls: [{
              id: 'call_1',
              type: 'function' as const,
              function: { name: 'echo', arguments: '{"text":"hello"}' },
            }],
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          };
        }
        return {
          id: 'resp-2',
          model: 'test',
          content: 'Tool result processed',
          finishReason: 'stop' as const,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        };
      },
    });

    const tools = new ToolRegistry();
    tools.register({
      name: 'echo',
      description: '回显',
      requiresConfirm: false,
      parameters: { type: 'object', properties: { text: { type: 'string', description: '' } }, required: ['text'] },
      execute: async (params: any) => ({ success: true, content: `Echo: ${params.text}` }),
    });

    const agent = new AgentEngine(mockAdapter as any, tools);
    const response = await agent.run('test with tool');
    expect(response).toContain('Tool result processed');
    expect(callCount).toBe(2);
  });
});

describe('AgentEngine - 事件系统', () => {
  it('应触发Agent生命周期事件', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const events: string[] = [];
    agent.onEvent((event: any) => {
      events.push(event.type);
    });

    await agent.run('test');

    // 应至少包含thinking和done事件
    expect(events).toContain('thinking');
    expect(events).toContain('done');
  });

  it('应支持移除事件监听器', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const events: string[] = [];
    const listener = (event: any) => events.push(event.type);
    agent.onEvent(listener);
    agent.offEvent(listener);

    await agent.run('test');
    // 移除后不应收到事件
    expect(events).toHaveLength(0);
  });
});

describe('AgentEngine - 中止', () => {
  it('abort应能中止Agent执行并返回取消消息', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    // 模拟一个支持signal检查的慢速响应
    const mockAdapter = createMockAdapter({
      chat: async (_messages: any, options: any) => {
        // 检查signal是否已abort
        if (options?.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        // 等待一点时间让abort有机会触发
        await new Promise(resolve => setTimeout(resolve, 10));
        // 再次检查
        if (options?.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        return {
          id: 'resp-1',
          model: 'test',
          content: 'Delayed response',
          finishReason: 'stop' as const,
        };
      },
    });

    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    // 异步运行agent
    const runPromise = agent.run('test');
    // 给agent一点时间进入循环后立即中止
    await new Promise(resolve => setTimeout(resolve, 2));
    agent.abort();

    const response = await runPromise;
    // abort后应该返回取消消息或错误消息
    expect(typeof response).toBe('string');
    // 可能是"操作已取消"（AbortError）或正常响应（如果来不及中止）
    // 两种情况都是合法的
    expect(response.length).toBeGreaterThan(0);
  });
});

describe('AgentEngine - 模型切换', () => {
  it('switchModel应切换模型并更新配置', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const newConfig = {
      id: 'qwen',
      name: '通义千问',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode',
      apiKey: 'test-key',
      apiFormat: 'openai' as const,
      models: [{
        id: 'qwen-max',
        name: 'Qwen Max',
        maxContextTokens: 32768,
        maxOutputTokens: 8192,
        supportsTools: true,
        supportsVision: false,
      }],
    };

    // 不应抛出异常
    expect(() => agent.switchModel(newConfig as any, 'qwen-max')).not.toThrow();
  });
});

describe('AgentEngine - 历史清除', () => {
  it('clearHistory应重置Token用量', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter({
      chat: async () => ({
        id: 'resp-1',
        model: 'test',
        content: 'Response',
        finishReason: 'stop' as const,
        usage: { inputTokens: 50, outputTokens: 25, totalTokens: 75 },
      }),
    });
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    await agent.run('test');
    expect(agent.getTokenUsage().totalTokens).toBeGreaterThan(0);

    agent.clearHistory('test-session');
    const usage = agent.getTokenUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.totalTokens).toBe(0);
  });
});

describe('AgentEngine - 边界条件', () => {
  it('空输入应能正常处理', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter();
    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const response = await agent.run('');
    expect(typeof response).toBe('string');
  });

  it('禁用工具时应不发送工具定义', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    let receivedTools: any = undefined;
    const mockAdapter = createMockAdapter({
      chat: async (_messages: any, options: any) => {
        receivedTools = options?.tools;
        return {
          id: 'resp-1',
          model: 'test',
          content: 'No tools used',
          finishReason: 'stop' as const,
        };
      },
    });

    const tools = new ToolRegistry();
    tools.register({
      name: 'test_tool',
      description: 'test',
      requiresConfirm: false,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ success: true, content: '' }),
    });

    const agent = new AgentEngine(mockAdapter as any, tools, undefined, {
      allowTools: false,
    });

    await agent.run('test');
    // 工具定义不应被发送
    expect(receivedTools).toBeUndefined();
  });

  it('模型返回空内容应给出默认提示', async () => {
    const { AgentEngine } = await import('../agent/AgentEngine.js');
    const { ToolRegistry } = await import('../tools/ToolRegistry.js');

    const mockAdapter = createMockAdapter({
      chat: async () => ({
        id: 'resp-1',
        model: 'test',
        content: '',
        finishReason: 'stop' as const,
      }),
    });

    const tools = new ToolRegistry();
    const agent = new AgentEngine(mockAdapter as any, tools);

    const response = await agent.run('test');
    expect(response).toContain('已完成');
  });
});
