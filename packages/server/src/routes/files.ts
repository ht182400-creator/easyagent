/**
 * 文件浏览路由（P1-1 第二批拆分产物）
 *
 * ── ⚠️ 本模块的约定 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. `projectRoot` 由调用方注入（同 semantic.ts —— 它取决于构建/宿主布局，
 *      不能在本模块内从 `__dirname` 推导）；
 *   3. **路径越界检查是本模块的安全边界**（`fullPath.startsWith(projectRoot)`），
 *      任何重构都不得移除或放宽；隐藏目录与 IGNORED_DIRS 的过滤同理；
 *   4. `BROWSEABLE_EXTENSIONS` 是"允许读取的文本类型"白名单 —— 只加不删，
 *      删除会让前端文件选择器突然看不到某类文件。
 *
 * @module routes/files
 */

import type { Express } from 'express';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 文件浏览路由依赖 */
export interface FilesRoutesDeps {
  /** 项目根目录（浏览的起点与越界检查基准） */
  projectRoot: string;
}

/** 可导入的文件扩展名（文本类型） */
const BROWSEABLE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.csv',
  '.tsv',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.htm',
  '.sh',
  '.bat',
  '.ps1',
  '.env',
  '.gitignore',
  '.vue',
  '.svelte',
]);

/** 忽略的目录名 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.codebuddy',
  'dist',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.svn',
  '.hg',
  '.easyagent',
]);

/**
 * 注册文件浏览路由
 *
 * @param app - Express 应用
 * @param deps - 显式注入的依赖
 */
export function registerFilesRoutes(app: Express, deps: FilesRoutesDeps): void {
  const { projectRoot } = deps;

  /** 浏览工作区文件 */
  app.get('/api/files/browse', (req, res) => {
    try {
      const relPath = (req.query.path as string) || '';
      const fullPath = relPath ? resolve(projectRoot, relPath) : projectRoot;

      // 安全检查：确保不越出工作区
      if (!fullPath.startsWith(projectRoot)) {
        return res.status(403).json({ success: false, error: '路径越界' });
      }
      if (!existsSync(fullPath)) {
        return res.status(404).json({ success: false, error: `路径不存在: ${relPath}` });
      }

      const entries = readdirSync(fullPath, { withFileTypes: true });
      const dirs: { name: string; itemCount: number }[] = [];
      const files: { name: string; ext: string; size: number; relativePath: string }[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue;

        const entryPath = join(fullPath, entry.name);
        const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          try {
            const subEntries = readdirSync(entryPath, { withFileTypes: true });
            const itemCount = subEntries.filter(
              (e) => !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name),
            ).length;
            dirs.push({ name: entry.name, itemCount });
          } catch (err) {
            dirs.push({ name: entry.name, itemCount: 0 });
          }
        } else if (entry.isFile()) {
          const ext = entry.name.includes('.')
            ? entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
            : '';
          if (BROWSEABLE_EXTENSIONS.has(ext)) {
            try {
              const stats = statSync(entryPath);
              files.push({
                name: entry.name,
                ext,
                size: stats.size,
                relativePath: entryRelPath,
              });
            } catch (err) {
              // 跳过无法读取的文件
            }
          }
        }
      }

      // 排序：目录在前，文件在后；各自按名称排序
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        success: true,
        currentPath: relPath || '',
        dirs,
        files,
        parentPath: relPath ? relPath.split('/').slice(0, -1).join('/') || '' : null,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });
}
