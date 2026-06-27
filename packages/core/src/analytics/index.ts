/**
 * Analytics 模块导出
 * 提供用户行为分析和北极星指标计算能力
 */
export { AnalyticsEngine, getAnalyticsEngine, setAnalyticsEngine } from './AnalyticsEngine';

export type {
  AnalyticsEventType,
  AnalyticsEvent,
  NorthStarMetrics,
  DailyStats,
  UserFunnel,
  AnalyticsReport,
} from './AnalyticsEngine';
