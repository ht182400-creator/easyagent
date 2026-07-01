/**
 * Agent 基础测试 — 验证 Think-Act-Observe 环形图
 * 
 * 使用 Mock 适配器测试（不含 Checkpoint 以简化单元测试）:
 * 1. 纯文本对话（无工具调用）
 * 2. 工具调用循环
 * 3. 最大轮次限制
 * 4. 错误处理
 * 5. 多工具并行
 */
import { describe, it, expect, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { createAgentGraph } from '../src/graph/agentGraph';
import type { AgentGraphConfig } from '../src/graph/agentGraph';

// ============ Mock 适配器 ============

/**
 * 创建模拟的 chat 函数
 */
function createMockChat(responses: Array<{
  content?: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}>) {
  let callIndex = 0;
  return vi.fn((_messages: unknown[], _options?: unknown) => {
    const response = responses[callIndex] || {
      content: '默认响应',
      finishReason: 'stop',
    };
    callIndex++;
    return Promise.resolve({
      content: response.content || '',
      toolCalls: response.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
      finishReason: response.finishReason || 'stop',
      usage: response.usage || { inputTokens: 10, outputTokens: 5 },
    });
  });
}

/**
 * 创建模拟的工具执行器
 */
function createMockToolExecutor(results: Record<string, { success: boolean; content: string }> = {}) {
  return {
    execute: vi.fn((name: string, _params: Record<string, unknown>) => {
      const result = results[name] || { success: true, content: `工具 ${name} 执行成功` };
      return Promise.resolve(result);
    }),
  };
}

/**
 * 构建测试图（不含 checkpointer）
 */
function buildTestGraph(config: Partial<{
  chatResponses: Parameters<typeof createMockChat>[0];
  toolResults: Record<string, { success: boolean; content: string }>;
}> = {}) {
  const mockChat = createMockChat(config.chatResponses || [
    { content: '你好！有什么可以帮助你的？', finishReason: 'stop' },
  ]);
  const mockExecutor = createMockToolExecutor(config.toolResults);

  const graphConfig: AgentGraphConfig = {
    think: {
      chat: mockChat,
      getToolDefinitions: () => [],
      systemPrompt: '你是一个测试助手',
    },
    act: {
      toolExecutor: mockExecutor,
    },
    // 不传 checkpointer — 单元测试不需要持久化
  };

  return { graph: createAgentGraph(graphConfig), mockChat, mockExecutor };
}

// ============ 基础测试 ============

describe('AgentGraph — 核心环形图', () => {
  // 测试 1: 纯文本对话
  it('应该正确处理纯文本对话（无工具调用）', async () => {
    const { graph } = buildTestGraph({
      chatResponses: [
        { content: '你好！我是测试助手。', finishReason: 'stop' },
      ],
    });

    const result = await graph.invoke({
      messages: [new HumanMessage({ content: '你好' })],
      sessionId: 'test-1',
      maxTurns: 5,
    });

    const messages = result.messages as any[];
    expect(messages.length).toBeGreaterThanOrEqual(2); // user + ai
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content).toBe('你好！我是测试助手。');
  });

  // 测试 2: 工具调用循环
  it('应该执行 Think → Act → Observe 循环', async () => {
    const { graph } = buildTestGraph({
      chatResponses: [
        {
          content: '',
          toolCalls: [{ id: 'call_1', name: 'calculate', args: { expression: '1+1' } }],
          finishReason: 'tool_calls',
        },
        {
          content: '1+1 的结果是 2。',
          finishReason: 'stop',
        },
      ],
      toolResults: {
        calculate: { success: true, content: '2' },
      },
    });

    const result = await graph.invoke({
      messages: [new HumanMessage({ content: '计算 1+1' })],
      sessionId: 'test-2',
      maxTurns: 5,
    });

    const messages = result.messages as any[];
    // 应该有: user → ai(tool_call) → tool_result → ai(response)
    expect(messages.length).toBeGreaterThanOrEqual(3);

    // 验证工具结果消息存在
    const toolMessages = messages.filter((m: any) => m.getType?.() === 'tool');
    expect(toolMessages.length).toBeGreaterThanOrEqual(1);

    // 验证最终响应
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.content).toContain('2');
  });

  // 测试 3: 最大轮次限制
  it('应该在超过 maxTurns 时终止', async () => {
    const { graph } = buildTestGraph({
      chatResponses: Array(10).fill({
        content: '',
        toolCalls: [{ id: 'call_x', name: 'loop', args: {} }],
        finishReason: 'tool_calls',
      }),
      toolResults: {
        loop: { success: true, content: 'looping' },
      },
    });

    const result = await graph.invoke({
      messages: [new HumanMessage({ content: '开始循环' })],
      sessionId: 'test-3',
      maxTurns: 3, // 限制 3 轮
    });

    const turnCount = result.turnCount as number;
    expect(turnCount).toBeLessThanOrEqual(3);
  });

  // 测试 4: 空消息处理
  it('应该处理 LLM 返回空内容的情况', async () => {
    const { graph } = buildTestGraph({
      chatResponses: [
        { content: '', finishReason: 'stop' },
      ],
    });

    const result = await graph.invoke({
      messages: [new HumanMessage({ content: '?' })],
      sessionId: 'test-4',
      maxTurns: 5,
    });

    // 不应崩溃
    expect(result.messages).toBeDefined();
  });

  // 测试 5: 模拟失败情况
  it('应该捕获 LLM 调用错误而不是崩溃', async () => {
    const mockChat = vi.fn(() => Promise.reject(new Error('API 超时')));
    const mockExecutor = createMockToolExecutor();

    const graph = createAgentGraph({
      think: {
        chat: mockChat,
        getToolDefinitions: () => [],
      },
      act: {
        toolExecutor: mockExecutor,
      },
    });

    // 不应 throw，应正常返回
    const result = await graph.invoke({
      messages: [new HumanMessage({ content: 'hi' })],
      sessionId: 'test-error',
      maxTurns: 5,
    });

    expect(result.messages).toBeDefined();
    expect(result.shouldContinue).toBe(false);
  });
});

describe('AgentGraph — 多工具并行', () => {
  it('应该并行执行多个独立工具', async () => {
    const mockChat = createMockChat([
      {
        content: '同时查询天气和时间',
        toolCalls: [
          { id: 'c1', name: 'get_weather', args: { city: '北京' } },
          { id: 'c2', name: 'get_time', args: {} },
        ],
        finishReason: 'tool_calls',
      },
      {
        content: '北京今天晴天，当前时间 12:00',
        finishReason: 'stop',
      },
    ]);

    const mockExecutor = createMockToolExecutor({
      get_weather: { success: true, content: '晴天' },
      get_time: { success: true, content: '12:00' },
    });

    const graph = createAgentGraph({
      think: {
        chat: mockChat,
        getToolDefinitions: () => [
          { name: 'get_weather', description: '', parameters: { type: 'object', properties: {} } },
          { name: 'get_time', description: '', parameters: { type: 'object', properties: {} } },
        ],
      },
      act: { toolExecutor: mockExecutor },
    });

    const result = await graph.invoke({
      messages: [new HumanMessage({ content: '查询天气和时间' })],
      sessionId: 'test-parallel',
      maxTurns: 5,
    });

    const messages = result.messages as any[];
    const toolMessages = messages.filter((m: any) => m.getType?.() === 'tool');
    // 两个工具都应被执行
    expect(toolMessages.length).toBeGreaterThanOrEqual(2);
  });

  it('应该处理工具执行失败的情况', async () => {
    const mockChat = createMockChat([
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'broken_tool', args: {} }],
        finishReason: 'tool_calls',
      },
      {
        content: '工具执行失败了，让我想想其他办法。',
        finishReason: 'stop',
      },
    ]);

    const mockExecutor = createMockToolExecutor({
      broken_tool: { success: false, content: '', error: '工具内部异常' },
    });

    const graph = createAgentGraph({
      think: {
        chat: mockChat,
        getToolDefinitions: () => [
          { name: 'broken_tool', description: '', parameters: { type: 'object', properties: {} } },
        ],
      },
      act: { toolExecutor: mockExecutor },
    });

    const result = await graph.invoke({
      messages: [new HumanMessage({ content: '测试' })],
      sessionId: 'test-tool-fail',
      maxTurns: 5,
    });

    const messages = result.messages as any[];
    // 应该有包含错误信息的 tool_message
    const toolMessages = messages.filter((m: any) => m.getType?.() === 'tool');
    expect(toolMessages.length).toBeGreaterThanOrEqual(1);
    // ToolMessage 应包含错误信息
    const errorContent = toolMessages.map((m: any) => m.content).join(' ');
    expect(errorContent).toMatch(/失败|异常/);
  });
});
