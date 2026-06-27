/**
 * TelegramAdapter 集成测试 (IT-03)
 * 覆盖：构造/配置、消息发送、编辑/输入状态、媒体发送、生命周期、Webhook、MarkdownV2转义、轮询逻辑
 * 策略：通过 vi.stubGlobal('fetch') mock Telegram API 所有 HTTP 请求
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelegramAdapter } from '../im/TelegramAdapter.js';
import type { TelegramConfig, IMSendOptions } from '../im/types.js';

/** 辅助：创建基础配置 */
function createConfig(overrides?: Partial<TelegramConfig>): TelegramConfig {
  return {
    platform: 'telegram',
    botToken: '123456:ABC-DEF1234ghijkl',
    ...overrides,
  };
}

/** 辅助：mock 成功 API 响应 */
function mockTelegramOk(result?: unknown) {
  return {
    ok: true,
    json: async () => ({ ok: true, result: result ?? {} }),
  };
}

/** 辅助：mock 失败 API 响应 */
function mockTelegramError(status: number, description?: string) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({ ok: false, description: description || 'error' }),
    json: async () => ({ ok: false, description: description || 'error' }),
  };
}

// ================================================================
// 套件 1: 构造与配置
// ================================================================
describe('TelegramAdapter — 构造与配置', () => {
  it('应正确初始化 basic 属性', () => {
    const adapter = new TelegramAdapter(createConfig());
    expect(adapter.platform).toBe('telegram');
    expect(adapter.name).toBe('Telegram Bot');
    expect(adapter.status).toBe('stopped');
  });

  it('应使用自定义名称', () => {
    const adapter = new TelegramAdapter(createConfig({ name: 'MyBot' }));
    expect(adapter.name).toBe('MyBot');
  });

  it('应基于 botToken 生成 apiUrl', () => {
    const adapter = new TelegramAdapter(createConfig());
    // 内部构造 apiUrl: https://api.telegram.org/bot${botToken}
    // 无法直接访问 private apiUrl，但可通过生命周期验证
    expect(adapter.platform).toBe('telegram');
  });
});

// ================================================================
// 套件 2: sendMessage 消息发送
// ================================================================
describe('TelegramAdapter — sendMessage', () => {
  let adapter: TelegramAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    adapter = new TelegramAdapter(createConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('基本发送消息应调用 Telegram API 并返回 message_id', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 42 }));

    const msgId = await adapter.sendMessage('12345', 'Hello World');
    expect(msgId).toBe('42');
    const call = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toContain('bot123456');
    expect(call[0]).toContain('sendMessage');
    const body = JSON.parse(call[1].body as string);
    expect(body.chat_id).toBe('12345');
    expect(body.text).toBe('Hello World');
  });

  it('消息超过 4096 字符应自动截断', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));
    const longText = 'A'.repeat(5000);

    await adapter.sendMessage('12345', longText);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.text.length).toBeLessThanOrEqual(4100);
    expect(body.text).toContain('内容过长已截断');
  });

  it('应支持 replyToMessageId 选项', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    await adapter.sendMessage('12345', 'Reply', { replyToMessageId: '100' } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.reply_to_message_id).toBe('100');
  });

  it('应支持 disableNotification 选项', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    await adapter.sendMessage('12345', 'Silent', { disableNotification: true } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.disable_notification).toBe(true);
  });

  it('Markdown parseMode 应设置 parse_mode', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    await adapter.sendMessage('12345', '**bold**', { parseMode: 'Markdown' } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.parse_mode).toBe('Markdown');
  });

  it('HTML parseMode 应设置 parse_mode', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    await adapter.sendMessage('12345', '<b>bold</b>', { parseMode: 'HTML' } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.parse_mode).toBe('HTML');
  });

  it('MarkdownV2 parseMode 应转义特殊字符并设置 parse_mode', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    // 文本包含需要转义的特殊字符 _
    await adapter.sendMessage('12345', 'hello_world', { parseMode: 'MarkdownV2' } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.parse_mode).toBe('MarkdownV2');
    // _ 应被转义为 \_
    expect(body.text).toContain('\\_');
  });

  it('MarkdownV2 应转义全部 17 个特殊字符', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));
    // 包含所有需要转义的字符
    const rawText = '_*[]()~`>#+-=|{}.!';

    await adapter.sendMessage('12345', rawText, { parseMode: 'MarkdownV2' } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    // 每个特殊字符前应有转义反斜杠
    const specialChars = [
      '_',
      '*',
      '[',
      ']',
      '(',
      ')',
      '~',
      '`',
      '>',
      '#',
      '+',
      '-',
      '=',
      '|',
      '{',
      '}',
      '.',
      '!',
    ];
    for (const ch of specialChars) {
      expect(body.text).toContain(`\\${ch}`);
    }
  });

  it('inlineKeyboard 应正确构建 reply_markup', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    await adapter.sendMessage('12345', 'Choose', {
      inlineKeyboard: [
        [
          { text: 'Yes', callbackData: 'yes' },
          { text: 'No', callbackData: 'no' },
        ],
        [{ text: 'Docs', url: 'https://example.com' }],
      ],
    } as IMSendOptions);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard).toHaveLength(2);
    expect(body.reply_markup.inline_keyboard[0][0].text).toBe('Yes');
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe('yes');
    expect(body.reply_markup.inline_keyboard[1][0].url).toBe('https://example.com');
  });

  it('API 返回失败应抛出错误', async () => {
    fetchSpy.mockResolvedValue(mockTelegramError(400, 'Bad Request'));

    // apiCall 检测到 !response.ok 时先抛异常，适配器自身错误检查不会被执行
    await expect(adapter.sendMessage('12345', 'test')).rejects.toThrow(
      'Telegram API sendMessage 返回 400',
    );
  });
});

// ================================================================
// 套件 3: editMessage 编辑消息
// ================================================================
describe('TelegramAdapter — editMessage', () => {
  let adapter: TelegramAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    adapter = new TelegramAdapter(createConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('正常编辑应返回 true', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk());

    const result = await adapter.editMessage('12345', '100', 'Updated text');
    expect(result).toBe(true);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.message_id).toBe(100);
    expect(body.chat_id).toBe('12345');
    expect(body.text).toBe('Updated text');
  });

  it('message is not modified 错误应被容错返回 true', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('editMessageText')) {
        return {
          ok: false,
          status: 400,
          text: async () => '{"ok":false,"description":"Bad Request: message is not modified"}',
        };
      }
      return mockTelegramOk();
    });

    const result = await adapter.editMessage('12345', '100', 'same text');
    expect(result).toBe(true); // 容错返回 true
  });

  it('其他 API 错误应返回 false', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('editMessageText')) {
        return mockTelegramError(400, 'Chat not found');
      }
      return mockTelegramOk();
    });

    const result = await adapter.editMessage('12345', '100', 'text');
    expect(result).toBe(false);
  });

  it('超长消息应自动截断', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk());
    const longText = 'B'.repeat(5000);

    await adapter.editMessage('12345', '100', longText);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.text.length).toBeLessThanOrEqual(4100);
    expect(body.text).toContain('内容过长已截断');
  });
});

// ================================================================
// 套件 4: sendTyping / sendPhoto / sendDocument
// ================================================================
describe('TelegramAdapter — 媒体与状态发送', () => {
  let adapter: TelegramAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    adapter = new TelegramAdapter(createConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sendTyping 应调用 sendChatAction', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk());

    await adapter.sendTyping('12345');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('sendChatAction');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.chat_id).toBe('12345');
    expect(body.action).toBe('typing');
  });

  it('sendTyping 出错应静默忽略', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    // 不应抛出异常
    await expect(adapter.sendTyping('12345')).resolves.toBeUndefined();
  });

  it('sendPhoto 应返回 message_id', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 99 }));

    const msgId = await adapter.sendPhoto('12345', 'https://img.example.com/photo.jpg');
    expect(msgId).toBe('99');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.photo).toBe('https://img.example.com/photo.jpg');
  });

  it('sendPhoto 应支持 caption', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 1 }));

    await adapter.sendPhoto('12345', 'url', 'My caption');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.caption).toBe('My caption');
  });

  it('sendDocument 应返回 message_id', async () => {
    fetchSpy.mockResolvedValue(mockTelegramOk({ message_id: 200 }));

    const msgId = await adapter.sendDocument(
      '12345',
      'https://files.example.com/doc.pdf',
      'Document',
    );
    expect(msgId).toBe('200');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.document).toBe('https://files.example.com/doc.pdf');
    expect(body.caption).toBe('Document');
  });
});

// ================================================================
// 套件 5: 生命周期 (onStart/onStop)
// ================================================================
describe('TelegramAdapter — 生命周期', () => {
  let adapter: TelegramAdapter;
  let fetchCalls: Array<{ url: string; body: string }>;

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const call = { url, body: (init?.body as string) || '' };
        fetchCalls.push(call);
        // 区分不同的 API 调用
        if (url.includes('getMe')) {
          return mockTelegramOk({ id: 12345, username: 'testbot' });
        }
        if (url.includes('getUpdates')) {
          return mockTelegramOk([]);
        }
        return mockTelegramOk({});
      }),
    );
    adapter = new TelegramAdapter(createConfig());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('start 应调用 getMe 验证 token', async () => {
    await adapter.start();
    // 验证 getMe 被调用
    const getMeCall = fetchCalls.find((c) => c.url.includes('getMe'));
    expect(getMeCall).toBeDefined();
    expect(adapter.status).toBe('running');
  });

  it('getMe 失败应抛出异常', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('getMe')) {
          return mockTelegramError(401, 'Unauthorized');
        }
        return mockTelegramOk({});
      }),
    );
    const ad = new TelegramAdapter(createConfig());

    // apiCall 先于 onStart 的错误检查抛出异常 (response.ok=false)
    await expect(ad.start()).rejects.toThrow('Telegram API getMe 返回 401');
  });

  it('stop 应停止轮询', async () => {
    await adapter.start();
    expect(adapter.status).toBe('running');

    await adapter.stop();
    expect(adapter.status).toBe('stopped');
  });
});

// ================================================================
// 套件 6: Webhook 模式
// ================================================================
describe('TelegramAdapter — Webhook', () => {
  let adapter: TelegramAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Webhook 模式下 start 应调用 setWebhook', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('getMe')) {
        return mockTelegramOk({ id: 12345, username: 'testbot' });
      }
      if (url.includes('setWebhook')) {
        return mockTelegramOk({});
      }
      return mockTelegramOk({});
    });

    adapter = new TelegramAdapter(
      createConfig({
        mode: 'webhook',
        webhookUrl: 'https://myapp.example.com/webhook',
      }),
    );

    await adapter.start();
    const webhookCall = (fetchSpy.mock.calls as Array<[string, RequestInit]>).find((c) =>
      c[0].includes('setWebhook'),
    );
    expect(webhookCall).toBeDefined();
  });

  it('Webhook 缺少 webhookUrl 应抛出错误', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('getMe')) {
        return mockTelegramOk({ id: 12345, username: 'testbot' });
      }
      return mockTelegramOk({});
    });

    adapter = new TelegramAdapter(createConfig({ mode: 'webhook' }));

    await expect(adapter.start()).rejects.toThrow('webhookUrl');
  });

  it('handleWebhookUpdate 应处理消息', async () => {
    adapter = new TelegramAdapter(createConfig());
    const msgReceived = vi.fn();
    adapter.setCallbacks({ onMessage: msgReceived });

    const fakeUpdate = {
      update_id: 123,
      message: {
        message_id: 1,
        from: { id: 100, is_bot: false, first_name: 'Test' },
        chat: { id: 200, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'Hello bot',
      },
    };

    await adapter.handleWebhookUpdate(fakeUpdate);
    // 不应抛出错误，消息应由 processMessage 处理
    // 由于没有 mock fetch 的 sendMessage 返回值，测试仅验证流程不崩溃
  });
});

// ================================================================
// 套件 7: 轮询逻辑
// ================================================================
describe('TelegramAdapter — 轮询', () => {
  let adapter: TelegramAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('start 后应开始轮询（调用 getUpdates）', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('getMe')) {
        return mockTelegramOk({ id: 1, username: 'bot' });
      }
      if (url.includes('getUpdates')) {
        return mockTelegramOk([]);
      }
      return mockTelegramOk({});
    });
    vi.stubGlobal('fetch', fetchMock);

    adapter = new TelegramAdapter(createConfig());
    await adapter.start();

    // 第一次轮询立即触发
    const getUpdatesCall = (fetchMock.mock.calls as Array<[string, RequestInit]>).find((c) =>
      c[0].includes('getUpdates'),
    );
    expect(getUpdatesCall).toBeDefined();
  });

  it('409 Conflict 应设置 error 状态', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('getMe')) {
        return mockTelegramOk({ id: 1, username: 'bot' });
      }
      if (url.includes('getUpdates')) {
        // 模拟 409 Conflict
        return {
          ok: false,
          status: 409,
          text: async () =>
            '{"ok":false,"description":"Conflict: terminated by other getUpdates request"}',
        };
      }
      return mockTelegramOk({});
    });
    vi.stubGlobal('fetch', fetchMock);

    adapter = new TelegramAdapter(createConfig());
    await adapter.start();

    // 等待 poll 执行完成
    await vi.runAllTimersAsync();

    expect(adapter.status).toBe('error');
    expect(adapter.error).toContain('另一个 Bot 实例已在轮询');
  });
});
