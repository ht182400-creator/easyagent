/**
 * 服务端 API 端点集成测试
 * 验证所有 HTTP API 端点返回正确的状态码和数据格式
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../index.js';

let app: Express;
let server: Server;

beforeAll(async () => {
  const result = await createApp();
  app = result.app;
  server = result.server;
}, 10000);

afterAll(() => {
  if (server) server.close();
});

// ======================== 系统 API ========================

describe('系统 API — /api/health', () => {
  it('应返回 200 和健康状态 JSON', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('memory');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('系统 API — /api/status', () => {
  it('应返回 200 和系统状态 JSON', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('model');
    expect(res.body).toHaveProperty('tokenUsage');
    expect(res.body).toHaveProperty('sessionCount');
    expect(res.body).toHaveProperty('toolCount');
    expect(res.body).toHaveProperty('providerCount');
  });

  it('toolCount 应大于 0（内置工具已注册）', async () => {
    const res = await request(app).get('/api/status');
    expect(res.body.toolCount).toBeGreaterThan(0);
  });
});

// ======================== 工具 API ========================

describe('工具 API — /api/tools', () => {
  it('应返回 200 和工具数组', async () => {
    const res = await request(app).get('/api/tools');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(50);
  });

  it('每个工具应包含必要字段', async () => {
    const res = await request(app).get('/api/tools');
    const tool = res.body[0];
    expect(tool).toHaveProperty('name');
    expect(tool).toHaveProperty('group');
    expect(tool).toHaveProperty('builtin');
    expect(tool).toHaveProperty('enabled');
    expect(tool.builtin).toBe(true);
    expect(tool.enabled).toBe(true);
  });

  it('工具应正确分组', async () => {
    const res = await request(app).get('/api/tools');
    const groups = new Set(res.body.map((t: { group: string }) => t.group));
    // 至少需有这些核心分组
    expect(groups.has('file')).toBe(true);
    expect(groups.has('search')).toBe(true);
    expect(groups.has('code')).toBe(true);
    expect(groups.has('exec')).toBe(true);
    // 总分组数应 >= 5
    expect(groups.size).toBeGreaterThanOrEqual(5);
  });
});

// ======================== 插件 API ========================

describe('插件 API — /api/plugins', () => {
  it('应返回 200 和插件数组', async () => {
    const res = await request(app).get('/api/plugins');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ======================== 技能 API ========================

describe('技能 API — /api/skills', () => {
  it('应返回 200 和技能数组', async () => {
    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('每个技能应包含 name 和 description', async () => {
    const res = await request(app).get('/api/skills');
    const skill = res.body[0];
    expect(skill).toHaveProperty('name');
    expect(skill).toHaveProperty('description');
  });
});

// ======================== 配置 API ========================

describe('配置 API — /api/config', () => {
  it('GET 应返回脱敏后的配置', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    // apiKey 应被脱敏
    if (res.body.providers?.length > 0) {
      const key = res.body.providers[0].apiKey;
      expect(key === undefined || key === '' || key.includes('•••')).toBe(true);
    }
  });
});

// ======================== 提供商 API ========================

describe('提供商 API — /api/providers', () => {
  it('应返回 200 和提供商预设数组', async () => {
    const res = await request(app).get('/api/providers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(5);
  });

  it('每个提供商应包含 id/name/models', async () => {
    const res = await request(app).get('/api/providers');
    const provider = res.body[0];
    expect(provider).toHaveProperty('id');
    expect(provider).toHaveProperty('name');
    expect(provider).toHaveProperty('models');
  });
});

// ======================== 会话 API ========================

describe('会话 API — /api/sessions', () => {
  it('GET /api/sessions 应返回 200 和会话数组', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ======================== IM 状态 API ========================

describe('IM API — /api/im/status', () => {
  it('应返回 200 和 IM 状态数据', async () => {
    const res = await request(app).get('/api/im/status');
    expect(res.status).toBe(200);
    // imManager.getStatus() 返回数组或对象，格式因实现而异
    expect(res.body).toBeDefined();
  });
});

// ======================== 沙箱 API ========================

describe('沙箱 API — /api/sandbox/status', () => {
  it('应返回 200 和沙箱状态', async () => {
    const res = await request(app).get('/api/sandbox/status');
    expect(res.status).toBe(200);
    // 响应格式: { docker: { available, ... }, sandbox: { ... } }
    expect(res.body).toHaveProperty('docker');
    expect(res.body).toHaveProperty('sandbox');
    if (res.body.docker) {
      expect(res.body.docker).toHaveProperty('available');
    }
  });
});

// ======================== 语义 API ========================

describe('语义 API — 参数校验', () => {
  it('/api/semantic/search 缺少 q 参数应返回 400', async () => {
    const res = await request(app).get('/api/semantic/search');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toContain('q');
  });

  it('/api/semantic/file 缺少 path 参数应返回 400', async () => {
    const res = await request(app).get('/api/semantic/file');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('/api/semantic/references 缺少 symbol 参数应返回 400', async () => {
    const res = await request(app).get('/api/semantic/references');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ======================== 知识库 API — 双作用域 (project/global) ========================

describe('知识库 API — 双作用域', () => {
  it('GET /api/knowledge?scope=project 应返回项目知识库数据', async () => {
    const res = await request(app).get('/api/knowledge?scope=project');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('project');
    expect(Array.isArray(res.body.documents)).toBe(true);
  });

  it('GET /api/knowledge?scope=global 应返回全局知识库数据', async () => {
    const res = await request(app).get('/api/knowledge?scope=global');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('global');
    expect(Array.isArray(res.body.documents)).toBe(true);
  });

  it('GET /api/knowledge/stats/summary 合并模式应返回 merged scope + 双域统计', async () => {
    const res = await request(app).get('/api/knowledge/stats/summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('merged');
    expect(res.body).toHaveProperty('totalDocs');
    expect(res.body).toHaveProperty('project');
    expect(res.body).toHaveProperty('global');
  });

  it('GET /api/knowledge/stats/summary?scope=global 应返回 global scope', async () => {
    const res = await request(app).get('/api/knowledge/stats/summary?scope=global');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('global');
  });

  it('GET /api/knowledge/search?q=test&scope=project 应支持 scope 参数', async () => {
    const res = await request(app).get('/api/knowledge/search?q=test&scope=project');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('project');
    expect(Array.isArray(res.body.results)).toBe(true);
  });

  it('GET /api/knowledge/search 缺少 q 参数应返回 400', async () => {
    const res = await request(app).get('/api/knowledge/search');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('q');
  });

  it('POST /api/knowledge/import 缺少 filePath 应返回 400', async () => {
    const res = await request(app).post('/api/knowledge/import').send({ scope: 'project' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('filePath');
  });

  it('POST /api/knowledge/import 不存在的文件应返回 400', async () => {
    const res = await request(app).post('/api/knowledge/import').send({ filePath: 'nonexistent/doc.md', scope: 'project' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('文件不存在');
  });

  it('POST /api/knowledge/upload 缺少文件应返回 400', async () => {
    const res = await request(app).post('/api/knowledge/upload').send({});
    // multer 在无文件时可能返回 400 或 500（取决于中间件配置）
    expect([400, 500]).toContain(res.status);
    if (res.status === 400) {
      expect(res.body.error).toContain('缺少');
    }
  });
});

// ======================== 404 处理 ========================

describe('未知路由 — 404 处理', () => {
  it('/api/nonexistent 应返回 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
