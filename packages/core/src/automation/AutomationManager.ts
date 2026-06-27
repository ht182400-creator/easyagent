/**
 * 自动化任务管理器
 * 管理定时/一次性任务的调度、执行和历史记录
 * 数据持久化在 {userHome}/.easyagent/data/automations.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';
import { EventEmitter } from 'node:events';

/** 调度类型 */
export type ScheduleType = 'recurring' | 'once';

/** 任务状态 */
export type TaskStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ERROR';

/** 运行状态 */
export type RunStatus = 'running' | 'completed' | 'failed' | 'timeout';

/** 自动化任务定义 */
export interface AutomationTask {
  id: string;
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  /** iCalendar RRULE (recurring) 或 null */
  rrule?: string;
  /** ISO 8601 datetime (once) */
  scheduledAt?: string;
  /** 工作区路径列表 */
  cwds: string[];
  status: TaskStatus;
  validFrom?: string;
  validUntil?: string;
  maxDurationMinutes?: number;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  runCount: number;
  /** 当前运行的控制ID，null 表示未在运行 */
  abortControllerId?: string;
  /** 指定的模型提供商 */
  provider?: string;
  /** 指定的模型 */
  model?: string;
}

/** 执行记录 */
export interface AutomationRun {
  id: string;
  taskId: string;
  taskName: string;
  startTime: string;
  endTime?: string;
  status: RunStatus;
  result?: string;
  error?: string;
  tokenUsage?: { input: number; output: number; total: number };
}

/** 自动化管理器配置 */
export interface AutomationManagerOptions {
  /** 数据存储路径 */
  storagePath?: string;
  /** 检查间隔(毫秒)，默认 30000 (30秒) */
  checkIntervalMs?: number;
  /** 执行任务回调: 返回 { result, tokenUsage } */
  executor?: (
    task: AutomationTask,
  ) => Promise<{ result: string; tokenUsage?: { input: number; output: number; total: number } }>;
}

/** 自动化事件 */
export interface AutomationEvents {
  'task:start': (task: AutomationTask, run: AutomationRun) => void;
  'task:complete': (task: AutomationTask, run: AutomationRun) => void;
  'task:error': (task: AutomationTask, run: AutomationRun) => void;
}

/**
 * 自动化任务管理器
 * 负责任务的增删改查、定时调度、执行触发
 */
export class AutomationManager extends EventEmitter {
  private storagePath: string;
  private checkIntervalMs: number;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private executor: (
    task: AutomationTask,
  ) => Promise<{ result: string; tokenUsage?: { input: number; output: number; total: number } }>;
  private runningTasks: Map<string, AbortController> = new Map();

  constructor(options: AutomationManagerOptions = {}) {
    super();
    this.storagePath =
      options.storagePath || join(homedir(), '.easyagent', 'data', 'automations.json');
    this.checkIntervalMs = options.checkIntervalMs || 30000;

    // 默认执行器: 仅记录日志
    this.executor =
      options.executor ||
      (async (task) => {
        logger.info({ task: task.name }, '默认执行器: 无实际任务执行');
        return { result: `[占位] 任务 "${task.name}" 执行完成` };
      });
  }

  /** 初始化: 加载任务并启动调度器 */
  initialize(): void {
    this.ensureStorageDir();
    this.startScheduler();
    logger.info({ path: this.storagePath, interval: this.checkIntervalMs }, '自动化管理器已初始化');
  }

  /** 关闭管理器 */
  shutdown(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    // 取消所有运行中的任务
    for (const [id, controller] of this.runningTasks) {
      controller.abort();
      logger.info({ taskId: id }, '关闭时终止运行中的任务');
    }
    this.runningTasks.clear();
    logger.info('自动化管理器已关闭');
  }

  /** 设置执行器 */
  setExecutor(
    executor: (
      task: AutomationTask,
    ) => Promise<{ result: string; tokenUsage?: { input: number; output: number; total: number } }>,
  ): void {
    this.executor = executor;
  }

  // ===================== 任务 CRUD =====================

  /** 获取所有任务 */
  getTasks(): AutomationTask[] {
    return this.loadTasks();
  }

  /** 获取单个任务 */
  getTask(id: string): AutomationTask | undefined {
    return this.loadTasks().find((t) => t.id === id);
  }

  /** 创建任务 */
  createTask(
    task: Omit<AutomationTask, 'createdAt' | 'runCount' | 'status' | 'id'> & { id?: string },
  ): AutomationTask {
    const tasks = this.loadTasks();

    const newTask: AutomationTask = {
      ...task,
      id: task.id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      runCount: 0,
    };

    // 计算首次运行时间
    if (newTask.status === 'ACTIVE') {
      newTask.nextRunAt = this.computeNextRun(newTask);
    }

    tasks.push(newTask);
    this.saveTasks(tasks);

    logger.info(
      { id: newTask.id, name: newTask.name, scheduleType: newTask.scheduleType },
      '自动化任务已创建',
    );
    return newTask;
  }

  /** 更新任务 */
  updateTask(id: string, updates: Partial<AutomationTask>): AutomationTask | null {
    const tasks = this.loadTasks();
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;

    tasks[index] = { ...tasks[index], ...updates };
    // 状态变更时重新计算下次运行时间
    if (
      updates.status === 'ACTIVE' ||
      updates.rrule ||
      updates.scheduledAt ||
      updates.scheduleType
    ) {
      tasks[index].nextRunAt = this.computeNextRun(tasks[index]);
    }
    this.saveTasks(tasks);

    logger.info({ id, updates: Object.keys(updates) }, '自动化任务已更新');
    return tasks[index];
  }

  /** 删除任务 */
  deleteTask(id: string): boolean {
    const tasks = this.loadTasks();
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === tasks.length) return false;

    // 取消正在运行的任务
    if (this.runningTasks.has(id)) {
      this.runningTasks.get(id)!.abort();
      this.runningTasks.delete(id);
    }

    this.saveTasks(filtered);
    logger.info({ id }, '自动化任务已删除');
    return true;
  }

  /** 切换任务启用/暂停 */
  toggleTask(id: string, active: boolean): AutomationTask | null {
    return this.updateTask(id, {
      status: active ? 'ACTIVE' : 'PAUSED',
    } as Partial<AutomationTask>);
  }

  // ===================== 任务执行 =====================

  /** 立即执行任务 */
  runTaskNow(id: string): AutomationRun | null {
    const task = this.getTask(id);
    if (!task) {
      logger.warn({ id }, '立即执行失败: 任务不存在');
      return null;
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const run: AutomationRun = {
      id: runId,
      taskId: id,
      taskName: task.name,
      startTime: new Date().toISOString(),
      status: 'running',
    };

    // 保存运行记录
    this.saveRun(run);

    // 异步执行 (不阻塞)
    this.executeTask(task, run).catch((err) => {
      logger.error({ taskId: id, error: (err as Error).message }, '任务执行异常');
    });

    return run;
  }

  /** 停止运行中的任务 */
  stopTask(id: string): boolean {
    const controller = this.runningTasks.get(id);
    if (!controller) return false;

    controller.abort();
    this.runningTasks.delete(id);
    logger.info({ taskId: id }, '任务已停止');
    return true;
  }

  /** 获取执行历史 */
  getHistory(taskId?: string, limit = 50): AutomationRun[] {
    const runs = this.loadHistory();
    let filtered = taskId ? runs.filter((r) => r.taskId === taskId) : runs;
    return filtered.slice(0, limit);
  }

  // ===================== 调度器 =====================

  /** 启动调度循环 */
  private startScheduler(): void {
    if (this.checkTimer) return;
    this.checkTimer = setInterval(() => this.checkAndRunTasks(), this.checkIntervalMs);
    // 启动后立即检查一次
    this.checkAndRunTasks();
  }

  /** 检查到期任务并执行 */
  private async checkAndRunTasks(): Promise<void> {
    const now = new Date();
    const tasks = this.loadTasks();

    for (const task of tasks) {
      if (task.status !== 'ACTIVE') continue;
      if (!task.nextRunAt) continue;

      // 检查有效期
      if (task.validUntil && new Date(task.validUntil) < now) {
        this.updateTask(task.id, { status: 'COMPLETED' } as Partial<AutomationTask>);
        continue;
      }
      if (task.validFrom && new Date(task.validFrom) > now) continue;

      // 检查是否到期
      const nextRun = new Date(task.nextRunAt);
      if (nextRun > now) continue;

      // 如果已经在运行，跳过
      if (this.runningTasks.has(task.id)) continue;

      // 执行任务
      const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const run: AutomationRun = {
        id: runId,
        taskId: task.id,
        taskName: task.name,
        startTime: new Date().toISOString(),
        status: 'running',
      };
      this.saveRun(run);

      // 计算下次运行时间
      const nextRunAt = this.computeNextRun(task);
      this.updateTaskSilent(task.id, {
        nextRunAt,
        lastRunAt: new Date().toISOString(),
      });

      // 异步执行
      this.executeTask(task, run).catch((err) => {
        logger.error({ taskId: task.id, error: (err as Error).message }, '调度执行异常');
      });
    }
  }

  /** 静默更新 (不触发日志) */
  private updateTaskSilent(id: string, updates: Partial<AutomationTask>): void {
    const tasks = this.loadTasks();
    const index = tasks.findIndex((t) => t.id === id);
    if (index === -1) return;
    tasks[index] = { ...tasks[index], ...updates };
    this.saveTasks(tasks);
  }

  /** 计算下次运行时间 */
  private computeNextRun(task: AutomationTask): string | undefined {
    if (task.status !== 'ACTIVE') return undefined;

    if (task.scheduleType === 'once' && task.scheduledAt) {
      const scheduled = new Date(task.scheduledAt);
      // 如果一次性任务尚未执行且未来时间
      if (scheduled > new Date() && !task.lastRunAt) {
        return task.scheduledAt;
      }
      return undefined;
    }

    if (task.scheduleType === 'recurring' && task.rrule) {
      return this.computeNextRecurring(task.rrule);
    }

    return undefined;
  }

  /**
   * 解析简单 RRULE 并计算下次执行时间
   * 支持格式:
   *   FREQ=HOURLY;INTERVAL=N
   *   FREQ=DAILY;BYHOUR=N;BYMINUTE=N
   *   FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=N;BYMINUTE=N
   */
  private computeNextRecurring(rrule: string): string | undefined {
    try {
      const parts = rrule.split(';').reduce(
        (acc, part) => {
          const [key, val] = part.split('=');
          acc[key.trim()] = val?.trim() || '';
          return acc;
        },
        {} as Record<string, string>,
      );

      const now = new Date();

      if (parts.FREQ === 'HOURLY') {
        const interval = parseInt(parts.INTERVAL || '1', 10);
        const next = new Date(now);
        next.setHours(next.getHours() + interval);
        next.setMinutes(0, 0, 0);
        return next.toISOString();
      }

      if (parts.FREQ === 'DAILY') {
        const hour = parseInt(parts.BYHOUR || '0', 10);
        const minute = parseInt(parts.BYMINUTE || '0', 10);
        const next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next.toISOString();
      }

      if (parts.FREQ === 'WEEKLY') {
        const hour = parseInt(parts.BYHOUR || '0', 10);
        const minute = parseInt(parts.BYMINUTE || '0', 10);
        const days = (parts.BYDAY || 'MO').split(',');

        const dayMap: Record<string, number> = {
          MO: 1,
          TU: 2,
          WE: 3,
          TH: 4,
          FR: 5,
          SA: 6,
          SU: 0,
        };

        const nowDay = now.getDay();
        const nowHour = now.getHours();
        const nowMin = now.getMinutes();

        // 找到下一个匹配的星期几
        const targetDays = days.map((d) => dayMap[d.trim()]).filter((d) => d !== undefined);
        if (targetDays.length === 0) return undefined;

        let next: Date | null = null;
        for (let offset = 0; offset <= 7; offset++) {
          const check = new Date(now);
          check.setDate(check.getDate() + offset);
          check.setHours(hour, minute, 0, 0);

          const checkDay = check.getDay();
          if (targetDays.includes(checkDay)) {
            if (offset === 0 && (nowHour > hour || (nowHour === hour && nowMin >= minute))) {
              continue; // 在同一天但已过时间
            }
            next = check;
            break;
          }
        }

        return next?.toISOString();
      }

      logger.warn({ rrule }, '不支持的 RRULE 格式');
      return undefined;
    } catch (error) {
      logger.error({ rrule, error: (error as Error).message }, 'RRULE 解析失败');
      return undefined;
    }
  }

  /** 执行单个任务 */
  private async executeTask(task: AutomationTask, run: AutomationRun): Promise<void> {
    const controller = new AbortController();
    this.runningTasks.set(task.id, controller);

    this.emit('task:start', task, run);
    logger.info({ taskId: task.id, name: task.name }, '开始执行自动化任务');

    try {
      // 超时控制
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      if (task.maxDurationMinutes) {
        timeoutHandle = setTimeout(
          () => {
            controller.abort();
          },
          task.maxDurationMinutes * 60 * 1000,
        );
      }

      const execResult = await this.executor(task);

      if (timeoutHandle) clearTimeout(timeoutHandle);

      // 取消信号检查
      if (controller.signal.aborted) {
        run.status = 'failed';
        run.error = '任务被手动停止';
        run.endTime = new Date().toISOString();
      } else {
        run.status = 'completed';
        run.result = execResult.result;
        run.tokenUsage = execResult.tokenUsage;
        run.endTime = new Date().toISOString();
      }

      this.saveRun(run);
      this.updateTaskSilent(task.id, { runCount: task.runCount + 1 } as Partial<AutomationTask>);

      this.emit('task:complete', task, run);
      logger.info({ taskId: task.id, runId: run.id, status: run.status }, '任务执行完成');
    } catch (error) {
      run.status = controller.signal.aborted ? 'timeout' : 'failed';
      run.error = (error as Error).message;
      run.endTime = new Date().toISOString();

      this.saveRun(run);
      this.emit('task:error', task, run);
      logger.error({ taskId: task.id, error: (error as Error).message }, '任务执行失败');
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  // ===================== 持久化 =====================

  private ensureStorageDir(): void {
    const dir = this.storagePath.replace(/[/\\][^/\\]+$/, '');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private loadTasks(): AutomationTask[] {
    try {
      if (!existsSync(this.storagePath)) return [];
      return JSON.parse(readFileSync(this.storagePath, 'utf-8'));
    } catch (err) {
      return [];
    }
  }

  private saveTasks(tasks: AutomationTask[]): void {
    this.ensureStorageDir();
    writeFileSync(this.storagePath, JSON.stringify(tasks, null, 2), 'utf-8');
  }

  /** 运行历史存储路径 */
  private get historyPath(): string {
    return this.storagePath.replace('.json', '_history.json');
  }

  private loadHistory(): AutomationRun[] {
    try {
      const path = this.historyPath;
      if (!existsSync(path)) return [];
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch (err) {
      return [];
    }
  }

  private saveRun(run: AutomationRun): void {
    const runs = this.loadHistory();
    const idx = runs.findIndex((r) => r.id === run.id);
    if (idx >= 0) {
      runs[idx] = run;
    } else {
      runs.unshift(run);
    }
    // 最多保留 500 条记录
    writeFileSync(this.historyPath, JSON.stringify(runs.slice(0, 500), null, 2), 'utf-8');
  }
}
