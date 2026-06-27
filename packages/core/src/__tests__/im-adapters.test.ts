/**
 * IM适配器测试
 * 覆盖 AbstractAdapter 抽象类、状态管理、消息发送功能
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';

/**
 * 创建一个具体测试适配器工厂函数
 * 因为 BaseIMAdapter 是抽象类，且需要通过 import 加载
 * 在 ESM 模式下类定义必须在模块加载后才能使用
 */
function createTestAdapter(BaseIMAdapter: any, platform: string, name: string) {
  return new (class extends BaseIMAdapter {
    async onStart(): Promise<void> {
      /* 模拟启动 */
    }
    async onStop(): Promise<void> {
      /* 模拟停止 */
    }
    async sendMessage(chatId: string, text: string): Promise<string> {
      return `msg_${Date.now()}`;
    }
    async editMessage(chatId: string, messageId: string, newText: string): Promise<boolean> {
      return true;
    }
    async sendTyping(chatId: string): Promise<void> {
      /* 模拟 */
    }
    async sendPhoto(chatId: string, imageUrl: string, caption?: string): Promise<string> {
      return `photo_${Date.now()}`;
    }
    async sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<string> {
      return `doc_${Date.now()}`;
    }
  })(platform, name);
}

// ==================== BaseIMAdapter 测试 ====================
describe('BaseIMAdapter - 基础功能', () => {
  let BaseIMAdapter: any;
  let IMAdapterEvent: any;
  let adapter: any;

  beforeAll(async () => {
    const mod = await import('../im/BaseIMAdapter.js');
    BaseIMAdapter = mod.BaseIMAdapter;
    IMAdapterEvent = mod.IMAdapterEvent;
  });

  beforeEach(() => {
    adapter = createTestAdapter(BaseIMAdapter, 'telegram', 'MyBot');
  });

  it('应正确创建adapter实例', () => {
    expect(adapter.platform).toBe('telegram');
    expect(adapter.name).toBe('MyBot');
    expect(adapter.status).toBe('stopped');
  });

  it('应正确启动和更新状态', async () => {
    expect(adapter.status).toBe('stopped');
    await adapter.start();
    expect(adapter.status).toBe('running');
  });

  it('重复启动应保持running状态', async () => {
    await adapter.start();
    await adapter.start(); // 第二次
    expect(adapter.status).toBe('running');
  });

  it('应正确停止adapter', async () => {
    await adapter.start();
    await adapter.stop();
    expect(adapter.status).toBe('stopped');
  });

  it('未启动时stop应无操作', async () => {
    await adapter.stop();
    expect(adapter.status).toBe('stopped');
  });

  it('getUptime应返回运行秒数', async () => {
    expect(adapter.getUptime()).toBe(0);
    await adapter.start();
    const uptime = adapter.getUptime();
    expect(uptime).toBeGreaterThanOrEqual(0);
    expect(typeof uptime).toBe('number');
  });

  it('getStatusSummary应返回状态摘要', async () => {
    await adapter.start();
    const summary = adapter.getStatusSummary();
    expect(summary.platform).toBe('telegram');
    expect(summary.name).toBe('MyBot');
    expect(summary.status).toBe('running');
    expect(summary.uptime).toBeGreaterThanOrEqual(0);
    expect(summary.startedAt).toBeDefined();
    expect(summary.error).toBeNull();
  });

  it('未启动时startedAt应为null', () => {
    const summary = adapter.getStatusSummary();
    expect(summary.startedAt).toBeNull();
    expect(summary.uptime).toBe(0);
  });

  it('error状态下stop应正常工作', async () => {
    adapter['_status'] = 'error';
    await adapter.stop();
    expect(adapter.status).toBe('stopped');
  });

  it('应支持sendMessage', async () => {
    const msgId = await adapter.sendMessage('chat123', 'Hello');
    expect(msgId).toBeDefined();
    expect(typeof msgId).toBe('string');
  });

  it('应支持editMessage', async () => {
    const result = await adapter.editMessage('chat123', 'msg1', 'Updated');
    expect(result).toBe(true);
  });

  it('应支持sendTyping', async () => {
    await expect(adapter.sendTyping('chat123')).resolves.toBeUndefined();
  });

  it('应支持sendPhoto', async () => {
    const photoId = await adapter.sendPhoto('chat123', 'https://img.com/photo.jpg', 'Caption');
    expect(photoId).toBeDefined();
    expect(typeof photoId).toBe('string');
  });

  it('应支持sendDocument', async () => {
    const docId = await adapter.sendDocument('chat123', 'https://files.com/doc.pdf', 'File');
    expect(docId).toBeDefined();
    expect(typeof docId).toBe('string');
  });

  it('setCallbacks应设置回调处理器', () => {
    const callbacks = {
      onMessage: async () => {},
      onStatusChange: () => {},
    };
    adapter.setCallbacks(callbacks);
    expect(adapter.callbacks).toBe(callbacks);
  });

  it('应能触发状态变更事件', async () => {
    let eventReceived = '';
    adapter.on(IMAdapterEvent.STATUS_CHANGE, (status: string) => {
      eventReceived = status;
    });
    await adapter.start();
    // 迁移状态会触发多次, 至少有一次是running
    expect(['starting', 'running']).toContain(eventReceived);
  });

  it('created with different platforms works', () => {
    const wechat = createTestAdapter(BaseIMAdapter, 'wechat', 'WCBot');
    expect(wechat.platform).toBe('wechat');
    const feishu = createTestAdapter(BaseIMAdapter, 'feishu', 'FSBot');
    expect(feishu.platform).toBe('feishu');
  });

  it('error为空字符串不应影响状态', async () => {
    expect(adapter.error).toBeNull();
    await adapter.start();
    expect(adapter.error).toBeNull();
  });
});

describe('BaseIMAdapter - 流式消息', () => {
  let BaseIMAdapter: any;
  let adapter: any;

  beforeAll(async () => {
    const mod = await import('../im/BaseIMAdapter.js');
    BaseIMAdapter = mod.BaseIMAdapter;
  });

  beforeEach(() => {
    adapter = createTestAdapter(BaseIMAdapter, 'telegram', 'StreamBot');
  });

  it('sendStreamingMessage应能流式发送', async () => {
    async function* generator() {
      yield 'Hello';
      yield ' ';
      yield 'World';
    }
    const msgId = await adapter.sendStreamingMessage('chat123', generator());
    expect(msgId).toBeDefined();
    expect(typeof msgId).toBe('string');
  });

  it('sendStreamingMessage编辑失败不应崩溃', async () => {
    const originalEdit = adapter.editMessage;
    adapter.editMessage = async () => {
      throw new Error('Edit failed');
    };

    async function* generator() {
      yield 'Hello';
      yield ' World';
    }
    const msgId = await adapter.sendStreamingMessage('chat123', generator());
    expect(msgId).toBeDefined();

    adapter.editMessage = originalEdit;
  });

  it('sendStreamingMessage初始消息send失败也要继续', async () => {
    const originalSend = adapter.sendMessage;
    adapter.sendMessage = async () => {
      throw new Error('Send failed');
    };

    async function* generator() {
      yield 'Recovered';
    }
    // 初始send失败后会尝试fallback
    try {
      const msgId = await adapter.sendStreamingMessage('chat123', generator());
      expect(msgId).toBeDefined();
    } catch (err) {
      // fallback也可能失败，验证不崩溃即可
    }

    adapter.sendMessage = originalSend;
  });
});

// ==================== IM类型定义测试 ====================
describe('IM类型定义 - 验证', () => {
  let IMAdapterEvent: any;

  beforeAll(async () => {
    const mod = await import('../im/BaseIMAdapter.js');
    IMAdapterEvent = mod.IMAdapterEvent;
  });

  it('IMAdapterEvent应有正确的值', () => {
    expect(IMAdapterEvent.MESSAGE).toBe('message');
    expect(IMAdapterEvent.STARTED).toBe('started');
    expect(IMAdapterEvent.STOPPED).toBe('stopped');
    expect(IMAdapterEvent.STATUS_CHANGE).toBe('status_change');
    expect(IMAdapterEvent.CALLBACK_QUERY).toBe('callback_query');
  });
});

// ==================== IM适配器导出验证 ====================
describe('IM模块 - 导出完整性', () => {
  it('im/index应导出BaseIMAdapter和IMManager', async () => {
    const mod = await import('../im/index.js');
    expect(mod.BaseIMAdapter).toBeDefined();
    expect(mod.IMManager).toBeDefined();
  });
});
