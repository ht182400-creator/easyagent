/**
 * 共享事件总线
 * 用于 Store 之间的解耦通信，替代跨 Store 直接调用和轮询
 *
 * 使用场景:
 * - chatStore 的 WebSocket 处理器将自动化事件转发给 automationStore
 * - 其他跨 Store 的实时事件通知
 */

type EventHandler = (payload: unknown) => void;

const listeners = new Map<string, Set<EventHandler>>();

/**
 * 订阅事件
 *
 * @param event - 事件名称
 * @param handler - 事件处理器
 * @returns 取消订阅函数
 */
export function on(event: string, handler: EventHandler): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(handler);
  return () => {
    listeners.get(event)?.delete(handler);
  };
}

/**
 * 发送事件
 *
 * @param event - 事件名称
 * @param payload - 事件数据
 */
export function emit(event: string, payload?: unknown): void {
  const handlers = listeners.get(event);
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`事件处理器错误 [${event}]:`, err);
      }
    }
  }
}

/**
 * 移除指定事件的所有监听器
 */
export function off(event: string): void {
  listeners.delete(event);
}

/**
 * 移除所有监听器（通常在应用卸载时调用）
 */
export function clearAllListeners(): void {
  listeners.clear();
}
