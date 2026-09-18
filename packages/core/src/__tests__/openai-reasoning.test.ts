/**
 * 推理模型「思考过程」解析测试
 *
 * ── 背景 ──
 * 推理模型（DeepSeek-R1 / Qwen3-thinking / GLM-Z1 / OpenAI o 系列等）会先输出一段
 * 思维链，再输出正式回答。原实现只认 `content` / `delta.content`，导致：
 *   · 思考内容要么被丢弃 → 界面在思考期间一片空白、看起来像卡死
 *   · 要么（若某天改成分支拼接）混进正文 → 用户看到大段自我修正碎碎念
 *
 * 本测试锁定「正文与思考过程严格分离」这一契约。
 *
 * ── 厂商字段差异 ──
 *   · DeepSeek / 通义千问 / 智谱 → `reasoning_content`
 *   · OpenAI o 系列              → `reasoning`
 * 适配器须同时支持两者，并归一化到 `reasoning` / `reasoningDelta`。
 *
 * @module __tests__/openai-reasoning.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleAdapter } from '../adapters/OpenAICompatibleAdapter.js';

// ===================== 测试辅助 =====================

const MODEL_ID = 'deepseek-reasoner';

function makeConfig() {
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKey: 'test-key',
    apiFormat: 'openai' as const,
    models: [
      {
        id: MODEL_ID,
        name: 'DeepSeek R1',
        maxContextTokens: 65536,
        maxOutputTokens: 8192,
        supportsTools: false,
        supportsVision: false,
      },
    ],
  };
}

/** 构造 SSE 流式响应 */
function sseResponse(chunks: unknown[]): Response {
  const payload =
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** 构造非流式 JSON 响应 */
function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => jsonResponse({})) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ===================== 流式解析 =====================

describe('chatStream — 思考过程解析', () => {
  it('DeepSeek 风格：reasoning_content 应作为 reasoningDelta 上抛', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { choices: [{ delta: { reasoning_content: '让我分析一下…' } }] },
        { choices: [{ delta: { reasoning_content: '应该是方案 B。' } }] },
        { choices: [{ delta: { content: '答案是 B。' } }] },
      ])) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const chunks = [];
    for await (const c of adapter.chatStream([{ role: 'user', content: 'hi' }] as never)) {
      chunks.push(c);
    }

    const reasoning = chunks.filter((c) => c.reasoningDelta).map((c) => c.reasoningDelta);
    const content = chunks.filter((c) => c.delta).map((c) => c.delta);

    expect(reasoning).toEqual(['让我分析一下…', '应该是方案 B。']);
    expect(content).toEqual(['答案是 B。']);
  });

  it('OpenAI o 系列风格：reasoning 字段同样应被识别', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { choices: [{ delta: { reasoning: '先确认约束条件。' } }] },
        { choices: [{ delta: { content: '结论：可行。' } }] },
      ])) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const chunks = [];
    for await (const c of adapter.chatStream([{ role: 'user', content: 'hi' }] as never)) {
      chunks.push(c);
    }

    expect(chunks.filter((c) => c.reasoningDelta).map((c) => c.reasoningDelta)).toEqual([
      '先确认约束条件。',
    ]);
    expect(chunks.filter((c) => c.delta).map((c) => c.delta)).toEqual(['结论：可行。']);
  });

  it('思考过程与正文不得相互污染（单个 chunk 内同时出现也要分开）', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { choices: [{ delta: { reasoning_content: '思考A', content: '正文A' } }] },
      ])) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const chunks = [];
    for await (const c of adapter.chatStream([{ role: 'user', content: 'hi' }] as never)) {
      chunks.push(c);
    }

    expect(chunks[0].reasoningDelta).toBe('思考A');
    expect(chunks[0].delta).toBe('正文A');
  });

  it('无推理字段时不应产生 reasoningDelta（普通模型保持原行为）', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { choices: [{ delta: { content: '普通回答' } }] },
      ])) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const chunks = [];
    for await (const c of adapter.chatStream([{ role: 'user', content: 'hi' }] as never)) {
      chunks.push(c);
    }

    expect(chunks.every((c) => c.reasoningDelta === undefined)).toBe(true);
    expect(chunks[0].delta).toBe('普通回答');
  });

  it('空串 / null 的推理字段不应产生 reasoningDelta', async () => {
    globalThis.fetch = (async () =>
      sseResponse([
        { choices: [{ delta: { reasoning_content: '', content: 'x' } }] },
        { choices: [{ delta: { reasoning: null, content: 'y' } }] },
      ])) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const chunks = [];
    for await (const c of adapter.chatStream([{ role: 'user', content: 'hi' }] as never)) {
      chunks.push(c);
    }

    expect(chunks.every((c) => c.reasoningDelta === undefined)).toBe(true);
    expect(chunks.map((c) => c.delta)).toEqual(['x', 'y']);
  });
});

// ===================== 非流式解析 =====================

describe('chat — 思考过程解析', () => {
  it('reasoning_content 应映射到 response.reasoning，且不混入 content', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        id: 'x',
        model: MODEL_ID,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '最终答案', reasoning_content: '推理过程…' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      })) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const res = await adapter.chat([{ role: 'user', content: 'hi' }] as never);

    expect(res.content).toBe('最终答案');
    expect(res.reasoning).toBe('推理过程…');
  });

  it('reasoning 字段同样应映射（OpenAI o 系列）', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        id: 'x',
        model: MODEL_ID,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '答', reasoning: '想' },
            finish_reason: 'stop',
          },
        ],
      })) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const res = await adapter.chat([{ role: 'user', content: 'hi' }] as never);

    expect(res.reasoning).toBe('想');
    expect(res.content).toBe('答');
  });

  it('无推理字段时 response.reasoning 应为 undefined（保持原有响应形状）', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        id: 'x',
        model: MODEL_ID,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: '普通' },
            finish_reason: 'stop',
          },
        ],
      })) as unknown as typeof fetch;

    const adapter = new OpenAICompatibleAdapter(makeConfig() as never, MODEL_ID);
    const res = await adapter.chat([{ role: 'user', content: 'hi' }] as never);

    expect(res.reasoning).toBeUndefined();
    expect(res.content).toBe('普通');
  });
});
