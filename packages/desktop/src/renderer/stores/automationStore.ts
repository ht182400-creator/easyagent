/**
 * 自动化任务状态管理
 * 管理: 定时任务、一次性任务、任务历史、任务模板
 */
import { create } from 'zustand';
import { useAppStore } from './appStore';
import { apiFetch } from '../api';

/** 调度类型 */
export type ScheduleType = 'recurring' | 'once';

/** 任务状态 */
export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ERROR';

/** 自动化任务 */
export interface AutomationTask {
  id: string;
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  /** iCalendar RRULE 格式 (recurring) */
  rrule?: string;
  /** ISO 8601 datetime (once) */
  scheduledAt?: string;
  /** 工作区路径列表 */
  cwds: string[];
  status: TaskStatus;
  /** 有效期 */
  validFrom?: string;
  validUntil?: string;
  /** 最大执行时间(分钟) */
  maxDurationMinutes?: number;
  /** 上次运行时间 */
  lastRunAt?: string;
  /** 下次运行时间 */
  nextRunAt?: string;
  /** 创建时间 */
  createdAt: string;
  /** 运行次数 */
  runCount: number;
  /** 指定的模型提供商（不选则用默认） */
  provider?: string;
  /** 指定的模型（不选则用默认） */
  model?: string;
}

/** 任务执行记录 */
export interface AutomationRun {
  id: string;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  result?: string;
  error?: string;
  tokenUsage?: { input: number; output: number; total: number };
}

/** 任务执行过程的实时进度日志条目 */
export interface AutomationProgressLog {
  timestamp: number;
  type: 'agent_start' | 'agent_turn' | 'tool_call' | 'tool_result' | 'agent_done' | 'agent_error';
  message: string;
  detail?: string;
}

/** WebSocket 推送的自动化进度事件 */
export interface AutomationProgressEvent extends AutomationProgressLog {
  taskId: string;
  taskName: string;
}

interface AutomationState {
  /** 任务列表 */
  tasks: AutomationTask[];
  /** 执行历史 */
  history: AutomationRun[];
  /** 加载状态 */
  loading: boolean;
  /** 当前正在运行的任务ID列表 */
  running: Set<string>;
  /** 最近一次执行记录 */
  lastRun: AutomationRun | null;
  /** 任务实时进度日志: taskId → 日志列表 */
  progressLogs: Map<string, AutomationProgressLog[]>;

  // Actions
  fetchTasks: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  createTask: (task: Omit<AutomationTask, 'id' | 'createdAt' | 'runCount'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<AutomationTask>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleTask: (id: string, active: boolean) => Promise<void>;
  runTaskNow: (id: string) => Promise<void>;
  stopTask: (id: string) => void;
  /** 添加任务进度日志 */
  addProgressLog: (taskId: string, log: AutomationProgressLog) => void;
  /** 清除任务进度日志 */
  clearProgressLogs: (taskId: string) => void;
}

/**
 * 自动化任务 Store
 * 管理定时/一次性任务的创建、执行和监控
 */
export const useAutomationStore = create<AutomationState>((set, get) => ({
  tasks: [],
  history: [],
  loading: false,
  running: new Set(),
  lastRun: null,
  progressLogs: new Map(),

  fetchTasks: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<any[]>('/api/automations');
      set({ tasks: Array.isArray(data) ? data : [], loading: false });
    } catch (err) {
      set({ loading: false });
    }
  },

  fetchHistory: async () => {
    try {
      const data = await apiFetch<any[]>('/api/automations/history');
      set({ history: Array.isArray(data) ? data : [] });
    } catch (err) { /* ignore */ }
  },

  createTask: async (task) => {
    const newTask: AutomationTask = {
      ...task,
      id: `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      runCount: 0,
    };

    set((s) => ({ tasks: [...s.tasks, newTask] }));

    useAppStore.getState().addNotification({
      type: 'success',
      message: `自动化任务 "${task.name}" 已创建`,
    });

    try {
      const serverTask = await apiFetch<any>('/api/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      });
      // 用服务端返回的任务（含正确 ID）替换本地副本
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === newTask.id ? serverTask : t)),
      }));
    } catch (err) { /* 本地存储 */ }
  },

  updateTask: async (id, updates) => {
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));

    try {
      await apiFetch(`/api/automations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (err) { /* ignore */ }
  },

  deleteTask: async (id) => {
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
    }));

    useAppStore.getState().addNotification({
      type: 'info',
      message: '自动化任务已删除',
      duration: 2000,
    });

    try {
      await apiFetch(`/api/automations/${id}`, { method: 'DELETE' });
    } catch (err) { /* ignore */ }
  },

  toggleTask: async (id, active) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: active ? 'ACTIVE' : 'PAUSED' } : t
      ),
    }));

    try {
      await apiFetch(`/api/automations/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
    } catch (err) { /* ignore */ }
  },

  runTaskNow: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return;

    // 清除上一次的进度日志
    get().clearProgressLogs(id);

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newRun: AutomationRun = {
      id: runId,
      taskId: id,
      taskName: task.name,
      startTime: new Date().toISOString(),
      status: 'running',
    };

    set((s) => ({
      running: new Set([...s.running, id]),
      history: [newRun, ...s.history],
    }));

    useAppStore.getState().addNotification({
      type: 'info',
      message: `正在执行任务: ${task.name}`,
    });

    // 通过 API 触发服务端执行
    try {
      const serverRun = await apiFetch<any>(`/api/automations/${id}/run`, { method: 'POST' });
      // 服务端已开始执行，等待完成通知
      // 轮询检查任务状态
      let attempts = 0;
      const maxAttempts = 120; // 最多等 2 分钟
      if (serverRun) {
      while (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
        attempts++;

        // 检查是否被手动停止
        if (!get().running.has(id)) {
          return;
        }

        // 拉取最新历史
        try {
          const history: AutomationRun[] = await apiFetch<any[]>(`/api/automations/history?taskId=${id}&limit=1`);
            const latest = history[0];
            if (latest && latest.status !== 'running') {
                // 执行完成
                set((s) => {
                  const newRunning = new Set(s.running);
                  newRunning.delete(id);
                  return {
                    running: newRunning,
                    history: s.history.map((h) =>
                      h.id === runId ? { ...latest, id: runId } : h
                    ),
                    tasks: s.tasks.map((t) =>
                      t.id === id
                        ? { ...t, lastRunAt: latest.endTime || new Date().toISOString(), runCount: t.runCount + 1 }
                        : t
                    ),
                    lastRun: { ...latest, id: runId },
                  };
                });

                useAppStore.getState().addNotification({
                  type: latest.status === 'completed' ? 'success' : 'error',
                  message: `任务 "${task.name}" ${latest.status === 'completed' ? '执行完成' : '执行失败'}`,
                  duration: 3000,
                });
                return;
              }
          } catch (err) { /* 继续轮询 */ }
        }

        // 超时
        set((s) => {
          const newRunning = new Set(s.running);
          newRunning.delete(id);
          return { running: newRunning };
        });
        useAppStore.getState().addNotification({
          type: 'warning',
          message: `任务 "${task.name}" 执行超时`,
        });
      } else {
        throw new Error('API 调用失败');
      }
    } catch (err) {
      set((s) => {
        const newRunning = new Set(s.running);
        newRunning.delete(id);
        const failedRun: AutomationRun = {
          ...newRun,
          endTime: new Date().toISOString(),
          status: 'failed',
          error: (err as Error).message,
        };
        return {
          running: newRunning,
          history: s.history.map((h) => (h.id === runId ? failedRun : h)),
          lastRun: failedRun,
        };
      });
      useAppStore.getState().addNotification({
        type: 'error',
        message: `任务执行失败: ${(err as Error).message}`,
      });
    }
  },

  stopTask: (id) => {
    set((s) => {
      const newRunning = new Set(s.running);
      newRunning.delete(id);
      return { running: newRunning };
    });

    // 通知服务端停止
    apiFetch(`/api/automations/${id}/stop`, { method: 'POST' }).catch(() => {});

    useAppStore.getState().addNotification({
      type: 'warning',
      message: '任务已停止',
      duration: 2000,
    });
  },

  /** 添加任务实时进度日志（最多保留 100 条） */
  addProgressLog: (taskId, log) => {
    set((s) => {
      const logs = [...(s.progressLogs.get(taskId) || [])];
      logs.push(log);
      if (logs.length > 100) logs.shift();
      const newMap = new Map(s.progressLogs);
      newMap.set(taskId, logs);
      return { progressLogs: newMap };
    });
  },

  /** 清除指定任务的进度日志 */
  clearProgressLogs: (taskId) => {
    set((s) => {
      const newMap = new Map(s.progressLogs);
      newMap.delete(taskId);
      return { progressLogs: newMap };
    });
  },
}));

/** 任务状态颜色 */
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  ACTIVE: '#10b981',
  PAUSED: '#f59e0b',
  COMPLETED: '#6b7280',
  ERROR: '#ef4444',
};

/** 调度频率预设 */
export const SCHEDULE_PRESETS = [
  { label: '每小时', rrule: 'FREQ=HOURLY;INTERVAL=1' },
  { label: '每天 9:00', rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0' },
  { label: '每天 0:00', rrule: 'FREQ=DAILY;BYHOUR=0;BYMINUTE=0' },
  { label: '每周一 9:00', rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0' },
  { label: '每周五 17:00', rrule: 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=0' },
];
