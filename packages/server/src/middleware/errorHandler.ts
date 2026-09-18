/**
 * 全局错误处理中间件（P1-6）
 *
 * ── 本模块的约定 ──
 *   1. **注册位置**：必须在所有 register*Routes（含静态托管）**之后** ——
 *      Express 的错误中间件只捕获其之前注册的路由抛出的错误；
 *   2. **统一响应格式**（/api/* 路径）：
 *      `{ success: false, error: { code, message } }` —— 前端可按 code 分支处理；
 *   3. **不泄露内部信息**：响应体只含 message（错误堆栈只进日志，绝不进响应）；
 *   4. **asyncHandler**：本项目为 Express 4，异步路由的 rejection 不会被自动捕获，
 *      新增/修改 async 路由时必须用 `asyncHandler()` 包裹（旧路由逐步迁移）；
 *   5. 404 兜底在 routes/staticFiles.ts（正常响应流），与本模块（错误流）互不干扰。
 *
 * @module middleware/errorHandler
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '@easyagent/core';

/** 带状态码的错误对象约定（路由可用 err.statusCode 控制响应码） */
interface HttpError extends Error {
  statusCode?: number;
  status?: number;
}

/** 提取错误对象上的 HTTP 状态码（缺省 500） */
function extractStatusCode(err: HttpError): number {
  const code = err.statusCode ?? err.status;
  // 只接受合法的 4xx/5xx，防止错误对象带脏值把响应码搞坏
  if (typeof code === 'number' && code >= 400 && code < 600) {
    return Math.floor(code);
  }
  return 500;
}

/** 错误码：优先取 err.code（字符串），否则按状态码给通用名 */
function extractErrorCode(err: HttpError, statusCode: number): string {
  if (typeof err.code === 'string' && err.code.length > 0 && err.code.length <= 64) {
    return err.code;
  }
  if (statusCode === 400) return 'BAD_REQUEST';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

/**
 * 包装异步路由处理器：把 rejection 转发给 Express 错误中间件
 *
 * Express 4 不会捕获 async 函数的 rejection（会成为 unhandledRejection，
 * 请求悬挂无响应），因此所有 async 路由都应使用本包装：
 *
 * ```ts
 * app.get('/api/x', asyncHandler(async (req, res) => { ... }));
 * ```
 *
 * @param fn - 异步路由处理器
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * 全局错误处理中间件（Express 4 参数签名：err 在首位）
 *
 * - /api/*：统一 JSON 格式 `{ success: false, error: { code, message } }`
 * - 非 API 路径（静态资源等）：纯文本 500（避免把 HTML 错误页当 JSON 解析的问题反向出现）
 *
 * ⚠️ 必须在所有 register*Routes 之后 `app.use(errorHandler)` 注册。
 */
export function errorHandler(
  err: HttpError,
  req: Request,
  res: Response,
  // Express 通过函数参数个数识别错误中间件，此参数不可省略（保持 4 参数签名）
  _next: NextFunction,
): void {
  const statusCode = extractStatusCode(err);
  const errorCode = extractErrorCode(err, statusCode);

  // 错误堆栈只进日志：含方法、路径与完整堆栈，便于事后定位（绝不进响应体）
  logger.error(
    {
      method: req.method,
      path: req.originalUrl,
      statusCode,
      errorCode,
      errorMessage: err.message,
      stack: err.stack,
    },
    '未捕获的路由错误（全局错误中间件）',
  );

  // 响应已发出的场景（流式中途出错）：只能交给 Express 默认处理并关闭连接
  if (res.headersSent) {
    res.end();
    return;
  }

  if (req.path.startsWith('/api/')) {
    res.status(statusCode).json({
      success: false,
      error: {
        code: errorCode,
        // 4xx 通常是调用方的参数/权限问题，原文返回最有用；
        // 5xx 是服务端内部错误，只给友好提示（细节看日志）
        message: statusCode < 500 ? err.message : '服务器内部错误，请稍后重试（详情见服务端日志）',
      },
    });
    return;
  }

  res.status(statusCode).send('Internal Server Error');
}
