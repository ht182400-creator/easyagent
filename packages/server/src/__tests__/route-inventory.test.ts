/**
 * 路由清单快照测试 —— 重构的「安全网」
 *
 * ── 存在意义 ──
 * `server/src/index.ts` 现有 3800+ 行、90+ 条路由。做拆分重构（P1-1）时，
 * 纯代码搬迁的最大风险是**静默丢路由 / 改错路径**：现有集成测试只覆盖一部分，
 * 漏掉的部分不会报错，直到线上 404。
 *
 * 本测试把「注册了哪些路由」固化成基线文件，任何增删改都会立即失败，
 * 从而让"搬迁"变成**可证明等价**的操作。
 *
 * ── 更新方式 ──
 * 路由变更属于有意为之（新增/删除接口）时，执行：
 *   $env:UPDATE_ROUTE_INVENTORY='1'; pnpm --filter @easyagent/server test
 * 然后 **务必 review 基线文件的 diff**，确认每一处增删都是预期的。
 *
 * @module __tests__/route-inventory.test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { createApp } from '../index.js';
import { listRoutes, summarizeRoutes, type RouteRecord } from '../utils/routeInventory.js';

// ===================== 常量 =====================

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 基线文件路径（与测试同目录，便于 code review 时一并看到 diff） */
const BASELINE_PATH = join(__dirname, 'route-inventory.baseline.json');

/** 设置该环境变量则用当前实际路由覆盖基线（用于有意的接口增删） */
const UPDATE_MODE = process.env.UPDATE_ROUTE_INVENTORY === '1';

/**
 * 路由数量下限
 *
 * 独立于基线文件的双保险：即便基线被误覆盖成空数组，本断言仍会失败。
 * 当前实现为 93 条（82 个路径），保留 ~5 条余量以容忍合理的接口删减。
 */
const MIN_ROUTE_COUNT = 88;

// ===================== 测试 =====================

let app: Express;
let server: Server;
let actual: RouteRecord[] = [];

beforeAll(async () => {
  const result = await createApp();
  app = result.app;
  server = result.server;
  actual = listRoutes(app);
}, 15000);

afterAll(() => {
  if (server) server.close();
});

describe('路由清单快照 — 防止重构静默丢路由', () => {
  it('应能枚举到路由（枚举器本身有效）', () => {
    // 若 Express 内部结构变化导致枚举器失效，本用例会先失败，
    // 避免"枚举器返回空数组 → 基线不存在 → 静默通过"这种假阴性
    expect(actual.length).toBeGreaterThan(0);
  });

  it(`路由数量不得少于 ${MIN_ROUTE_COUNT} 条`, () => {
    expect(
      actual.length,
      `实际仅 ${actual.length} 条路由（${summarizeRoutes(actual)}），疑似路由注册被破坏`,
    ).toBeGreaterThanOrEqual(MIN_ROUTE_COUNT);
  });

  it('每条路由都必须有合法的方法与路径', () => {
    for (const r of actual) {
      expect(r.method, `路由 ${r.path} 的 method 非法`).toMatch(/^(GET|POST|PUT|PATCH|DELETE|ALL|HEAD|OPTIONS)$/);
      expect(r.path, '路由 path 不得为空').toBeTruthy();
      // 允许以 / 开头的常规路径，以及通配路径（如 SPA fallback 的 `*`）
      const looksLikePath = r.path.startsWith('/') || r.path.includes('*');
      expect(looksLikePath, `路由 ${r.method} ${r.path} 既不以 / 开头也不含通配符`).toBe(true);
      expect(/\s/.test(r.path), `路由 ${r.method} ${r.path} 不应包含空白字符`).toBe(false);
    }
  });

  it('路由清单不应存在重复（同方法同路径注册两次）', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of actual) {
      const key = `${r.method} ${r.path}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes, `存在重复注册的路由: ${dupes.join(', ')}`).toEqual([]);
  });

  it('路由清单应与基线逐条一致', () => {
    if (UPDATE_MODE) {
      mkdirSync(dirname(BASELINE_PATH), { recursive: true });
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(
          {
            _comment:
              '路由清单基线（由 __tests__/route-inventory.test.ts 生成）。' +
              '任何增删改都会让测试失败——这是重构安全网，请 review diff 后再更新。',
            _generatedAt: new Date().toISOString(),
            _count: actual.length,
            routes: actual,
          },
          null,
          2,
        )}\n`,
        'utf-8',
      );
      // 更新模式下不比对；打印数量供确认
      // eslint-disable-next-line no-console
      console.log(`[route-inventory] 基线已更新：${summarizeRoutes(actual)} → ${BASELINE_PATH}`);
      return;
    }

    expect(
      existsSync(BASELINE_PATH),
      `基线文件缺失：${BASELINE_PATH}\n` +
        '请用 UPDATE_ROUTE_INVENTORY=1 生成，并 review 其内容是否与当前实现一致。',
    ).toBe(true);

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as { routes: RouteRecord[] };

    // 逐条比对，并给出人类可读的差异说明（便于定位是"丢"还是"改"）
    const expectedKeys = baseline.routes.map((r) => `${r.method} ${r.path}`);
    const actualKeys = actual.map((r) => `${r.method} ${r.path}`);

    const missing = expectedKeys.filter((k) => !actualKeys.includes(k));
    const added = actualKeys.filter((k) => !expectedKeys.includes(k));

    expect(
      missing,
      `以下路由在本次改动后**消失**（重构最危险的信号）:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
    expect(added, `以下路由为**新增**（若非有意添加，请检查）:\n  ${added.join('\n  ')}`).toEqual([]);
    expect(actual).toEqual(baseline.routes);
  });
});
