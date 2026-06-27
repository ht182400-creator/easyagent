/**
 * 静态文件服务测试
 * 验证前端资源能被正确提供，SPA fallback 正常工作
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../index.js';

let app: Express;
let server: Server;
const webDistPath = join(__dirname, '..', '..', '..', 'web', 'dist');

beforeAll(async () => {
  const result = await createApp();
  app = result.app;
  server = result.server;
}, 10000);

afterAll(() => {
  if (server) server.close();
});

// ======================== 静态文件可用性 ========================

describe('静态文件服务 — 前端资源', () => {
  it('index.html 应存在并被提供 (200)', async () => {
    // 这个测试需要 web/dist 已构建
    if (!existsSync(join(webDistPath, 'index.html'))) {
      console.warn(
        '⚠ web/dist 不存在，跳过静态文件测试。请先运行: cd packages/web && npx vite build',
      );
      return;
    }
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('JS 资源应正确提供 (200 + application/javascript)', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    // 先获取 index.html 找到第一个 JS 资源路径
    const htmlRes = await request(app).get('/');
    const jsMatch = htmlRes.text.match(/src="\/assets\/([^"]+\.js)"/);
    if (jsMatch) {
      const jsPath = `/assets/${jsMatch[1]}`;
      const res = await request(app).get(jsPath);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('javascript');
    }
  });

  it('CSS 资源应正确提供 (200 + text/css)', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    const htmlRes = await request(app).get('/');
    const cssMatch = htmlRes.text.match(/href="\/assets\/([^"]+\.css)"/);
    if (cssMatch) {
      const cssPath = `/assets/${cssMatch[1]}`;
      const res = await request(app).get(cssPath);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('css');
    }
  });
});

// ======================== SPA Fallback 测试 ========================

describe('SPA Fallback — 前端路由', () => {
  it('/dashboard 非 API 路径应返回 index.html (SPA fallback)', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<!DOCTYPE html>');
  });

  it('/tools 非 API 路径应返回 index.html', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    const res = await request(app).get('/tools');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('/sandbox 非 API 路径应返回 index.html', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    const res = await request(app).get('/sandbox');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('/semantic 非 API 路径应返回 index.html', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    const res = await request(app).get('/semantic');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('不存在的静态文件返回 index.html (SPA) 而非 404', async () => {
    if (!existsSync(join(webDistPath, 'index.html'))) {
      return;
    }
    const res = await request(app).get('/any-random-spa-route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
  });
});
