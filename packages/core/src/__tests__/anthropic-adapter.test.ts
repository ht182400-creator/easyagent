/**
 * AnthropicAdapter 测试
 *
 * ── 为什么必须有这些用例 ──
 * Anthropic Messages API 与 OpenAI 格式在**五个层面**都不同（鉴权头、`system` 位置、
 * `max_tokens` 必填、流式命名事件、工具调用块结构）。任何一处写错都会得到
 * 400/401，而错误信息与真实原因毫无关系 —— 因此这里把"请求长什么样"直接断言下来，
 * 让格式偏差在本地就暴露。
 *
 * 重点覆盖：
 *   ① 请求头（x-api-key + anthropic-version，**不能**是 Bearer）
 *   ② 请求体（system 在顶层、max_tokens 必填、工具用 input_schema）
 *   ③ 流式命名事件的解析（文本 / 思考过程 / 工具参数增量）
 *   ④ stop_reason → 内部 finishReason 的映射
 *   ⑤ 工具调用归一化（tool_use.input 对象 → arguments JSON 字符串）
 *
 * @module __tests__/anthropic-adapter.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnthropicAdapter } from '../adapters/AnthropicAdapter.js';
import type { Message, ProviderConfig } from '../types/index.js';

// ===================== 测试辅助 =====================

const MODEL_ID = 'claude-opus-4-8';

function makeConfig(): ProviderConfig {
  return {
    id: 'anthropic' as ProviderConfig['id'],
    name: 'Anthropic Claude',
    baseURL: 'https://api.anthropic.com',
    apiKey: 'test-key',
    apiFormat: 'anthropic',
    models: [
      {
        id: MODEL_ID,
        name: 'Claude Opus 4.8',
        maxContextTokens: 200000,
        maxOutputTokens: 32000,
        supportsTools: true,
        supportsVision: true,
      },
    ],
    defaultModel: MODEL_ID,
  } as ProviderConfig;
}

/** 记录最后一次请求，便于断言请求形状 */
let lastRequest: { url: string; init: RequestInit } | null = null;

/** 构造 Anthropic 命名事件 SSE 流 */
function sseResponse(events: Array<{ type: string; [k: string]: unknown }>): Response {
  const payload = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  lastRequest = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    lastRequest = { url, init };
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** 取出最后一次请求体 */
function sentBody(): Record<string, unknown> {
  return JSON.parse(String(lastRequest?.init?.body ?? '{}'));
}

// ===================== 请求形状 =====================

describe('AnthropicAdapter — 请求形状', () => {
  it('🛡️ 鉴权必须用 x-api-key + anthropic-version，不得用 Authorization Bearer', async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      lastRequest = { url, init };
      return jsonResponse({
        id: 'm',
        model: MODEL_ID,
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
      });
    }) as unknown as typeof fetch;

    await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]);

    const headers = lastRequest!.init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['anthropic-version']).toBeTruthy();
    // 用 Bearer 会被 Anthropic 判为未授权
    expect(headers.Authorization).toBeUndefined();
  });

  it('请求路径应为 {baseURL}/v1/messages', async () => {
    await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]);
    expect(lastRequest!.url).toBe('https://api.anthropic.com/v1/messages');
  });

  it('🛡️ system 消息必须抽到顶层 system 字段，不能留在 messages 里', async () => {
    const messages: Message[] = [
      { role: 'system', content: '你是助手' },
      { role: 'system', content: '保持简洁' },
      { role: 'user', content: '你好' },
    ];
    await new AnthropicAdapter(makeConfig()).chat(messages);

    const body = sentBody();
    expect(body.system).toBe('你是助手\n\n保持简洁');
    // messages 里不得出现 system 角色（Anthropic 会 400）
    expect((body.messages as Array<{ role: string }>).every((m) => m.role !== 'system')).toBe(true);
    expect(body.messages).toHaveLength(1);
  });

  it('🛡️ max_tokens 必须始终存在（Anthropic 缺失即 400）', async () => {
    await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]);
    expect(sentBody().max_tokens).toBe(32000); // 取自模型配置

    await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }], {
      maxTokens: 123,
    });
    expect(sentBody().max_tokens).toBe(123);
  });

  it('工具定义必须转成 input_schema 形式', async () => {
    await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }], {
      tools: [
        {
          name: 'read_file',
          description: '读文件',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: '路径' } },
          },
        },
      ],
    });

    const tools = sentBody().tools as Array<Record<string, unknown>>;
    expect(tools[0].name).toBe('read_file');
    expect(tools[0].input_schema).toBeDefined();
    // OpenAI 的 "parameters" 字段名在 Anthropic 下必须是 "input_schema"
    expect(tools[0].parameters).toBeUndefined();
  });

  it('tool_choice 应按 Anthropic 结构映射（而非 OpenAI 的 function 形式）', async () => {
    await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }], {
      tools: [{ name: 't', description: 'd', parameters: { type: 'object', properties: {} } }],
      toolChoice: { type: 'function', function: { name: 't' } },
    });
    expect(sentBody().tool_choice).toEqual({ type: 'tool', name: 't' });
  });

  it('🛡️ 工具结果消息应转成 user 消息里的 tool_result 内容块', async () => {
    const messages: Message[] = [
      { role: 'user', content: '读一下' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"p":"a"}' },
          },
        ],
      },
      { role: 'tool', content: '文件内容', tool_call_id: 'call_1' },
    ];
    await new AnthropicAdapter(makeConfig()).chat(messages);

    const msgs = sentBody().messages as Array<{ role: string; content: unknown }>;
    // assistant 的工具调用 → tool_use 块
    const assistant = msgs.find((m) => m.role === 'assistant')!;
    const toolUse = (assistant.content as Array<Record<string, unknown>>).find(
      (b) => b.type === 'tool_use',
    )!;
    expect(toolUse.id).toBe('call_1');
    // ⚠️ input 必须是**对象**，不是 JSON 字符串
    expect(toolUse.input).toEqual({ p: 'a' });

    // 工具结果 → user 消息 + tool_result 块
    const toolMsg = msgs[msgs.length - 1];
    expect(toolMsg.role).toBe('user');
    const toolResult = (toolMsg.content as Array<Record<string, unknown>>)[0];
    expect(toolResult.type).toBe('tool_result');
    expect(toolResult.tool_use_id).toBe('call_1');
  });
});

// ===================== 非流式解析 =====================

describe('AnthropicAdapter — 非流式响应解析', () => {
  it('应提取正文、工具调用，并映射 stop_reason', async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      lastRequest = { url, init };
      return jsonResponse({
        id: 'msg_1',
        model: MODEL_ID,
        content: [
          { type: 'text', text: '好的' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.ts' } },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    }) as unknown as typeof fetch;

    const res = await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]);

    expect(res.content).toBe('好的');
    expect(res.finishReason).toBe('tool_calls');
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    // 🛡️ input 对象必须序列化成 arguments 字符串（内部 ToolCall 契约）
    expect(res.toolCalls?.[0].function.arguments).toBe('{"path":"a.ts"}');
  });

  it('thinking 块应进入 reasoning，且不混入 content', async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      lastRequest = { url, init };
      return jsonResponse({
        id: 'msg_2',
        model: MODEL_ID,
        content: [
          { type: 'thinking', thinking: '先分析…' },
          { type: 'text', text: '结论' },
        ],
        stop_reason: 'end_turn',
      });
    }) as unknown as typeof fetch;

    const res = await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]);
    expect(res.reasoning).toBe('先分析…');
    expect(res.content).toBe('结论');
  });

  it('stop_reason 映射应完整（max_tokens→length / end_turn→stop / refusal→content_filter）', async () => {
    const cases: Array<[string, string]> = [
      ['max_tokens', 'length'],
      ['end_turn', 'stop'],
      ['stop_sequence', 'stop'],
      ['refusal', 'content_filter'],
    ];
    for (const [anthropicReason, expected] of cases) {
      globalThis.fetch = (async () =>
        jsonResponse({
          id: 'm',
          model: MODEL_ID,
          content: [{ type: 'text', text: 'x' }],
          stop_reason: anthropicReason,
        })) as unknown as typeof fetch;
      const res = await new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]);
      expect(res.finishReason, `${anthropicReason} 应映射为 ${expected}`).toBe(expected);
    }
  });

  it('HTTP 错误应抛出且带上响应体（便于排障）', async () => {
    globalThis.fetch = (async () =>
      new Response('{"error":{"message":"invalid x-api-key"}}', {
        status: 401,
      })) as unknown as typeof fetch;

    await expect(
      new AnthropicAdapter(makeConfig()).chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toThrow(/401/);
  });
});

// ===================== 流式解析 =====================

describe('AnthropicAdapter — 流式命名事件解析', () => {
  it('应解析文本增量、思考增量、stop_reason 与用量', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { type: 'message_start', message: { usage: { input_tokens: 7 } } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: '思考中' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '你好' } },
        { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '世界' } },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
        { type: 'message_stop' },
      ])) as unknown as typeof fetch;

    const chunks = [];
    for await (const c of new AnthropicAdapter(makeConfig()).chatStream([
      { role: 'user', content: 'hi' },
    ])) {
      chunks.push(c);
    }

    expect(chunks.filter((c) => c.delta).map((c) => c.delta)).toEqual(['你好', '世界']);
    expect(chunks.filter((c) => c.reasoningDelta).map((c) => c.reasoningDelta)).toEqual(['思考中']);
    expect(chunks.find((c) => c.finishReason)?.finishReason).toBe('stop');
    expect(chunks.find((c) => c.usage)?.usage).toEqual({
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10,
    });
  });

  it('🛡️ 工具调用参数以 JSON 片段分片到达，必须累积成完整 arguments 后上抛', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { type: 'message_start', message: { usage: { input_tokens: 1 } } },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_9', name: 'write_file', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"pa' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: 'th":"a.ts"}' },
        },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ])) as unknown as typeof fetch;

    const chunks = [];
    for await (const c of new AnthropicAdapter(makeConfig()).chatStream([
      { role: 'user', content: 'hi' },
    ])) {
      chunks.push(c);
    }

    const tcChunk = chunks.find((c) => c.toolCallDelta);
    expect(tcChunk?.toolCallDelta?.id).toBe('toolu_9');
    expect(tcChunk?.toolCallDelta?.function?.name).toBe('write_file');
    // 分片必须被拼成完整 JSON
    expect(tcChunk?.toolCallDelta?.function?.arguments).toBe('{"path":"a.ts"}');
    expect(chunks.find((c) => c.finishReason)?.finishReason).toBe('tool_calls');
  });

  it('流式 HTTP 错误应抛出', async () => {
    globalThis.fetch = (async () =>
      new Response('bad', { status: 400 })) as unknown as typeof fetch;

    const iterate = async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of new AnthropicAdapter(makeConfig()).chatStream([
        { role: 'user', content: 'hi' },
      ])) {
        /* 不应有产出 */
      }
    };
    await expect(iterate()).rejects.toThrow(/400/);
  });
});

// ===================== 连接校验 =====================

describe('AnthropicAdapter — validateConnection', () => {
  it('应发送最小化请求且 max_tokens 必填', async () => {
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      lastRequest = { url, init };
      return jsonResponse({ id: 'm', content: [], stop_reason: 'end_turn' });
    }) as unknown as typeof fetch;

    const ok = await new AnthropicAdapter(makeConfig()).validateConnection();
    expect(ok).toBe(true);
    expect(sentBody().max_tokens).toBe(1);
  });

  it('网络异常应返回 false 而非抛出', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(new AnthropicAdapter(makeConfig()).validateConnection()).resolves.toBe(false);
  });
});
