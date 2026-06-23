/**
 * 管线缓存模块测试 (p5b)
 * 测试 pipeline-cache.mjs 的缓存读写、快照、有效性判断
 * 
 * 运行: node docs/pipeline/__tests__/pipeline-cache.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadCache,
  saveCache,
  createEmptyCache,
  getFileSnapshot,
  isCacheValid,
  isTodayFile,
  getTodayStr,
} from '../lib/pipeline-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_CACHE = path.join(__dirname, '__test_cache.json');

// 清理函数
function cleanup() {
  try { if (fs.existsSync(TEMP_CACHE)) fs.unlinkSync(TEMP_CACHE); } catch (e) { /* ignore */ }
}

describe('缓存系统 (pipeline-cache.mjs)', () => {
  before(cleanup);
  after(cleanup);

  // ==================== createEmptyCache ====================
  it('createEmptyCache 应返回正确结构', () => {
    const cache = createEmptyCache();
    assert.ok(typeof cache === 'object', '应为对象');
    assert.ok(typeof cache.snapshots === 'object', 'snapshots 应为对象');
    assert.ok(typeof cache.fileResults === 'object', 'fileResults 应为对象');
    assert.ok(Object.keys(cache.snapshots).length === 0, 'snapshots 应为空');
    assert.ok(Object.keys(cache.fileResults).length === 0, 'fileResults 应为空');
  });

  // ==================== loadCache 不存在的文件 ====================
  it('loadCache 不存在的文件应返回 null', () => {
    const cache = loadCache(path.join(__dirname, '__nonexistent__.json'));
    assert.equal(cache, null, '不存在的缓存文件应返回 null');
  });

  // ==================== saveCache & loadCache 往返 ====================
  it('saveCache 后 loadCache 应返回相同数据', () => {
    const cache = createEmptyCache();
    cache.snapshots['test.md'] = { mtimeMs: 1234567890, size: 100 };
    cache.fileResults['test.md'] = [{ moduleId: 'f1', title: '测试' }];

    saveCache(TEMP_CACHE, cache);
    assert.ok(fs.existsSync(TEMP_CACHE), '缓存文件应被创建');

    const loaded = loadCache(TEMP_CACHE);
    assert.ok(loaded !== null, '应成功加载缓存');
    assert.ok(loaded.snapshots['test.md'], 'snapshots 应包含 test.md');
    assert.equal(loaded.snapshots['test.md'].mtimeMs, 1234567890, 'mtimeMs 应匹配');
    assert.equal(loaded.snapshots['test.md'].size, 100, 'size 应匹配');
    assert.ok(Array.isArray(loaded.fileResults['test.md']), 'fileResults 应为数组');
    assert.equal(loaded.fileResults['test.md'][0].moduleId, 'f1', 'moduleId 应匹配');
    assert.ok(loaded.generatedAt, '应有 generatedAt 时间戳');
  });

  it('saveCache 应设置 generatedAt 时间戳', () => {
    const cache = createEmptyCache();
    saveCache(TEMP_CACHE, cache);
    const loaded = loadCache(TEMP_CACHE);
    const date = new Date(loaded.generatedAt);
    assert.ok(!isNaN(date.getTime()), 'generatedAt 应为有效 ISO 时间');
    // 时间应在最近 5 秒内
    const diff = Date.now() - date.getTime();
    assert.ok(diff < 5000, `generatedAt 应在 5s 内，偏差: ${diff}ms`);
  });

  // ==================== saveCache 损坏的 JSON ====================
  it('loadCache 损坏的 JSON 应返回 null', () => {
    fs.writeFileSync(TEMP_CACHE, '{ invalid json }', 'utf-8');
    const cache = loadCache(TEMP_CACHE);
    assert.equal(cache, null, '损坏的缓存应返回 null');
  });

  // ==================== loadCache 结构不完整 ====================
  it('loadCache 缺少 snapshots 字段应返回 null', () => {
    fs.writeFileSync(TEMP_CACHE, JSON.stringify({ fileResults: {} }), 'utf-8');
    const cache = loadCache(TEMP_CACHE);
    assert.equal(cache, null, '不完整的缓存应返回 null');
  });

  // ==================== getFileSnapshot ====================
  it('getFileSnapshot 存在的文件应返回有效快照', () => {
    // 使用 test 文件自身
    const __filename = fileURLToPath(import.meta.url);
    const snap = getFileSnapshot(__filename);
    assert.ok(snap !== null, '应返回快照');
    assert.ok(typeof snap.mtimeMs === 'number', 'mtimeMs 应为数字');
    assert.ok(snap.mtimeMs > 0, 'mtimeMs 应 > 0');
    assert.ok(typeof snap.size === 'number', 'size 应为数字');
    assert.ok(snap.size > 0, 'size 应 > 0（测试文件非空）');
  });

  it('getFileSnapshot 不存在的文件应返回 null', () => {
    const snap = getFileSnapshot(path.join(__dirname, '__nonexistent__.txt'));
    assert.equal(snap, null, '不存在文件应返回 null');
  });

  // ==================== getTodayStr ====================
  it('getTodayStr 应返回 YYYY-MM-DD 格式', () => {
    const today = getTodayStr();
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/, '格式应为 YYYY-MM-DD');
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.equal(today, expected, '应为当天日期');
  });

  // ==================== isTodayFile ====================
  it('isTodayFile 今天的文件应返回 true', () => {
    const todayFile = `${getTodayStr()}.md`;
    assert.equal(isTodayFile(todayFile), true, '今天的文件应返回 true');
  });

  it('isTodayFile 昨天的文件应返回 false', () => {
    const d = new Date(Date.now() - 86400000);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.md`;
    assert.equal(isTodayFile(yesterday), false, '昨天的文件应返回 false');
  });

  // ==================== isCacheValid ====================
  it('isCacheValid 空缓存应返回 false', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const valid = isCacheValid(thisFile, 'test.md', null);
    assert.equal(valid, false, '空缓存应无效');
  });

  it('isCacheValid 今天的文件应返回 false（强制重新解析）', () => {
    const todayFile = `${getTodayStr()}.md`;
    const cache = createEmptyCache();
    cache.snapshots[todayFile] = { mtimeMs: 0, size: 0 };
    cache.fileResults[todayFile] = [];
    const thisFile = fileURLToPath(import.meta.url);
    const valid = isCacheValid(thisFile, todayFile, cache);
    assert.equal(valid, false, '今天的文件不应使用缓存');
  });

  it('isCacheValid 未变化的文件应返回 true', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const stat = fs.statSync(thisFile);
    const cache = createEmptyCache();
    cache.snapshots['config.test.mjs'] = { mtimeMs: stat.mtimeMs, size: stat.size };
    cache.fileResults['config.test.mjs'] = [];

    const valid = isCacheValid(thisFile, 'config.test.mjs', cache);
    // 文件名不以今天开头，且 mtime/size 匹配 → 应为 true
    assert.equal(valid, true, '未变化的文件应缓存有效');
  });

  it('isCacheValid mtime 变化的文件应返回 false', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const stat = fs.statSync(thisFile);
    const cache = createEmptyCache();
    // 故意设置不同的 mtime
    cache.snapshots['config.test.mjs'] = { mtimeMs: stat.mtimeMs + 99999, size: stat.size };
    cache.fileResults['config.test.mjs'] = [];

    const valid = isCacheValid(thisFile, 'config.test.mjs', cache);
    assert.equal(valid, false, 'mtime 变化应缓存无效');
  });
});

describe('缓存压力测试', () => {
  after(cleanup);

  it('应能处理 100 个文件的缓存', () => {
    const cache = createEmptyCache();
    for (let i = 0; i < 100; i++) {
      cache.snapshots[`file_${i}.md`] = { mtimeMs: Date.now() + i, size: i * 100 };
      cache.fileResults[`file_${i}.md`] = [{ moduleId: 'f1', title: `item_${i}` }];
    }
    saveCache(TEMP_CACHE, cache);

    const loaded = loadCache(TEMP_CACHE);
    assert.ok(loaded !== null, '应成功加载 100 条缓存');
    assert.equal(Object.keys(loaded.snapshots).length, 100, '应有 100 条 snapshot');
    assert.equal(Object.keys(loaded.fileResults).length, 100, '应有 100 条 fileResult');
  });
});
