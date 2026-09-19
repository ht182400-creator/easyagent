/**
 * 安全中间件栈装配（P1-1 第六批拆分产物，自 bootstrap.ts 按职责二次拆出）
 *
 * ── 本模块的约定 ──
 *   注册顺序是**安全契约**，不可调整：
 *     同源预判定 → CORS → trust proxy → 限流 → express.json → 安全响应头 → API 鉴权
 *   ⚠️ 限流必须置于 express.json 之前（未授权超大请求体不应消耗 10MB 解析开销）；
 *   ⚠️ 必须先于所有 register*Routes 调用。
 *
 * @module middleware/securityStack
 */

import express, { type Express } from 'express';
import cors from 'cors';
import {
  createApiAuthMiddleware,
  createCostlyRateLimit,
  createGlobalRateLimit,
  type SecurityConfig,
} from './apiSecurity.js';

/**
 * 注册安全中间件栈
 *
 * @param app - Express 应用
 * @param securityConfig - API 安全配置（令牌 / 限流开关 / 反代层数）
 */
export function applySecurityMiddleware(app: Express, securityConfig: SecurityConfig): void {
  const corsEnv = process.env.CORS_ORIGIN;
  const allowedCorsOrigins = corsEnv
    ? corsEnv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // 同源预判定中间件（保留 cors 包做真正的头设置；此处只判定“是否同源”）
  // 浏览器加载同源子资源（<script>/<link>/同站 fetch）会带 Origin 头；
  // 服务器若在 NAT 后（网卡是私网 IP，对外是公网 IP），无法靠网卡地址判断同源，
  // 故比较 Origin 的 host:port 与本次请求的 Host 头是否一致：
  //   · 一致 → 视为同源，摘除 Origin，让后续 cors 按“无 origin（同源导航）”放行；
  //   · 不一致 → 保留 Origin，交给 cors 按 CORS_ORIGIN 白名单处理（跨域前端场景）。
  // 安全不变：仅“站点自身 + 白名单跨域源 + file:// 桌面版”可被放行；
  // 第三方恶意站点（Origin 与 Host 不符且不在白名单）仍会被 cors 拒绝。
  app.use((req, _res, next) => {
    const origin = req.headers.origin as string | undefined;
    const host = (req.headers.host || '') as string;
    if (origin) {
      try {
        const o = new URL(origin);
        if (o.host === host) {
          // 同源：等价于浏览器自身导航，cors 按无 origin 处理即可，无需反射具体源
          delete (req.headers as Record<string, string | undefined>).origin;
        }
      } catch {
        // Origin 非法，保留交 cors 拒绝
      }
    }
    next();
  });

  // CORS 配置（cors 包，标准安全控件，控制“哪些源可读取本 API / 携带凭据”）
  // 放行策略：无 Origin（同源导航） / file://（Electron Desktop）
  // / 本地开发（localhost/127.0.0.1） / CORS_ORIGIN 显式白名单（独立前端域名）
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin || origin === 'null' || origin.startsWith('file://')) {
          callback(null, true); // 同源导航 / Electron Desktop (file://)
          return;
        }
        if (allowedCorsOrigins.length > 0 && allowedCorsOrigins.includes(origin)) {
          callback(null, true); // 显式跨域白名单（独立前端域名访问）
          return;
        }
        if (
          origin.startsWith('http://localhost') ||
          origin.startsWith('http://127.0.0.1') ||
          origin.startsWith('http://[::1]')
        ) {
          callback(null, true); // 本地开发服务器
          return;
        }
        console.log(`[CORS] 拒绝未知 origin="${origin}"`);
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    }),
  );

  // 反向代理支持：置于 Caddy / Nginx 之后时**必须**设置 EASYAGENT_TRUST_PROXY，
  // 否则 req.ip 恒为代理地址，会导致「回环免鉴权」误判与限流聚簇到同一个桶。
  if (securityConfig.trustProxy) {
    app.set('trust proxy', securityConfig.trustProxy);
  }

  // ── 限流 ──
  // 必须置于 express.json 之前：未授权的超大请求体不应消耗 10MB 解析开销。
  // 注册方式为 `app.use(fn)`（不带路径前缀），详见 createGlobalRateLimit 注释。
  if (securityConfig.rateLimitEnabled) {
    app.use(createGlobalRateLimit());
    app.use(createCostlyRateLimit());
  }

  app.use(express.json({ limit: '10mb' }));

  /** 安全 HTTP 头中间件：防止常见 Web 攻击 */
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // 允许同源内嵌（文档浏览器需要在 iframe 中加载），其他来源拒绝
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  });

  // ── API 鉴权 ──
  // 策略：静态资源放行；回环地址（Desktop / 本地 Web）免鉴权；
  // 非回环请求必须携带有效令牌，否则 401。详见 middleware/apiSecurity.ts。
  app.use(createApiAuthMiddleware(securityConfig));
}
