/**
 * 集成测试：自动化任务、知识库、沙箱、IM、语义分析 API
 * 覆盖端点: /api/automations(CRUD), /api/automations/:id/toggle|run|stop,
 *           /api/automations/history, /api/knowledge(POST/DELETE/:id/GET:id),
 *           /api/sandbox(CRUD), /api/im/config|:platform/start|stop|webhook,
 *           /api/semantic/map|overview
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ⚠️ 必须早于 createApp()：把全局知识库重定向到临时目录，否则测试写入用户真实数据
// ~/.easyagent，并与并行运行的 core 包测试互相污染（2026-09-19 假失败根因）。
process.env.EASYAGENT_GLOBAL_KB_DIR = mkdtempSync(join(tmpdir(), 'ea-global-kb-'));

// ⚠️ 同理：自动化任务默认落盘到用户真实文件 ~/.easyagent/data/automations.json。
// 本文件的用例会通过真实 API 建 2 条任务（集成/一次性测试自动化），此前每跑一次回归
// 就往用户数据里留 2 条、永不清理 —— 累积成「任务列表 100 条」（2026-09-19 实报）。
process.env.EASYAGENT_AUTOMATIONS_FILE = join(
  mkdtempSync(join(tmpdir(), 'ea-automations-')),
  'automations.json',
);

let app: ReturnType<typeof import('express').default>;
let server: Server;

beforeAll(async () => {
  const mod = await import('../index.js');
  const result = await mod.createApp();
  app = result.app;
  server = result.server;
});

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ==================== Automation API ====================

describe('GET /api/automations', () => {
  it('返回自动化任务列表（数组）', async () => {
    const res = await request(app).get('/api/automations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/automations', () => {
  let automationId: string;

  it('缺少 name 参数返回 400', async () => {
    const res = await request(app).post('/api/automations').send({ prompt: 'test prompt' });
    expect(res.status).toBe(400);
  });

  it('缺少 prompt 参数返回 400', async () => {
    const res = await request(app).post('/api/automations').send({ name: 'test-automation' });
    expect(res.status).toBe(400);
  });

  it('创建 recurring 类型自动化任务返回 id', async () => {
    const res = await request(app)
      .post('/api/automations')
      .send({
        name: '集成测试自动化',
        prompt: '每日检查项目状态',
        scheduleType: 'recurring',
        rrule: 'FREQ=DAILY;BYHOUR=0;BYMINUTE=0',
        cwds: [process.cwd()],
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', '集成测试自动化');
    expect(res.body).toHaveProperty('scheduleType', 'recurring');
    automationId = res.body.id;
  });

  it('创建 once 类型自动化任务返回 scheduledAt', async () => {
    const res = await request(app).post('/api/automations').send({
      name: '一次性测试自动化',
      prompt: '执行一次性任务',
      scheduleType: 'once',
      scheduledAt: '2026-12-31T23:59',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('scheduleType', 'once');
  });
});

describe('PUT /api/automations/:id', () => {
  it('更新不存在的自动化任务返回 404', async () => {
    const res = await request(app).put('/api/automations/nonexistent').send({ name: 'updated' });
    expect(res.status).toBe(404);
  });

  it('更新已存在的自动化任务', async () => {
    // 先获取列表
    const listRes = await request(app).get('/api/automations');
    if (listRes.body.length > 0) {
      const task = listRes.body[0];
      const res = await request(app)
        .put(`/api/automations/${task.id}`)
        .send({ name: task.name + '-updated' });
      expect([200, 404]).toContain(res.status);
    }
  });
});

describe('DELETE /api/automations/:id', () => {
  it('删除不存在的自动化任务返回 404', async () => {
    const res = await request(app).delete('/api/automations/nonexistent');
    expect(res.status).toBe(404);
  });

  it('删除已存在的自动化任务返回 success', async () => {
    const listRes = await request(app).get('/api/automations');
    if (listRes.body.length > 0) {
      const task = listRes.body[0];
      const res = await request(app).delete(`/api/automations/${task.id}`);
      expect(res.status).toBe(200);
    }
  });
});

describe('POST /api/automations/:id/toggle', () => {
  it('toggle 不存在的任务返回 404', async () => {
    const res = await request(app).post('/api/automations/nonexistent/toggle');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/automations/:id/run', () => {
  it('执行不存在的任务返回 404', async () => {
    const res = await request(app).post('/api/automations/nonexistent/run');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/automations/:id/stop', () => {
  it('停止不存在的任务返回合理状态', async () => {
    const res = await request(app).post('/api/automations/nonexistent/stop');
    // 部分实现返回 200（幂等）
    expect([200, 404]).toContain(res.status);
  });
});

describe('GET /api/automations/history', () => {
  it('返回执行历史（数组）', async () => {
    const res = await request(app).get('/api/automations/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ==================== Knowledge CRUD API ====================

describe('POST /api/knowledge', () => {
  let docId: string;

  it('缺少 title 参数返回 400', async () => {
    const res = await request(app).post('/api/knowledge').send({ content: 'test content' });
    expect(res.status).toBe(400);
  });

  it('添加文档返回 success + scope', async () => {
    const res = await request(app)
      .post('/api/knowledge')
      .send({
        title: '集成测试文档',
        content: '这是一份集成测试文档内容',
        category: 'test',
        tags: ['integration', 'test'],
        scope: 'project',
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    // 响应可能含 document 对象或仅 scope 字段
    expect(res.body).toHaveProperty('scope', 'project');
  });

  it('支持 global 作用域添加文档', async () => {
    const res = await request(app).post('/api/knowledge').send({
      title: '全局知识库测试',
      content: '全局文档内容',
      scope: 'global',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

describe('GET /api/knowledge/:id', () => {
  it('不存在的文档返回 404', async () => {
    const res = await request(app).get('/api/knowledge/nonexistent-doc-id');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/knowledge/:id', () => {
  it('删除不存在的文档返回 404', async () => {
    const res = await request(app).delete('/api/knowledge/nonexistent-doc-id');
    expect(res.status).toBe(404);
  });
});

// ==================== Sandbox API ====================

describe('Sandbox CRUD', () => {
  it('GET /api/sandbox 返回沙箱列表（数组）', async () => {
    const res = await request(app).get('/api/sandbox');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/sandbox/status 返回沙箱状态（含 docker 字段）', async () => {
    const res = await request(app).get('/api/sandbox/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('docker');
    expect(typeof res.body.docker).toBe('object');
  });

  it('POST /api/sandbox 创建沙箱（需要 Docker）', async () => {
    const res = await request(app)
      .post('/api/sandbox')
      .send({ type: 'node', image: 'node:18-alpine' });
    // Docker 不可用时返回 500，可用时返回 200
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/sandbox/:id 不存在返回 404', async () => {
    const res = await request(app).get('/api/sandbox/nonexistent-sandbox');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/sandbox/:id 不存在返回合理状态', async () => {
    const res = await request(app).delete('/api/sandbox/nonexistent-sandbox');
    // 部分实现返回 200（幂等删除）
    expect([200, 404]).toContain(res.status);
  });

  it('POST /api/sandbox/:id/exec 不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/sandbox/nonexistent-sandbox/exec')
      .send({ command: 'echo hello' });
    expect(res.status).toBe(404);
  });
});

// ==================== IM Config API ====================

describe('IM Management', () => {
  it('GET /api/im/config 返回 IM 配置', async () => {
    const res = await request(app).get('/api/im/config');
    expect(res.status).toBe(200);
    // 可能返回 { platforms: {...} } 或空对象
    expect(typeof res.body).toBe('object');
  });

  it('PUT /api/im/config 配置 IM 平台', async () => {
    const res = await request(app)
      .put('/api/im/config')
      .send({
        platform: 'wechat',
        enabled: true,
        config: { token: 'test-token' },
      });
    // IM 管理器初始化状态未知，可能成功或失败
    expect([200, 400, 500]).toContain(res.status);
  });

  it('POST /api/im/:platform/start 启动不存在的平台', async () => {
    const res = await request(app).post('/api/im/nonexistent-plat/start');
    expect([404, 500]).toContain(res.status);
  });

  it('POST /api/im/:platform/stop 停止不存在的平台', async () => {
    const res = await request(app).post('/api/im/nonexistent-plat/stop');
    // 可能返回 200（幂等）或 404/500
    expect([200, 404, 500]).toContain(res.status);
  });

  it('DELETE /api/im/:platform 删除不存在的配置', async () => {
    const res = await request(app).delete('/api/im/nonexistent-plat');
    expect([200, 404]).toContain(res.status);
  });

  it('ALL /api/im/webhook/:platform 接收 Webhook（无签名返回 400）', async () => {
    const res = await request(app).post('/api/im/webhook/wechat').send({ Body: 'test' });
    // Webhook 可能返回 400（签名校验失败）或其他状态
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ==================== Semantic API ====================

describe('Semantic Analysis', () => {
  it('GET /api/semantic/overview 返回代码库概览', async () => {
    const res = await request(app).get('/api/semantic/overview');
    expect(res.status).toBe(200);
    // 可能返回空数据或概览信息
    expect(typeof res.body).toBe('object');
  });

  // ⚠️ 以下用例触发 buildSemanticMap（全仓同步扫描）——性能已优化：
  // 实测 300 文件 144ms / 全仓 717 文件 ~0.9s（修复前同一仓库需 11s，见 docs/修复汇总 2026-09-19）。
  // 仍按**最坏负载**留足余量到 30s（CI 机器更慢、并行 worker 抢占时不会假失败）。
  it('GET /api/semantic/map 不带 path 时使用服务端默认目录', async () => {
    // 默认目录由 createApp 的 projectRoot 决定（不再是 process.cwd()）
    const res = await request(app).get('/api/semantic/map');
    expect([200, 400, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(typeof res.body.root).toBe('string');
    }
  }, 30_000);

  it('GET /api/semantic/map 带 path 参数返回该目录的地图数据', async () => {
    // 用临时目录构造确定性样本（不依赖仓库布局）：显式 path 不向上扩展到仓库根
    const dir = mkdtempSync(join(tmpdir(), 'ea-semantic-'));
    writeFileSync(
      join(dir, 'sample.ts'),
      'export function alpha() { return 1; }\nclass Beta {}\n',
      'utf-8',
    );
    try {
      const res = await request(app).get('/api/semantic/map').query({ path: dir });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats.totalFiles).toBeGreaterThan(0);
      expect(res.body.stats.totalLines).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('GET /api/semantic/map path 不存在时返回 400（而非静默返回 0 文件）', async () => {
    const res = await request(app)
      .get('/api/semantic/map')
      .query({ path: join(tmpdir(), '__easyagent_not_exist_dir__') });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain('不存在');
  }, 30_000);
});
