/**
 * api.ts 测试 — 统一 API 请求工具
 *
 * 验证:
 * 1. apiFetch 基本请求能力 (mock fetch)
 * 2. JSON 响应解析
 * 3. 错误响应处理
 * 4. 重试机制 (网络错误)
 * 5. 非 JSON 响应处理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock stores to prevent useAppStore().addNotification() side effects
vi.mock('../stores/appStore', () => ({
  useAppStore: {
    getState: () => ({
      addNotification: vi.fn(),
      settings: {},
    }),
    setState: vi.fn(),
    subscribe: vi.fn(),
  },
  initializeTheme: vi.fn(),
}));

import { apiFetch } from '../api';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('基本请求', () => {
    it('应正确拼接 apiBase 和 path', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/status', 'http://127.0.0.1:3456');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:3456/api/status',
        expect.any(Object),
      );
    });

    it('已含 http(s) 的 path 不应拼接 apiBase', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('https://external.api.com/data', 'http://127.0.0.1:3456');

      expect(mockFetch).toHaveBeenCalledWith('https://external.api.com/data', expect.any(Object));
    });
  });

  describe('JSON 响应', () => {
    it('应正确解析 JSON 响应体', async () => {
      const data = { users: [{ id: 1 }, { id: 2 }] };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => data,
        }),
      );

      const result = await apiFetch('/api/users', '');
      expect(result).toEqual(data);
    });

    it('应设置 Content-Type: application/json', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/test', '');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
    });

    it('应合并自定义 headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      await apiFetch('/api/test', '', {
        headers: { 'X-Custom': 'custom-value' },
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
      expect(callArgs[1].headers['X-Custom']).toBe('custom-value');
    });
  });

  describe('错误处理', () => {
    it('非 2xx JSON 响应应抛出带 error 信息的异常', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: '服务器内部错误' }),
        }),
      );

      await expect(apiFetch('/api/error', '')).rejects.toThrow('服务器内部错误');
    });

    it('非 2xx JSON 响应无 error 字段时应显示状态码', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({}),
        }),
      );

      await expect(apiFetch('/api/missing', '')).rejects.toThrow('请求失败 (404)');
    });

    it('非 JSON 错误响应应显示状态码', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<html>Forbidden</html>',
        }),
      );

      await expect(apiFetch('/api/forbidden', '')).rejects.toThrow('请求失败 (403)');
    });
  });

  describe('重试机制', () => {
    it('网络错误应重试后成功', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            return Promise.reject(new TypeError('Failed to fetch'));
          }
          return Promise.resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({ status: 'ok' }),
          });
        }),
      );

      const promise = apiFetch('/api/retry-test', '');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ status: 'ok' });
      expect(callCount).toBe(3);

      vi.useRealTimers();
    });

    it('连续失败后应最终拒绝', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.reject(new TypeError('Failed to fetch'));
        }),
      );

      // 发起请求（会尝试重试）
      const promise = apiFetch('/api/unreachable', '');

      // 逐步推进每次重试的定时器（共 6 次: 初始 + 5 次重试）
      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(1000);
      }

      // 验证: 函数被调用了 6 次
      expect(callCount).toBe(6);

      // 最终 promise 应被拒绝
      let rejected = false;
      try {
        await promise;
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('非 JSON 响应', () => {
    it('应返回纯文本响应', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'text/plain' }),
          text: async () => 'plain text response',
        }),
      );

      const result = await apiFetch('/api/text', '');
      expect(result).toBe('plain text response');
    });

    it('应返回 HTML 响应', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => '<div>Hello</div>',
        }),
      );

      const result = await apiFetch('/api/html', '');
      expect(result).toBe('<div>Hello</div>');
    });
  });
});
