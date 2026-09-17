/**
 * 静态文件托管路由（Web Dashboard + 文档浏览器 + API 404 兜底）
 *
 * 从 `index.ts` 拆出（P1-1 第一阶段）。
 *
 * ── ⚠️ 注册顺序至关重要（本模块必须在所有 API 路由之后调用）──
 *   1. 先注册 `/api/*` 的 404 兜底，避免未匹配的 API 请求被 SPA fallback 吞掉
 *      而返回 200 + index.html（前端会把 HTML 当 JSON 解析，报出难以定位的错误）；
 *   2. 再挂载 `/doc-viewer` 与 Web Dashboard 静态资源；
 *   3. 最后才是 `app.get('*')` 的 SPA fallback。
 *
 * ── 关于 `__dirname` ──
 * 路径基准由调用方通过 `deps.serverDir` 传入（而非在本模块内取 `__dirname`）。
 * 原因：`__dirname` 的取值取决于**构建产物布局**，而非源码布局。
 * 从源码文件里取会让"拆文件"意外改变路径解析结果——这类 bug 极难定位。
 * 由 `createApp()`（它所在层级的产物路径是已验证的）传入即可保证行为不变。
 *
 * @module routes/staticFiles
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import express, { type Express } from 'express';
import { logger } from '@easyagent/core';

// ===================== 常量 =====================

/** 文档浏览器静态资源挂载前缀 */
const DOC_VIEWER_MOUNT_PATH = '/doc-viewer';

/** 插件安装根目录下的元数据/隐藏目录（扫描时跳过） */
const SKIPPED_PLUGIN_DIR_PREFIX = '.';

// ===================== 依赖声明 =====================

/** 静态文件路由所需依赖 */
export interface StaticRoutesDeps {
  /**
   * 服务端产物目录（即 `__dirname`）
   *
   * 用于推导 Web Dashboard 的 dist 路径：`<serverDir>/../../web/dist`
   */
  serverDir: string;
  /**
   * 文档浏览器兜底目录（开发调试用）
   *
   * 对应原实现的 `resolve(__dirname, '../../../../Doc_project/dist')`
   */
  docViewerFallbackDir: string;
}

// ===================== 实现 =====================

/**
 * 解析文档浏览器的静态资源目录
 *
 * 查找顺序（方案 D：优先插件安装目录 > 开发调试降级）：
 *   1. `~/.easyagent/plugins/<任意插件>/dist/`  （CI 构建产物，按已安装插件动态扫描）
 *   2. `~/.easyagent/plugins/<任意插件>/`       （dist.zip 解压到根目录）
 *   3. `Doc_project/dist`                       （开发调试降级）
 *
 * 注意：插件目录名是 GitHub 仓库名（带前缀），不能硬编码 obsidian-doc-viewer。
 *
 * @param fallbackDir - 开发调试降级目录
 * @returns 目录路径与来源说明
 */
function resolveDocViewerDir(fallbackDir: string): { dir: string; source: string } {
  const pluginsBaseDir = join(homedir(), '.easyagent', 'plugins');

  if (existsSync(pluginsBaseDir)) {
    for (const name of readdirSync(pluginsBaseDir)) {
      // 跳过元数据目录
      if (name === '.cache' || name.startsWith(SKIPPED_PLUGIN_DIR_PREFIX)) continue;
      const dir = join(pluginsBaseDir, name);
      const distPath = join(dir, 'dist');
      if (existsSync(join(distPath, 'index.html'))) {
        return { dir: distPath, source: `已安装插件: ${name}` };
      }
      if (existsSync(join(dir, 'index.html'))) {
        return { dir, source: `已安装插件(平铺): ${name}` };
      }
    }
  }

  if (existsSync(join(fallbackDir, 'index.html'))) {
    return { dir: fallbackDir, source: 'Doc_project 开发降级' };
  }
  return { dir: '', source: '未找到' };
}

/**
 * 注册静态文件相关路由
 *
 * ⚠️ 必须在**所有 API 路由注册完成之后**调用（原因见模块头注释）。
 *
 * @param app - Express 应用
 * @param deps - 依赖（见 {@link StaticRoutesDeps}）
 */
export function registerStaticRoutes(app: Express, deps: StaticRoutesDeps): void {
  // 从 server/dist 回退到 packages/web/dist（兼容多种启动目录）
  const webDistPath = join(deps.serverDir, '..', '..', 'web', 'dist');

  // 捕获未匹配的 /api/* 路径返回 404（避免被 SPA fallback 吞掉）
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: `API端点不存在: ${_req.method} ${_req.path}` });
  });

  // ========== 文档浏览器 (Doc_project) 静态文件 ==========
  const docViewer = resolveDocViewerDir(deps.docViewerFallbackDir);

  if (docViewer.dir) {
    app.use(DOC_VIEWER_MOUNT_PATH, express.static(docViewer.dir));
    app.get(`${DOC_VIEWER_MOUNT_PATH}/*`, (_req, res) => {
      const indexPath = join(docViewer.dir, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Doc Viewer Not Found');
      }
    });
    logger.info({ path: docViewer.dir, source: docViewer.source }, '文档浏览器静态文件已托管');
  } else {
    logger.warn(
      '文档浏览器 dist/ 未找到，请安装 obsidian-doc-viewer 插件（方案 D）或确保开发降级目录存在',
    );
  }

  // ========== Web Dashboard 静态文件服务 ==========
  if (existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    // SPA fallback: 非 API 路径返回 index.html
    app.get('*', (_req, res) => {
      const indexPath = join(webDistPath, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }
}

/** 解析文档浏览器兜底目录（供 createApp 组装依赖时使用） */
export function resolveDocViewerFallbackDir(serverDir: string): string {
  return resolve(serverDir, '..', '..', '..', '..', 'Doc_project', 'dist');
}
