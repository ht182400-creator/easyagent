/**
 * 服务端冒烟测试（P1-6）
 *
 * ── 前置条件 ──
 *   core 与 server 已构建（dist 存在）。CI 中由 smoke-test job 先行构建；
 *   本地手动运行：先 `pnpm --filter @easyagent/core build && pnpm --filter @easyagent/server build`。
 *
 * ── 流程 ──
 *   1. 随机空闲端口启动真实服务端（packages/server/dist/index.js）；
 *   2. 轮询 GET /api/health 直至 200（超时 60s）；
 *   3. 探测 /api/sessions 返回 JSON（会话管理器 + SQLite + 迁移机制全链路可用）；
 *   4. 优雅终止子进程，退出码 0 = 冒烟通过。
 *
 * 退出码：0 = 通过；1 = 任一环节失败（可直接用于 CI 门禁）。
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('smoke-test');

/** 健康检查总超时（毫秒） */
const HEALTH_TIMEOUT_MS = 60_000;
/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 500;
/** 进程退出后等待子进程回收的宽限（毫秒） */
const KILL_GRACE_MS = 5000;

/** 获取一个随机空闲端口（由操作系统分配，避免端口冲突） */
function getRandomPort() {
  const require = createRequire(import.meta.url);
  const net = require('node:net');
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/** 带超时的 fetch */
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 等待健康检查通过；超时抛错 */
async function waitHealthy(baseUrl) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`${baseUrl}/api/health`, 3000);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return body;
      }
    } catch {
      // 服务未就绪，继续轮询
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`健康检查超时（${HEALTH_TIMEOUT_MS / 1000}s）—— 服务端未能正常启动`);
}

/** 主流程 */
async function main() {
  const port = await getRandomPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverEntry = join(process.cwd(), 'packages', 'server', 'dist', 'index.js');

  log.info(`启动服务端（${serverEntry}）端口 ${port} ...`);
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      // 冒烟环境禁止任何外部依赖阻塞启动
      EASYAGENT_DISABLE_RATE_LIMIT: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  /** 收集子进程输出，失败时输出尾部帮助定位 */
  const outputTail = [];
  child.stdout.on('data', (d) => {
    outputTail.push(String(d));
    if (outputTail.length > 50) outputTail.shift();
  });
  child.stderr.on('data', (d) => {
    outputTail.push(String(d));
    if (outputTail.length > 50) outputTail.shift();
  });

  /** 统一收尾：杀子进程并等待回收 */
  let killed = false;
  const cleanup = () => {
    if (killed) return;
    killed = true;
    try {
      child.kill();
    } catch {
      // 子进程可能已退出
    }
  };
  child.on('exit', (code) => {
    if (!killed) {
      // 服务端在健康检查前自行退出 = 启动失败
      log.error(`服务端进程提前退出（code=${code}），输出尾部：\n${outputTail.join('')}`);
      process.exit(1);
    }
  });

  try {
    const health = await waitHealthy(baseUrl);
    log.info(`✅ /api/health → 200（${JSON.stringify(health)}）`);

    // 会话 API 探测：覆盖 SessionManager + SQLite + 迁移机制全链路
    const sessionsRes = await fetchWithTimeout(`${baseUrl}/api/sessions`, 5000);
    if (!sessionsRes.ok) {
      throw new Error(`/api/sessions → ${sessionsRes.status}（预期 200）`);
    }
    await sessionsRes.json();
    log.info('✅ /api/sessions → 200 application/json');

    log.info('✅ 冒烟测试通过');
  } catch (err) {
    log.error(`❌ 冒烟测试失败: ${err.message}`);
    log.error(`服务端输出尾部：\n${outputTail.join('')}`);
    process.exitCode = 1;
  } finally {
    cleanup();
    // 给子进程一点时间优雅退出，避免 CI 环境僵尸进程
    await new Promise((r) => setTimeout(r, KILL_GRACE_MS));
  }
}

main().catch((err) => {
  log.error(`冒烟测试脚本异常: ${err.message}\n${err.stack}`);
  process.exit(1);
});
