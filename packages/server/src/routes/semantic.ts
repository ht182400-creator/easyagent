/**
 * 语义分析路由（P1-1 第二批拆分产物）
 *
 * ── ⚠️ 本模块的约定 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. `projectRoot` 由调用方注入 —— 它取决于 `createApp` 的 `options.projectRoot`
 *      （Desktop 会传入自定义根目录），**不能**在本模块内从 `__dirname` 推导，
 *      否则"拆文件"会改变路径解析（这类 bug 极难定位）；
 *   3. `/api/semantic/file` 有**路径越界检查**（仅允许项目根目录内的文件），
 *      修改时不要破坏（`/api/files/browse` 同理）；
 *   4. 语义分析函数来自 `@easyagent/core`（本地符号索引，非 LSP 服务）。
 *
 * @module routes/semantic
 */

import type { Express } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildSemanticMap,
  searchSymbol,
  findReferences,
  getCodebaseOverview,
  analyzeFile,
  resetSemanticCache,
} from '@easyagent/core';

// ===================== 路由层语义地图缓存 =====================
// 背景：buildSemanticMap 是同步全仓扫描（读文件 + 正则提符号），单次常态 1~3 秒。
// 此前路由每次请求都直接重建，在机器繁忙时（vitest 并行 worker / Defender 扫描
// 新构建产物）会被拖慢 5~10 倍，击穿测试 15s 超时（2026-09-18 收官复验 b/c 实测）。
// core 的 SemanticTools 内部有 60s 缓存但仅限内部工具使用，REST 路由此前绕过了它，
// 这里按同一策略在路由层补齐（TTL / 参数级 key / refresh 强制重建）。

/** 缓存有效期（毫秒），与 core SemanticTools.CACHE_TTL 一致 */
const MAP_CACHE_TTL_MS = 60_000;

/** 缓存的语义地图（最近一次构建结果） */
let cachedMap: ReturnType<typeof buildSemanticMap> | null = null;
/** 缓存 key：workspace|depth|maxFiles 三元组，参数不同不共用 */
let cachedKey = '';
/** 缓存写入时间戳 */
let cachedAt = 0;

/**
 * 取缓存的语义地图，未命中或参数变化时重建
 *
 * @param workspace - 扫描根目录（findRepoRoot 会向上扩展到仓库根）
 * @param maxDepth - 目录扫描深度
 * @param maxFiles - 最多分析的文件数
 * @param force - 为 true 时跳过缓存强制重建（对应 refresh=true）
 */
function getOrBuildSemanticMap(
  workspace: string,
  maxDepth: number,
  maxFiles: number,
  force = false,
): ReturnType<typeof buildSemanticMap> {
  const key = `${workspace}|${maxDepth}|${maxFiles}`;
  const now = Date.now();
  if (!force && cachedMap && cachedKey === key && now - cachedAt < MAP_CACHE_TTL_MS) {
    return cachedMap;
  }
  cachedMap = buildSemanticMap(workspace, maxDepth, maxFiles);
  cachedKey = key;
  cachedAt = now;
  return cachedMap;
}

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

  /** 获取代码库语义地图 */
  app.get('/api/semantic/map', (req, res) => {
    try {
      const workspace = (req.query.path as string) || process.cwd();
      const maxDepth = parseInt(req.query.depth as string) || 6;
      const maxFiles = parseInt(req.query.maxFiles as string) || 300;
      const forceRefresh = req.query.refresh === 'true';

      if (forceRefresh) {
        // refresh=true 时连带清空 core 工具层缓存，再强制重建路由层缓存
        resetSemanticCache();
      }

      const map = getOrBuildSemanticMap(workspace, maxDepth, maxFiles, forceRefresh);

      res.json({
        success: true,
        root: map.root,
        stats: map.stats,
        symbolCount: map.symbolIndex.size,
        topSymbols: [...map.symbolIndex.entries()]
          .filter(([, syms]) => syms.length > 1)
          .sort(([, a], [, b]) => b.length - a.length)
          .slice(0, 50)
          .map(([name, syms]) => ({
            name,
            count: syms.length,
            locations: syms.slice(0, 5).map((s) => s.filePath + ':' + s.line),
          })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 搜索符号 */
  app.get('/api/semantic/search', (req, res) => {
    try {
      const query = req.query.q as string;
      const workspace = (req.query.path as string) || process.cwd();
      const caseSensitive = req.query.case === 'true';
      const kind = req.query.kind as string | undefined;

      if (!query) {
        return res.status(400).json({ error: '缺少 q 参数' });
      }

      // search 与 map 共用路由层缓存（key 含参数，不会串用不同扫描配置的结果）
      const map = getOrBuildSemanticMap(workspace, 8, 500);
      let results = searchSymbol(map, query, caseSensitive);
      if (kind) {
        results = results.filter((s) => s.kind === kind);
      }

      res.json({
        success: true,
        query,
        totalResults: results.length,
        results: results.slice(0, 100).map((s) => ({
          name: s.name,
          kind: s.kind,
          line: s.line,
          filePath: s.filePath,
          signature: s.signature,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  /** 查找符号引用 */
  app.get('/api/semantic/references', (req, res) => {
    try {
      const symbol = req.query.symbol as string;
      const workspace = (req.query.path as string) || process.cwd();

      if (!symbol) {
        return res.status(400).json({ error: '缺少 symbol 参数' });
      }

      // references 与 map 共用路由层缓存（key 含参数，不会串用不同扫描配置的结果）
      const map = getOrBuildSemanticMap(workspace, 8, 500);
      const refs = findReferences(map, symbol, workspace);

      res.json({
        success: true,
        symbol,
        totalReferences: refs.length,
        definitions: refs.filter((r) => r.kind === 'definition').length,
        usages: refs.filter((r) => r.kind === 'reference').length,
        references: refs.slice(0, 200).map((r) => ({
          filePath: r.filePath,
          line: r.line,
          kind: r.kind,
        })),
      });
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
