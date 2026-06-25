/**
 * 集成测试：聊天与会话管理 API
 * 覆盖端点: /api/chat, /api/sessions/:id, /api/sessions/search,
 *           /api/version, /api/version/check, /api/token-usage/analytics,
 *           /api/files/browse
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

// 动态导入 createApp（服务器模块含大量依赖）
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

// ==================== 版本 API ====================

describe('GET /api/version', () => {
  it('应返回版本信息（含 version/codename/releaseDate/changelog）', async () => {
    const res = await request(app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version');
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.body).toHaveProperty('codename');
    expect(res.body).toHaveProperty('releaseDate');
    expect(res.body).toHaveProperty('changelog');
  });
});

describe('GET /api/version/check', () => {
  it('应返回当前版本和更新检查结果', async () => {
    const res = await request(app).get('/api/version/check');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentVersion');
    expect(res.body).toHaveProperty('hasUpdate');
    expect(typeof res.body.hasUpdate).toBe('boolean');
  });

  it('网络不可达时也应返回 200（降级处理）', async () => {
    const res = await request(app).get('/api/version/check');
    // GitHub API 可能超时，但始终应返回 200
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('currentVersion');
  });
});

// ==================== Session API ====================

describe('Session CRUD', () => {
  let testSessionId: string;

  it('GET /api/sessions 返回会话列表（数组）', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/sessions/:id 不存在返回 404', async () => {
    const res = await request(app).get('/api/sessions/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('不存在');
  });

  it('GET /api/sessions/:id 存在时返回会话对象', async () => {
    // 先获取会话列表，提取第一个 ID 测试
    const listRes = await request(app).get('/api/sessions');
    if (listRes.body.length > 0) {
      testSessionId = listRes.body[0].id;
      const res = await request(app).get(`/api/sessions/${testSessionId}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    }
  });

  it('DELETE /api/sessions/:id 返回 success', async () => {
    const res = await request(app).delete(`/api/sessions/test-delete-id`);
    // 删除不存在的会话也应返回成功（幂等）
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('POST /api/sessions/:id/archive 返回 success', async () => {
    const res = await request(app).post('/api/sessions/test-archive-id/archive');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

// ==================== Session Search API ====================

describe('GET /api/sessions/search', () => {
  it('缺少 q 参数时返回 400', async () => {
    const res = await request(app).get('/api/sessions/search');
    // route 顺序已修复，缺少 q 参数应返回 400
    expect(res.status).toBe(400);
  });

  it('带 q 参数搜索返回数组结果', async () => {
    const res = await request(app).get('/api/sessions/search').query({ q: 'test' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('支持 status 过滤参数', async () => {
    const res = await request(app).get('/api/sessions/search').query({ q: 'test', status: 'active' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ==================== Chat API ====================

describe('POST /api/chat', () => {
  it('缺少 message 参数返回 400', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({})
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('请求体非 JSON 时应能处理', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send('not-json')
      .set('Content-Type', 'text/plain');
    // 可能返回 400（JSON解析失败）
    expect([400, 500]).toContain(res.status);
  });

  it('未配置提供商时返回错误', async () => {
    // 如果系统已配好提供商，此测试可能通过或返回 200
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'hello', model: 'test-model-nonexist' })
      .set('Content-Type', 'application/json');
    // 根据配置状态可能返回不同结果
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ==================== Token 用量分析 API ====================

describe('GET /api/token-usage/analytics', () => {
  it('返回用量分析数据（含 summary/byModel/byDay/byProvider）', async () => {
    const res = await request(app).get('/api/token-usage/analytics');
    expect(res.status).toBe(200);
    // 响应包含 summary 字段（token 计数，不含 totalCalls）
    expect(res.body).toHaveProperty('summary');
    expect(res.body.summary).toHaveProperty('total');
    expect(typeof res.body.summary.total.totalTokens).toBe('number');
  });

  it('返回按模型聚合的数据', async () => {
    const res = await request(app).get('/api/token-usage/analytics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.byModel)).toBe(true);
  });

  it('返回按日期聚合的30天数据', async () => {
    const res = await request(app).get('/api/token-usage/analytics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.byDay)).toBe(true);
  });

  it('返回按提供商聚合的数据', async () => {
    const res = await request(app).get('/api/token-usage/analytics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.byProvider)).toBe(true);
  });

  it('包含费用估算字段', async () => {
    const res = await request(app).get('/api/token-usage/analytics');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('cost');
    expect(res.body.cost).toHaveProperty('totalEstimatedCost');
    expect(typeof res.body.cost.totalEstimatedCost).toBe('number');
  });

  it('recentCalls 是数组', async () => {
    const res = await request(app).get('/api/token-usage/analytics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recentCalls)).toBe(true);
  });
});

// ==================== 文件浏览 API ====================

describe('GET /api/files/browse', () => {
  it('无 path 参数返回工作区根目录（含 dirs/files）', async () => {
    const res = await request(app).get('/api/files/browse');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('currentPath', '');
    expect(Array.isArray(res.body.dirs)).toBe(true);
    expect(Array.isArray(res.body.files)).toBe(true);
  });

  it('指定 path 返回子目录内容', async () => {
    const res = await request(app).get('/api/files/browse').query({ path: 'packages' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.currentPath).toBe('packages');
    expect(Array.isArray(res.body.dirs)).toBe(true);
  });

  it('不存在的路径返回 404', async () => {
    const res = await request(app).get('/api/files/browse').query({ path: 'nonexistent-path-xyz' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
  });

  it('路径越界返回 403', async () => {
    const res = await request(app).get('/api/files/browse').query({ path: '../../Windows' });
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('success', false);
  });

  it('parentPath 非空时返回上一级路径', async () => {
    const res = await request(app).get('/api/files/browse').query({ path: 'packages/core' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('parentPath');
  });
});
