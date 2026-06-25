/**
 * AnalyticsEngine - 用户行为分析引擎
 * 提供 FTSR (First Time to Success Rate)、7日留存率、TTFV (Time to First Value) 等北极星指标
 */
import { EventEmitter } from 'events';

// ========== 类型定义 ==========

/** 事件类型 */
export type AnalyticsEventType =
  | 'session_start'
  | 'session_end'
  | 'chat_message'
  | 'tool_call'
  | 'tool_result'
  | 'model_switch'
  | 'provider_config'
  | 'error'
  | 'feature_usage';

/** 分析事件 */
export interface AnalyticsEvent {
  type: AnalyticsEventType;
  timestamp: number;
  sessionId: string;
  userId?: string;
  data?: Record<string, unknown>;
}

/** 北极星指标 */
export interface NorthStarMetrics {
  /** 首次价值时间 (秒) - 从安装到首次成功完成任务的时间 */
  ftsr: number;
  /** 7日留存率 (0-1) */
  retention7d: number;
  /** 首次价值获取时间 (秒) - 从启动到产生有效输出的延迟 */
  ttfv: number;
  /** 日活跃用户数 */
  dau: number;
  /** 周活跃用户数 */
  wau: number;
  /** 月活跃用户数 */
  mau: number;
  /** DAU/MAU 比例 (粘性指标) */
  stickiness: number;
  /** 平均会话时长 (秒) */
  avgSessionDuration: number;
  /** 每个用户的平均消息数 */
  avgMessagesPerUser: number;
  /** 工具调用成功率 */
  toolSuccessRate: number;
}

/** 每日统计 */
export interface DailyStats {
  date: string;
  sessions: number;
  messages: number;
  toolCalls: number;
  errors: number;
  uniqueUsers: number;
  uniqueProviders: number;
  totalTokens: number;
}

/** 用户漏斗数据 */
export interface UserFunnel {
  /** 安装 → 首次配置 */
  installToConfig: { count: number; rate: number };
  /** 配置 → 首次对话 */
  configToFirstChat: { count: number; rate: number };
  /** 首次对话 → 首次工具调用 */
  firstChatToToolUse: { count: number; rate: number };
  /** 首次工具调用 → 周活跃 */
  toolUseToWAU: { count: number; rate: number };
  /** 周活跃 → 月活跃 */
  wauToMAU: { count: number; rate: number };
}

/** 分析报告 */
export interface AnalyticsReport {
  generatedAt: string;
  period: { from: string; to: string };
  northStar: NorthStarMetrics;
  daily: DailyStats[];
  funnel: UserFunnel;
  byProvider: Record<string, { messages: number; toolCalls: number; errors: number }>;
  byModel: Record<string, { calls: number; avgTokens: number }>;
  trends: {
    dauTrend: number[];       // 最近30天 DAU 趋势
    messagesTrend: number[];  // 最近30天消息趋势
    retentionTrend: number[];  // 最近7天留存率趋势
  };
}

// ========== AnalyticsEngine ==========

/**
 * 用户行为分析引擎
 * 负责收集、聚合和计算北极星指标
 */
export class AnalyticsEngine extends EventEmitter {
  private events: AnalyticsEvent[] = [];
  private maxEvents: number;
  private dailyStats: Map<string, DailyStats> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId → Set<sessionId>
  private userFirstSeen: Map<string, number> = new Map();      // userId → timestamp
  private sessionStartTimes: Map<string, number> = new Map();   // sessionId → startTime
  private flushing = false;

  constructor(maxEvents = 10000) {
    super();
    this.maxEvents = maxEvents;
  }

  // ========== 事件收集 ==========

  /**
   * 记录分析事件
   * @param event - 分析事件对象
   */
  track(event: AnalyticsEvent): void {
    this.events.push(event);

    // 自动清理旧事件
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents / 2);
    }

    // 更新用户首次出现时间
    if (event.userId && !this.userFirstSeen.has(event.userId)) {
      this.userFirstSeen.set(event.userId, event.timestamp);
    }

    // 记录会话开始时间
    if (event.type === 'session_start') {
      this.sessionStartTimes.set(event.sessionId, event.timestamp);
    }

    // 更新用户会话映射
    if (event.userId) {
      if (!this.userSessions.has(event.userId)) {
        this.userSessions.set(event.userId, new Set());
      }
      this.userSessions.get(event.userId)!.add(event.sessionId);
    }

    // 更新每日统计
    const dateKey = this.toDateKey(event.timestamp);
    if (!this.dailyStats.has(dateKey)) {
      this.dailyStats.set(dateKey, this.createEmptyDailyStats(dateKey));
    }
    const stats = this.dailyStats.get(dateKey)!;
    this.updateDailyStats(stats, event);

    this.emit('event', event);
  }

  /**
   * 批量记录事件
   */
  trackBatch(events: AnalyticsEvent[]): void {
    for (const event of events) {
      this.track(event);
    }
  }

  // ========== 北极星指标计算 ==========

  /**
   * 计算 FTSR (First Time to Success Rate)
   * 定义: 从安装到首次成功工具调用的时间
   */
  calculateFTSR(): number {
    const successEvents = this.events.filter(
      e => e.type === 'tool_result' && e.data?.success === true
    );

    if (successEvents.length === 0) return 0;

    // 按用户分组，取每个用户的首次成功时间
    const userFirstSuccess = new Map<string, number>();
    for (const event of successEvents) {
      if (!event.userId) continue;
      const firstSeen = this.userFirstSeen.get(event.userId);
      if (!firstSeen) continue;
      const ttr = event.timestamp - firstSeen;
      if (!userFirstSuccess.has(event.userId) || ttr < userFirstSuccess.get(event.userId)!) {
        userFirstSuccess.set(event.userId, ttr);
      }
    }

    // 返回中位数 (秒)
    const times = Array.from(userFirstSuccess.values()).sort((a, b) => a - b);
    if (times.length === 0) return 0;
    const mid = Math.floor(times.length / 2);
    return times.length % 2 === 0
      ? (times[mid - 1] + times[mid]) / 2
      : times[mid];
  }

  /**
   * 计算 7日留存率
   */
  calculateRetention7d(): number {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

    // 14天前有活动的用户
    const cohort = new Set<string>();
    for (const event of this.events) {
      if (event.userId && event.timestamp >= fourteenDaysAgo && event.timestamp < sevenDaysAgo) {
        cohort.add(event.userId);
      }
    }

    if (cohort.size === 0) return 1;

    // 7天内仍有活动的用户
    const retained = new Set<string>();
    for (const event of this.events) {
      if (event.userId && event.timestamp >= sevenDaysAgo && cohort.has(event.userId)) {
        retained.add(event.userId);
      }
    }

    return retained.size / cohort.size;
  }

  /**
   * 计算 TTFV (Time to First Value)
   * 定义: 从 session_start 到首次产生有效 chat 响应的时间
   */
  calculateTTFV(): number {
    const sessions = new Map<string, { start: number; firstValue?: number }>();

    for (const event of this.events) {
      if (event.type === 'session_start') {
        sessions.set(event.sessionId, { start: event.timestamp });
      } else if ((event.type === 'chat_message' || event.type === 'tool_result') && sessions.has(event.sessionId)) {
        const s = sessions.get(event.sessionId)!;
        if (!s.firstValue) {
          s.firstValue = event.timestamp;
        }
      }
    }

    const ttfvs: number[] = [];
    for (const [, s] of sessions) {
      if (s.firstValue) {
        ttfvs.push(s.firstValue - s.start);
      }
    }

    if (ttfvs.length === 0) return 0;
    ttfvs.sort((a, b) => a - b);
    const mid = Math.floor(ttfvs.length / 2);
    return ttfvs.length % 2 === 0
      ? (ttfvs[mid - 1] + ttfvs[mid]) / 2
      : ttfvs[mid];
  }

  // ========== DAU/WAU/MAU ==========

  /**
   * 计算日活跃用户数
   */
  calculateDAU(date?: string): number {
    const target = date || this.toDateKey(Date.now());
    const users = new Set<string>();

    for (const event of this.events) {
      if (event.userId && this.toDateKey(event.timestamp) === target) {
        users.add(event.userId);
      }
    }

    return users.size;
  }

  /**
   * 计算周活跃用户数
   */
  calculateWAU(): number {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const users = new Set<string>();

    for (const event of this.events) {
      if (event.userId && event.timestamp >= sevenDaysAgo) {
        users.add(event.userId);
      }
    }

    return users.size;
  }

  /**
   * 计算月活跃用户数
   */
  calculateMAU(): number {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const users = new Set<string>();

    for (const event of this.events) {
      if (event.userId && event.timestamp >= thirtyDaysAgo) {
        users.add(event.userId);
      }
    }

    return users.size;
  }

  // ========== 工具调用成功率 ==========

  /**
   * 计算工具调用成功率
   */
  calculateToolSuccessRate(): number {
    const total = this.events.filter(e => e.type === 'tool_call').length;
    if (total === 0) return 1;

    const successful = this.events.filter(
      e => e.type === 'tool_result' && e.data?.success === true
    ).length;

    return successful / total;
  }

  // ========== 会话分析 ==========

  /**
   * 计算平均会话时长 (秒)
   */
  calculateAvgSessionDuration(): number {
    const durations: number[] = [];

    for (const [sessionId, startTime] of this.sessionStartTimes) {
      const endEvent = this.events.find(
        e => e.sessionId === sessionId && e.type === 'session_end'
      );
      if (endEvent) {
        durations.push(endEvent.timestamp - startTime);
      }
    }

    if (durations.length === 0) return 0;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
  }

  /**
   * 计算每用户平均消息数
   */
  calculateAvgMessagesPerUser(): number {
    const userMsgCount = new Map<string, number>();

    for (const event of this.events) {
      if (event.type === 'chat_message' && event.userId) {
        userMsgCount.set(event.userId, (userMsgCount.get(event.userId) || 0) + 1);
      }
    }

    if (userMsgCount.size === 0) return 0;
    return Array.from(userMsgCount.values()).reduce((a, b) => a + b, 0) / userMsgCount.size;
  }

  // ========== 用户漏斗 ==========

  /**
   * 计算用户转化漏斗
   */
  calculateUserFunnel(): UserFunnel {
    // Stage 1: 安装 → 配置 (所有事件中出现的用户)
    const allUsers = new Set<string>();
    const configuredUsers = new Set<string>();
    const chattedUsers = new Set<string>();
    const toolUsers = new Set<string>();

    for (const event of this.events) {
      if (!event.userId) continue;
      allUsers.add(event.userId);

      if (event.type === 'provider_config') {
        configuredUsers.add(event.userId);
      }
      if (event.type === 'chat_message') {
        chattedUsers.add(event.userId);
      }
      if (event.type === 'tool_call') {
        toolUsers.add(event.userId);
      }
    }

    const wau = this.calculateWAU();
    const mau = this.calculateMAU();

    return {
      installToConfig: {
        count: configuredUsers.size,
        rate: allUsers.size > 0 ? configuredUsers.size / allUsers.size : 0
      },
      configToFirstChat: {
        count: chattedUsers.size,
        rate: configuredUsers.size > 0 ? chattedUsers.size / configuredUsers.size : 0
      },
      firstChatToToolUse: {
        count: toolUsers.size,
        rate: chattedUsers.size > 0 ? toolUsers.size / chattedUsers.size : 0
      },
      toolUseToWAU: {
        count: wau,
        rate: toolUsers.size > 0 ? wau / toolUsers.size : 0
      },
      wauToMAU: {
        count: mau,
        rate: wau > 0 ? mau / wau : 0
      }
    };
  }

  // ========== 趋势数据 ==========

  /**
   * 获取最近 N 天的 DAU 趋势
   */
  getDAUTrend(days: number = 30): number[] {
    const trend: number[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const date = this.toDateKey(now - i * 24 * 60 * 60 * 1000);
      trend.push(this.calculateDAU(date));
    }

    return trend;
  }

  /**
   * 获取最近 N 天的消息量趋势
   */
  getMessagesTrend(days: number = 30): number[] {
    const trend: number[] = [];
    const now = Date.now();

    for (let i = days - 1; i >= 0; i--) {
      const date = this.toDateKey(now - i * 24 * 60 * 60 * 1000);
      const stats = this.dailyStats.get(date);
      trend.push(stats ? stats.messages : 0);
    }

    return trend;
  }

  // ========== 完整报告 ==========

  /**
   * 生成完整的分析报告
   */
  generateReport(): AnalyticsReport {
    const dau = this.calculateDAU();
    const wau = this.calculateWAU();
    const mau = this.calculateMAU();

    // 按提供商聚合
    const byProvider: Record<string, { messages: number; toolCalls: number; errors: number }> = {};
    const byModel: Record<string, { calls: number; avgTokens: number }> = {};

    for (const event of this.events) {
      const provider = (event.data?.provider as string) || 'unknown';
      const model = (event.data?.model as string) || 'unknown';

      if (!byProvider[provider]) {
        byProvider[provider] = { messages: 0, toolCalls: 0, errors: 0 };
      }
      if (!byModel[model]) {
        byModel[model] = { calls: 0, avgTokens: 0 };
      }

      if (event.type === 'chat_message') byProvider[provider].messages++;
      if (event.type === 'tool_call') byProvider[provider].toolCalls++;
      if (event.type === 'error') byProvider[provider].errors++;

      if (event.type === 'chat_message') {
        byModel[model].calls++;
        const tokens = (event.data?.tokens as number) || 0;
        byModel[model].avgTokens =
          (byModel[model].avgTokens * (byModel[model].calls - 1) + tokens) /
          byModel[model].calls;
      }
    }

    const now = Date.now();
    return {
      generatedAt: new Date().toISOString(),
      period: {
        from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      },
      northStar: {
        ftsr: this.calculateFTSR(),
        retention7d: this.calculateRetention7d(),
        ttfv: this.calculateTTFV(),
        dau,
        wau,
        mau,
        stickiness: mau > 0 ? dau / mau : 0,
        avgSessionDuration: this.calculateAvgSessionDuration(),
        avgMessagesPerUser: this.calculateAvgMessagesPerUser(),
        toolSuccessRate: this.calculateToolSuccessRate()
      },
      daily: Array.from(this.dailyStats.values()).sort(
        (a, b) => a.date.localeCompare(b.date)
      ),
      funnel: this.calculateUserFunnel(),
      byProvider,
      byModel,
      trends: {
        dauTrend: this.getDAUTrend(30),
        messagesTrend: this.getMessagesTrend(30),
        retentionTrend: this.getRetentionTrend(7)
      }
    };
  }

  /**
   * 获取事件总数
   */
  getEventCount(): number {
    return this.events.length;
  }

  /**
   * 清空所有数据
   */
  reset(): void {
    this.events = [];
    this.dailyStats.clear();
    this.userSessions.clear();
    this.userFirstSeen.clear();
    this.sessionStartTimes.clear();
  }

  // ========== 私有方法 ==========

  private toDateKey(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0];
  }

  private createEmptyDailyStats(date: string): DailyStats {
    return {
      date,
      sessions: 0,
      messages: 0,
      toolCalls: 0,
      errors: 0,
      uniqueUsers: 0,
      uniqueProviders: 0,
      totalTokens: 0
    };
  }

  private updateDailyStats(stats: DailyStats, event: AnalyticsEvent): void {
    switch (event.type) {
      case 'session_start':
        stats.sessions++;
        break;
      case 'chat_message':
        stats.messages++;
        stats.totalTokens += (event.data?.tokens as number) || 0;
        break;
      case 'tool_call':
        stats.toolCalls++;
        break;
      case 'error':
        stats.errors++;
        break;
    }
  }

  /**
   * 计算最近 N 天留存率趋势
   */
  private getRetentionTrend(days: number): number[] {
    const trend: number[] = [];
    const now = Date.now();

    for (let i = 0; i < days; i++) {
      const dayStart = now - (i + 1) * 24 * 60 * 60 * 1000;
      const dayEnd = now - i * 24 * 60 * 60 * 1000;
      const prevStart = now - (i + 2) * 24 * 60 * 60 * 1000;

      const cohort = new Set<string>();
      const retained = new Set<string>();

      for (const event of this.events) {
        if (event.userId && event.timestamp >= prevStart && event.timestamp < dayStart) {
          cohort.add(event.userId);
        }
        if (event.userId && event.timestamp >= dayStart && event.timestamp < dayEnd && cohort.has(event.userId)) {
          retained.add(event.userId);
        }
      }

      trend.push(cohort.size > 0 ? retained.size / cohort.size : 1);
    }

    return trend;
  }
}

/** 全局单例 */
let globalEngine: AnalyticsEngine | null = null;

/**
 * 获取 AnalyticsEngine 单例
 */
export function getAnalyticsEngine(): AnalyticsEngine {
  if (!globalEngine) {
    globalEngine = new AnalyticsEngine();
  }
  return globalEngine;
}

/**
 * 设置 AnalyticsEngine 单例
 */
export function setAnalyticsEngine(engine: AnalyticsEngine): void {
  globalEngine = engine;
}
