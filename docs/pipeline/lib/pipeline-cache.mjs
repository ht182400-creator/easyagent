/**
 * 管线缓存库 —— 文件级别的 mtime 缓存系统
 * 
 * 缓存策略：
 * - 今天的文件：每次重新解析（可能还在写入中）
 * - 历史文件：按 mtime 判断，未变化则直接使用缓存
 * 
 * 使用方式：
 *   import { loadCache, saveCache, isCacheValid } from './pipeline-cache.mjs';
 */

import fs from 'fs';
import path from 'path';

/**
 * 加载缓存文件
 * @param {string} cacheFilePath - .pipeline-cache.json 路径
 * @returns {{ snapshots: Object, fileResults: Object, generatedAt: string } | null}
 */
export function loadCache(cacheFilePath) {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const raw = fs.readFileSync(cacheFilePath, 'utf-8');
      const cache = JSON.parse(raw);
      if (cache && cache.snapshots && cache.fileResults) {
        return cache;
      }
    }
  } catch (e) {
    console.warn('[cache] 缓存读取失败，将全量重建:', e.message);
  }
  return null;
}

/**
 * 保存缓存文件
 * @param {string} cacheFilePath
 * @param {{ snapshots: Object, fileResults: Object }} cache
 */
export function saveCache(cacheFilePath, cache) {
  try {
    cache.generatedAt = new Date().toISOString();
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[cache] 缓存写入失败:', e.message);
  }
}

/**
 * 初始化空缓存结构
 * @returns {{ snapshots: Object, fileResults: Object, generatedAt: string }}
 */
export function createEmptyCache() {
  return { snapshots: {}, fileResults: {}, generatedAt: '' };
}

/**
 * 获取文件的快照指纹（mtimeMs + size）
 * @param {string} filePath - 文件绝对路径
 * @returns {{ mtimeMs: number, size: number } | null}
 */
export function getFileSnapshot(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

/**
 * 判断缓存是否对指定文件有效
 * @param {string} filePath - 文件绝对路径
 * @param {string} fileName - 文件名（用于判断是否今天）
 * @param {{ snapshots: Object, fileResults: Object } | null} cache - 缓存对象
 * @returns {boolean}
 */
export function isCacheValid(filePath, fileName, cache) {
  if (!cache || !cache.snapshots || !cache.fileResults) return false;

  const todayStr = getTodayStr();
  // 今天的文件不信任缓存（可能还在追加内容）
  if (fileName.startsWith(todayStr)) return false;

  const snap = getFileSnapshot(filePath);
  if (!snap) return false;

  const cachedSnap = cache.snapshots[fileName];
  if (!cachedSnap) return false;

  // mtime 和 size 都没变，且缓存中有该文件的结果
  const unchanged = cachedSnap.mtimeMs === snap.mtimeMs && cachedSnap.size === snap.size;
  return unchanged && !!cache.fileResults[fileName];
}

/**
 * 判断是否为今天的文件
 * @param {string} fileName - 文件名
 * @returns {boolean}
 */
export function isTodayFile(fileName) {
  return fileName.startsWith(getTodayStr());
}

/** @returns {string} YYYY-MM-DD */
export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
