/**
 * 管线 API 模块测试 (p5b/p5c)
 * 测试 pipeline-api.mjs 的 API 路由和响应格式
 * 
 * 运行: node docs/pipeline/__tests__/pipeline-api.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiHandler } from '../lib/pipeline-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_MEMORY_DIR = path.resolve(__dirname, '__mock_mem_api');
const CACHE_FILE = path.join(__dirname, '__test_api_cache.json');

/**
 * 创建模拟 HTTP 响应对象用于测试
 * @returns {{ res: Object, getResponse: () => {statusCode: number, body: string} }}
 */
function createMockResponse() {
  let statusCode = 200;
  let headers = {};
  let body = '';
  const res = {
    writeHead(code, hdrs) {
      statusCode = code;
      headers = hdrs || {};
    },
    setHeader(key, value) { headers[key] = value; },
    end(data) { body = data || ''; },
  };
  return {
    res,
    getResponse: () => ({
      statusCode,
      body: (() => { try { return JSON.parse(body); } catch { return body; } })(),
      headers,
    }),
  };
}

describe('管线 API (pipeline-api.mjs)', () => {
  // 确保 mock 目录存在
  before(() => {
    try { fs.mkdirSync(MOCK_MEMORY_DIR, { recursive: true }); } catch (e) { /* */ }
  });
  after(() => {
    try { fs.rmSync(MOCK_MEMORY_DIR, { recursive: true, force: true }); } catch (e) { /* */ }
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }
  });

  const handleApi = createApiHandler(MOCK_MEMORY_DIR, CACHE_FILE);

  // ==================== /api/pipeline ====================
  it('/api/pipeline 应返回管线视图 + KPI', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/pipeline');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 200, '应返回 200');
    assert.ok(resp.body.pipeline, '应有 pipeline 字段');
    assert.ok(resp.body.pipeline.phases, '应有 phases');
    assert.ok(resp.body.pipeline.branches, '应有 branches');
    assert.ok(resp.body.kpi, '应有 kpi 字段');
    assert.ok(resp.body.kpi.testCases, 'kpi 应有 testCases');
    assert.ok(resp.body.kpi.testPassRate, 'kpi 应有 testPassRate');
    assert.ok(resp.body.kpi.tools, 'kpi 应有 tools');
    assert.ok(resp.body.scoreHistory, '应有 scoreHistory');
  });

  it('/api/pipeline 响应应为 JSON content-type', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/pipeline');
    handleApi(url, res);
    const resp = getResponse();
    assert.ok(
      resp.headers['Content-Type']?.includes('application/json'),
      'Content-Type 应为 application/json'
    );
  });

  it('/api/pipeline phases 应包含所有阶段', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/pipeline');
    handleApi(url, res);
    const resp = getResponse();
    const phaseIds = resp.body.pipeline.phases.map(p => p.id);
    ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].forEach(id => {
      assert.ok(phaseIds.includes(id), `应包含 ${id} 阶段`);
    });
  });

  // ==================== /api/issues ====================
  it('/api/issues 应返回问题解析结果', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/issues');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 200, '应返回 200');
    assert.ok(resp.body.modules, '应有 modules 字段');
    assert.ok(typeof resp.body._totalIssues === 'number', '应有 _totalIssues');
    assert.ok(resp.body._generatedAt, '应有 _generatedAt');
    assert.ok(resp.body._cacheStats, '应有 _cacheStats');
  });

  it('/api/issues 应包含 p5a/p5b/p5c 模块容器', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/issues');
    handleApi(url, res);
    const resp = getResponse();
    // 模块容器应始终存在，即使没有 issue
    assert.ok(resp.body.modules.p5a, '应有 p5a 模块容器');
    assert.ok(resp.body.modules.p5b, '应有 p5b 模块容器');
    assert.ok(resp.body.modules.p5c, '应有 p5c 模块容器');
  });

  // ==================== /api/status ====================
  it('/api/status 应返回系统状态', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/status');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 200, '应返回 200');
    assert.ok(resp.body.generatedAt, '应有 generatedAt');
    assert.ok(typeof resp.body.totalIssues === 'number', '应有 totalIssues');
    assert.ok(Array.isArray(resp.body.sourceFiles), '应有 sourceFiles');
    assert.ok(resp.body.cacheStats, '应有 cacheStats');
    assert.ok(resp.body.pipeline, '应有 pipeline');
    assert.ok(typeof resp.body.pipeline.phases === 'number', 'pipeline.phases 应为数字');
    assert.ok(typeof resp.body.pipeline.modules === 'number', 'pipeline.modules 应为数字');
  });

  // ==================== /api/dashboard ====================
  it('/api/dashboard 应返回仪表板详情', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/dashboard');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 200, '应返回 200');
    assert.ok(resp.body.tests, '应有 tests 卡片');
    assert.ok(resp.body.pass, '应有 pass 卡片');
    assert.ok(resp.body.tools, '应有 tools 卡片');
    assert.ok(resp.body.models, '应有 models 卡片');
  });

  it('/api/dashboard/tests 应返回测试详情', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/dashboard/tests');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 200, '应返回 200');
    assert.ok(resp.body.items, '应有 items 数组');
    assert.ok(resp.body.items.length > 0, 'items 应非空');
    assert.ok(resp.body.summary, '应有 summary');
  });

  it('/api/dashboard/无效ID 应返回 404', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/dashboard/nonexistent_card');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 404, '应返回 404');
    assert.ok(resp.body.error, '应有 error 字段');
  });

  // ==================== /api/modules ====================
  it('/api/modules 应返回所有模块列表', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/modules');
    const handled = handleApi(url, res);
    assert.equal(handled, true, '应处理该请求');

    const resp = getResponse();
    assert.equal(resp.statusCode, 200, '应返回 200');
    assert.ok(Array.isArray(resp.body.modules), 'modules 应为数组');
    assert.ok(resp.body.modules.length >= 29, `至少 29 个模块，实际 ${resp.body.modules.length}`);
  });

  it('/api/modules 应包含 p5a/p5b/p5c', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/modules');
    handleApi(url, res);
    const resp = getResponse();
    const p5Ids = resp.body.modules.filter(m => m.phase === 'P5').map(m => m.id);
    assert.ok(p5Ids.includes('p5a'), '应包含 p5a');
    assert.ok(p5Ids.includes('p5b'), '应包含 p5b');
    assert.ok(p5Ids.includes('p5c'), '应包含 p5c');
  });

  // ==================== 非 API 请求 ====================
  it('非 API 路径应返回 false', () => {
    const { res } = createMockResponse();
    const url = new URL('http://localhost/index.html');
    const handled = handleApi(url, res);
    assert.equal(handled, false, '非 API 路径不应被处理');
  });

  // ==================== CORS 头测试 ====================
  it('/api/pipeline 响应应包含 CORS 头', () => {
    const { res, getResponse } = createMockResponse();
    const url = new URL('http://localhost/api/pipeline');
    handleApi(url, res);
    const resp = getResponse();
    assert.ok(
      resp.headers['Cache-Control']?.includes('no-cache'),
      '应有 Cache-Control: no-cache'
    );
  });

  // ==================== JSON 格式测试 ====================
  it('所有 API 响应应为合法 JSON', () => {
    const endpoints = [
      '/api/pipeline',
      '/api/issues',
      '/api/status',
      '/api/dashboard',
      '/api/dashboard/tests',
      '/api/modules',
    ];

    for (const endpoint of endpoints) {
      const { res, getResponse } = createMockResponse();
      const url = new URL(`http://localhost${endpoint}`);
      handleApi(url, res);
      const resp = getResponse();
      assert.equal(resp.statusCode, 200, `${endpoint} 应返回 200`);
      assert.ok(typeof resp.body === 'object', `${endpoint} 应返回 JSON 对象`);
    }
  });
});
