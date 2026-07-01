/**
 * Memory — 长期记忆管理
 * 
 * 提供分层记忆能力：
 * 1. 短期记忆 — 通过 Checkpoint 管理的 messages 历史（已在 agentGraph 中实现）
 * 2. 长期记忆 — 语义摘要 + 关键信息提取（本模块实现）
 * 
 * Phase 3 实现内容：
 * - 消息摘要压缩（当消息数超过阈值时）
 * - 用户偏好存储
 * - 项目知识存储
 * - 向量检索预留接口
 */
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { Logger } from '../logger/Logger';

/** Memory 模块 Logger */
const log = new Logger('MemoryManager');

/**
 * 记忆项 — 长期记忆的存储单元
 */
export interface MemoryItem {
  /** 唯一标识 */
  id: string;
  /** 记忆类型 */
  type: 'summary' | 'preference' | 'fact' | 'decision';
  /** 内容 */
  content: string;
  /** 相关会话 ID */
  sessionId?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 重要性权重 (0-1) */
  importance: number;
}

/**
 * Memory 配置
 */
export interface MemoryConfig {
  /** 触发摘要的最大消息数，默认 100 */
  maxMessagesBeforeSummary: number;
  /** 摘要后保留的最近消息数，默认 20 */
  keepRecentMessages: number;
  /** 最大记忆项数量，默认 1000 */
  maxMemoryItems: number;
}

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxMessagesBeforeSummary: 100,
  keepRecentMessages: 20,
  maxMemoryItems: 1000,
};

/**
 * 长短期记忆管理器
 * 
 * 负责：
 * - 消息历史压缩：当消息数超过阈值时，自动生成摘要
 * - 关键信息提取：从对话中提取用户偏好、项目知识等
 * - 历史上下文注入：在构建系统提示时注入相关记忆
 */
export class MemoryManager {
  private items: MemoryItem[] = [];
  private config: MemoryConfig;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    log.debug('MemoryManager 初始化', { maxMessagesBeforeSummary: this.config.maxMessagesBeforeSummary, maxMemoryItems: this.config.maxMemoryItems });
  }

  /**
   * 检查是否需要压缩消息历史
   * @param messages - 当前消息列表
   * @returns 是否需要压缩
   */
  needsCompression(messages: BaseMessage[]): boolean {
    const needs = messages.length > this.config.maxMessagesBeforeSummary;
    if (needs) {
      log.debug('消息需要压缩', { msgCount: messages.length, threshold: this.config.maxMessagesBeforeSummary });
    }
    return needs;
  }

  /**
   * 生成消息摘要（供 thinkNode 调用）
   * 
   * 策略：保留最近 N 条消息，将更早的消息压缩为摘要
   * 注意：实际摘要生成需要 LLM 调用，此处提供框架
   * 
   * @param messages - 完整消息历史
   * @param generateSummary - LLM 摘要生成函数
   * @returns { keepMessages, summary } — 保留的消息 + 摘要文本
   */
  async compressMessages(
    messages: BaseMessage[],
    generateSummary: (msgs: BaseMessage[]) => Promise<string>
  ): Promise<{
    /** 保留的最近消息 */
    keepMessages: BaseMessage[];
    /** 摘要文本 */
    summary: string;
  }> {
    if (messages.length <= this.config.keepRecentMessages) {
      return { keepMessages: messages, summary: '' };
    }

    // 分割：早期消息用于生成摘要，近期消息保留
    const olderMessages = messages.slice(0, -this.config.keepRecentMessages);
    const recentMessages = messages.slice(-this.config.keepRecentMessages);
    log.debug('压缩消息', { totalMsg: messages.length, olderCount: olderMessages.length, keepCount: recentMessages.length });

    // 生成摘要（调用外部 LLM 函数）
    const summaryTimer = log.startTimer('生成摘要');
    const summary = await generateSummary(olderMessages);
    summaryTimer({ summaryLen: summary.length });

    return { keepMessages: recentMessages, summary };
  }

  /**
   * 添加记忆项
   * @param item - 记忆内容
   */
  addMemory(item: Omit<MemoryItem, 'id' | 'createdAt'>): void {
    const fullItem: MemoryItem = {
      ...item,
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
    };

    this.items.push(fullItem);
    log.debug('添加记忆', { type: item.type, importance: item.importance, contentPreview: item.content.substring(0, 80) });

    // 按重要性排序，淘汰低优先级记忆
    if (this.items.length > this.config.maxMemoryItems) {
      const removed = this.items.length - this.config.maxMemoryItems;
      this.items.sort((a, b) => b.importance - a.importance);
      this.items = this.items.slice(0, this.config.maxMemoryItems);
      log.debug('记忆淘汰', { removed, remaining: this.items.length });
    }
  }

  /**
   * 提取对话中的关键信息并存储为记忆
   * 
   * 基于启发式规则（当前版本），后续可接入 LLM 提取
   * 
   * @param messages - 对话消息
   */
  extractKeyInfo(messages: BaseMessage[]): void {
    const beforeCount = this.items.length;
    for (const msg of messages) {
      if (!(msg instanceof HumanMessage)) continue;

      const content = typeof msg.content === 'string' ? msg.content : '';
      if (!content) continue;

      // 启发式提取用户偏好
      if (content.includes('我喜欢') || content.includes('偏好') || content.includes('prefer')) {
        this.addMemory({ type: 'preference', content, importance: 0.7 });
        continue;
      }

      // 启发式提取技术决策
      if (content.includes('决定') || content.includes('采用') || content.includes('选择')) {
        this.addMemory({ type: 'decision', content, importance: 0.8 });
        continue;
      }
    }
    const extracted = this.items.length - beforeCount;
    if (extracted > 0) {
      log.debug('关键信息提取', { extracted, totalMemories: this.items.length });
    }
  }

  /**
   * 搜索相关记忆
   * 
   * 当前为关键词匹配，后续可接入向量检索
   * 
   * @param query - 搜索查询
   * @param limit - 最大返回数量
   * @returns 相关记忆项列表
   */
  search(query: string, limit = 5): MemoryItem[] {
    const keywords = query.toLowerCase().split(/\s+/);
    log.debug('记忆搜索', { query, keywords, totalItems: this.items.length });

    // 基于关键词的简单评分
    const scored = this.items.map((item) => {
      const content = item.content.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (content.includes(kw)) {
          score += 1;
        }
      }
      // 重要性加权
      score *= item.importance;
      return { item, score };
    });

    // 按分数排序
    scored.sort((a, b) => b.score - a.score);

    const results = scored
      .filter((s) => s.score > 0)
      .slice(0, limit)
      .map((s) => s.item);

    log.debug('搜索结果', { resultCount: results.length });
    return results;
  }

  /**
   * 获取系统提示词中需要注入的记忆上下文
   * @param sessionId - 当前会话 ID
   * @returns 格式化的记忆文本
   */
  getContextForPrompt(sessionId?: string): string {
    const relevantItems = this.items
      .filter((item) => !sessionId || item.sessionId === sessionId)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 10);

    if (relevantItems.length === 0) return '';

    log.debug('构建记忆上下文', { sessionId, itemCount: relevantItems.length, types: relevantItems.map(i => i.type) });

    const lines: string[] = ['## 历史记忆与偏好', ''];
    for (const item of relevantItems) {
      const typeLabel = {
        summary: '📋 摘要',
        preference: '⭐ 偏好',
        fact: '📌 事实',
        decision: '🔧 决策',
      }[item.type];

      lines.push(`- ${typeLabel}: ${item.content}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取所有记忆项
   */
  getItems(): MemoryItem[] {
    return [...this.items];
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    log.info('清空所有记忆', { previousCount: this.items.length });
    this.items = [];
  }
}
