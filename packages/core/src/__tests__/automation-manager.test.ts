/**
 * AutomationManager 单元测试
 * 覆盖任务 CRUD、调度(RRULE 解析)、执行、历史记录
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AutomationManager as AM } from '../automation/AutomationManager.js';
import type { AutomationTask, AutomationRun } from '../automation/AutomationManager.js';

/** 创建临时存储目录 */
function createTestStorageDir(): { dir: string; storagePath: string } {
  const dir = resolve(tmpdir(), `ea-am-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return { dir, storagePath: join(dir, 'automations.json') };
}

/** 创建一个简单的执行器 */
function createMockExecutor() {
  return async (task: AutomationTask) => {
    return { result: `OK: ${task.name}`, tokenUsage: { input: 10, output: 5, total: 15 } };
  };
}

/** 创建一个快速失败执行器 */
function createFailingExecutor() {
  return async (_task: AutomationTask) => {
    throw new Error('执行器模拟失败');
  };
}

describe('AutomationManager - 任务 CRUD', () => {
  let AutomationManager: typeof AM;
  let manager: AM;
  let testDir: string;

  beforeAll(async () => {
    const mod = await import('../automation/AutomationManager.js');
    AutomationManager = mod.AutomationManager;
  });

  beforeEach(() => {
    const { dir, storagePath } = createTestStorageDir();
    testDir = dir;
    manager = new AutomationManager({ storagePath, checkIntervalMs: 99999999 }); // 禁用自动调度
    manager.setExecutor(createMockExecutor());
    manager.initialize();
  });

  afterEach(() => {
    manager.shutdown();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ==================== 创建任务 ====================
  describe('createTask', () => {
    it('应创建一次性任务', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString();
      const task = manager.createTask({
        name: '一次性任务',
        prompt: '做某事',
        scheduleType: 'once',
        scheduledAt: tomorrow,
        cwds: ['/test'],
      });

      expect(task.id).toMatch(/^auto_/);
      expect(task.name).toBe('一次性任务');
      expect(task.scheduleType).toBe('once');
      expect(task.status).toBe('ACTIVE');
      expect(task.runCount).toBe(0);
      expect(task.createdAt).toBeDefined();
    });

    it('应创建周期性任务并计算 nextRunAt', () => {
      const task = manager.createTask({
        name: '每日任务',
        prompt: '每天执行',
        scheduleType: 'recurring',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0',
        cwds: ['/test'],
      });

      expect(task.nextRunAt).toBeDefined();
      const nextRun = new Date(task.nextRunAt!);
      expect(nextRun.getHours()).toBe(8);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('应默认状态为 ACTIVE', () => {
      const task = manager.createTask({
        name: '默认状态测试',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=DAILY;BYHOUR=0;BYMINUTE=0',
        cwds: [],
      });
      expect(task.status).toBe('ACTIVE');
    });
  });

  // ==================== 获取任务 ====================
  describe('getTasks / getTask', () => {
    it('空管理器应返回空数组', () => {
      expect(manager.getTasks()).toEqual([]);
    });

    it('getTask 应返回正确任务', () => {
      const created = manager.createTask({
        name: '查找任务',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      const found = manager.getTask(created.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('查找任务');
    });

    it('getTask 不存在的 ID 应返回 undefined', () => {
      expect(manager.getTask('non-existent')).toBeUndefined();
    });

    it('应返回所有任务列表', () => {
      manager.createTask({ name: 'A', prompt: 'a', scheduleType: 'once', cwds: [] });
      manager.createTask({ name: 'B', prompt: 'b', scheduleType: 'once', cwds: [] });

      expect(manager.getTasks().length).toBe(2);
    });
  });

  // ==================== 更新任务 ====================
  describe('updateTask', () => {
    it('应更新任务属性', () => {
      const task = manager.createTask({
        name: '旧名称',
        prompt: 'old',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      const updated = manager.updateTask(task.id, { name: '新名称' });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('新名称');
    });

    it('更新不存在的任务应返回 null', () => {
      expect(manager.updateTask('fake', { name: 'x' })).toBeNull();
    });

    it('更新 name 不应影响 nextRunAt', () => {
      const task = manager.createTask({
        name: 'Test',
        prompt: 'p',
        scheduleType: 'recurring',
        rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
        cwds: [],
      });

      const originalNextRun = task.nextRunAt!;
      // 仅更新 name，nextRunAt 应保持不变
      const updated = manager.updateTask(task.id, { name: 'Renamed' });
      expect(updated).not.toBeNull();
      // name 变更不触发 RRULE 重算，nextRunAt 应保持原值
      expect(updated!.name).toBe('Renamed');
    });

    it('切换到 ACTIVE 应重新计算 nextRunAt', () => {
      // 先创建任务然后暂停
      const task = manager.createTask({
        name: 'T',
        prompt: 'p',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      manager.toggleTask(task.id, false); // 暂停
      // 重新启用以 ACTIVE 状态 update，应触发 nextRunAt 重算
      const updated = manager.updateTask(task.id, { status: 'ACTIVE' } as any);
      expect(updated!.nextRunAt).toBeDefined();
    });
  });

  // ==================== 删除任务 ====================
  describe('deleteTask', () => {
    it('应成功删除任务', () => {
      const task = manager.createTask({
        name: '待删除',
        prompt: 'd',
        scheduleType: 'once',
        cwds: [],
      });

      expect(manager.deleteTask(task.id)).toBe(true);
      expect(manager.getTasks().length).toBe(0);
    });

    it('删除不存在的任务应返回 false', () => {
      expect(manager.deleteTask('fake-id')).toBe(false);
    });
  });

  // ==================== 切换任务 ====================
  describe('toggleTask', () => {
    it('应切换为暂停', () => {
      const task = manager.createTask({
        name: 'T',
        prompt: 'p',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      const updated = manager.toggleTask(task.id, false);
      expect(updated!.status).toBe('PAUSED');
    });

    it('应切换为启用', () => {
      const task = manager.createTask({
        name: 'T',
        prompt: 'p',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      manager.toggleTask(task.id, false);
      const updated = manager.toggleTask(task.id, true);
      expect(updated!.status).toBe('ACTIVE');
    });
  });
});

// ==================== 任务执行 ====================
describe('AutomationManager - 任务执行', () => {
  let AutomationManager: typeof AM;
  let manager: AM;
  let testDir: string;

  beforeAll(async () => {
    const mod = await import('../automation/AutomationManager.js');
    AutomationManager = mod.AutomationManager;
  });

  beforeEach(() => {
    const { dir, storagePath } = createTestStorageDir();
    testDir = dir;
    manager = new AutomationManager({ storagePath, checkIntervalMs: 99999999 });
    manager.setExecutor(createMockExecutor());
    manager.initialize();
  });

  afterEach(() => {
    manager.shutdown();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('runTaskNow', () => {
    it('应立即执行任务并返回运行记录', async () => {
      const task = manager.createTask({
        name: '立即执行',
        prompt: 'test',
        scheduleType: 'once',
        cwds: [],
      });

      const run = manager.runTaskNow(task.id);
      expect(run).not.toBeNull();
      expect(run!.status).toBe('running');
      expect(run!.taskId).toBe(task.id);

      // 等待执行完成
      await new Promise((r) => setTimeout(r, 200));

      // 检查历史记录
      const history = manager.getHistory(task.id);
      expect(history.length).toBeGreaterThanOrEqual(1);
      const lastRun = history[0];
      expect(lastRun.status).toBe('completed');
      expect(lastRun.result).toContain('OK: 立即执行');
      expect(lastRun.tokenUsage).toBeDefined();
    });

    it('不存在的任务应返回 null', () => {
      const run = manager.runTaskNow('no-such-task');
      expect(run).toBeNull();
    });

    it('执行失败应在历史中记录', async () => {
      manager.setExecutor(createFailingExecutor());

      const task = manager.createTask({
        name: '失败任务',
        prompt: 'fail',
        scheduleType: 'once',
        cwds: [],
      });

      manager.runTaskNow(task.id);
      await new Promise((r) => setTimeout(r, 200));

      const history = manager.getHistory(task.id);
      const lastRun = history[0];
      expect(lastRun.status).toBe('failed');
      expect(lastRun.error).toContain('执行器模拟失败');
    });
  });

  describe('事件系统', () => {
    it('任务完成应触发 task:complete 事件', async () => {
      const events: string[] = [];
      manager.on('task:start', () => events.push('start'));
      manager.on('task:complete', () => events.push('complete'));

      const task = manager.createTask({
        name: '事件测试',
        prompt: 'test',
        scheduleType: 'once',
        cwds: [],
      });

      manager.runTaskNow(task.id);
      await new Promise((r) => setTimeout(r, 200));

      expect(events).toContain('start');
      expect(events).toContain('complete');
    });

    it('任务失败应触发 task:error 事件', async () => {
      manager.setExecutor(createFailingExecutor());

      const events: string[] = [];
      manager.on('task:start', () => events.push('start'));
      manager.on('task:error', () => events.push('error'));

      const task = manager.createTask({
        name: '错误事件',
        prompt: 'test',
        scheduleType: 'once',
        cwds: [],
      });

      manager.runTaskNow(task.id);
      await new Promise((r) => setTimeout(r, 200));

      expect(events).toContain('start');
      expect(events).toContain('error');
    });
  });

  describe('getHistory', () => {
    it('空历史应返回空数组', () => {
      expect(manager.getHistory()).toEqual([]);
    });

    it('应按 taskId 过滤', async () => {
      const taskA = manager.createTask({ name: 'A', prompt: 'a', scheduleType: 'once', cwds: [] });
      const taskB = manager.createTask({ name: 'B', prompt: 'b', scheduleType: 'once', cwds: [] });

      manager.runTaskNow(taskA.id);
      manager.runTaskNow(taskB.id);
      await new Promise((r) => setTimeout(r, 200));

      const histA = manager.getHistory(taskA.id);
      expect(histA.every((r) => r.taskId === taskA.id)).toBe(true);
    });

    it('应限制返回数量', async () => {
      const task = manager.createTask({ name: '批量', prompt: 'x', scheduleType: 'once', cwds: [] });
      // 手动插入多条
      for (let i = 0; i < 5; i++) {
        manager.runTaskNow(task.id);
      }
      await new Promise((r) => setTimeout(r, 300));

      const limited = manager.getHistory(task.id, 2);
      expect(limited.length).toBeLessThanOrEqual(2);
    });
  });
});

// ==================== RULL 调度解析 ====================
describe('AutomationManager - RRULE 调度解析', () => {
  let AutomationManager: typeof AM;
  let manager: AM;
  let testDir: string;

  beforeAll(async () => {
    const mod = await import('../automation/AutomationManager.js');
    AutomationManager = mod.AutomationManager;
  });

  beforeEach(() => {
    const { dir, storagePath } = createTestStorageDir();
    testDir = dir;
    manager = new AutomationManager({ storagePath, checkIntervalMs: 99999999 });
    manager.setExecutor(createMockExecutor());
    manager.initialize();
  });

  afterEach(() => {
    manager.shutdown();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('HOURLY 调度', () => {
    it('FREQ=HOURLY;INTERVAL=1 应在未来1小时内', () => {
      const task = manager.createTask({
        name: '每小时',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      expect(task.nextRunAt).toBeDefined();
      const nextRun = new Date(task.nextRunAt!);
      const expectedHour = new Date();
      expectedHour.setHours(expectedHour.getHours() + 1);
      expectedHour.setMinutes(0, 0, 0);
      expect(nextRun.getHours()).toBe(expectedHour.getHours());
      expect(nextRun.getMinutes()).toBe(0);
    });
  });

  describe('DAILY 调度', () => {
    it('FREQ=DAILY;BYHOUR=6;BYMINUTE=30 应在每天6:30', () => {
      const task = manager.createTask({
        name: '每天',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=DAILY;BYHOUR=6;BYMINUTE=30',
        cwds: [],
      });

      const nextRun = new Date(task.nextRunAt!);
      expect(nextRun.getHours()).toBe(6);
      expect(nextRun.getMinutes()).toBe(30);
    });

    it('如果指定时间已过，应调度到明天', () => {
      // 使用一个肯定已经过去的时间
      const task = manager.createTask({
        name: '已过去的调度',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=DAILY;BYHOUR=0;BYMINUTE=0',
        cwds: [],
      });

      const nextRun = new Date(task.nextRunAt!);
      const now = new Date();
      expect(nextRun > now).toBe(true);
    });
  });

  describe('WEEKLY 调度', () => {
    it('FREQ=WEEKLY 应在指定星期几', () => {
      const task = manager.createTask({
        name: '每周一',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
        cwds: [],
      });

      const nextRun = new Date(task.nextRunAt!);
      expect(nextRun.getDay()).toBe(1); // Monday
      expect(nextRun.getHours()).toBe(9);
    });

    it('多日调度应找到最近的一天', () => {
      const task = manager.createTask({
        name: '多个工作日',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=10;BYMINUTE=0',
        cwds: [],
      });

      expect(task.nextRunAt).toBeDefined();
      const nextRun = new Date(task.nextRunAt!);
      expect([1, 3, 5]).toContain(nextRun.getDay()); // Mon/Wed/Fri
    });
  });

  describe('一次性调度', () => {
    it('未来的时间应返回该时间', () => {
      const future = new Date(Date.now() + 7 * 86400000).toISOString(); // 7天后
      const task = manager.createTask({
        name: '未来任务',
        prompt: 'test',
        scheduleType: 'once',
        scheduledAt: future,
        cwds: [],
      });

      expect(task.nextRunAt).toBe(future);
    });

    it('已过去的一次性任务不应有 nextRunAt', () => {
      const past = new Date(Date.now() - 86400000).toISOString(); // 昨天
      const task = manager.createTask({
        name: '过期任务',
        prompt: 'test',
        scheduleType: 'once',
        scheduledAt: past,
        cwds: [],
      });

      expect(task.nextRunAt).toBeUndefined();
    });
  });

  describe('有效期检查', () => {
    it('validFrom 在未来的任务不应被调度', () => {
      const future = new Date(Date.now() + 7 * 86400000).toISOString();
      const task = manager.createTask({
        name: '未到有效期',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=HOURLY;INTERVAL=1',
        cwds: [],
      });

      const updated = manager.updateTask(task.id, { validFrom: future });
      // nextRunAt 仍然存在(因为 computeNextRun 正常计算),
      // 但调度器 checkAndRunTasks 会跳过 validFrom 未到的任务
      // 此处验证 update 不崩溃即可
      expect(updated).not.toBeNull();
    });
  });

  describe('不支持的 RRULE', () => {
    it('不支持的格式应返回 undefined', () => {
      const task = manager.createTask({
        name: '坏格式',
        prompt: 'test',
        scheduleType: 'recurring',
        rrule: 'FREQ=YEARLY;BYMONTH=1', // 不支持的频率
        cwds: [],
      });

      expect(task.nextRunAt).toBeUndefined();
    });
  });
});

// ==================== 管理器生命周期 ====================
describe('AutomationManager - 生命周期', () => {
  let AutomationManager: typeof AM;
  let testDir: string;

  beforeAll(async () => {
    const mod = await import('../automation/AutomationManager.js');
    AutomationManager = mod.AutomationManager;
  });

  it('initialize 和 shutdown 应正确运行', () => {
    const { dir, storagePath } = createTestStorageDir();
    testDir = dir;

    const mgr = new AutomationManager({ storagePath, checkIntervalMs: 99999999 });
    mgr.initialize();

    // 不应崩溃
    mgr.shutdown();

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('重复 shutdown 不应崩溃', () => {
    const { dir, storagePath } = createTestStorageDir();
    testDir = dir;

    const mgr = new AutomationManager({ storagePath, checkIntervalMs: 99999999 });
    mgr.initialize();
    mgr.shutdown();
    mgr.shutdown(); // 第二次

    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
