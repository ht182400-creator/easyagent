/**
 * 自动化任务 API 路由
 *
 * 从 `index.ts` 拆出（P1-1 第一阶段）。纯搬迁：路径/方法/逻辑/注册顺序不变。
 *
 * @module routes/automations
 */

import type { Express } from 'express';
import type { AutomationManager } from '@easyagent/core';
import type { QuestionBroker } from '../hitl.js';

// ===================== 依赖声明 =====================

/** 自动化路由所需依赖 */
export interface AutomationRoutesDeps {
  /** 自动化任务管理器（已在 createApp 中初始化并设置执行器） */
  automationManager: AutomationManager;
  /** 人在环路提问代理（Agent 提问 → 用户回答） */
  questionBroker: QuestionBroker;
}

// ===================== 路由注册 =====================

/**
 * 注册自动化任务相关路由
 *
 * @param app - Express 应用
 * @param deps - 依赖（见 {@link AutomationRoutesDeps}）
 */
export function registerAutomationRoutes(app: Express, deps: AutomationRoutesDeps): void {
  const { automationManager, questionBroker } = deps;

  // ========== 人在环路（HITL）：Agent 提问与回答 ==========

  /** 当前待回答的 Agent 提问（页面刷新后可恢复显示） */
  app.get('/api/agent/questions', (_req, res) => {
    res.json(questionBroker.list());
  });

  /** 提交用户回答（Agent 会带着这个回答继续执行） */
  app.post('/api/agent/answer', (req, res) => {
    try {
      const { questionId, answer } = req.body as { questionId?: string; answer?: string };
      if (!questionId || typeof answer !== 'string') {
        return res.status(400).json({ error: '缺少 questionId 或 answer' });
      }
      const ok = questionBroker.answer(questionId, answer);
      if (!ok) {
        // 已超时 / 已回答 / 不存在 —— 对用户来说是"这个问题不需要再答了"
        return res.status(404).json({ success: false, error: '该问题已过期或已回答' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ========== 自动化任务 API ==========

  /** 获取自动化任务列表 */
  app.get('/api/automations', (_req, res) => {
    try {
      const tasks = automationManager.getTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 创建自动化任务 */
  app.post('/api/automations', (req, res) => {
    try {
      const {
        id,
        name,
        prompt,
        scheduleType,
        rrule,
        scheduledAt,
        cwds,
        validFrom,
        validUntil,
        maxDurationMinutes,
        provider,
        model,
      } = req.body;
      if (!name) {
        return res.status(400).json({ error: '缺少 name 参数' });
      }
      if (!prompt) {
        return res.status(400).json({ error: '缺少 prompt 参数' });
      }
      const task = automationManager.createTask({
        id,
        name,
        prompt,
        scheduleType: scheduleType || 'recurring',
        rrule,
        scheduledAt,
        cwds: cwds || [process.cwd()],
        validFrom,
        validUntil,
        maxDurationMinutes,
        provider,
        model,
      });
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 更新自动化任务 */
  app.put('/api/automations/:id', (req, res) => {
    try {
      const updated = automationManager.updateTask(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: '任务不存在' });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 删除自动化任务 */
  app.delete('/api/automations/:id', (req, res) => {
    try {
      const deleted = automationManager.deleteTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: '任务不存在' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 切换任务启用/暂停 */
  app.post('/api/automations/:id/toggle', (req, res) => {
    try {
      const { active } = req.body;
      const updated = automationManager.toggleTask(req.params.id, !!active);
      if (!updated) {
        return res.status(404).json({ error: '任务不存在' });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 立即执行任务 */
  app.post('/api/automations/:id/run', (req, res) => {
    try {
      const run = automationManager.runTaskNow(req.params.id);
      if (!run) {
        return res.status(404).json({ error: '任务不存在或无法执行' });
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 停止任务 */
  app.post('/api/automations/:id/stop', (req, res) => {
    try {
      const stopped = automationManager.stopTask(req.params.id);
      // 释放等待中的提问：否则工具调用会一直挂着（HITL 的 Promise 永不落地）
      const cancelled = questionBroker.cancelAll('任务已停止');
      res.json({ success: true, stopped, cancelledQuestions: cancelled });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 获取执行历史 */
  app.get('/api/automations/history', (req, res) => {
    try {
      const { taskId, limit } = req.query;
      const history = automationManager.getHistory(
        taskId as string | undefined,
        limit ? parseInt(limit as string) : 50,
      );
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
}
