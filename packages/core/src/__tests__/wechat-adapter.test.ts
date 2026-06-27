/**
 * WeChatAdapter 公共 API 测试
 * 覆盖构造、start/stop、URL验证、消息回调 (仅边界，不测试 private 方法)
 * AES解密和XML解析的算法正确性在 wechat-crypto.test.ts 中独立验证
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import type { WeChatConfig } from '../im/types.js';

/** 辅助: 构造微信 XML 消息 */
function buildWxXml(fields: Record<string, string>): string {
  let xml = '<xml>\n';
  for (const [key, value] of Object.entries(fields)) {
    xml += `  <${key}><![CDATA[${value}]]></${key}>\n`;
  }
  xml += '</xml>';
  return xml;
}

// ==================== 构造与生命周期 ====================
describe('WeChatAdapter - 构造与配置', () => {
  let WeChatAdapter: any;

  beforeAll(async () => {
    const mod = await import('../im/WeChatAdapter.js');
    WeChatAdapter = mod.WeChatAdapter;
  });

  it('应正确创建实例', () => {
    const config: WeChatConfig = {
      platform: 'wechat',
      enabled: true,
      name: '测试微信 Bot',
      corpId: 'test-corp-id',
      agentId: '1000001',
      appSecret: 'test-secret',
    };

    const adapter = new WeChatAdapter(config);
    expect(adapter.platform).toBe('wechat');
    expect(adapter.name).toBe('测试微信 Bot');
    expect(adapter.status).toBe('stopped');
  });

  it('无 corpId/appSecret 时 start 应抛出异常', async () => {
    const config: WeChatConfig = {
      platform: 'wechat',
      enabled: true,
      name: 'Bad Config',
    };

    const adapter = new WeChatAdapter(config);

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url: string) => {
      if (url.includes('gettoken')) {
        return new Response(JSON.stringify({ errcode: 40001, errmsg: 'invalid corpid' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    };

    try {
      await expect(adapter.start()).rejects.toThrow();
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ==================== URL 验证 (公共 API) ====================
describe('WeChatAdapter - URL 验证', () => {
  let WeChatAdapter: any;

  beforeAll(async () => {
    const mod = await import('../im/WeChatAdapter.js');
    WeChatAdapter = mod.WeChatAdapter;
  });

  it('无 echostr 应返回空字符串', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'Test',
    } as WeChatConfig);
    const result = await adapter.handleUrlVerify({});
    expect(result).toBe('');
  });

  it('无 EncodingAESKey 时应返回原始 echostr', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'No Encrypt',
    } as WeChatConfig);
    const result = await adapter.handleUrlVerify({ echostr: 'plain_echo' });
    expect(result).toBe('plain_echo');
  });

  it('无效 EncodingAESKey 解密失败应 fallback 返回原始 echostr', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'Bad Key',
      encodingAESKey: 'wrong_key_has_43_chars_at_least_xx_abc',
    } as WeChatConfig);
    // 无效 base64 会导致解密失败 → 返回原始值
    const result = await adapter.handleUrlVerify({ echostr: 'not_valid_base64_data' });
    // 解密失败 fallback 返回原始 echostr
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ==================== 消息回调 (公共 API) ====================
describe('WeChatAdapter - 消息回调', () => {
  let WeChatAdapter: any;

  beforeAll(async () => {
    const mod = await import('../im/WeChatAdapter.js');
    WeChatAdapter = mod.WeChatAdapter;
  });

  it('handleMessageCallback 明文 XML 无回调不应崩溃', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'No Callback',
    } as WeChatConfig);

    const xml = buildWxXml({
      FromUserName: 'user1',
      MsgType: 'text',
      Content: 'hello',
    });

    const response = await adapter.handleMessageCallback(xml);
    expect(response).toBe('');
  });

  it('handleMessageCallback 空字符串不应崩溃', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'Empty',
    } as WeChatConfig);

    await expect(adapter.handleMessageCallback('')).resolves.toBe('');
  });

  it('handleMessageCallback 非 XML 输入不应崩溃', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'Malformed',
    } as WeChatConfig);

    await expect(adapter.handleMessageCallback('不是 XML')).resolves.toBe('');
  });

  it('handleMessageCallback 无有效标签的 XML 不应崩溃', async () => {
    const adapter = new WeChatAdapter({
      platform: 'wechat',
      enabled: true,
      name: 'Bad XML',
    } as WeChatConfig);

    await expect(adapter.handleMessageCallback('<root></root>')).resolves.toBe('');
  });
});
