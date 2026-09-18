/**
 * 自动化任务页面 - 数据与小部件（P2-1 拆分产物，自 Automation.tsx 纯搬迁）
 *
 * @module pages/automation/data
 */

import { Clock, RefreshCw, History } from 'lucide-react';
import type { ScheduleType } from '../../stores/automationStore';

/** 功能卡片配置 */
export const FEATURES = [
  {
    icon: Clock,
    title: '定时执行',
    desc: '支持 RRULE 表达式，设置每日/每周/每小时的定时任务',
    color: 'text-yellow-400',
    action: 'templates' as const,
  },
  {
    icon: RefreshCw,
    title: '立即触发',
    desc: '随时手动触发任务执行，实时查看运行结果',
    color: 'text-green-400',
    action: 'tasklist' as const,
  },
  {
    icon: History,
    title: '执行历史',
    desc: '查看完整的任务运行记录和 Token 消耗统计',
    color: 'text-purple-400',
    action: 'history' as const,
  },
];

/** 预设任务模板 */
export const TASK_TEMPLATES = [
  {
    name: '每日代码审查',
    scheduleType: 'recurring' as ScheduleType,
    rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
    prompt: '请审查当前项目的最新代码变更，列出潜在问题、代码风格问题和安全风险，并给出改进建议。',
    icon: '🔍',
  },
  {
    name: '项目文档更新',
    scheduleType: 'recurring' as ScheduleType,
    rrule: 'FREQ=DAILY;BYHOUR=18;BYMINUTE=0',
    prompt: '检查今天的代码变更，更新项目的 README.md 和相关技术文档，确保文档与代码保持同步。',
    icon: '📝',
  },
  {
    name: '依赖安全检查',
    scheduleType: 'recurring' as ScheduleType,
    rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0',
    prompt: '检查项目依赖的安全漏洞，使用 npm audit 或类似工具，生成安全报告和修复建议。',
    icon: '🔒',
  },
  {
    name: '性能分析',
    scheduleType: 'recurring' as ScheduleType,
    rrule: 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=0',
    prompt: '分析代码性能热点和瓶颈，提供优化建议，包括算法复杂度、内存使用、I/O 效率等方面。',
    icon: '⚡',
  },
];

/** 状态标签 */
export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    ACTIVE: { label: '运行中', color: '#10b981', bg: 'bg-emerald-500/10' },
    PAUSED: { label: '已暂停', color: '#f59e0b', bg: 'bg-amber-500/10' },
    COMPLETED: { label: '已完成', color: '#6b7280', bg: 'bg-gray-500/10' },
    ERROR: { label: '异常', color: '#ef4444', bg: 'bg-red-500/10' },
  };
  const c = config[status] || config.PAUSED;
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`}
      style={{ color: c.color }}
    >
      {c.label}
    </span>
  );
}
