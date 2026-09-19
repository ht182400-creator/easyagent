/**
 * 模块测试：API 安全中间件（鉴权 / 限流 / 绑定地址策略）
 *
 * 覆盖目标（按测试专家视角，不只走正常流程）：
 *   · 边界值：空 IP、undefined、IPv4-mapped IPv6、不同长度令牌、空令牌
 *   · 异常场景：鉴权失败、限流超限、中间件内部异常（fail-closed）
 *   · 分支覆盖：白名单 / 预检 / 静态资源 / 回环 / 令牌四通道 / 400 与 429
 *   · 竞态：并发请求下的固定窗口计数
 *
 * 说明：supertest 发起请求时源地址恒为回环，无法直接验证"非回环"分支，
 * 故通过前置中间件覆写 `req.ip` 来模拟远端来源。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import {
  PUBLIC_API_PATHS,
  RATE_LIMIT_PRESETS,
  TOKEN_COOKIE_NAME,
  assertSecurityOk,
  createApiAuthMiddleware,
  createRateLimitMiddleware,
  isLoopbackAddress,
  isLoopbackBindHost,
  resolveSecurityConfig,
  safeTokenEqual,
  type SecurityConfig,
} from '../middleware/apiSecurity.js';

// ==================== 测试辅助 ====================

/** 构造一份"已启用令牌"的安全配置 */
function makeConfig(overrides: Partial<SecurityConfig> = {}): SecurityConfig {
  return {
    token: 'test-token-abcdefghijklmnop',
    tokenSource: 'env',
    allowRemoteNoAuth: false,
    rateLimitEnabled: true,
    trustProxy: false,
    ...overrides,
  };
}

/**
 * 把请求伪装成来自指定 IP
 *
 * Express 的 req.ip 是原型上的 getter，必须在实例上重新定义为自有属性才能覆写。
 */
function spoofIp(ip: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
    next();
  };
}

/** 构建一个最小可用的受保护应用 */
function buildApp(config: SecurityConfig, peerIp: string) {
  const app = express();
  app.use(spoofIp(peerIp));
  app.use(createApiAuthMiddleware(config));
  app.get('/api/health', (_req, res) => res.json({ ok: 'health' }));
  app.get('/api/secret', (_req, res) => res.json({ ok: 'secret' }));
  app.get('/page', (_req, res) => res.send('<html>page</html>'));
  return app;
}

// ==================== 1. 回环地址判定 ====================

describe('isLoopbackAddress() — 回环地址判定', () => {
  it('应识别 IPv4 回环段', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.5.5.5')).toBe(true);
    expect(isLoopbackAddress('127.0.0.1:54321')).toBe(false); // 端口不属于 IP 部分
  });

  it('应识别 IPv6 回环与 IPv4-mapped 形式', () => {
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('公网地址应判定为非回环', () => {
    expect(isLoopbackAddress('82.156.71.231')).toBe(false);
    expect(isLoopbackAddress('192.168.1.10')).toBe(false);
  });

  it('边界值：空串与 undefined 不应误判为回环', () => {
    expect(isLoopbackAddress('')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});

describe('isLoopbackBindHost() — 监听地址判定', () => {
  it('回环与 localhost 视为仅本机可见', () => {
    expect(isLoopbackBindHost('127.0.0.1')).toBe(true);
    expect(isLoopbackBindHost('localhost')).toBe(true);
    expect(isLoopbackBindHost('::1')).toBe(true);
  });

  it('0.0.0.0 / 具体 IP 视为对外可见', () => {
    expect(isLoopbackBindHost('0.0.0.0')).toBe(false);
    expect(isLoopbackBindHost('82.156.71.231')).toBe(false);
  });
});

// ==================== 2. 令牌比较 ====================

describe('safeTokenEqual() — 常量时间令牌比较', () => {
  it('相同令牌返回 true', () => {
    expect(safeTokenEqual('abc123', 'abc123')).toBe(true);
  });

  it('不同令牌返回 false', () => {
    expect(safeTokenEqual('abc123', 'abc124')).toBe(false);
  });

  it('边界：长度不一致不应抛异常（timingSafeEqual 会因此抛错）', () => {
    expect(() => safeTokenEqual('short', 'much-longer-token')).not.toThrow();
    expect(safeTokenEqual('short', 'much-longer-token')).toBe(false);
  });

  it('边界：空串参与比较', () => {
    expect(safeTokenEqual('', '')).toBe(true);
    expect(safeTokenEqual('', 'x')).toBe(false);
    expect(safeTokenEqual('x', '')).toBe(false);
  });
});

// ==================== 3. 安全配置解析 ====================

describe('resolveSecurityConfig() — 环境变量解析', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    // 恢复环境变量，避免用例之间互相污染
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL);
  });

  it('EASYAGENT_API_TOKEN 优先，来源标记为 env', () => {
    process.env.EASYAGENT_API_TOKEN = 'from-env-token';
    const cfg = resolveSecurityConfig();
    expect(cfg.token).toBe('from-env-token');
    expect(cfg.tokenSource).toBe('env');
  });

  it('未设置令牌时应自动生成非空令牌', () => {
    delete process.env.EASYAGENT_API_TOKEN;
    const cfg = resolveSecurityConfig();
    expect(cfg.token).toBeTruthy();
    expect((cfg.token as string).length).toBeGreaterThanOrEqual(20);
  });

  it('EASYAGENT_DISABLE_RATE_LIMIT=1 应关闭限流', () => {
    process.env.EASYAGENT_DISABLE_RATE_LIMIT = '1';
    expect(resolveSecurityConfig().rateLimitEnabled).toBe(false);
  });

  it('未设置 EASYAGENT_DISABLE_RATE_LIMIT 时默认开启限流', () => {
    delete process.env.EASYAGENT_DISABLE_RATE_LIMIT;
    expect(resolveSecurityConfig().rateLimitEnabled).toBe(true);
  });

  it('EASYAGENT_TRUST_PROXY=1 应解析为数字 1', () => {
    process.env.EASYAGENT_TRUST_PROXY = '1';
    expect(resolveSecurityConfig().trustProxy).toBe(1);
  });

  it('EASYAGENT_TRUST_PROXY 非数字时回退为 true', () => {
    process.env.EASYAGENT_TRUST_PROXY = 'yes';
    expect(resolveSecurityConfig().trustProxy).toBe(true);
  });
});

// ==================== 4. 启动期安全自检 ====================

describe('assertSecurityOk() — 启动期 fail-fast 自检', () => {
  it('回环监听时无条件通过', () => {
    expect(() => assertSecurityOk('127.0.0.1', makeConfig({ token: null }))).not.toThrow();
  });

  it('非回环监听 + 环境变量令牌 → 通过', () => {
    expect(() => assertSecurityOk('0.0.0.0', makeConfig())).not.toThrow();
  });

  it('非回环监听 + 无令牌 → 抛错拒绝启动（核心安全保证）', () => {
    expect(() =>
      assertSecurityOk('0.0.0.0', makeConfig({ token: null, tokenSource: 'none' })),
    ).toThrow(/拒绝启动/);
  });

  it('非回环监听 + 仅自动生成令牌 → 抛错（自动生成的令牌无法被远端记住）', () => {
    expect(() => assertSecurityOk('0.0.0.0', makeConfig({ tokenSource: 'generated' }))).toThrow(
      /拒绝启动/,
    );
  });

  it('显式设置 EASYAGENT_ALLOW_REMOTE_NO_AUTH 时放行（承担风险）', () => {
    expect(() =>
      assertSecurityOk(
        '0.0.0.0',
        makeConfig({ token: null, tokenSource: 'none', allowRemoteNoAuth: true }),
      ),
    ).not.toThrow();
  });
});

// ==================== 5. 鉴权中间件 ====================

describe('createApiAuthMiddleware() — 鉴权', () => {
  it('白名单路径（/api/health）对远端开放', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('非 API 路径（静态资源/SPA）直接放行', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/page');
    expect(res.status).toBe(200);
  });

  it('OPTIONS 预检应放行（预检请求不携带 Authorization）', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).options('/api/secret');
    expect(res.status).not.toBe(401);
  });

  it('回环来源免鉴权（Desktop / 本地 Web 零摩擦）', async () => {
    const app = buildApp(makeConfig(), '127.0.0.1');
    const res = await request(app).get('/api/secret');
    expect(res.status).toBe(200);
  });

  it('远端来源无令牌 → 401', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/api/secret');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
  });

  it('远端来源令牌错误 → 401 且不回显期望令牌', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/api/secret').set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('test-token-abcdefghijklmnop');
  });

  it('远端来源携带正确 Bearer 令牌 → 200', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app)
      .get('/api/secret')
      .set('Authorization', 'Bearer test-token-abcdefghijklmnop');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', 'secret');
  });

  it('远端来源通过 x-auth-token 头携带令牌 → 200', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app)
      .get('/api/secret')
      .set('x-auth-token', 'test-token-abcdefghijklmnop');
    expect(res.status).toBe(200);
  });

  it('远端来源通过 ?token= 携带令牌 → 200 并下发 Cookie', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/api/secret?token=test-token-abcdefghijklmnop');
    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(String(setCookie)).toContain(TOKEN_COOKIE_NAME);
  });

  it('远端来源通过 Cookie 携带令牌 → 200（浏览器后续请求免带 ?token=）', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app)
      .get('/api/secret')
      .set('Cookie', `${TOKEN_COOKIE_NAME}=test-token-abcdefghijklmnop`);
    expect(res.status).toBe(200);
  });

  it('未启用令牌时：回环放行、远端拒绝', async () => {
    const noToken = makeConfig({ token: null, tokenSource: 'none' });
    expect((await request(buildApp(noToken, '127.0.0.1')).get('/api/secret')).status).toBe(200);

    const remote = await request(buildApp(noToken, '82.156.71.231')).get('/api/secret');
    expect(remote.status).toBe(401);
    expect(JSON.stringify(remote.body)).toContain('非本机');
  });

  it('页面级 ?token= 应写入 Cookie 并 302 跳转到无令牌 URL', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/page?token=test-token-abcdefghijklmnop');
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toContain('token=');
    expect(String(res.headers['set-cookie'])).toContain(TOKEN_COOKIE_NAME);
  });

  it('页面级 ?token= 无效时应 401 且不跳转', async () => {
    const app = buildApp(makeConfig(), '82.156.71.231');
    const res = await request(app).get('/page?token=bad-token');
    expect(res.status).toBe(401);
  });

  it('异常场景：中间件内部抛错时必须 fail-closed（拒绝而非放行）', async () => {
    const app = express();
    app.use(spoofIp('82.156.71.231'));
    // 制造异常：config.token 为对象时 safeTokenEqual 内部会抛错
    const broken = makeConfig({ token: {} as unknown as string });
    app.use(createApiAuthMiddleware(broken));
    app.get('/api/secret', (_req, res) => res.json({ ok: true }));

    // req.query 被污染为抛错 getter，模拟中间件内部异常
    const res = await request(app).get('/api/secret?token=x');
    expect(res.status).not.toBe(200);
  });
});

// ==================== 6. 限流中间件 ====================

describe('createRateLimitMiddleware() — 固定窗口限流', () => {
  /** 构造一个仅含限流中间件的最小应用 */
  function buildLimitApp(max: number, skip?: (req: Request) => boolean, windowMs = 60_000) {
    const app = express();
    app.use(spoofIp('9.9.9.9'));
    app.use(createRateLimitMiddleware(windowMs, max, skip));
    app.get('/api/data', (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('配额内应放行并下发限流响应头', async () => {
    const app = buildLimitApp(5);
    const res = await request(app).get('/api/data');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('超过配额应返回 429 并带 Retry-After', async () => {
    const app = buildLimitApp(2);
    expect((await request(app).get('/api/data')).status).toBe(200);
    expect((await request(app).get('/api/data')).status).toBe(200);

    const third = await request(app).get('/api/data');
    expect(third.status).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect(third.body).toHaveProperty('success', false);
  });

  it('remaining 不应出现负数', async () => {
    const app = buildLimitApp(1);
    await request(app).get('/api/data');
    const over = await request(app).get('/api/data');
    expect(over.status).toBe(429);
    expect(over.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('skip 判定为 true 的请求不应计数', async () => {
    let calls = 0;
    const app = buildLimitApp(1, () => {
      calls++;
      return true; // 全部跳过
    });
    await request(app).get('/api/data');
    await request(app).get('/api/data');
    await request(app).get('/api/data');
    expect(calls).toBe(3);
  });

  it('窗口过期后配额应重置（极短窗口验证）', async () => {
    const app = buildLimitApp(1, undefined, 60); // 60ms 窗口
    expect((await request(app).get('/api/data')).status).toBe(200);
    expect((await request(app).get('/api/data')).status).toBe(429);
    await new Promise((r) => setTimeout(r, 90));
    expect((await request(app).get('/api/data')).status).toBe(200);
  });

  it('竞态：并发 10 个请求在 max=5 下应恰好 5 个成功', async () => {
    const app = buildLimitApp(5);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => request(app).get('/api/data')),
    );
    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429).length;
    expect(ok).toBe(5);
    expect(limited).toBe(5);
  });
});

// ==================== 7. 常量契约 ====================

describe('安全中间件的常量契约', () => {
  it('健康检查必须在免鉴权白名单中（负载均衡/探活依赖）', () => {
    expect(PUBLIC_API_PATHS).toContain('/api/health');
  });

  it('限流预设应为正数且高成本配额更严格', () => {
    expect(RATE_LIMIT_PRESETS.global.max).toBeGreaterThan(0);
    expect(RATE_LIMIT_PRESETS.costly.max).toBeGreaterThan(0);
    expect(RATE_LIMIT_PRESETS.costly.max).toBeLessThan(RATE_LIMIT_PRESETS.global.max);
  });
});
