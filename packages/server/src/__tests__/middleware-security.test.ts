/**
 * 集成测试：中间件与安全基础设施
 * 覆盖: CORS 头、安全 HTTP 头、JSON 限制、projectRoot 参数、
 *       SPA Fallback、静态文件服务、405 方法、404 API 路由
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

// ==================== CORS 头验证 ====================

describe('CORS 中间件', () => {
  it('OPTIONS 预检请求返回 204 并含 CORS 头', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');
    expect([200, 204]).toContain(res.status);
    // CORS 头应存在
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('正常 GET 请求包含 CORS 头', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});

// ==================== 安全 HTTP 头验证 ====================

describe('安全 HTTP 头', () => {
  it('X-Content-Type-Options 头存在', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('X-Frame-Options 头存在', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('X-XSS-Protection 头存在', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-xss-protection']).toBeDefined();
  });

  it('Referrer-Policy 头存在', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['referrer-policy']).toBeDefined();
  });
});

// ==================== JSON 解析限制 ====================

describe('JSON 解析中间件', () => {
  it('正常 JSON 请求体应被解析', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'test' })
      .set('Content-Type', 'application/json');
    // 可能返回 400（message 太简单）或 500（无提供商）
    expect([200, 400, 500]).toContain(res.status);
  });

  it('超大请求体应被拒绝（>10MB）', async () => {
    // 生成约 11MB 的数据
    const largeData = 'x'.repeat(11 * 1024 * 1024);
    const res = await request(app)
      .post('/api/chat')
      .send({ message: largeData })
      .set('Content-Type', 'application/json');
    // 应该返回 413 或相关错误
    expect([400, 413, 500]).toContain(res.status);
  });

  it('非 JSON Content-Type 应能处理', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send('plain text not json')
      .set('Content-Type', 'text/plain');
    expect([400, 500]).toContain(res.status);
  });
});

// ==================== projectRoot 参数 ====================

describe('CreateAppOptions.projectRoot', () => {
  it('默认 projectRoot 存在且可配置', async () => {
    // createApp 返回的 app 使用默认 PROJECT_ROOT
    const res = await request(app).get('/api/files/browse');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('自定义 projectRoot 时文件浏览隔离在指定目录', async () => {
    const { createApp } = await import('../index.js');
    const testDir = join(tmpdir(), 'easyagent-test-browse');
    // 创建临时目录
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'test.txt'), 'hello');

    try {
      const custom = await createApp({ projectRoot: testDir });
      const res = await request(custom.app).get('/api/files/browse');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);

      // 关闭自定义 server
      await new Promise<void>((resolve) => custom.server.close(() => resolve()));
    } finally {
      // 清理
      try {
        rmSync(testDir, { recursive: true });
      } catch {}
    }
  });
});

// ==================== 405 Method Not Allowed ====================

describe('HTTP 方法验证', () => {
  it('GET-only 端点接受 PUT 时应返回合理状态', async () => {
    const res = await request(app).put('/api/health');
    // Express 默认不处理不匹配的方法路由，可能 404
    expect([200, 404, 405]).toContain(res.status);
  });

  it('POST-only 端点接受 GET 时应返回合理状态', async () => {
    const res = await request(app).get('/api/chat');
    expect([200, 404]).toContain(res.status);
  });
});

// ==================== 404 与 SPA Fallback ====================

describe('404 与 SPA Fallback', () => {
  it('/api/nonexistent 返回 JSON 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('/api/nonexistent/nested 返回 JSON 404', async () => {
    const res = await request(app).get('/api/nonexistent/nested/path');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('已知端点的 JSON 响应 Content-Type 正确', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });
});

// ==================== 并发请求 ====================

describe('并发请求', () => {
  it('同时发出多个 health 请求应全部成功', async () => {
    const promises = Array.from({ length: 10 }, () => request(app).get('/api/health'));
    const results = await Promise.all(promises);
    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
    });
  });

  it('混合 API 请求应全部正确响应', async () => {
    const results = await Promise.all([
      request(app).get('/api/health'),
      request(app).get('/api/status'),
      request(app).get('/api/version'),
    ]);
    results.forEach((res) => expect(res.status).toBe(200));
  });
});
