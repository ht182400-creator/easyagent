/**
 * API 安全中间件 — 鉴权 + 限流 + 绑定地址策略
 *
 * ── 为什么需要它（2026-09-18 安全审核结论）──
 * 改造前：`packages/server/src/index.ts` 中 **REST 侧完全没有入站鉴权**，
 * 只有 WebSocket 有一个 `if (serverToken && ...)` 的可选校验（不设环境变量即等于不校验）。
 * 而服务被部署在公网（`82.156.71.231:3456` / `CCCN.fable5.icu`）并以
 * `express.static` 同时对外提供页面。攻击者只需一条命令即可：
 *   · `POST /api/chat`              → 白嫖 API Key、消耗余额
 *   · `GET  /api/files/browse`      → 读取服务器任意文件
 *   · `POST /api/sandbox/:id/exec`  → 执行任意命令
 *   · `PUT  /api/providers/:id/key` → 覆盖用户密钥
 *   · `GET  /api/sessions`          → 读取全部对话历史
 *
 * ── 设计原则（安全且不伤本地体验）──
 *   1. **默认只监听 127.0.0.1**：不显式设置 HOST 时，服务根本不会暴露到公网。
 *   2. **回环地址免鉴权**：Desktop / 本地 Web 走 127.0.0.1，不引入任何使用摩擦。
 *      （这是关键取舍：本地场景零成本，暴露场景强制鉴权。）
 *   3. **非回环监听 + 无令牌 = 拒绝启动**（fail-fast），除非运维显式
 *      设置 `EASYAGENT_ALLOW_REMOTE_NO_AUTH=1` 承担风险。
 *   4. **令牌三种携带方式**：`Authorization: Bearer`、`?token=`、`x-auth-token`
 *      （桌面端与脚本用前者；浏览器首次访问用 `?token=` 换取 Cookie）。
 *   5. **限流**：内存固定窗口计数器，零新增依赖；`/api/chat`、`/api/run/*`
 *      这类"烧钱/长任务"端点用更严格的独立配额。
 *
 * ── 环境变量 ──
 *   EASYAGENT_API_TOKEN              显式指定令牌（未指定时自动生成并持久化）
 *   HOST                             监听地址（默认 127.0.0.1）
 *   EASYAGENT_ALLOW_REMOTE_NO_AUTH   非回环监听且无令牌时，显式允许裸奔（不推荐）
 *   EASYAGENT_TRUST_PROXY            反向代理层数，如 1（Caddy/Nginx 后置时必须设置）
 *   EASYAGENT_DISABLE_RATE_LIMIT     关闭限流（仅压测场景使用）
 *
 * @module server/middleware/apiSecurity
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '@easyagent/core';

// ===================== 常量（禁止在逻辑中裸写） =====================

/** 默认监听地址：仅本机，未显式配置时绝不暴露到公网 */
export const DEFAULT_BIND_HOST = '127.0.0.1';

/** 免鉴权的 API 路径白名单（健康检查必须公开，供探活/负载均衡使用） */
export const PUBLIC_API_PATHS: readonly string[] = ['/api/health'];

/** 令牌 Cookie 名称（浏览器首次用 ?token= 换取后长期免输） */
export const TOKEN_COOKIE_NAME = 'ea_api_token';

/** Cookie 有效期：7 天（秒） */
export const TOKEN_COOKIE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

/** 自动生成的令牌字节数（32 字节 = 256 bit，Base64URL 后 43 字符） */
const TOKEN_BYTES = 32;

/** 自动生成令牌的持久化路径 */
const TOKEN_FILE = join(homedir(), '.easyagent', 'api-token');

/** 全局限流窗口（毫秒） */
const GLOBAL_WINDOW_MS = 60_000;
/** 全局窗口内每 IP 最大请求数 */
const GLOBAL_MAX_REQUESTS = 600;

/** 高成本端点限流窗口（毫秒） */
const COSTLY_WINDOW_MS = 60_000;
/** 高成本端点窗口内每 IP 最大请求数（/api/chat → 一次可能调用多次 LLM） */
const COSTLY_MAX_REQUESTS = 30;

/** 被判定为"高成本"的 API 路径前缀 */
const COSTLY_PATH_PREFIXES: readonly string[] = [
  '/api/chat',
  '/api/run/',
  '/api/demo/',
  '/api/sandbox/',
  '/api/plugins/install',
];

/** 内存限流桶的清理阈值：桶数量超过该值时触发过期清理，防止内存无限增长 */
const BUCKET_CLEANUP_THRESHOLD = 5_000;

// ===================== 类型 =====================

/** 解析后的安全配置 */
export interface SecurityConfig {
  /** 令牌值（null 表示未启用鉴权） */
  token: string | null;
  /** 令牌来源：env（环境变量） / generated（自动生成并持久化） / none */
  tokenSource: 'env' | 'generated' | 'none';
  /** 是否允许非回环访问且不鉴权（危险，需显式开启） */
  allowRemoteNoAuth: boolean;
  /** 是否启用限流 */
  rateLimitEnabled: boolean;
  /** 反向代理层数 */
  trustProxy: number | boolean;
}

/** 固定窗口计数器条目 */
interface RateBucket {
  /** 窗口起始时间戳 */
  start: number;
  /** 窗口内计数 */
  count: number;
}

// ===================== 工具函数 =====================

/**
 * 判断是否为回环地址
 *
 * 覆盖 IPv4 回环段、IPv6 回环、以及 IPv4-mapped IPv6 形式。
 * Express 在未开启 trust proxy 时 `req.ip` 即为 socket 对端地址。
 *
 * @param addr - IP 地址字符串（可能为空或带 ::ffff: 前缀）
 */
export function isLoopbackAddress(addr?: string): boolean {
  if (!addr) return false;
  const ip = addr.startsWith('::ffff:') ? addr.slice(7) : addr;
  // IPv6 回环
  if (ip === '::1') return true;
  // IPv4 回环：严格限定 a.b.c.d 形式。
  // 不能简单用 startsWith('127.')——否则 "127.0.0.1:8080" 这类 host:port
  // 也会被误判为回环地址，从而绕过鉴权（安全漏洞）。
  return /^127(?:\.\d{1,3}){3}$/.test(ip);
}

/**
 * 常量时间比较两个令牌，避免时序侧信道
 *
 * `timingSafeEqual` 要求两个 Buffer 长度一致，否则抛异常，故需先做长度判断。
 *
 * @param a - 待校验令牌
 * @param b - 期望令牌
 */
export function safeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * 从 Cookie 头中解析指定名称的值
 *
 * 不引入 cookie-parser 依赖，手写解析（格式简单且可控）。
 */
function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/**
 * 生成并持久化访问令牌
 *
 * 首次运行自动生成，之后复用同一令牌（避免重启即失效导致客户端断连）。
 * 文件写入失败不阻断启动 —— 仅在内存中使用本次生成的令牌。
 *
 * @returns 令牌字符串
 */
function generateToken(): string {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  try {
    const dir = join(homedir(), '.easyagent');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(TOKEN_FILE, token, { encoding: 'utf8', mode: 0o600 });
    try {
      chmodSync(TOKEN_FILE, 0o600); // Windows 上可能无效，忽略失败
    } catch {
      /* 平台不支持时忽略 */
    }
    logger.info(`已生成 API 访问令牌并保存到 ${TOKEN_FILE}`);
  } catch (err) {
    logger.warn(
      { error: (err as Error).message },
      'API 令牌持久化失败（本次运行仍可使用内存令牌）',
    );
  }
  return token;
}

/**
 * 解析安全配置（环境变量 → 结构化配置）
 *
 * 令牌优先级：`EASYAGENT_API_TOKEN` > 持久化文件 > 自动生成。
 */
export function resolveSecurityConfig(): SecurityConfig {
  const envToken = process.env.EASYAGENT_API_TOKEN?.trim();
  let token: string | null = null;
  let tokenSource: SecurityConfig['tokenSource'] = 'none';

  if (envToken) {
    token = envToken;
    tokenSource = 'env';
  } else {
    try {
      if (existsSync(TOKEN_FILE)) {
        const saved = readFileSync(TOKEN_FILE, 'utf8').trim();
        if (saved) {
          token = saved;
          tokenSource = 'generated';
        }
      }
    } catch (err) {
      logger.warn({ error: (err as Error).message }, '读取已持久化的 API 令牌失败');
    }
    if (!token) {
      token = generateToken();
      tokenSource = 'generated';
    }
  }

  const trustProxyRaw = process.env.EASYAGENT_TRUST_PROXY;
  const trustProxy = trustProxyRaw ? Number(trustProxyRaw) || true : false;

  return {
    token,
    tokenSource,
    allowRemoteNoAuth: process.env.EASYAGENT_ALLOW_REMOTE_NO_AUTH === '1',
    rateLimitEnabled: process.env.EASYAGENT_DISABLE_RATE_LIMIT !== '1',
    trustProxy,
  };
}

/**
 * 判定监听地址是否只对本机可见
 *
 * @param host - 监听地址（HOST 环境变量值）
 */
export function isLoopbackBindHost(host: string): boolean {
  return isLoopbackAddress(host) || host === 'localhost';
}

/**
 * 启动期安全自检
 *
 * 规则：非回环监听 + 未显式允许裸奔 → 直接拒绝启动（fail-fast）。
 * 宁可起不来，也不能悄悄把 API Key 与文件系统暴露到公网。
 *
 * @param bindHost - 实际监听地址
 * @param config - 安全配置
 * @throws 当配置存在安全风险且未被显式豁免时
 */
export function assertSecurityOk(bindHost: string, config: SecurityConfig): void {
  if (isLoopbackBindHost(bindHost)) return;
  if (config.token && config.tokenSource === 'env') return;
  if (config.allowRemoteNoAuth) {
    logger.error(
      `⚠️ 危险配置：正在以 ${bindHost} 监听且未设置 EASYAGENT_API_TOKEN，` +
        '所有 API 将对公网开放（含文件浏览、命令执行、密钥写入）。' +
        '仅因设置了 EASYAGENT_ALLOW_REMOTE_NO_AUTH=1 而继续启动。',
    );
    return;
  }
  throw new Error(
    `拒绝启动：HOST=${bindHost} 会将对公网开放 API，但未设置 EASYAGENT_API_TOKEN。\n` +
      '  修复方式（任选其一）：\n' +
      '    1) 设置访问令牌：set EASYAGENT_API_TOKEN=<你的强随机字符串>（推荐）\n' +
      '    2) 仅本机访问：不设置 HOST（默认 127.0.0.1）\n' +
      '    3) 明确承担风险：set EASYAGENT_ALLOW_REMOTE_NO_AUTH=1（不推荐）',
  );
}

/**
 * 生成启动期安全摘要（用于日志展示）
 */
export function describeSecurityConfig(bindHost: string, config: SecurityConfig): string {
  const authPart =
    config.token === null ? '鉴权: 关闭' : `鉴权: 开启（令牌来源=${config.tokenSource}）`;
  return (
    `监听=${bindHost} · ${authPart} · ` +
    `限流=${config.rateLimitEnabled ? '开启' : '关闭'} · ` +
    `回环免鉴权=是 · 反向代理层数=${String(config.trustProxy)}`
  );
}

// ===================== 中间件：鉴权 =====================

/**
 * 创建 API 鉴权中间件
 *
 * 放行规则（按顺序判定）：
 *   1. 非 `/api` 路径 → 直接放行（静态资源本身不含敏感数据）
 *   2. `OPTIONS` 预检 → 放行（CORS 预检不带 Authorization）
 *   3. 白名单路径（`/api/health`）→ 放行
 *   4. 来自回环地址 → 放行（Desktop / 本地 Web，零摩擦）
 *   5. 令牌正确（Bearer / query / header / Cookie）→ 放行，并下发 Cookie
 *   6. 其余 → 401
 *
 * 另：当以 `/`（页面）访问并携带 `?token=xxx` 时，校验通过后写入 Cookie
 * 并 302 跳转到去掉 token 的干净 URL —— 让浏览器用户只需输一次令牌。
 */
export function createApiAuthMiddleware(config: SecurityConfig): RequestHandler {
  return function apiAuth(req: Request, res: Response, next: NextFunction): void {
    try {
      // ── 步骤 1：页面级令牌换取 Cookie（浏览器首次访问场景）──
      const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
      if (!req.path.startsWith('/api') && queryToken && config.token) {
        if (safeTokenEqual(queryToken, config.token)) {
          res.setHeader(
            'Set-Cookie',
            `${TOKEN_COOKIE_NAME}=${encodeURIComponent(queryToken)}; Path=/; ` +
              `Max-Age=${TOKEN_COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax`,
          );
          // 去掉 URL 中的 token 参数（避免残留在浏览器历史/Referer 中），
          // 并清理因摘除而产生的孤立 ? / & 分隔符
          const cleanUrl = req.originalUrl
            .replace(/([?&])token=[^&]*(&?)/, (_m, p1: string, p2: string) => (p2 ? p1 : ''))
            .replace(/\?&/, '?')
            .replace(/&&/g, '&')
            .replace(/[?&]$/, '');
          logger.info({ ip: req.ip }, '浏览器已通过 ?token= 换取访问 Cookie');
          res.redirect(302, cleanUrl || '/');
          return;
        }
        logger.warn({ ip: req.ip }, '浏览器携带的 ?token= 无效');
        res.status(401).json({ success: false, error: '访问令牌无效' });
        return;
      }

      // ── 步骤 1.5：静态资源与 SPA 路由直接放行 ──
      if (!req.path.startsWith('/api')) {
        next();
        return;
      }

      // ── 步骤 2：CORS 预检放行 ──
      if (req.method === 'OPTIONS') {
        next();
        return;
      }

      // ── 步骤 3：白名单 ──
      if (PUBLIC_API_PATHS.includes(req.path)) {
        next();
        return;
      }

      // ── 步骤 4：未启用令牌 → 仅允许回环访问 ──
      if (!config.token) {
        if (isLoopbackAddress(req.ip)) {
          next();
          return;
        }
        logger.warn({ ip: req.ip, path: req.path }, '拒绝非回环访问：未配置访问令牌');
        res.status(401).json({
          success: false,
          error: '服务未配置访问令牌，且请求来自非本机地址，已拒绝',
        });
        return;
      }

      // ── 步骤 5：回环地址免鉴权（本地应用零摩擦）──
      if (isLoopbackAddress(req.ip)) {
        logger.debug({ ip: req.ip, path: req.path, reason: 'loopback' }, 'API 鉴权通过');
        next();
        return;
      }

      // ── 步骤 6：校验令牌（Bearer / query / header / Cookie）──
      const authHeader = req.headers.authorization;
      const bearer =
        typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
          ? authHeader.slice(7).trim()
          : null;
      const headerToken =
        typeof req.headers['x-auth-token'] === 'string' ? req.headers['x-auth-token'] : null;
      const cookieToken = readCookie(req, TOKEN_COOKIE_NAME);

      const provided = bearer || queryToken || headerToken || cookieToken;
      if (provided && safeTokenEqual(provided, config.token)) {
        // 记录令牌携带方式：排查"为什么这个客户端一直 401"时最有用的线索
        logger.debug(
          {
            ip: req.ip,
            path: req.path,
            reason: 'token',
            via: bearer ? 'bearer' : queryToken ? 'query' : headerToken ? 'header' : 'cookie',
          },
          'API 鉴权通过',
        );
        // 通过 query/header 认证的浏览器请求，顺手补发 Cookie，后续请求免带令牌
        if (!cookieToken && (queryToken || bearer)) {
          res.setHeader(
            'Set-Cookie',
            `${TOKEN_COOKIE_NAME}=${encodeURIComponent(config.token)}; Path=/; ` +
              `Max-Age=${TOKEN_COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax`,
          );
        }
        next();
        return;
      }

      logger.warn({ ip: req.ip, path: req.path, hasToken: !!provided }, 'API 鉴权失败');
      res.status(401).json({
        success: false,
        error: '未授权：需要有效的访问令牌（Authorization: Bearer <token>）',
      });
    } catch (err) {
      // 鉴权中间件自身异常必须 fail-closed（拒绝访问），绝不能放行
      logger.error(
        { error: (err as Error).message, stack: (err as Error).stack },
        'API 鉴权中间件异常，已按失败关闭处理',
      );
      res.status(500).json({ success: false, error: '鉴权处理异常' });
    }
  };
}

// ===================== 中间件：限流 =====================

/**
 * 创建固定窗口限流中间件
 *
 * 采用"固定窗口计数器"而非令牌桶：实现简单、可预测、零依赖，
 * 对本项目（单进程、低并发的自托管场景）足够。
 *
 * 内存安全：桶数量超过阈值时清理过期条目，防止被大量伪造 IP 打爆内存。
 *
 * @param windowMs - 窗口长度（毫秒）
 * @param max - 窗口内允许的最大请求数
 * @param skip - 可选的跳过判定（返回 true 则不计数）
 */
export function createRateLimitMiddleware(
  windowMs: number,
  max: number,
  skip?: (req: Request) => boolean,
): RequestHandler {
  const buckets = new Map<string, RateBucket>();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    try {
      if (skip?.(req)) {
        next();
        return;
      }

      const key = req.ip || 'unknown';
      const now = Date.now();

      // 内存保护：桶过多时清理过期项（固定窗口过期后即可安全移除）
      if (buckets.size > BUCKET_CLEANUP_THRESHOLD) {
        for (const [k, v] of buckets) {
          if (now - v.start >= windowMs) buckets.delete(k);
        }
      }

      let bucket = buckets.get(key);
      if (!bucket || now - bucket.start >= windowMs) {
        bucket = { start: now, count: 0 };
        buckets.set(key, bucket);
      }
      bucket.count += 1;

      // 接近配额时提前留痕：便于在真正被限流前发现异常流量来源
      if (bucket.count > max * 0.8) {
        logger.debug(
          { ip: key, path: req.path, count: bucket.count, max, windowMs },
          '限流用量接近配额',
        );
      }

      const remaining = Math.max(0, max - bucket.count);
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((bucket.start + windowMs) / 1000)));

      if (bucket.count > max) {
        const retryAfter = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        logger.warn({ ip: key, path: req.path, count: bucket.count, max }, '触发限流，已拒绝请求');
        res.status(429).json({
          success: false,
          error: `请求过于频繁，请在 ${retryAfter} 秒后重试`,
        });
        return;
      }

      next();
    } catch (err) {
      // 限流异常不应导致业务中断，但必须留痕
      logger.error({ error: (err as Error).message }, '限流中间件异常，已放行当前请求');
      next();
    }
  };
}

/**
 * 全局 API 限流（宽松，防扫描）
 *
 * 注意：本中间件**必须以 `app.use(fn)` 形式注册**（不带路径前缀），
 * 否则 Express 会把 `req.path` 重写为去除挂载前缀后的相对路径，
 * 导致下方基于完整路径的判定失效。
 */
export function createGlobalRateLimit(): RequestHandler {
  return createRateLimitMiddleware(
    GLOBAL_WINDOW_MS,
    GLOBAL_MAX_REQUESTS,
    // 静态资源不计数（页面加载会并发拉取大量 chunk）；
    // 非 API 路径与健康检查白名单同样不计入
    (req) => !req.path.startsWith('/api') || PUBLIC_API_PATHS.includes(req.path),
  );
}

/**
 * 高成本端点限流（严格，防刷钱与长任务打爆）
 */
export function createCostlyRateLimit(): RequestHandler {
  return createRateLimitMiddleware(
    COSTLY_WINDOW_MS,
    COSTLY_MAX_REQUESTS,
    (req) => !COSTLY_PATH_PREFIXES.some((p) => req.path.startsWith(p)),
  );
}

/** 供测试与文档引用的限流阈值（只读） */
export const RATE_LIMIT_PRESETS = {
  global: { windowMs: GLOBAL_WINDOW_MS, max: GLOBAL_MAX_REQUESTS },
  costly: { windowMs: COSTLY_WINDOW_MS, max: COSTLY_MAX_REQUESTS },
} as const;
