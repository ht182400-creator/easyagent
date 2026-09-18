/**
 * Docker 沙箱路由（P1-1 第二批拆分产物）
 *
 * ── ⚠️ 本模块的约定 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. `SandboxManager.getInstance(...)` 是**单例**，管理器的创建与异步 `init()`
 *      随本模块注册发生 —— 与拆分前"在 createApp 内创建"的行为一致
 *      （createApp 被多次调用时 getInstance 返回同一实例，init 幂等）；
 *   3. init 是**不阻塞启动**的异步操作：Docker 不可用时降级为本地进程模式，
 *      每次请求 `/api/sandbox/status` 都会实时探测 Docker 可用性；
 *   4. 沙箱创建时的默认资源限制（512m / 0.5 CPU / 50 pids）是安全兜底，
 *      调整前请评估逃逸风险。
 *
 * @module routes/sandbox
 */

import type { Express } from 'express';
import { SandboxManager, checkDockerAvailability, logger } from '@easyagent/core';

/** 沙箱路由依赖（当前无外部依赖 —— 管理器为自包含单例） */
export type SandboxRoutesDeps = Record<string, never>;

/**
 * 注册 Docker 沙箱路由
 *
 * @param app - Express 应用
 */
export function registerSandboxRoutes(app: Express): void {
  /** 初始化沙箱管理器 */
  const sandboxManager = SandboxManager.getInstance({
    maxSandboxes: 10,
    defaultTimeout: 300000,
    idleTimeout: 600000,
  });
  // 异步初始化 (不阻塞服务启动)
  sandboxManager.init().then((result) => {
    if (result.mode === 'docker') {
      logger.info({ version: result.version }, 'Docker 沙箱系统就绪');
    } else if (result.mode === 'local') {
      logger.warn({ version: result.version }, 'Docker 不可用，沙箱已降级为本地进程模式');
    } else {
      logger.warn('沙箱功能已禁用');
    }
  });

  /** 获取沙箱状态 */
  app.get('/api/sandbox/status', async (_req, res) => {
    try {
      const dockerCheck = await checkDockerAvailability();
      const overview = sandboxManager.getOverview();
      res.json({
        docker: dockerCheck,
        sandbox: overview,
        mode: overview.localMode ? 'local' : dockerCheck.available ? 'docker' : 'disabled',
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 创建沙箱 */
  app.post('/api/sandbox', async (req, res) => {
    try {
      const { image, workspace, readOnly, allowNetwork, memoryLimit, cpuLimit } = req.body;
      const sandbox = await sandboxManager.createSandbox({
        image: image || 'node:20-alpine',
        workspace: workspace || process.cwd(),
        readOnly: !!readOnly,
        allowNetwork: !!allowNetwork,
        limits: {
          memory: memoryLimit || '512m',
          cpuCores: cpuLimit || 0.5,
          maxPids: 50,
        },
      });
      res.json({ success: true, sandbox: sandbox.getStatus() });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 在沙箱中执行命令 */
  app.post('/api/sandbox/:id/exec', async (req, res) => {
    try {
      const { id } = req.params;
      const { command, timeout } = req.body;
      if (!command) {
        return res.status(400).json({ error: '缺少 command 参数' });
      }
      const sandbox = sandboxManager.getSandbox(id);
      if (!sandbox) {
        return res.status(404).json({ error: '沙箱不存在或已过期' });
      }
      const result = await sandbox.exec(command, timeout || 30000);
      res.json({ success: result.success, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 查看沙箱信息 */
  app.get('/api/sandbox/:id', (req, res) => {
    const { id } = req.params;
    const sandbox = sandboxManager.getSandbox(id);
    if (!sandbox) {
      return res.status(404).json({ error: '沙箱不存在或已过期' });
    }
    res.json(sandbox.getStatus());
  });

  /** 销毁沙箱 */
  app.delete('/api/sandbox/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await sandboxManager.destroySandbox(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 列出所有沙箱 */
  app.get('/api/sandbox', (_req, res) => {
    res.json(sandboxManager.listSandboxes());
  });
}
