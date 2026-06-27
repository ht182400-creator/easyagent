/**
 * events.ts 测试 — 共享事件总线
 *
 * 用于 Store 间解耦通信。需验证：
 * 1. 基本发布/订阅正确性
 * 2. 多个监听器互不干扰
 * 3. 取消订阅后不再接收事件
 * 4. 错误处理器不影响其他监听器
 * 5. off/clearAllListeners 清理行为
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { on, emit, off, clearAllListeners } from '../events';

describe('events 事件总线', () => {
  beforeEach(() => {
    clearAllListeners();
  });

  describe('基本发布/订阅', () => {
    it('应能订阅并接收事件', () => {
      const handler = vi.fn();
      on('test.event', handler);
      emit('test.event', { data: 42 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 42 });
    });

    it('无载荷事件应正常发送', () => {
      const handler = vi.fn();
      on('test.event', handler);
      emit('test.event');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('发送到不存在的事件不应报错', () => {
      expect(() => emit('nonexistent.event')).not.toThrow();
    });

    it('应支持多种载荷类型', () => {
      const handler = vi.fn();
      on('data', handler);

      emit('data', 'string payload');
      emit('data', 123);
      emit('data', { nested: { deep: true } });
      emit('data', [1, 2, 3]);
      emit('data', null);

      expect(handler).toHaveBeenCalledTimes(5);
    });
  });

  describe('多个监听器', () => {
    it('同一事件多个监听器应全部收到', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const h3 = vi.fn();

      on('multi', h1);
      on('multi', h2);
      on('multi', h3);
      emit('multi', 'payload');

      expect(h1).toHaveBeenCalledWith('payload');
      expect(h2).toHaveBeenCalledWith('payload');
      expect(h3).toHaveBeenCalledWith('payload');
    });

    it('不同事件应互不干扰', () => {
      const hA = vi.fn();
      const hB = vi.fn();

      on('event.a', hA);
      on('event.b', hB);
      emit('event.a', 'A');
      emit('event.b', 'B');

      expect(hA).toHaveBeenCalledTimes(1);
      expect(hB).toHaveBeenCalledTimes(1);
      expect(hA).toHaveBeenCalledWith('A');
      expect(hB).toHaveBeenCalledWith('B');
    });
  });

  describe('取消订阅', () => {
    it('on() 返回的取消函数应正常工作', () => {
      const handler = vi.fn();
      const unsubscribe = on('test', handler);

      emit('test', 'first');
      unsubscribe();
      emit('test', 'second');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('first');
    });

    it('取消一个监听器不应影响同事件的其他监听器', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      const unsub1 = on('test', h1);
      on('test', h2);

      emit('test', 'before');
      unsub1();
      emit('test', 'after');

      expect(h1).toHaveBeenCalledTimes(1);
      expect(h2).toHaveBeenCalledTimes(2);
    });

    it('off() 应移除事件的所有监听器', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      on('test', h1);
      on('test', h2);
      off('test');
      emit('test', 'gone');

      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('一个监听器抛出异常不应阻塞其他监听器', () => {
      const hError = vi.fn(() => {
        throw new Error('模拟崩溃');
      });
      const hNormal = vi.fn();

      // 抑制 console.error 输出
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      on('test', hError);
      on('test', hNormal);
      emit('test', 'data');

      expect(hError).toHaveBeenCalled();
      expect(hNormal).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('clearAllListeners', () => {
    it('应清除所有事件的所有监听器', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();

      on('event.a', h1);
      on('event.b', h2);
      clearAllListeners();

      emit('event.a', 1);
      emit('event.b', 2);

      expect(h1).not.toHaveBeenCalled();
      expect(h2).not.toHaveBeenCalled();
    });
  });
});
