/**
 * messageUtils — 消息类型判断工具
 *
 * LangGraph checkpoint 系统使用 JSON 序列化/反序列化保存/恢复 State，
 * 导致 messages 数组中的 BaseMessage 实例变成普通 JS 对象。
 * 这些对象保留了 type/content/tool_calls 等属性，但丢失了 getType() 等原型方法。
 *
 * 本模块提供兼容两种消息格式的安全判断函数。
 */

/** LangChain 消息类型字符串（与 BaseMessage.getType() 返回值一致） */
export type MessageType = 'system' | 'human' | 'ai' | 'tool';

/**
 * 获取消息的类型字符串（兼容 BaseMessage 实例与 checkpoint 还原的普通对象）
 *
 * BaseMessage 有 .getType() 方法 → 直接调用
 * 普通对象有 .type 属性 (格式: "constructor" | "system" | "human" | "ai" | "tool")
 *
 * @param msg - 消息对象（可能为 BaseMessage 或普通 Object）
 * @returns 消息类型，失败时返回 'unknown'
 */
export function getMessageType(msg: unknown): MessageType | 'unknown' {
  if (!msg || typeof msg !== 'object') return 'unknown';

  // 1. BaseMessage 实例 → 调用 getType()
  if (typeof (msg as Record<string, unknown>).getType === 'function') {
    const type = (msg as { getType(): string }).getType();
    if (type === 'system' || type === 'human' || type === 'ai' || type === 'tool') {
      return type;
    }
    return 'unknown';
  }

  // 2. 普通对象 (checkpoint 还原) → 读取 .type 属性
  const typeVal = (msg as Record<string, unknown>).type;
  if (typeof typeVal === 'string') {
    // LangChain 消息的 .type 值可能是 "constructor"（占位）或 "system"/"human"/"ai"/"tool"
    // constructor 对应的实际类型通过 _getType?.() 或额外字段判断
    const normalized = normalizeTypeString(typeVal as string);
    if (normalized) return normalized;
  }

  // 3. 通过 constructor.name 推断（兜底）
  const ctorName = (msg as Record<string, unknown>).constructor?.name;
  if (typeof ctorName === 'string') {
    const normalized = normalizeTypeString(ctorName);
    if (normalized) return normalized;
  }

  return 'unknown';
}

/**
 * 标准化类型字符串
 */
function normalizeTypeString(s: string): MessageType | null {
  const lower = s.toLowerCase();
  if (lower.includes('system')) return 'system';
  if (lower.includes('human')) return 'human';
  if (lower.includes('ai')) return 'ai';
  if (lower.includes('tool')) return 'tool';
  return null;
}

/**
 * 判断消息是否为 AI 类型
 */
export function isAIMessage(msg: unknown): boolean {
  return getMessageType(msg) === 'ai';
}

/**
 * 判断消息是否包含 tool_calls
 *
 * @param msg - 消息对象
 * @returns 是否有非空 tool_calls
 */
export function hasToolCalls(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;

  const toolCalls = (msg as Record<string, unknown>).tool_calls;
  if (!Array.isArray(toolCalls)) return false;
  return toolCalls.length > 0;
}

/**
 * 获取消息的 tool_calls 数组（标准化格式）
 *
 * BaseMessage 的 tool_calls 格式: { id, name, args }
 * checkpoint 还原后的 tool_calls 保持相同格式
 *
 * @param msg - 消息对象
 * @returns tool_calls 数组，空数组表示无
 */
export function getToolCalls(msg: unknown): Array<{ id?: string; name: string; args: Record<string, unknown> }> {
  if (!hasToolCalls(msg)) return [];
  return (msg as Record<string, unknown>).tool_calls as Array<{ id?: string; name: string; args: Record<string, unknown> }>;
}

/**
 * 获取消息的 tool_call_id
 *
 * @param msg - 消息对象
 * @returns tool_call_id，不存在返回 undefined
 */
export function getToolCallId(msg: unknown): string | undefined {
  if (!msg || typeof msg !== 'object') return undefined;
  const id = (msg as Record<string, unknown>).tool_call_id;
  return typeof id === 'string' ? id : undefined;
}

/**
 * 获取消息内容（字符串形式）
 */
export function getMessageContent(msg: unknown): string {
  if (!msg || typeof msg !== 'object') return '';

  const content = (msg as Record<string, unknown>).content;
  if (typeof content === 'string') return content;

  // 可能是 complex content 数组，序列化为 JSON
  if (Array.isArray(content)) {
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }

  return String(content ?? '');
}
