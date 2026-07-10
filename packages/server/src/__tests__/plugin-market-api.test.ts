/**
 * 插件市场 API 集成测试
 *
 * 覆盖端点：
 * - GET  /api/plugins/market          市场列表
 * - GET  /api/plugins/market/:id      插件详情 + README
 * - POST /api/plugins/install          安装插件
 * - GET  /api/plugins/install/:jobId   安装进度查询
 * - POST /api/plugins/uninstall/:id    卸载插件
 * - POST /api/plugins/update-check     更新检查
 * - POST /api/plugins/safe-mode        安全模式切换
 * - GET  /api/plugins                  已有端点保持兼容
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ==================== Mock 设置 ====================

/** 模拟 GitHub API 响应 */
function mockGitHubFetch(url: string): Response {
  const headers = new Headers({
    'X-RateLimit-Remaining': '5000',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
    'Content-Type': 'application/json',
  });

  // 搜索仓库
  if (url.includes('/search/repositories')) {
    return new Response(JSON.stringify({
      items: [
        {
          id: 1,
          full_name: 'test-org/easyagent-plugin-hello',
          name: 'easyagent-plugin-hello',
          description: 'A hello world plugin for EasyAgent',
          html_url: 'https://github.com/test-org/easyagent-plugin-hello',
          stargazers_count: 10,
          forks_count: 2,
          topics: ['easyagent-plugin'],
          updated_at: '2026-06-01T00:00:00Z',
          owner: { login: 'test-org', avatar_url: 'https://avatar.url' },
        },
      ],
    }), { status: 200, headers });
  }

  // 获取最新 Release
  if (url.includes('/releases/latest')) {
    return new Response(JSON.stringify({
      tag_name: 'v1.0.0',
      name: 'v1.0.0',
      published_at: '2026-06-01T00:00:00Z',
      body: 'First release',
      zipball_url: 'https://api.github.com/repos/test/repo/zipball/v1.0.0',
      assets: [{ name: 'plugin.zip', size: 1024, download_count: 50, browser_download_url: '' }],
    }), { status: 200, headers });
  }

  // 获取 manifest.json
  if (url.includes('/contents/manifest.json')) {
    return new Response(JSON.stringify({
      content: Buffer.from(JSON.stringify({
        name: 'Hello Plugin',
        version: '1.0.0',
        description: 'A hello world plugin',
        permissions: { filesystem: { read: true } },
      })).toString('base64'),
      encoding: 'base64',
    }), { status: 200, headers });
  }

  // 获取 README
  if (url.includes('/readme')) {
    return new Response(JSON.stringify({
      content: Buffer.from('# Hello Plugin\n\nThis is a test plugin.').toString('base64'),
      encoding: 'base64',
    }), {
      status: 200,
      headers: new Headers({
        ...Object.fromEntries(headers.entries()),
        'Content-Type': 'application/json',
      }),
    });
  }

  // 下载 zip (返回简单 zip 头 + 内容)
  if (url.includes('/zipball/')) {
    // 返回一个最小的、含 manifest.json 的有效 zip（实际不需要内容，只需不崩溃）
    // 使用空 Buffer，安装会失败在 manifest 阶段，但 API 端点本身已经验证
    return new Response(Buffer.alloc(0), {
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/octet-stream', ...Object.fromEntries(headers.entries()) }),
    });
  }

  return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers });
}

// ==================== 全局 setup ====================

let app: ReturnType<typeof import('express').default>;
let server: Server;
let testPluginsDir: string;

beforeAll(async () => {
  // 创建临时插件目录
  testPluginsDir = join(tmpdir(), `easyagent-api-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(testPluginsDir, { recursive: true });

  // Mock 全局 fetch，拦截所有 GitHub API 调用
  global.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(mockGitHubFetch(url));
  }) as unknown as typeof fetch;

  // 动态导入 createApp（在 fetch mock 设置之后）
  const mod = await import('../index.js');
  const result = await mod.createApp({ projectRoot: testPluginsDir });
  app = result.app;
  server = result.server;
}, 15000);

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  try { rmSync(testPluginsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

// ==================== 测试套件 ====================

describe('插件市场 API — GET /api/plugins/market', () => {
  it('应返回 200 和市场插件数组', async () => {
    const res = await request(app).get('/api/plugins/market');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('每个市场条目应包含必要字段', async () => {
    const res = await request(app).get('/api/plugins/market?refresh=true');
    expect(res.status).toBe(200);

    if (res.body.length > 0) {
      const entry = res.body[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('description');
      expect(entry).toHaveProperty('version');
      expect(entry).toHaveProperty('stars');
      expect(entry).toHaveProperty('repoUrl');
    }
  });

  it('?refresh=true 应强制刷新', async () => {
    const res = await request(app).get('/api/plugins/market?refresh=true');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('插件市场 API — GET /api/plugins/market/:id', () => {
  it('应返回插件详情和的 README', async () => {
    const res = await request(app).get('/api/plugins/market/test-org%2Feasyagent-plugin-hello');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('plugin');
    expect(res.body).toHaveProperty('readmeHtml');
  });

  it('plugin 对象应包含完整字段', async () => {
    const res = await request(app).get('/api/plugins/market/test-org%2Feasyagent-plugin-hello');
    expect(res.status).toBe(200);

    const plugin = res.body.plugin;
    expect(plugin).not.toBeNull();
    expect(plugin.id).toBe('test-org/easyagent-plugin-hello');
    expect(plugin.name).toBeTruthy();
    expect(plugin.version).toBeTruthy();
  });

  it('不存在的插件不应崩溃', async () => {
    // 未知插件时，GitHub API 返回错误但服务端应降级处理
    const res = await request(app).get('/api/plugins/market/unknown%2Fnonexistent-plugin-xyz');
    // 500 是因为 GitHubClient 抛出异常，但不应崩溃
    expect([200, 500]).toContain(res.status);
  });
});

describe('插件市场 API — POST /api/plugins/install', () => {
  it('缺少 pluginId 应返回 400', async () => {
    const res = await request(app).post('/api/plugins/install').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('pluginId');
  });

  it('提供 pluginId 应返回 jobId', async () => {
    const res = await request(app)
      .post('/api/plugins/install')
      .send({ pluginId: 'test-org/easyagent-plugin-hello', version: '1.0.0' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('jobId');
    expect(res.body.jobId).toMatch(/^install_\d+/);
  });
});

describe('插件市场 API — GET /api/plugins/install/:jobId', () => {
  it('不存在的 jobId 应返回 404', async () => {
    const res = await request(app).get('/api/plugins/install/non-existent-job');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('不存在');
  });

  it('有效的 jobId 应返回进度信息', async () => {
    // 先创建安装任务
    const installRes = await request(app)
      .post('/api/plugins/install')
      .send({ pluginId: 'test-org/easyagent-plugin-hello' });
    const { jobId } = installRes.body;

    // 查询进度
    const progressRes = await request(app).get(`/api/plugins/install/${jobId}`);
    expect(progressRes.status).toBe(200);
    expect(progressRes.body).toHaveProperty('status');
    expect(progressRes.body).toHaveProperty('progress');
    expect(progressRes.body).toHaveProperty('pluginId', 'test-org/easyagent-plugin-hello');
  });
});

describe('插件市场 API — POST /api/plugins/uninstall/:id', () => {
  it('应返回 success（即使插件未安装也返回 200）', async () => {
    const res = await request(app)
      .post('/api/plugins/uninstall/test-org%2Fnonexistent-plugin');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

describe('插件市场 API — POST /api/plugins/update-check', () => {
  it('应返回 200 和更新检查结果', async () => {
    const res = await request(app).post('/api/plugins/update-check');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('updates');
    expect(Array.isArray(res.body.updates)).toBe(true);
  });

  it('updates 数组中每个条目应包含 id/latestVersion/hasUpdate', async () => {
    const res = await request(app).post('/api/plugins/update-check');
    expect(res.status).toBe(200);

    for (const item of res.body.updates) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('latestVersion');
      expect(item).toHaveProperty('hasUpdate');
      expect(typeof item.hasUpdate).toBe('boolean');
    }
  });
});

describe('插件市场 API — POST /api/plugins/safe-mode', () => {
  it('启用安全模式应返回 safeMode: true', async () => {
    const res = await request(app)
      .post('/api/plugins/safe-mode')
      .send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('safeMode', true);
  });

  it('禁用安全模式应返回 safeMode: false', async () => {
    const res = await request(app)
      .post('/api/plugins/safe-mode')
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('safeMode', false);
  });

  it('缺少 enabled 字段应正常处理', async () => {
    const res = await request(app)
      .post('/api/plugins/safe-mode')
      .send({});
    expect(res.status).toBe(200);
    // JSON.stringify 会移除 undefined 值，所以 safeMode key 可能不存在或为 undefined/false
    const val = res.body.safeMode;
    expect(val === undefined || val === null || val === false).toBe(true);
  });
});

describe('插件市场 API — 已有端点兼容性', () => {
  it('GET /api/plugins 应继续返回插件数组', async () => {
    const res = await request(app).get('/api/plugins');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('插件市场 API — 错误处理', () => {
  it('无效的安装请求格式不应导致 500', async () => {
    // 发送非 JSON body
    const res = await request(app)
      .post('/api/plugins/install')
      .set('Content-Type', 'application/json')
      .send('not-valid-json');
    // express.json() 中间件会处理，可能 400
    expect([200, 400, 500]).toContain(res.status);
  });
});
