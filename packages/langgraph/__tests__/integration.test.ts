/**
 * Phase A 集成测试 — 验证 LangGraph ↔ EasyAgent Core 桥接
 *
 * 测试场景：
 * 1. createAdapterBridge — 适配器类型转换正确性
 * 2. createToolBridge — 工具上下文注入正确性
 * 3. createLangGraphAgent — 工厂函数创建可用 Agent
 * 4. 端到端 — 完整对话（含工具调用）通过桥接运行
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseAdapter, ToolRegistry, AdapterFactory } from '@easyagent/core';
import type { Message, ChatResponse, ChatOptions, ProviderConfig, ToolResult, ToolContext, ITool } from '@easyagent/core';
import { createAdapterBridge } from '../src/bridge/adapterBridge';
import { createToolBridge } from '../src/bridge/toolBridge';
import { createLangGraphAgent } from '../src/bridge/AgentFactory';
import { LangGraphAgent } from '../src/Agent';

// ==================== Mock 工具 — 模拟 BaseAdapter 子类 ====================

/**
 * 用于测试的 MockAdapter，继承 BaseAdapter 实现最小 chat 方法
 */
class MockAdapter extends BaseAdapter {
  private mockChat: (messages: Message[], options?: ChatOptions) => Promise<ChatResponse>;

  constructor(
    mockChatFn: (messages: Message[], options?: ChatOptions) => Promise<ChatResponse>,
    config?: ProviderConfig
  ) {
    const defaultConfig: ProviderConfig = {
      id: 'deepseek',
      name: 'Mock',
      baseURL: 'http://localhost:9999',
      apiKey: 'test-key',
      apiFormat: 'openai',
      models: [{ id: 'mock-model', name: 'Mock Model', maxContextTokens: 8192, maxOutputTokens: 4096, supportsTools: true, supportsVision: false }],
      defaultModel: 'mock-model',
    };
    super(config || defaultConfig, 'mock-model');
    this.mockChat = mockChatFn;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    return this.mockChat(messages, options);
  }

  async *chatStream(_messages: Message[], _options?: ChatOptions): AsyncGenerator<{ delta?: string; finishReason?: string }> {
    yield { delta: 'mock stream', finishReason: 'stop' };
  }

  async validateConnection(): Promise<boolean> {
    return true;
  }
}

// ==================== Mock 工具注册表 ====================

/**
 * 创建一个带有 "echo" 工具的 ToolRegistry
 */
function createMockRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  const echoTool: ITool = {
    name: 'echo',
    description: '返回输入内容',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要回显的消息' },
      },
      required: ['message'],
    },
    requiresConfirm: false,
    group: 'test',
    async execute(params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      return {
        success: true,
        content: `Echo: ${params.message}`,
      };
    },
  };

  registry.register(echoTool);
  return registry;
}

// ==================== A.1 — adapterBridge 测试 ====================

describe('createAdapterBridge', () => {
  it('应该将 BaseAdapter.chat 包装为 thinkNode chat 回调', async () => {
    const mockFn = vi.fn(async (msgs: Message[]): Promise<ChatResponse> => ({
      id: 'resp-1',
      model: 'mock-model',
      content: '你好，世界',
      toolCalls: undefined,
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    }));

    const adapter = new MockAdapter(mockFn);
    const bridge = createAdapterBridge(adapter);

    // 调用 bridge（模拟 thinkNode 传入的 ChatMessage 格式）
    const result = await bridge(
      [{ role: 'user', content: '你好' }],
      { tools: [], signal: undefined }
    );

    // 验证类型转换正确
    expect(result.content).toBe('你好，世界');
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    // 验证 adapter.chat 被正确调用
    expect(mockFn).toHaveBeenCalledTimes(1);
    const calledMessages = mockFn.mock.calls[0][0] as Message[];
    expect(calledMessages[0].role).toBe('user');
    expect(calledMessages[0].content).toBe('你好');
  });

  it('应该正确传递 toolCalls', async () => {
    const mockFn = vi.fn(async (): Promise<ChatResponse> => ({
      id: 'resp-2',
      model: 'mock-model',
      content: '',
      toolCalls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'echo', arguments: JSON.stringify({ message: 'test' }) },
      }],
      finishReason: 'tool_calls',
    }));

    const adapter = new MockAdapter(mockFn);
    const bridge = createAdapterBridge(adapter);
    const result = await bridge(
      [{ role: 'user', content: '回显 test' }],
      { tools: [{ name: 'echo', description: '回显', parameters: { type: 'object', properties: {} } }] }
    );

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls![0].function.name).toBe('echo');
    expect(result.finishReason).toBe('tool_calls');
  });
});

// ==================== A.2 — toolBridge 测试 ====================

describe('createToolBridge', () => {
  it('应该将 ToolRegistry.execute 包装为 ToolExecutor', async () => {
    const registry = createMockRegistry();
    const bridge = createToolBridge(registry, () => ({
      workspace: '/test/workspace',
      sessionId: 'test-session',
    }));

    const result = await bridge.execute('echo', { message: 'hello' });

    expect(result.success).toBe(true);
    expect(result.content).toBe('Echo: hello');
  });

  it('应该在每次调用时动态获取 ToolContext', async () => {
    const registry = createMockRegistry();
    let callCount = 0;

    const bridge = createToolBridge(registry, () => {
      callCount++;
      return { workspace: `/ws-${callCount}`, sessionId: `session-${callCount}` };
    });

    await bridge.execute('echo', { message: 'first' });
    await bridge.execute('echo', { message: 'second' });

    expect(callCount).toBe(2);
  });
});

// ==================== A.3 — AgentFactory 测试 ====================

describe('createLangGraphAgent', () => {
  it('应该通过工厂函数创建可用的 LangGraphAgent', async () => {
    const mockChatFn = async (): Promise<ChatResponse> => ({
      id: 'resp-factory',
      model: 'mock-model',
      content: '你好，我是工厂创建的 Agent',
      finishReason: 'stop',
    });

    const adapter = new MockAdapter(mockChatFn);
    const registry = createMockRegistry();
    const agent = await createLangGraphAgent(adapter, registry, {
      systemPrompt: '你是工厂测试助手',
      maxTurns: 3,
    });

    expect(agent).toBeInstanceOf(LangGraphAgent);

    const result = await agent.run('你好');
    expect(result.response).toContain('工厂创建');
    expect(result.turnCount).toBeGreaterThanOrEqual(1);
    expect(result.sessionId).toMatch(/^session_/);

    agent.close();
  });

  it('应该支持工具调用场景', async () => {
    const registry = createMockRegistry();

    // 模拟 LLM：第一轮返回 tool_call，第二轮返回最终文本
    let callIndex = 0;
    const mockChatFn = async (): Promise<ChatResponse> => {
      callIndex++;
      if (callIndex === 1) {
        return {
          id: 'resp-tool-1',
          model: 'mock-model',
          content: '',
          toolCalls: [{
            id: 'call_echo',
            type: 'function',
            function: { name: 'echo', arguments: JSON.stringify({ message: '桥梁测试' }) },
          }],
          finishReason: 'tool_calls',
        };
      }
      return {
        id: 'resp-tool-2',
        model: 'mock-model',
        content: '工具调用完成，结果是: Echo: 桥梁测试',
        finishReason: 'stop',
      };
    };

    const adapter = new MockAdapter(mockChatFn);

    // 手工组装 AgentConfig，使用 bridge
    const chat = createAdapterBridge(adapter);
    const toolExecutor = createToolBridge(registry, () => ({
      workspace: '/test',
      sessionId: 'test-tool-agent',
    }));

    const agent = new LangGraphAgent({
      think: {
        chat,
        getToolDefinitions: () => {
          // 手动定义工具，模拟 ToolRegistry.getDefinitions()
          return registry.getDefinitions() as any;
        },
      },
      act: { toolExecutor },
      systemPrompt: '你是工具测试助手',
      maxTurns: 5,
    });

    const result = await agent.run('回显 桥梁测试');
    expect(result.turnCount).toBeGreaterThanOrEqual(2); // think + act + think
    expect(result.response).toContain('Echo');
    expect(callIndex).toBe(2); // 两次 LLM 调用

    agent.close();
  });

  it('应该在传入 ProviderConfig 时通过 AdapterFactory 创建适配器', async () => {
    const registry = createMockRegistry();

    // AdapterFactory.create() 是同步的，不触发网络调用
    // 因此传入任意 ProviderConfig 都能成功创建 agent
    const agent = await createLangGraphAgent(
      {
        id: 'deepseek',
        name: 'Test',
        baseURL: 'http://localhost:99999/nonexistent',
        apiKey: 'test-key',
        apiFormat: 'openai',
        models: [{ id: 'test', name: 'Test', maxContextTokens: 4096, maxOutputTokens: 1024, supportsTools: false, supportsVision: false }],
      },
      registry,
      { model: 'test', maxTurns: 1 }
    );

    expect(agent).toBeInstanceOf(LangGraphAgent);

    // run() 会因为无效 baseURL 而失败，但 thinkNode 内部 catch 返回友好错误消息
    const result = await agent.run('测试');
    expect(result.turnCount).toBe(0);
    expect(result.response).toContain('LLM 时发生错误');
    agent.close();
  });
});

// ==================== A.4 — 端到端：bridge → Agent → 对话 ====================

describe('端到端集成', () => {
  it('应该完成 纯文本对话（无工具）', async () => {
    const mockChatFn = async (): Promise<ChatResponse> => ({
      id: 'e2e-1',
      model: 'mock',
      content: '集成测试成功！',
      finishReason: 'stop',
    });

    const adapter = new MockAdapter(mockChatFn);
    const registry = createMockRegistry();
    const agent = await createLangGraphAgent(adapter, registry, {
      systemPrompt: 'E2E 测试助手',
      maxTurns: 3,
    });

    const result = await agent.run('测试');
    expect(result.response).toBe('集成测试成功！');
    expect(result.messages.length).toBeGreaterThan(0);

    agent.close();
  });

  it('应该完成 工具调用 → 观察 → 最终回答 全路径', async () => {
    const registry = createMockRegistry();

    const responses = [
      {
        id: 'e2e-tool-1', model: 'mock', content: '',
        toolCalls: [{ id: 'c1', type: 'function' as const, function: { name: 'echo', arguments: JSON.stringify({ message: 'E2E测试' }) } }],
        finishReason: 'tool_calls' as const,
      },
      {
        id: 'e2e-tool-2', model: 'mock', content: 'Echo 返回: Echo: E2E测试',
        finishReason: 'stop' as const,
      },
    ];
    let idx = 0;
    const mockChatFn = async (): Promise<ChatResponse> => {
      const r = responses[idx++] || { id: 'default', model: 'mock', content: '', finishReason: 'stop' as const };
      return r;
    };

    const adapter = new MockAdapter(mockChatFn);
    const chat = createAdapterBridge(adapter);
    const toolExecutor = createToolBridge(registry, () => ({
      workspace: '/e2e',
      sessionId: 'e2e-session',
    }));

    const agent = new LangGraphAgent({
      think: { chat, getToolDefinitions: () => registry.getDefinitions() as any },
      act: { toolExecutor },
      systemPrompt: 'E2E 工具测试',
      maxTurns: 5,
    });

    const result = await agent.run('执行 E2E 工具测试');
    expect(result.turnCount).toBeGreaterThanOrEqual(2);
    expect(result.response).toContain('Echo');

    agent.close();
  });
});
