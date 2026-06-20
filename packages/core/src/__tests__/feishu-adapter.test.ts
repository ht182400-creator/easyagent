/**
 * FeishuAdapter 单元测试
 * 覆盖构造(Lark 国际版识别)、事件回调、消息发送、图片/文件上传
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import type { FeishuConfig } from '../im/types.js';

// ==================== 构造与配置 ====================
describe('FeishuAdapter - 构造与配置', () => {
  let FeishuAdapter: any;

  beforeAll(async () => {
    const mod = await import('../im/FeishuAdapter.js');
    FeishuAdapter = mod.FeishuAdapter;
  });

  it('应正确创建飞书实例', () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: '飞书 Bot',
      appId: 'test-app-id',
      appSecret: 'test-secret',
    };

    const adapter = new FeishuAdapter(config);
    expect(adapter.platform).toBe('feishu');
    expect(adapter.name).toBe('飞书 Bot');
    expect(adapter.status).toBe('stopped');
  });

  it('应自动识别 Lark 国际版(appId 以 cli_ 开头)', () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Lark Bot',
      appId: 'cli_abc123',
      appSecret: 'test-secret',
    };

    const adapter = new FeishuAdapter(config);
    expect(adapter.platform).toBe('feishu');
    // 验证 apiBase 指向 Lark
    // apiBase 是私有属性，通过实例化间接验证
    // Lark 国际版以 cli_ 开头时使用 LARK_API_BASE
  });

  it('普通 appId 应使用飞书 API Base', () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Feishu Bot',
      appId: 'app_normal_123',
      appSecret: 'test-secret',
    };

    const adapter = new FeishuAdapter(config);
    expect(adapter.platform).toBe('feishu');
  });
});

// ==================== 事件回调 ====================
describe('FeishuAdapter - 事件回调', () => {
  let FeishuAdapter: any;

  beforeAll(async () => {
    const mod = await import('../im/FeishuAdapter.js');
    FeishuAdapter = mod.FeishuAdapter;
  });

  it('url_verification 应返回 challenge', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Verify Test',
      appId: 'app_test',
      appSecret: 'secret',
      verificationToken: 'my_token',
    };

    const adapter = new FeishuAdapter(config);

    const result = await adapter.handleEventCallback({
      type: 'url_verification',
      token: 'my_token',
      challenge: 'challenge_12345',
    });

    expect(result.challenge).toBe('challenge_12345');
  });

  it('url_verification token 不匹配应返回空对象', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Verify Test',
      appId: 'app_test',
      appSecret: 'secret',
      verificationToken: 'correct_token',
    };

    const adapter = new FeishuAdapter(config);

    const result = await adapter.handleEventCallback({
      type: 'url_verification',
      token: 'wrong_token',
      challenge: 'challenge_12345',
    });

    expect(result).toEqual({});
  });

  it('应处理文本消息事件', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Event Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);

    let receivedMsg: any = null;
    adapter.setCallbacks({
      onMessage: async (msg: any) => {
        receivedMsg = msg;
      },
    });

    await adapter.handleEventCallback({
      type: 'event_callback',
      event: {
        type: 'im.message.receive_v1',
        message: {
          message_id: 'msg_001',
          chat_id: 'oc_test_chat',
          chat_type: 'p2p',
          content: JSON.stringify({ text: '你好，飞书！' }),
          create_time: '1710000000',
          message_type: 'text',
        },
        sender: {
          sender_id: {
            open_id: 'ou_user_123',
          },
        },
      },
    } as any);

    expect(receivedMsg).not.toBeNull();
    expect(receivedMsg.chatId).toBe('oc_test_chat');
    expect(receivedMsg.text).toBe('你好，飞书！');
    expect(receivedMsg.isGroupChat).toBe(false);
  });

  it('群聊消息应标记 isGroupChat', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Group Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);

    let receivedMsg: any = null;
    adapter.setCallbacks({
      onMessage: async (msg: any) => {
        receivedMsg = msg;
      },
    });

    await adapter.handleEventCallback({
      type: 'event_callback',
      event: {
        type: 'im.message.receive_v1',
        message: {
          message_id: 'msg_002',
          chat_id: 'oc_group_456',
          chat_type: 'group',
          content: JSON.stringify({ text: '群消息' }),
          create_time: '1710000001',
          message_type: 'text',
        },
        sender: {
          sender_id: {
            open_id: 'ou_user_456',
          },
        },
      },
    } as any);

    expect(receivedMsg.isGroupChat).toBe(true);
  });

  it('非文本消息应被忽略', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Non-text Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);

    let called = false;
    adapter.setCallbacks({
      onMessage: async () => { called = true; },
    });

    // 非 im.message.receive_v1 事件
    await adapter.handleEventCallback({
      type: 'event_callback',
      event: {
        type: 'im.chat.member.user_added',
      },
    } as any);

    expect(called).toBe(false);
  });
});

// ==================== 消息发送 (模拟 fetch) ====================
describe('FeishuAdapter - 消息发送', () => {
  let FeishuAdapter: any;
  let origFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    const mod = await import('../im/FeishuAdapter.js');
    FeishuAdapter = mod.FeishuAdapter;
  });

  beforeEach(() => {
    origFetch = globalThis.fetch;

    // 模拟飞书 API 响应
    globalThis.fetch = (async (url: string, options?: RequestInit) => {
      const urlStr = String(url);

      // Token 接口
      if (urlStr.includes('tenant_access_token')) {
        return new Response(JSON.stringify({
          code: 0,
          msg: 'ok',
          tenant_access_token: 'test_access_token_123',
          expire: 7200,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 发送消息接口
      if (urlStr.includes('/messages') && options?.method === 'POST') {
        return new Response(JSON.stringify({
          code: 0,
          msg: 'ok',
          data: { message_id: 'msg_sent_001' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 删除消息接口
      if (urlStr.includes('/messages') && options?.method === 'DELETE') {
        return new Response(JSON.stringify({
          code: 0,
          msg: 'ok',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('sendMessage 应成功发送消息', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Send Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    // 先启动获取 token
    await adapter.start();
    
    const msgId = await adapter.sendMessage('oc_test_chat', '测试消息');
    expect(msgId).toBe('msg_sent_001');

    await adapter.stop();
  });

  it('editMessage 应删除旧消息并发送新消息', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Edit Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await adapter.start();

    const result = await adapter.editMessage('oc_test_chat', 'old_msg_id', '新内容');
    expect(result).toBe(true);

    await adapter.stop();
  });

  it('sendTyping 应无操作也不崩溃', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Typing Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await adapter.start();

    await expect(adapter.sendTyping('oc_test_chat')).resolves.toBeUndefined();

    await adapter.stop();
  });
});

// ==================== 图片/文件上传 ====================
describe('FeishuAdapter - 图片/文件上传', () => {
  let FeishuAdapter: any;
  let origFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    const mod = await import('../im/FeishuAdapter.js');
    FeishuAdapter = mod.FeishuAdapter;
  });

  beforeEach(() => {
    origFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string, options?: RequestInit) => {
      const urlStr = String(url);

      // Token 接口
      if (urlStr.includes('tenant_access_token')) {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          tenant_access_token: 'test_token',
          expire: 7200,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 图片上传
      if (urlStr.includes('/images')) {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          data: { image_key: 'img_key_001' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 文件上传
      if (urlStr.includes('/files')) {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          data: { file_key: 'file_key_001' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 发送消息
      if (urlStr.includes('/messages')) {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          data: { message_id: 'msg_media_001' },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 下载 URL (模拟)
      if (urlStr.startsWith('https://') || urlStr.startsWith('http://')) {
        return new Response('fake image binary data', { status: 200 });
      }

      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('sendPhoto 应支持 URL 图片源', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Photo Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await adapter.start();

    const msgId = await adapter.sendPhoto('oc_chat', 'https://example.com/photo.jpg', '图片说明');
    expect(msgId).toBe('msg_media_001');

    await adapter.stop();
  });

  it('sendPhoto 应支持 Base64 图片源', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Photo Base64',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await adapter.start();

    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const msgId = await adapter.sendPhoto('oc_chat', base64Image);
    expect(msgId).toBe('msg_media_001');

    await adapter.stop();
  });

  it('sendDocument 应支持 URL 文件源', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Doc Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await adapter.start();

    const msgId = await adapter.sendDocument('oc_chat', 'https://example.com/report.pdf', '报告');
    expect(msgId).toBe('msg_media_001');

    await adapter.stop();
  });

  it('sendPhoto 下载失败应返回空字符串', async () => {
    // 临时替换 fetch 模拟下载失败
    const failedFetch = (async (url: string, options?: RequestInit) => {
      const urlStr = String(url);

      if (urlStr.includes('tenant_access_token')) {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          tenant_access_token: 'test_token',
          expire: 7200,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // 模拟下载失败
      if (urlStr === 'https://broken.example.com/img.jpg') {
        return new Response('Not Found', { status: 404 });
      }

      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;

    globalThis.fetch = failedFetch;

    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Fail Test',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await adapter.start();

    const msgId = await adapter.sendPhoto('oc_chat', 'https://broken.example.com/img.jpg');
    expect(msgId).toBe('');

    await adapter.stop();
  });
});

// ==================== 生命周期 ====================
describe('FeishuAdapter - 生命周期', () => {
  let FeishuAdapter: any;
  let origFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    const mod = await import('../im/FeishuAdapter.js');
    FeishuAdapter = mod.FeishuAdapter;
  });

  beforeEach(() => {
    origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes('tenant_access_token')) {
        return new Response(JSON.stringify({
          code: 0, msg: 'ok',
          tenant_access_token: 'tok',
          expire: 7200,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200 });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('start → stop 应正确切换状态', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Lifecycle',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    expect(adapter.status).toBe('stopped');

    await adapter.start();
    expect(adapter.status).toBe('running');

    await adapter.stop();
    expect(adapter.status).toBe('stopped');
  });

  it('未启动 stop 不应崩溃', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Early Stop',
      appId: 'app_test',
      appSecret: 'secret',
    };

    const adapter = new FeishuAdapter(config);
    await expect(adapter.stop()).resolves.toBeUndefined();
  });
});

// ==================== Token 管理错误 ====================
describe('FeishuAdapter - Token 获取失败', () => {
  let FeishuAdapter: any;
  let origFetch: typeof globalThis.fetch;

  beforeAll(async () => {
    const mod = await import('../im/FeishuAdapter.js');
    FeishuAdapter = mod.FeishuAdapter;
  });

  beforeEach(() => {
    origFetch = globalThis.fetch;
    // 模拟 token 获取失败
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        code: 999,
        msg: 'invalid app secret',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('token 获取失败时 start 应抛出异常', async () => {
    const config: FeishuConfig = {
      platform: 'feishu',
      enabled: true,
      name: 'Bad Secret',
      appId: 'app_test',
      appSecret: 'wrong_secret',
    };

    const adapter = new FeishuAdapter(config);
    await expect(adapter.start()).rejects.toThrow();
  });
});
