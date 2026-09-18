/**
 * 语义分析路由（P1-1 第二批拆分产物；P2 压测后性能重构）
 *
 * ── 性能设计（2026-09-18，依据压测 docs/76）──
 *   buildSemanticMap 是同步 CPU 密集操作（全仓扫描，实测 10s+）。
 *   三层防护：
 *   1. **worker_threads**：扫描在长驻 Worker 内执行，主线程事件循环永不被冻结
 *      （压测实锤：主线程同步扫描会冻结全部并发请求 10s+）；
 *   2. **SWR 缓存**（stale-while-revalidate）：60s 内命中直接返回；过期时
 *      **先返回陈旧结果 + 后台重建**（仅首次冷启动需等待 Worker 实际扫描）；
 *   3. **路径语义修正**：显式 path 参数不再向上扩展到仓库根 ——
 *      查子目录只扫子目录（此前 packages/server 的请求会被放大到全仓 10s+）。
 *
 * ── 与 core 的关系 ──
 *   扫描逻辑仍来自 @easyagent/core 的 buildSemanticMap/searchSymbol/findReferences，
 *   在 Worker 内通过动态 import 加载（core dist 为 ESM）。
 *
 * @module routes/semantic
 */

import type { Express } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resetSemanticCache, getCodebaseOverview, analyzeFile } from '@easyagent/core';

// ===================== Worker 宿主（长驻，扫描不冻结主线程） =====================

/** Worker 单任务超时（毫秒）：全仓扫描实测可达 10s+，给足余量 */
const WORKER_TIMEOUT_MS = 120_000;

/** Worker 内地图缓存有效期（毫秒）—— 与历史 60s 缓存策略一致 */
const WORKER_MAP_TTL_MS = 60_000;

/** 生成 Worker 源码（eval 模式：CJS 宿主 + 动态 import ESM 的 core dist） */
function buildWorkerSource(coreUrl: string): string {
  return `
const { parentPort, workerData } = require('node:worker_threads');
const TTL = ${WORKER_MAP_TTL_MS};
let cachedMap = null;
let cachedKey = '';
let cachedAt = 0;

async function getMap(m) {
  const key = m.workspace + '|' + m.maxDepth + '|' + m.maxFiles + '|' + (m.expandToRepoRoot ? 1 : 0);
  const now = Date.now();
  if (!m.force && cachedMap && cachedKey === key && now - cachedAt < TTL) return cachedMap;
  const { buildSemanticMap } = await import(workerData.coreUrl);
  cachedMap = buildSemanticMap(m.workspace, m.maxDepth, m.maxFiles, { expandToRepoRoot: !!m.expandToRepoRoot });
  cachedKey = key;
  cachedAt = now;
  return cachedMap;
}

parentPort.on('message', async (msg) => {
  try {
    let payload;
    if (msg.task === 'map') {
      const map = await getMap(msg);
      const topSymbols = [...map.symbolIndex.entries()]
        .filter(([, syms]) => syms.length > 1)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 50)
        .map(([name, syms]) => ({
          name,
          count: syms.length,
          locations: syms.slice(0, 5).map((s) => s.filePath + ':' + s.line),
        }));
      payload = {
        success: true,
        root: map.root,
        stats: map.stats,
        symbolCount: map.symbolIndex.size,
        topSymbols,
      };
    } else if (msg.task === 'search') {
      const map = await getMap(msg);
      let results = [...map.symbolIndex.values()].flat().filter((s) =>
        msg.caseSensitive ? s.name.includes(msg.query) : s.name.toLowerCase().includes(msg.query.toLowerCase()),
      );
      if (msg.kind) results = results.filter((s) => s.kind === msg.kind);
      payload = {
        success: true,
        query: msg.query,
        totalResults: results.length,
        results: results.slice(0, 100).map((s) => ({
          name: s.name, kind: s.kind, line: s.line, filePath: s.filePath, signature: s.signature,
        })),
      };
    } else if (msg.task === 'references') {
      const map = await getMap(msg);
      const { findReferences } = await import(workerData.coreUrl);
      const refs = findReferences(map, msg.symbol, msg.workspace);
      payload = {
        success: true,
        symbol: msg.symbol,
        totalReferences: refs.length,
        definitions: refs.filter((r) => r.kind === 'definition').length,
        usages: refs.filter((r) => r.kind === 'reference').length,
        references: refs.slice(0, 200).map((r) => ({ filePath: r.filePath, line: r.line, kind: r.kind })),
      };
    } else {
      throw new Error('未知任务类型: ' + msg.task);
    }
    parentPort.postMessage({ id: msg.id, ok: true, payload });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, ok: false, error: err.message });
  }
});
`;
}

/** 路由 → Worker 的请求消息 */
interface WorkerTask {
  task: 'map' | 'search' | 'references';
  workspace: string;
  maxDepth: number;
  maxFiles: number;
  expandToRepoRoot: boolean;
  force?: boolean;
  query?: string;
  symbol?: string;
  caseSensitive?: boolean;
  kind?: string;
}

/** Worker 宿主单例（懒创建；异常后下次请求自动重建） */
let worker: Worker | null = null;
let workerSeq = 0;
const pendingTasks = new Map<
  number,
  { resolve: (payload: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
>();

/**
 * 解析 core dist 的 file:// URL（Worker 内动态 import 用）
 *
 * ⚠️ 不能用 require.resolve('@easyagent/core')：core 的 exports 未暴露入口子路径。
 * 改为基于本模块位置探测（兼容 dist 打包与 src 测试两种布局）。
 */
function resolveCoreUrl(): string {
  // fileURLToPath 得到本文件真实路径；再向上探测 core/dist/index.js
  const selfPath = fileURLToPath(import.meta.url);
  const candidates = [
    // dist 布局: packages/server/dist/index.js → packages/core/dist/index.js
    resolve(selfPath, '..', '..', '..', 'core', 'dist', 'index.js'),
    // src 布局: packages/server/src/routes/semantic.ts → packages/core/dist/index.js
    resolve(selfPath, '..', '..', '..', '..', 'core', 'dist', 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  throw new Error('无法定位 @easyagent/core 的 dist 入口（candidates: ' + candidates.join(', ') + '）');
}

/** 获取（或重建）长驻 Worker */
function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(buildWorkerSource(resolveCoreUrl()), {
    eval: true,
    workerData: { coreUrl: resolveCoreUrl() },
  });
  w.on('message', (msg: { id: number; ok: boolean; payload?: unknown; error?: string }) => {
    const p = pendingTasks.get(msg.id);
    if (!p) return;
    pendingTasks.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.ok) p.resolve(msg.payload);
    else p.reject(new Error(msg.error || 'Worker 任务失败'));
  });
  w.on('error', (err) => {
    // Worker 崩溃：拒绝全部未决任务并丢弃实例（下次请求重建）
    for (const [, p] of pendingTasks) {
      clearTimeout(p.timer);
      p.reject(new Error(`语义 Worker 崩溃: ${err.message}`));
    }
    pendingTasks.clear();
    worker = null;
  });
  worker = w;
  return w;
}

/**
 * 向 Worker 提交任务并等待结果（Promise 封装 + 超时）
 */
function runWorkerTask(task: WorkerTask): Promise<unknown> {
  const w = getWorker();
  const id = ++workerSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTasks.delete(id);
      reject(new Error(`语义 Worker 任务超时（${WORKER_TIMEOUT_MS / 1000}s）: ${task.task}`));
    }, WORKER_TIMEOUT_MS);
    pendingTasks.set(id, {
      resolve: (payload) => {
        clearTimeout(timer);
        resolve(payload);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
      timer,
    });
    w.postMessage({ ...task, id });
  });
}

// ===================== SWR 缓存（stale-while-revalidate，仅 map 任务） =====================

/** map 结果缓存有效期（毫秒） */
const MAP_CACHE_TTL_MS = 60_000;

interface CacheEntry {
  payload: unknown;
  cachedAt: number;
}
const mapCache = new Map<string, CacheEntry>();
/** 正在后台重建的 key（防重复触发） */
const rebuilding = new Set<string>();

/** 缓存 key */
function mapKey(workspace: string, maxDepth: number, maxFiles: number): string {
  return `${workspace}|${maxDepth}|${maxFiles}`;
}

/**
 * 触发后台重建（fire-and-forget：完成后更新缓存，失败仅记日志）
 *
 * 内部用 force=true 绕过 Worker 内缓存，确保拿到新数据。
 */
function rebuildInBackground(task: WorkerTask, key: string): void {
  if (rebuilding.has(key)) return;
  rebuilding.add(key);
  runWorkerTask({ ...task, force: true })
    .then((payload) => {
      mapCache.set(key, { payload, cachedAt: Date.now() });
    })
    .catch((err) => {
      // 后台重建失败：保留陈旧缓存供后续 SWR，不影响已返回的响应
      console.error(`[semantic] 后台重建失败: ${(err as Error).message}`);
    })
    .finally(() => rebuilding.delete(key));
}

// ===================== 路由注册 =====================

/** 语义分析路由依赖 */
export interface SemanticRoutesDeps {
  /**
   * 项目根目录（路径越界检查的基准）
   *
   * 来自 `createApp(options).projectRoot`，Desktop 场景下由宿主传入。
   */
  projectRoot: string;
}

/**
 * 注册语义分析路由
 *
 * @param app - Express 应用
 * @param deps - 显式注入的依赖
 */
export function registerSemanticRoutes(app: Express, deps: SemanticRoutesDeps): void {
  const { projectRoot } = deps;

  /** 获取代码库语义地图（Worker 执行 + SWR 缓存，不阻塞事件循环） */
  app.get('/api/semantic/map', (req, res) => {
    try {
      const explicitPath = req.query.path as string | undefined;
      const workspace = explicitPath || process.cwd();
      const maxDepth = parseInt(req.query.depth as string) || 6;
      const maxFiles = parseInt(req.query.maxFiles as string) || 300;
      const forceRefresh = req.query.refresh === 'true';

      // 路径语义修正：显式 path 只扫该目录（不再被 findRepoRoot 放大到仓库根）；
      // 未传 path 时保留"扩展到仓库根"的原默认行为
      const expandToRepoRoot = !explicitPath;

      if (forceRefresh) {
        // refresh=true 时连带清空 core 工具层缓存
        resetSemanticCache();
      }

      const key = mapKey(workspace, maxDepth, maxFiles);
      const entry = mapCache.get(key);

      // ── SWR 分派 ──
      if (entry && Date.now() - entry.cachedAt < MAP_CACHE_TTL_MS) {
        // 新鲜命中
        res.json(entry.payload);
        return;
      }
      if (entry && !forceRefresh) {
        // 过期：先返回陈旧结果，后台静默重建
        rebuildInBackground(
          { task: 'map', workspace, maxDepth, maxFiles, expandToRepoRoot },
          key,
        );
        res.json(entry.payload);
        return;
      }

      // 冷启动 / 强制刷新：等待 Worker 实际构建（不冻结其他请求）
      runWorkerTask({ task: 'map', workspace, maxDepth, maxFiles, expandToRepoRoot, force: forceRefresh })
        .then((payload) => {
          mapCache.set(key, { payload, cachedAt: Date.now() });
          res.json(payload);
        })
        .catch((err) => {
          res.status(500).json({ success: false, error: (err as Error).message });
        });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 搜索符号（Worker 执行；Worker 内地图缓存复用，避免重复扫描） */
  app.get('/api/semantic/search', (req, res) => {
    try {
      const query = req.query.q as string;
      const workspace = (req.query.path as string) || process.cwd();
      const caseSensitive = req.query.case === 'true';
      const kind = req.query.kind as string | undefined;

      if (!query) {
        return res.status(400).json({ error: '缺少 q 参数' });
      }

      runWorkerTask({
        task: 'search',
        workspace,
        maxDepth: 8,
        maxFiles: 500,
        expandToRepoRoot: !req.query.path,
        query,
        caseSensitive,
        kind,
      })
        .then((payload) => res.json(payload))
        .catch((err) => res.status(500).json({ success: false, error: (err as Error).message }));
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 查找符号引用（Worker 执行） */
  app.get('/api/semantic/references', (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const workspace = (req.query.path as string) || process.cwd();

      if (!symbol) {
        return res.status(400).json({ error: '缺少 symbol 参数' });
      }

      runWorkerTask({
        task: 'references',
        workspace,
        maxDepth: 8,
        maxFiles: 500,
        expandToRepoRoot: !req.query.path,
        symbol,
      })
        .then((payload) => res.json(payload))
        .catch((err) => res.status(500).json({ success: false, error: (err as Error).message }));
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 获取代码库概览 */
  app.get('/api/semantic/overview', (req, res) => {
    try {
      const workspace = (req.query.path as string) || process.cwd();
      const overview = getCodebaseOverview(workspace);
      res.json({
        success: true,
        root: overview.root,
        stats: overview.stats,
        fileTree: overview.fileTree,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 分析单个文件 */
  app.get('/api/semantic/file', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: '缺少 path 参数' });
      }
      // 路径安全检查：确保不越出项目根目录
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(projectRoot)) {
        return res.status(403).json({ error: '路径越界，仅允许访问项目目录内的文件' });
      }
      if (!existsSync(resolvedPath)) {
        return res.status(404).json({ error: '文件不存在' });
      }
      const info = analyzeFile(resolvedPath);
      res.json({
        success: true,
        filePath: info.filePath,
        language: info.language,
        symbols: info.symbols,
        imports: info.imports,
        exports: info.exports,
        lineCount: info.lineCount,
        size: info.size,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
}
