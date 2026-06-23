/**
 * 管线解析器模块测试 (p5c)
 * 测试 pipeline-parser.mjs 的 Memory MD 解析功能
 * 
 * 运行: node docs/pipeline/__tests__/pipeline-parser.test.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseMemoryIssues } from '../lib/pipeline-parser.mjs';
import {
  loadCache, saveCache, createEmptyCache,
  getFileSnapshot, isTodayFile, getTodayStr,
} from '../lib/pipeline-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_DIR = path.join(__dirname, '__mock_memory');
const CACHE_FILE = path.join(__dirname, '__test_parser_cache.json');

function cleanup() {
  try { if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }
  try { fs.rmSync(MOCK_DIR, { recursive: true, force: true }); } catch (e) { /* */ }
}

function createMockFile(filename, content) {
  const filePath = path.join(MOCK_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('管线解析器 (pipeline-parser.mjs)', () => {
  before(() => {
    cleanup();
    fs.mkdirSync(MOCK_DIR, { recursive: true });
  });
  after(cleanup);

  // ==================== 空目录 ====================
  it('空 memory 目录应返回空结果', () => {
    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);
    assert.equal(result._totalIssues, 0, '应无 issue');
    assert.ok(Array.isArray(result._sourceFiles), '_sourceFiles 应为数组');
    assert.ok(result._sourceFiles.length === 0, 'sourceFiles 应为空');
    assert.ok(result._generatedAt, '应有 generatedAt');
    assert.ok(result._cacheStats, '应有 _cacheStats');
  });

  // ==================== 不存在的目录 ====================
  it('不存在的目录应返回错误', () => {
    const result = parseMemoryIssues(
      path.join(__dirname, '__definitely_not_exist__'),
      CACHE_FILE
    );
    assert.ok(result._error, '应有 _error 字段');
    assert.equal(result._totalIssues, 0, '应无 issue');
  });

  // ==================== 标准格式解析 ====================
  it('应能解析标准 [模块:ID] 格式的 MD 文件', () => {
    const content = `# 测试记录

## [模块:F1] DeepSeek 流式响应修复
- **问题**: 流式响应中断时连接未正确释放
- **根因**: WebSocket 未设置超时处理
- **修复**: 添加 30s 超时 + 自动重连机制
- **状态**: ✅ 已解决

## [模块:p5b] 自动数据采集优化
- **问题**: 缓存命中率低于预期
- **根因**: mtime 精度问题导致误判
- **修复**: 改用毫秒级 mtimeMs
- **状态**: ✅ 已解决
`;

    createMockFile('2026-06-20.md', content);
    // 删除旧缓存强制重新解析
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }

    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);
    assert.ok(result._totalIssues >= 2, `应至少解析 2 个 issue，实际 ${result._totalIssues}`);

    // 验证 F1 模块
    const f1Issues = result.modules.f1?.issues || [];
    const f1Stream = f1Issues.find(i => i.title.includes('流式响应'));
    assert.ok(f1Stream, '应找到 F1 的流式响应问题');
    assert.equal(f1Stream.status, 'resolved', 'F1 问题应已解决');

    // 验证 p5b 模块
    const p5bIssues = result.modules.p5b?.issues || [];
    const p5bCache = p5bIssues.find(i => i.title.includes('数据采集'));
    assert.ok(p5bCache, '应找到 p5b 的数据采集问题');
    assert.equal(p5bCache.status, 'resolved', 'p5b 问题应已解决');
  });

  // ==================== 关键词回退匹配 ====================
  it('应通过关键词回退匹配模块（无显式标签时）', () => {
    const content = `# 测试记录

## 管线数据看板渲染问题
- **问题**: SVG 流程图在Firefox 中渲染异常
- **根因**: CSS stroke-dasharray 兼容性问题
- **修复**: 添加 -moz- 前缀
- **状态**: ✅ 已解决

## MCP 协议连接超时
- **问题**: stdio 连接 5 秒超时
- **根因**: 子进程启动慢
- **修复**: 超时延长到 15 秒
- **状态**: ✅ 已解决
`;

    createMockFile('2026-06-21.md', content);
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }

    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);

    // "管线看板" 应匹配到 p5a (关键词: 管线看板, 数据可视化)
    const p5aIssues = result.modules.p5a?.issues || [];
    const dashIssue = p5aIssues.find(i => i.title.includes('看板'));
    assert.ok(dashIssue, '"管线看板" 应通过关键词匹配到 p5a');

    // "MCP 协议" 应匹配到 f5
    const f5Issues = result.modules.f5?.issues || [];
    const mcpIssue = f5Issues.find(i => i.title.includes('MCP'));
    assert.ok(mcpIssue, '"MCP 协议" 应通过关键词匹配到 f5');
  });

  // ==================== 去重测试 ====================
  it('应正确处理重复条目', () => {
    const content = `# 测试

## [模块:F1] 相同问题
- **问题**: 测试重复条目
- **修复**: 修复内容
- **状态**: ✅ 已解决

## [模块:F1] 相同问题
- **问题**: 测试重复条目
- **修复**: 修复内容
- **状态**: ✅ 已解决
`;

    createMockFile('2026-06-22.md', content);
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }

    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);
    const f1Issues = result.modules.f1?.issues || [];
    const dupIssues = f1Issues.filter(i => i.title === '相同问题');
    assert.equal(dupIssues.length, 1, '重复条目应去重，只保留 1 条');
  });

  // ==================== 缓存行为测试 ====================
  it('缓存命中时不应重新解析', () => {
    // 先用一个旧文件测试缓存行为
    const oldContent = `# 缓存测试

## [模块:F3] 工具系统测试
- **问题**: ToolRegistry 注册失败
- **修复**: 修复类型定义
- **状态**: ✅ 已解决
`;
    const oldFile = '2026-06-01.md';
    createMockFile(oldFile, oldContent);

    // 第一次解析
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }
    const result1 = parseMemoryIssues(MOCK_DIR, CACHE_FILE);
    const hits1 = result1._cacheStats?.cacheHits || 0;
    const reparsed1 = result1._cacheStats?.reparsed || 0;

    // 第二次解析（文件未变 → 应命中缓存）
    const result2 = parseMemoryIssues(MOCK_DIR, CACHE_FILE);
    const hits2 = result2._cacheStats?.cacheHits || 0;
    const reparsed2 = result2._cacheStats?.reparsed || 0;

    // 第二次的缓存命中数应 >= 第一次的重新解析数
    // （因为历史文件 + mtime/size 未变 → 应命中缓存）
    assert.ok(hits2 > hits1 || reparsed2 < reparsed1,
      '第二次解析应更多命中缓存');
  });

  // ==================== 返回结构完整性 ====================
  it('parseMemoryIssues 应返回完整结构', () => {
    const content = `# 结构测试

## [模块:F1] 测试
- **问题**: 测试结构完整性
- **修复**: 修复
- **状态**: ✅ 已解决
`;
    createMockFile('2026-06-15.md', content);
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }

    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);

    // 验证顶级字段
    assert.ok(result.modules, '应有 modules');
    assert.ok(typeof result._totalIssues === 'number', '_totalIssues 应为数字');
    assert.ok(result._generatedAt, '应有 _generatedAt');
    assert.ok(Array.isArray(result._sourceFiles), '_sourceFiles 应为数组');
    assert.ok(result._cacheStats, '应有 _cacheStats');
    assert.ok(typeof result._cacheStats.totalFiles === 'number', 'totalFiles 应为数字');
    assert.ok(typeof result._cacheStats.cacheHits === 'number', 'cacheHits 应为数字');
    assert.ok(typeof result._cacheStats.reparsed === 'number', 'reparsed 应为数字');

    // 验证 modules 结构
    assert.ok(typeof result.modules === 'object', 'modules 应为对象');
  });

  // ==================== 多种状态识别 ====================
  it('应正确识别 resolved/pending 状态', () => {
    const content = `# 状态测试

## [模块:F1] 已解决问题
- **问题**: 已解决的 bug
- **修复**: 修复方案
- **状态**: ✅ 已解决

## [模块:F2] 待解决问题
- **问题**: 待处理的 bug
- **状态**: ⏳ 进行中

## [模块:F3] 未解决问题
- **问题**: 未解决
- **状态**: ❌ 未解决
`;
    createMockFile('2026-06-10.md', content);
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }

    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);

    const f1Resolved = result.modules.f1?.issues?.find(i => i.title === '已解决问题');
    assert.ok(f1Resolved, '应找到已解决问题');
    assert.equal(f1Resolved.status, 'resolved', '✅ 应识别为 resolved');

    const f2Pending = result.modules.f2?.issues?.find(i => i.title === '待解决问题');
    assert.ok(f2Pending, '应找到待解决问题');
    assert.equal(f2Pending.status, 'pending', '⏳ 应识别为 pending');
  });

  // ==================== p5c 自我识别测试 ====================
  it('应能解析标注为 p5c 模块的 issue', () => {
    const content = `# p5c 测试

## [模块:p5c] 解析器正则优化
- **问题**: 正则匹配遗漏部分格式
- **根因**: 状态字段正则未兼容冒号位置
- **修复**: 同时支持 **状态：** 和 **状态**: 两种格式
- **状态**: ✅ 已解决

## [模块:p5c] 解析器性能优化
- **问题**: 大文件解析耗时超过 2 秒
- **修复**: 添加文件级缓存
- **状态**: ✅ 已解决
`;
    createMockFile('2026-06-05.md', content);
    try { fs.unlinkSync(CACHE_FILE); } catch (e) { /* */ }

    const result = parseMemoryIssues(MOCK_DIR, CACHE_FILE);
    const p5cIssues = result.modules.p5c?.issues || [];
    assert.ok(p5cIssues.length >= 2, `p5c 至少应有 2 个 issue，实际 ${p5cIssues.length}`);

    const regexIssue = p5cIssues.find(i => i.title.includes('正则'));
    assert.ok(regexIssue, '应找到正则优化 issue');
    assert.equal(regexIssue.status, 'resolved', '应为 resolved');

    const perfIssue = p5cIssues.find(i => i.title.includes('性能'));
    assert.ok(perfIssue, '应找到性能优化 issue');
    assert.equal(perfIssue.status, 'resolved', '应为 resolved');
  });
});
