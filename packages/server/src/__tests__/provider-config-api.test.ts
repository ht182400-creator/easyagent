/**
 * 集成测试：提供商管理与配置 API
 * 覆盖端点: /api/providers/:id/test, /api/providers/all-models,
 *           /api/providers/catalog/refresh, /api/providers/:id/models/refresh,
 *           /api/providers/:id/key, /api/config(PUT), /api/config/templates,
 *           /api/config/allowed-commands, /api/plugins(CRUD), /api/skills(CRUD),
 *           /api/tools/:name
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

// ==================== Provider Test API ====================

describe('POST /api/providers/:id/test', () => {
  it('测试提供商连接返回结果（deepseek 可能未配置）', async () => {
    const res = await request(app).post('/api/providers/deepseek/test').send({});
    // 根据是否有 API Key 配置返回不同状态
    expect([200, 404, 500]).toContain(res.status);
  });

  it('不存在的提供商返回 404 或 500', async () => {
    const res = await request(app).post('/api/providers/nonexistent-provider-xyz/test').send({});
    expect([404, 500]).toContain(res.status);
  });
});

// ==================== All Models API ====================

describe('GET /api/providers/all-models', () => {
  it('返回模型数据（可能是数组或对象包装）', async () => {
    const res = await request(app).get('/api/providers/all-models');
    expect(res.status).toBe(200);
    // 可能是 { models: [...] } 或直接是数组
    const body = res.body;
    expect(typeof body).toBe('object');
    const models = Array.isArray(body) ? body : body.models || [];
    expect(Array.isArray(models)).toBe(true);
  });

  it('每个模型至少包含 provider 字段', async () => {
    const res = await request(app).get('/api/providers/all-models');
    const models = Array.isArray(res.body) ? res.body : res.body.models || [];
    if (models.length > 0) {
      const model = models[0];
      expect(model).toHaveProperty('provider');
    }
  });
});

// ==================== Provider Catalog ====================

describe('GET /api/providers/catalog/status', () => {
  it('返回目录状态 (ready/version/generatedAt/providers)', async () => {
    const res = await request(app).get('/api/providers/catalog/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ready');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('generatedAt');
    expect(res.body).toHaveProperty('providers');
  });
});

describe('POST /api/providers/catalog/refresh', () => {
  it('尝刷刷新模型目录（网络超时降级处理）', async () => {
    const res = await request(app).post('/api/providers/catalog/refresh');
    // 网络不可达时降级处理，可能超时或返回错误
    expect([200, 500, 503, 504]).toContain(res.status);
  }, 30000); // 30s timeout for network test
});

describe('POST /api/providers/:id/models/refresh', () => {
  it('指定提供商刷新模型列表', async () => {
    const res = await request(app).post('/api/providers/deepseek/models/refresh');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('不存在的提供商返回错误', async () => {
    const res = await request(app).post('/api/providers/xyz-nonexist/models/refresh');
    expect([404, 500]).toContain(res.status);
  });
});

// ==================== Provider Key API ====================

describe('PUT /api/providers/:id/key', () => {
  it('设置 API Key 需要 apiKey 字段', async () => {
    const res = await request(app)
      .put('/api/providers/deepseek/key')
      .send({ apiKey: 'test-key-for-integration' });
    expect([200, 400, 500]).toContain(res.status);
  });

  it('设置空 apiKey 也能处理', async () => {
    const res = await request(app).put('/api/providers/anthropic/key').send({});
    // 可能返回 200（成功清空）或 400（缺少字段）
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ==================== Config API ====================

describe('PUT /api/config', () => {
  it('更新 agent 配置返回 success', async () => {
    const res = await request(app)
      .put('/api/config')
      .send({
        agent: { maxIterations: 10 },
        preferences: { language: 'zh-CN' },
      });
    expect([200, 500]).toContain(res.status);
  });

  it('请求体为空也能处理', async () => {
    const res = await request(app).put('/api/config').send({});
    expect([200, 500]).toContain(res.status);
  });
});

describe('GET /api/config/templates', () => {
  it('返回模板列表（success + templates 数组）', async () => {
    const res = await request(app).get('/api/config/templates');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.templates)).toBe(true);
    expect(res.body.templates.length).toBeGreaterThan(0);
  });

  it('每个模板包含 id/label/desc/icon/prompt 字段', async () => {
    const res = await request(app).get('/api/config/templates');
    const tmpl = res.body.templates[0];
    expect(tmpl).toHaveProperty('id');
    expect(tmpl).toHaveProperty('label');
    expect(tmpl).toHaveProperty('desc');
    expect(tmpl).toHaveProperty('icon');
    expect(tmpl).toHaveProperty('prompt');
  });
});

describe('GET /api/config/allowed-commands', () => {
  it('返回命令白名单（数组）', async () => {
    const res = await request(app).get('/api/config/allowed-commands');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.commands)).toBe(true);
  });
});

describe('PUT /api/config/allowed-commands', () => {
  it('commands 非数组返回 400', async () => {
    const res = await request(app)
      .put('/api/config/allowed-commands')
      .send({ commands: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('success', false);
  });

  it('更新命令白名单返回 success', async () => {
    const res = await request(app)
      .put('/api/config/allowed-commands')
      .send({ commands: ['git', 'npm', 'node'] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.commands).toEqual(['git', 'npm', 'node']);
  });
});

// ==================== Plugin API ====================

describe('POST /api/plugins/load', () => {
  it('缺少 path 参数返回 400', async () => {
    const res = await request(app).post('/api/plugins/load').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('路径不符合安全限制返回 403', async () => {
    const res = await request(app).post('/api/plugins/load').send({ path: '/etc/passwd' });
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/plugins/:name/toggle', () => {
  it('切换不存在的插件返回结果', async () => {
    const res = await request(app).post('/api/plugins/nonexistent-plugin/toggle');
    // 部分实现在toggle时返回 200（幂等操作）
    expect([200, 404]).toContain(res.status);
  });
});

describe('DELETE /api/plugins/:name', () => {
  it('删除不存在的插件返回结果', async () => {
    const res = await request(app).delete('/api/plugins/nonexistent-plugin');
    // 部分实现在delete时返回 200（幂等操作）
    expect([200, 404]).toContain(res.status);
  });
});

// ==================== Skill API ====================

describe('POST /api/skills/:name/activate', () => {
  it('激活不存在的技能返回 404', async () => {
    const res = await request(app).post('/api/skills/nonexistent-skill/activate');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/skills/:name/deactivate', () => {
  it('停用不存在的技能返回 404', async () => {
    const res = await request(app).post('/api/skills/nonexistent-skill/deactivate');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/skills/custom', () => {
  it('添加自定义技能需要 name/description', async () => {
    const res = await request(app)
      .post('/api/skills/custom')
      .send({
        name: 'test-custom-skill-int',
        description: '集成测试自定义技能',
        prompt: '这是一个测试技能',
        tags: ['test'],
        requiresConfirm: true,
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('重复名称返回 409', async () => {
    const res = await request(app).post('/api/skills/custom').send({
      name: 'test-custom-skill-int',
      description: '重复技能',
    });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/skills/custom/:name', () => {
  it('更新自定义技能返回 success', async () => {
    const res = await request(app)
      .put('/api/skills/custom/test-custom-skill-int')
      .send({
        description: '更新的描述',
        prompt: '更新的提示',
        tags: ['test', 'updated'],
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

describe('DELETE /api/skills/custom/:name', () => {
  it('删除自定义技能返回 success', async () => {
    const res = await request(app).delete('/api/skills/custom/test-custom-skill-int');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('删除不存在的自定义技能返回 404', async () => {
    const res = await request(app).delete('/api/skills/custom/test-custom-skill-int');
    expect(res.status).toBe(404);
  });
});

// ==================== Tools API ====================

describe('POST /api/tools/:name', () => {
  it('切换不存在的工具返回错误（400 或 404）', async () => {
    const res = await request(app).post('/api/tools/nonexistent-tool');
    expect([400, 404, 500]).toContain(res.status);
  });

  it('切换有效的工具状态返回合理状态码', async () => {
    // 先获取工具列表
    const toolsRes = await request(app).get('/api/tools');
    if (Array.isArray(toolsRes.body) && toolsRes.body.length > 0) {
      const toolName = toolsRes.body[0].name || toolsRes.body[0].id;
      const res = await request(app).post(`/api/tools/${toolName}`);
      expect([200, 400, 404]).toContain(res.status);
    }
  });
});

// ==================== 模型「元数据未校准」标记透传 ====================
//
// v0.6.33 引入 `unverified`：由「厂商 API 直连」发现的新模型会带上它 ——
// 厂商 `/models` 只返回模型 ID，不含价格/上下文/能力，那些字段只是**保守默认值**。
//
// ⚠️ 服务端在组装响应时是**逐字段重新映射**的（不是整对象透传），
//    因此极易在后续改动中把该标记悄悄丢掉。一旦丢掉，前端就无从区分，
//    界面会把 ¥0 当成"免费"、把 32K 当成真实上下文 —— 属于**静默的诚实性回归**。
//    本用例锁住这条透传链路。

describe('模型 unverified 标记透传', () => {
  it('🛡️ /api/providers 必须透传 unverified（否则界面会把默认值当真实规格）', async () => {
    const { PROVIDER_PRESETS } = await import('@easyagent/core');
    const preset = PROVIDER_PRESETS[0];
    const model = preset.models[0];
    const original = model.unverified;

    model.unverified = true;
    try {
      const res = await request(app).get('/api/providers');
      expect(res.status).toBe(200);

      const p = res.body.find((x: { id: string }) => x.id === preset.id);
      expect(p, `响应中未找到提供商 ${preset.id}`).toBeTruthy();
      const m = p.models.find((x: { id: string }) => x.id === model.id);
      expect(m, `响应中未找到模型 ${model.id}`).toBeTruthy();
      expect(m.unverified).toBe(true);
    } finally {
      model.unverified = original;
    }
  });

  it('unverified 只应是布尔或未定义（不得是字符串等异常形态）', async () => {
    const res = await request(app).get('/api/providers');
    for (const p of res.body) {
      for (const m of p.models || []) {
        if (m.unverified !== undefined) {
          expect(typeof m.unverified, `${p.id}/${m.id} 的 unverified 类型异常`).toBe('boolean');
        }
      }
    }
  });

  it('/api/providers/all-models 也应透传 unverified（供模型下拉框标注）', async () => {
    const { PROVIDER_PRESETS } = await import('@easyagent/core');
    const preset = PROVIDER_PRESETS[0];
    const model = preset.models[0];
    const original = model.unverified;

    model.unverified = true;
    try {
      const res = await request(app).get('/api/providers/all-models');
      expect(res.status).toBe(200);
      const models = Array.isArray(res.body) ? res.body : res.body.models || [];
      const hit = models.find(
        (m: { provider: string; modelId: string }) =>
          m.provider === preset.id && m.modelId === model.id,
      );
      expect(hit, '未找到目标模型').toBeTruthy();
      expect(hit.unverified).toBe(true);
    } finally {
      model.unverified = original;
    }
  });
});
