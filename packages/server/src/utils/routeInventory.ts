/**
 * 路由清单枚举工具
 *
 * ── 为什么需要它 ──
 * `packages/server/src/index.ts` 达 3800+ 行、注册 90+ 条路由。做纯搬迁式重构
 * （拆分成 routes/ 模块）时，最大的风险是**静默丢路由或改错路径** ——
 * 现有集成测试只覆盖其中一部分，漏掉的那部分不会报错，直到线上 404 才被发现。
 *
 * 本模块把"当前注册了哪些路由"变成可断言的清单，配合快照测试
 * （`__tests__/route-inventory.test.ts`）即可保证重构前后路由集合**逐条一致**。
 *
 * @module utils/routeInventory
 */

import { METHODS as HTTP_METHODS } from 'node:http';
import type { Express } from 'express';

// ===================== 常量 =====================

/**
 * 合法 HTTP 方法集合（小写）
 *
 * 用于识别 `app.all(path, handler)` —— Express 内部会把 `route.methods`
 * 展开成**全部 35 个 HTTP 动词**，若不归一化，一条 `app.all` 会在清单里
 * 变成 35 条记录，淹没真正有意义的差异。
 */
const HTTP_METHOD_SET = new Set(HTTP_METHODS.map((m) => m.toLowerCase()));

/** 判定为「全方法注册」的最小方法数阈值 */
const ALL_METHODS_MIN_COUNT = 20;

// ===================== 类型 =====================

/** 单条路由记录 */
export interface RouteRecord {
  /** HTTP 方法（大写） */
  method: string;
  /** 路由路径（Express 原样，如 `/api/plugins/:id`） */
  path: string;
}

/** Express 内部 layer 结构（仅声明用到的字段，避免 any 扩散） */
interface ExpressLayer {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
    stack?: unknown[];
  };
  name?: string;
  regexp?: RegExp;
  handle?: {
    stack?: ExpressLayer[];
  };
}

// ===================== 实现 =====================

/**
 * 从 Express 的 layer 正则中尽力还原挂载路径前缀
 *
 * 说明：Express 不保留原始挂载字符串，只能从编译后的正则反推。
 * 本项目当前**没有嵌套 router**（都是直接注册在 app 上），此函数仅作为
 * 递归兜底；无法识别时返回空串（此时路由路径仍可用于差异比对）。
 *
 * @param regexp - Express layer 的正则
 */
function extractMountPrefix(regexp?: RegExp): string {
  if (!regexp) return '';
  // 形如 /^\/doc-viewer\/?(?=\/|$)/i → 提取 doc-viewer
  const m = /^\^\\\/([^\\/?]+)/.exec(regexp.source);
  return m ? `/${m[1]}` : '';
}

/**
 * 枚举 Express 应用已注册的全部路由
 *
 * 结果按「路径 → 方法」排序，保证输出稳定（可用于快照比对）。
 * 同时递归处理嵌套 router（若有）。
 *
 * @param app - Express 应用实例
 * @returns 排序后的路由清单
 */
export function listRoutes(app: Express): RouteRecord[] {
  const out: RouteRecord[] = [];

  /** 递归收集 */
  function walk(layers: ExpressLayer[] | undefined, prefix: string): void {
    if (!layers) return;
    for (const layer of layers) {
      // ① 直接注册的路由
      if (layer.route) {
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        const methodEntries = Object.entries(layer.route.methods).filter(([, enabled]) => enabled);
        // app.all(...) 会被 Express 展开为全部 HTTP 动词，此处归一化为单条 ALL
        const normalized = normalizeMethods(methodEntries.map(([m]) => m));
        for (const p of paths) {
          for (const method of normalized) {
            out.push({ method, path: joinPath(prefix, p) });
          }
        }
        continue;
      }
      // ② 嵌套 router（app.use('/x', router)）
      if (layer.handle?.stack) {
        walk(layer.handle.stack, prefix + extractMountPrefix(layer.regexp));
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = (app as any)._router as { stack?: ExpressLayer[] } | undefined;
  walk(router?.stack, '');

  return out.sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
  );
}

/** 拼接前缀与路径，避免出现 `//` */
function joinPath(prefix: string, path: string): string {
  if (!prefix) return path || '/';
  if (path === '/' || path === '') return prefix;
  return `${prefix}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * 归一化 HTTP 方法列表
 *
 * `app.all(path, handler)` 在 Express 内部会使 `route.methods` 包含全部
 * HTTP 动词（~35 个）。若不归一化，一条 `app.all` 会占据清单里 35 行，
 * 让真实差异被噪声淹没。此处统一折叠为单条 `ALL`。
 *
 * @param methods - layer.route.methods 中为 true 的方法名（小写）
 * @returns 归一化后的大写方法名列表
 */
function normalizeMethods(methods: readonly string[]): string[] {
  if (methods.includes('_all')) return ['ALL'];
  if (methods.length >= ALL_METHODS_MIN_COUNT && methods.every((m) => HTTP_METHOD_SET.has(m))) {
    return ['ALL'];
  }
  return methods.map((m) => m.toUpperCase()).sort();
}

/**
 * 统计路由的稳定性摘要（用于日志与快速断言）
 *
 * @param routes - 路由清单
 * @returns 形如 `93 routes (18 paths × methods)`
 */
export function summarizeRoutes(routes: readonly RouteRecord[]): string {
  const paths = new Set(routes.map((r) => r.path));
  return `${routes.length} routes (${paths.size} paths)`;
}
