/**
 * 全局错误处理中间件测试（P1-6）
 *
 * 覆盖维度（按测试规范）：
 *   - 正常值：sync 抛错 / asyncHandler 包裹的 rejection → 统一 JSON 格式
 *   - 边界值：err.statusCode 合法 4xx 透传、非法值回退 500；err.code 透传；非 /api 路径纯文本
 *   - 异常场景：headersSent（流式中途出错）不重复写响应头；错误堆栈不进响应体
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { asyncHandler, errorHandler } from '../middleware/errorHandler.js';

/** 构建最小测试应用：注册若干抛错路由 + 全局错误中间件 */
function buildApp() {
  const app = express();

  app.get('/api/sync-throw', () => {
    throw new Error('同步爆炸');
  });

  app.get('/api/async-reject', asyncHandler(async () => {
    throw new Error('异步爆炸');
  }));

  app.get('/api/status-error', asyncHandler(async (_req, res) => {
    // 模拟业务错误：带 statusCode 与 code
    const err = new Error('资源不存在') as Error & { statusCode?: number; code?: string };
    err.statusCode = 404;
    err.code = 'SESSION_NOT_FOUND';
    throw err;
  }));

  app.get('/api/dirty-status', asyncHandler(async () => {
    // 脏 statusCode（3xx）应回退 500
    const err = new Error('脏状态码') as Error & { statusCode?: number };
    err.statusCode = 302;
    throw err;
  }));

  // 非 API 路径的错误
  app.get('/some-page', () => {
    throw new Error('静态页错误');
  });

  app.use(errorHandler);
  return app;
}

describe('errorHandler — /api/* 统一 JSON 格式', () => {
  it('sync 抛错 → 500 + { success:false, error:{ code, message } }', async () => {
    const res = await request(buildApp()).get('/api/sync-throw');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    // 5xx 不泄露内部错误细节
    expect(res.body.error.message).not.toContain('同步爆炸');
    expect(res.body.error.message).toContain('服务器内部错误');
  });

  it('asyncHandler 包裹的 rejection → 同样被捕获为 500', async () => {
    const res = await request(buildApp()).get('/api/async-reject');
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('业务错误 statusCode=404 + code → 原样透传（4xx 返回原始 message）', async () => {
    const res = await request(buildApp()).get('/api/status-error');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    expect(res.body.error.message).toBe('资源不存在');
  });

  it('脏 statusCode（3xx）回退 500', async () => {
    const res = await request(buildApp()).get('/api/dirty-status');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('errorHandler — 非 API 路径', () => {
  it('静态路径错误 → 纯文本 500（不输出 JSON）', async () => {
    const res = await request(buildApp()).get('/some-page');
    expect(res.status).toBe(500);
    expect(res.text).toBe('Internal Server Error');
    expect(res.headers['content-type']).not.toContain('application/json');
  });
});

describe('errorHandler — headersSent 保护', () => {
  it('响应头已发出时不重复写响应（连接被 end() 收尾，请求不悬挂）', async () => {
    const app = express();
    app.get('/api/stream', (_req, res) => {
      res.status(200);
      // text/plain：避免 supertest 的 JSON 解析器对截断体报 Unexpected end of JSON
      res.setHeader('Content-Type', 'text/plain');
      res.write('{"partial":');
      // 流式中途抛错 → errorHandler 应走 headersSent 分支，仅 end() 收尾
      throw new Error('流中途爆炸');
    });
    app.use(errorHandler);

    // 若中间件试图重复写响应头会抛 ERR_HTTP_HEADERS_SENT，
    // 或请求悬挂 —— 两者都会让本用例失败/超时
    const res = await request(app).get('/api/stream');
    expect(res.status).toBe(200);
    // 响应体是已写出的半截内容（未被错误响应覆盖/追加）
    expect(res.text).toBe('{"partial":');
  });
});
