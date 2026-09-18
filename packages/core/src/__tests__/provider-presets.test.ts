/**
 * 提供商预设完整性与适配器路由测试
 *
 * ── 为什么需要 ──
 * ① 预设是**离线兜底数据**（远程目录不可用时的最后一道），字段缺失只会在
 *    用户无网络时暴露，属于典型的"最需要它时才坏"。
 * ② 适配器路由有个**静默失败陷阱**：`apiFormat` 若不被工厂识别，会落到
 *    `default` 分支用 OpenAI 兼容适配器去请求一个格式完全不同的 API ——
 *    结果是 400/401，而错误信息与真实原因毫无关系。必须显式失败。
 *
 * @module __tests__/provider-presets.test
 */

import { describe, it, expect } from 'vitest';
import { PROVIDER_PRESETS } from '../config/ProviderPresets.js';
import { AdapterFactory, OpenAICompatibleAdapter } from '../adapters/index.js';
import type { ProviderConfig } from '../types/index.js';

// ===================== 预设完整性 =====================

describe('PROVIDER_PRESETS — 结构完整性', () => {
  it('至少应有 10 个内置提供商', () => {
    expect(PROVIDER_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('每个预设都必须有 id / name / baseURL / apiFormat / apiKeyEnv', () => {
    for (const p of PROVIDER_PRESETS) {
      expect(p.id, `预设缺少 id: ${JSON.stringify(p).slice(0, 60)}`).toBeTruthy();
      expect(p.name, `${p.id} 缺少 name`).toBeTruthy();
      expect(p.baseURL, `${p.id} 缺少 baseURL`).toBeTruthy();
      expect(p.apiFormat, `${p.id} 缺少 apiFormat`).toBeTruthy();
      expect(p.apiKeyEnv, `${p.id} 缺少 apiKeyEnv`).toBeTruthy();
    }
  });

  it('每个预设都必须至少有一个模型且包含 defaultModel', () => {
    for (const p of PROVIDER_PRESETS) {
      expect(p.models?.length, `${p.id} 没有任何模型（离线兜底会失效）`).toBeGreaterThan(0);
      const ids = (p.models || []).map((m) => m.id);
      expect(ids, `${p.id} 的 defaultModel "${p.defaultModel}" 不在 models 列表中`).toContain(
        p.defaultModel,
      );
    }
  });

  it('提供商 id 不得重复', () => {
    const ids = PROVIDER_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('baseURL 必须是 https（本地 Ollama 除外）', () => {
    for (const p of PROVIDER_PRESETS) {
      if (p.id === 'custom' || p.id === 'ollama') continue;
      expect(p.baseURL.startsWith('https://'), `${p.id} 的 baseURL 不是 https`).toBe(true);
    }
  });

  it('每个模型都必须有 id / name 与能力标记', () => {
    for (const p of PROVIDER_PRESETS) {
      for (const m of p.models || []) {
        expect(m.id, `${p.id} 存在无 id 的模型`).toBeTruthy();
        expect(m.name, `${p.id}/${m.id} 缺少 name`).toBeTruthy();
        expect(typeof m.supportsTools, `${p.id}/${m.id} 缺少 supportsTools`).toBe('boolean');
        expect(typeof m.supportsVision, `${p.id}/${m.id} 缺少 supportsVision`).toBe('boolean');
      }
    }
  });
});

// ===================== Google（新增） =====================

describe('Google Gemini 预设', () => {
  const google = PROVIDER_PRESETS.find((p) => p.id === 'google');

  it('应存在 google 提供商', () => {
    expect(google, '未找到 google 提供商预设').toBeTruthy();
  });

  it('baseURL 必须是官方 OpenAI 兼容端点（末尾 /openai/ 不能漏）', () => {
    // 漏掉 /openai/ 会 404 —— 这是最容易写错的一处
    expect(google!.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
  });

  it('应使用 openai 格式（可复用 OpenAICompatibleAdapter，无需专用适配器）', () => {
    expect(google!.apiFormat).toBe('openai');
  });

  it('环境变量应为 GEMINI_API_KEY', () => {
    expect(google!.apiKeyEnv).toBe('GEMINI_API_KEY');
  });

  it('工厂应能为它创建 OpenAICompatibleAdapter', () => {
    const adapter = AdapterFactory.create({ ...google!, apiKey: 'test-key' } as ProviderConfig);
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });
});

// ===================== 适配器路由的显式失败 =====================

describe('AdapterFactory — 不支持的 apiFormat 必须显式失败', () => {
  it('🛡️ apiFormat=anthropic 应抛错，而不是静默回退到 OpenAI 适配器', () => {
    const config = {
      id: 'anthropic' as ProviderConfig['id'],
      name: 'Anthropic',
      baseURL: 'https://api.anthropic.com',
      apiKey: 'k',
      apiFormat: 'anthropic',
      models: [{ id: 'claude-x', name: 'Claude X' }],
      defaultModel: 'claude-x',
    } as unknown as ProviderConfig;

    // 静默回退会让请求以 400/401 失败，错误信息与真实原因（格式选错）无关，极难排查
    expect(() => AdapterFactory.create(config)).toThrow(/anthropic/i);
  });

  it('apiFormat=openai 应返回 OpenAICompatibleAdapter', () => {
    const config = {
      id: 'deepseek' as ProviderConfig['id'],
      name: 'DeepSeek',
      baseURL: 'https://api.deepseek.com',
      apiKey: 'k',
      apiFormat: 'openai',
      models: [{ id: 'm', name: 'M' }],
      defaultModel: 'm',
    } as unknown as ProviderConfig;
    expect(AdapterFactory.create(config)).toBeInstanceOf(OpenAICompatibleAdapter);
  });

  it('apiFormat=custom 且 id=ernie/hunyuan 应走对应专用适配器', () => {
    for (const id of ['ernie', 'hunyuan'] as const) {
      const config = {
        id,
        name: id,
        baseURL: 'https://example.com',
        apiKey: 'k',
        apiFormat: 'custom' as const,
        models: [{ id: 'm', name: 'M' }],
        defaultModel: 'm',
      } as unknown as ProviderConfig;
      // 不应抛错，且不应是通用的 OpenAI 适配器
      const adapter = AdapterFactory.create(config);
      expect(adapter).toBeTruthy();
      expect(adapter).not.toBeInstanceOf(OpenAICompatibleAdapter);
    }
  });
});
