/**
 * AnalyticsEngine 单元测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsEngine } from '../analytics/AnalyticsEngine';

describe('AnalyticsEngine', () => {
  let engine: AnalyticsEngine;

  beforeEach(() => {
    engine = new AnalyticsEngine(1000);
  });

  // ==================== 事件记录 ====================

  describe('track', () => {
    it('正确记录单个事件', () => {
      engine.track({
        type: 'session_start',
        timestamp: Date.now(),
        sessionId: 'session-1',
        userId: 'user-1',
      });
      expect(engine.getEventCount()).toBe(1);
    });

    it('记录多个不同类型的事件', () => {
      engine.track({ type: 'session_start', timestamp: Date.now(), sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'chat_message', timestamp: Date.now(), sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'tool_call', timestamp: Date.now(), sessionId: 's1', userId: 'u1' });
      expect(engine.getEventCount()).toBe(3);
    });

    it('超过 maxEvents 时自动清理旧事件', () => {
      const smallEngine = new AnalyticsEngine(10);
      for (let i = 0; i < 20; i++) {
        smallEngine.track({
          type: 'chat_message',
          timestamp: Date.now() - (20 - i) * 1000,
          sessionId: `s${i}`,
          userId: `u${i}`,
        });
      }
      // 应该只保留一半 (maxEvents/2)
      expect(smallEngine.getEventCount()).toBeLessThanOrEqual(10);
    });
  });

  // ==================== DAU/WAU/MAU ====================

  describe('calculateDAU', () => {
    it('返回正确数量的日活跃用户', () => {
      const now = Date.now();
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's2', userId: 'u2' });
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's3', userId: 'u1' }); // 重复用户
      expect(engine.calculateDAU()).toBe(2);
    });

    it('不统计没有 userId 的事件', () => {
      engine.track({ type: 'chat_message', timestamp: Date.now(), sessionId: 's1' });
      expect(engine.calculateDAU()).toBe(0);
    });
  });

  describe('calculateWAU', () => {
    it('统计最近7天的活跃用户', () => {
      const now = Date.now();
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'session_start', timestamp: now - 3 * 24 * 60 * 60 * 1000, sessionId: 's2', userId: 'u2' });
      // 8天前的事件不应计入
      engine.track({ type: 'session_start', timestamp: now - 8 * 24 * 60 * 60 * 1000, sessionId: 's3', userId: 'u3' });
      expect(engine.calculateWAU()).toBe(2);
    });
  });

  describe('calculateMAU', () => {
    it('统计最近30天的活跃用户', () => {
      const now = Date.now();
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'session_start', timestamp: now - 20 * 24 * 60 * 60 * 1000, sessionId: 's2', userId: 'u2' });
      // 31天前的事件不应计入
      engine.track({ type: 'session_start', timestamp: now - 31 * 24 * 60 * 60 * 1000, sessionId: 's3', userId: 'u3' });
      expect(engine.calculateMAU()).toBe(2);
    });
  });

  // ==================== 工具成功率 ====================

  describe('calculateToolSuccessRate', () => {
    it('没有工具调用时返回 1', () => {
      expect(engine.calculateToolSuccessRate()).toBe(1);
    });

    it('计算正确的成功率', () => {
      const now = Date.now();
      engine.track({ type: 'tool_call', timestamp: now, sessionId: 's1', userId: 'u1', data: { tool: 'read' } });
      engine.track({ type: 'tool_result', timestamp: now + 100, sessionId: 's1', userId: 'u1', data: { success: true } });
      engine.track({ type: 'tool_call', timestamp: now, sessionId: 's1', userId: 'u1', data: { tool: 'write' } });
      engine.track({ type: 'tool_result', timestamp: now + 100, sessionId: 's1', userId: 'u1', data: { success: false } });
      expect(engine.calculateToolSuccessRate()).toBe(0.5);
    });
  });

  // ==================== FTSR ====================

  describe('calculateFTSR', () => {
    it('没有成功事件时返回 0', () => {
      expect(engine.calculateFTSR()).toBe(0);
    });

    it('计算首次成功时间中位数', () => {
      const base = Date.now();
      engine.track({ type: 'session_start', timestamp: base, sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'tool_result', timestamp: base + 5000, sessionId: 's1', userId: 'u1', data: { success: true } });
      engine.track({ type: 'session_start', timestamp: base + 1000, sessionId: 's2', userId: 'u2' });
      engine.track({ type: 'tool_result', timestamp: base + 11000, sessionId: 's2', userId: 'u2', data: { success: true } });
      // u1: 5000ms, u2: 10000ms → 中位数 7500ms = 7.5s
      const ftsr = engine.calculateFTSR();
      expect(ftsr).toBeGreaterThan(0);
    });
  });

  // ==================== DAU/MAU 粘性 ====================

  describe('stickiness', () => {
    it('DAU/MAU 比例在 0-1 范围内', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        engine.track({ type: 'session_start', timestamp: now, sessionId: `s${i}`, userId: `u${i}` });
      }
      const report = engine.generateReport();
      expect(report.northStar.stickiness).toBeGreaterThanOrEqual(0);
      expect(report.northStar.stickiness).toBeLessThanOrEqual(1);
    });
  });

  // ==================== 趋势数据 ====================

  describe('getDAUTrend', () => {
    it('返回指定天数的数组', () => {
      const trend = engine.getDAUTrend(7);
      expect(trend).toHaveLength(7);
      expect(trend.every(v => typeof v === 'number')).toBe(true);
    });
  });

  describe('getMessagesTrend', () => {
    it('返回指定天数的数组', () => {
      const trend = engine.getMessagesTrend(14);
      expect(trend).toHaveLength(14);
    });
  });

  // ==================== 用户漏斗 ====================

  describe('calculateUserFunnel', () => {
    it('返回漏斗各阶段数据', () => {
      const now = Date.now();
      const steps = [
        { type: 'session_start' as const },
        { type: 'provider_config' as const },
        { type: 'chat_message' as const },
        { type: 'tool_call' as const },
      ];

      steps.forEach((step, i) => {
        engine.track({
          type: step.type,
          timestamp: now + i * 1000,
          sessionId: `s1`,
          userId: 'u1',
        });
      });

      const funnel = engine.calculateUserFunnel();
      expect(funnel.installToConfig).toBeDefined();
      expect(funnel.configToFirstChat).toBeDefined();
      expect(funnel.firstChatToToolUse).toBeDefined();
      expect(typeof funnel.installToConfig.rate).toBe('number');
    });
  });

  // ==================== 完整报告 ====================

  describe('generateReport', () => {
    it('生成包含所有字段的完整报告', () => {
      const report = engine.generateReport();

      // 结构验证
      expect(report).toHaveProperty('northStar');
      expect(report).toHaveProperty('daily');
      expect(report).toHaveProperty('funnel');
      expect(report).toHaveProperty('byProvider');
      expect(report).toHaveProperty('byModel');
      expect(report).toHaveProperty('trends');

      // 北极星指标
      expect(report.northStar).toHaveProperty('ftsr');
      expect(report.northStar).toHaveProperty('retention7d');
      expect(report.northStar).toHaveProperty('ttfv');
      expect(report.northStar).toHaveProperty('dau');
      expect(report.northStar).toHaveProperty('wau');
      expect(report.northStar).toHaveProperty('mau');
      expect(report.northStar).toHaveProperty('stickiness');
      expect(report.northStar).toHaveProperty('toolSuccessRate');

      // 趋势
      expect(report.trends.dauTrend).toHaveLength(30);
      expect(report.trends.messagesTrend).toHaveLength(30);
      expect(report.trends.retentionTrend).toHaveLength(7);
    });
  });

  // ==================== 重置 ====================

  describe('reset', () => {
    it('清除所有数据', () => {
      engine.track({ type: 'session_start', timestamp: Date.now(), sessionId: 's1', userId: 'u1' });
      expect(engine.getEventCount()).toBe(1);

      engine.reset();
      expect(engine.getEventCount()).toBe(0);
      expect(engine.calculateDAU()).toBe(0);
    });
  });

  // ==================== 会话时长 ====================

  describe('calculateAvgSessionDuration', () => {
    it('计算平均会话时长', () => {
      const now = Date.now();
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's1', userId: 'u1' });
      engine.track({ type: 'session_end', timestamp: now + 60000, sessionId: 's1', userId: 'u1' }); // 60s
      engine.track({ type: 'session_start', timestamp: now, sessionId: 's2', userId: 'u2' });
      engine.track({ type: 'session_end', timestamp: now + 30000, sessionId: 's2', userId: 'u2' }); // 30s
      expect(engine.calculateAvgSessionDuration()).toBe(45000);
    });
  });
});
