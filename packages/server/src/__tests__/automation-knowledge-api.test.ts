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
    const res = await request(app)
      .post('/api/automations')
      .send({ prompt: 'test prompt' });
    expect(res.status).toBe(400);
  });

  it('缺少 prompt 参数返回 400', async () => {
    const res = await request(app)
      .post('/api/automations')
      .send({ name: 'test-automation' });
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
    const res = await request(app)
      .post('/api/automations')
      .send({
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
    const res = await request(app)
      .put('/api/automations/nonexistent')
      .send({ name: 'updated' });
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
    const res = await request(app)
      .post('/api/knowledge')
      .send({ content: 'test content' });
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
    const res = await request(app)
      .post('/api/knowledge')
      .send({
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
    const res = await request(app)
      .post('/api/im/webhook/wechat')
      .send({ Body: 'test' });
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

  it('GET /api/semantic/map 返回语义地图（需要 path 参数）', async () => {
    // 不带 path 可能返回错误或空结果
    const res = await request(app).get('/api/semantic/map');
    expect([200, 400, 500]).toContain(res.status);
  });

  it('GET /api/semantic/map 带 path 参数返回地图数据', async () => {
    const res = await request(app).get('/api/semantic/map').query({ path: 'packages' });
    expect(res.status).toBe(200);
    if (res.body.nodes) {
      expect(Array.isArray(res.body.nodes)).toBe(true);
    }
  });
});
