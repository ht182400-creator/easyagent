/**
 * 管线解析器库 —— 从 .codebuddy/memory/*.md 文件解析模块问题
 * 
 * 依赖：
 * - pipeline-config.mjs  获取模块定义和关键词映射
 * - pipeline-cache.mjs   缓存系统
 * 
 * 识别方式：
 * 1. [模块:ID] 显式标签（优先级最高）
 * 2. 关键词匹配（回退方案）
 */

import fs from 'fs';
import path from 'path';
import { getKeywordMap } from './pipeline-config.mjs';
import {
  loadCache, saveCache, createEmptyCache,
  getFileSnapshot, isTodayFile, getTodayStr,
} from './pipeline-cache.mjs';

/**
 * 解析 memory 目录中的所有 .md 文件，提取模块问题
 * @param {string} memoryDir - .codebuddy/memory 目录路径
 * @param {string} cacheFilePath - 缓存文件路径
 * @returns {Object} { modules, _totalIssues, _generatedAt, _sourceFiles, _cacheStats }
 */
export function parseMemoryIssues(memoryDir, cacheFilePath) {
  const mdFiles = getMdFiles(memoryDir);
  if (!mdFiles) {
    return {
      modules: {}, _totalIssues: 0, _generatedAt: new Date().toISOString(),
      _error: '无法读取 memory 目录',
    };
  }

  // 加载缓存和关键词表
  let cache = loadCache(cacheFilePath);
  const keywordMap = getKeywordMap();
  const todayStr = getTodayStr();

  // 初始化模块容器
  /** @type {Record<string, {name: string, phase: string, issues: Object[]}>} */
  const modules = {};
  for (const id in keywordMap) {
    modules[id] = { name: keywordMap[id].name, phase: keywordMap[id].phase, issues: [] };
  }

  let totalExtracted = 0;
  let cacheHitCount = 0;
  let parseCount = 0;

  const allFileResults = {};

  // 遍历每个 .md 文件
  for (const mdFile of mdFiles) {
    const filePath = path.join(memoryDir, mdFile);
    const snap = getFileSnapshot(filePath);
    if (!snap) continue;

    // 判断是否命中缓存
    const isToday = mdFile.startsWith(todayStr);
    const cachedSnap = cache?.snapshots?.[mdFile];
    const isUnchanged = cachedSnap &&
      cachedSnap.mtimeMs === snap.mtimeMs &&
      cachedSnap.size === snap.size;

    if (!isToday && isUnchanged && cache?.fileResults?.[mdFile]) {
      allFileResults[mdFile] = cache.fileResults[mdFile];
      cacheHitCount++;
      continue;
    }

    // 重新解析文件
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      console.error(`[parser] 读取 ${mdFile} 失败:`, e.message);
      continue;
    }

    const fileDate = mdFile.replace('.md', '');
    const dateForEntry = /^\d{4}-\d{2}-\d{2}$/.test(fileDate) ? fileDate : '';
    const entries = extractEntries(content, dateForEntry, keywordMap);

    allFileResults[mdFile] = entries;
    parseCount++;

    // 更新缓存
    if (!cache) cache = createEmptyCache();
    cache.snapshots[mdFile] = snap;
    cache.fileResults[mdFile] = entries;
  }

  // 合并结果到模块容器（去重）
  for (const mdFile of mdFiles) {
    const fileEntries = allFileResults[mdFile] || [];
    for (const entry of fileEntries) {
      const mid = entry.moduleId;
      if (!modules[mid]) continue;
      const exists = modules[mid].issues.find(
        i => i.date === entry.date && i.title === entry.title
      );
      if (!exists) {
        modules[mid].issues.push({
          date: entry.date,
          title: entry.title,
          problem: entry.problem,
          solution: entry.solution,
          status: entry.status,
        });
        totalExtracted++;
      }
    }
  }

  // 持久化缓存
  if (parseCount > 0 && cache) {
    saveCache(cacheFilePath, cache);
  }

  console.log(`[parser] ${mdFiles.length} 文件: ${cacheHitCount} 缓存命中 + ${parseCount} 重新解析 = ${totalExtracted} 问题`);

  return {
    modules,
    _totalIssues: totalExtracted,
    _generatedAt: new Date().toISOString(),
    _sourceFiles: mdFiles,
    _cacheStats: { totalFiles: mdFiles.length, cacheHits: cacheHitCount, reparsed: parseCount },
  };
}

/**
 * 获取 memory 目录中的 .md 文件列表
 * @param {string} memoryDir
 * @returns {string[] | null}
 */
function getMdFiles(memoryDir) {
  try {
    const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md')).sort();
    return files;
  } catch (e) {
    console.error('[parser] 读取 memory 目录失败:', e.message);
    return null;
  }
}

/**
 * 从 Markdown 内容中提取问题条目
 * @param {string} content - MD 文件内容
 * @param {string} defaultDate - 默认日期
 * @param {Object} keywordMap - 关键词映射表
 * @returns {Object[]}
 */
function extractEntries(content, defaultDate, keywordMap) {
  const entries = [];
  const sections = content.split(/^## /m).slice(1);

  for (const sectionRaw of sections) {
    const lines = sectionRaw.split('\n');
    const rawTitle = (lines[0] || '').trim();

    // 提取 [模块:ID] 标签
    const tagMatch = rawTitle.match(/\[模块[：:]\s*(F\d+|B[123][a-e]|p5[a-c])\s*\]/i);
    const sectionTagIds = tagMatch ? [tagMatch[1].toLowerCase()] : [];

    // 纯标题（去掉标签）
    const sectionTitle = rawTitle.replace(
      /\[模块[：:]\s*(?:F\d+|B[123][a-e]|p5[a-c])\s*\]/i, ''
    ).trim().slice(0, 80);

    // 跳过纯操作类标题
    if (sectionTagIds.length === 0 && /^(前后端|文档|GitHub|发布|打包|编译|启动|重启|停止|验证|测试通过|清理|workflow)/.test(sectionTitle)) {
      continue;
    }

    let currentProblem = '';
    let currentSolution = '';
    let currentStatus = '';
    let inSolutionBlock = false;
    let currentTagIds = [...sectionTagIds];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('### ')) {
        if (currentProblem || currentSolution) {
          entries.push(makeEntry(defaultDate, sectionTitle, currentProblem, currentSolution, currentStatus, [...currentTagIds]));
        }
        const subTagMatch = line.match(/\[模块[：:]\s*(F\d+|B[123][a-e]|p5[a-c])\s*\]/i);
        if (subTagMatch) {
          currentTagIds = [subTagMatch[1].toLowerCase()];
        }
        currentProblem = '';
        currentSolution = '';
        currentStatus = '';
        inSolutionBlock = false;
        continue;
      }

      // 状态字段
      const statusMatch = line.match(/^[-*]\s*\*\*状态[：:]\*\*\s*(.+)$/);
      if (statusMatch) {
        const st = statusMatch[1].trim().toLowerCase();
        if (st.includes('resolved') || st.includes('解决') || st.includes('✅')) currentStatus = 'resolved';
        else if (st.includes('pending') || st.includes('进行') || st.includes('⏳')) currentStatus = 'pending';
        else if (st.includes('open') || st.includes('未解决') || st.includes('❌')) currentStatus = 'open';
        continue;
      }

      // 问题描述
      const probMatch = line.match(/^[-*]\s*\*\*问题[：:]\*\*\s*(.+)$/);
      if (probMatch) {
        if (currentProblem || currentSolution) {
          entries.push(makeEntry(defaultDate, sectionTitle, currentProblem, currentSolution, currentStatus, [...currentTagIds]));
        }
        currentProblem = probMatch[1].trim().slice(0, 200);
        currentSolution = '';
        currentStatus = '';
        inSolutionBlock = false;
        continue;
      }

      // 根因
      const rootMatch = line.match(/^[-*]\s*\*\*根因[：:]\*\*\s*(.+)$/);
      if (rootMatch) {
        currentProblem = currentProblem
          ? currentProblem + ' [根因] ' + rootMatch[1].trim().slice(0, 200)
          : rootMatch[1].trim().slice(0, 200);
        continue;
      }

      // 现象
      const symMatch = line.match(/^[-*]\s*\*\*现象[：:]\*\*\s*(.+)$/);
      if (symMatch) {
        if (!currentProblem) currentProblem = '[现象] ' + symMatch[1].trim().slice(0, 200);
        continue;
      }

      // 排查
      const diagMatch = line.match(/^[-*]\s*\*\*(?:排查|排查结果)[：:]\*\*\s*(.+)$/);
      if (diagMatch) {
        currentProblem = currentProblem
          ? currentProblem + ' [排查] ' + diagMatch[1].trim().slice(0, 150)
          : diagMatch[1].trim().slice(0, 150);
        continue;
      }

      // 修复
      const fixStart = line.match(/^[-*]\s*\*\*修复(?:\*\*)?(?:\s*\([^)]*\))?[：:]\*\*\s*(.*)$/);
      if (fixStart) {
        currentSolution = fixStart[1].trim().slice(0, 200);
        inSolutionBlock = !currentSolution.endsWith('.') && currentSolution.length > 0;
        continue;
      }

      const fixHeader = line.match(/^[-*]\s*\*\*修复\*\*(\s*\([^)]*\))?$/);
      if (fixHeader) {
        currentSolution = '';
        inSolutionBlock = true;
        continue;
      }

      // 修复方案/正确方案/处理
      const altFix = line.match(/^[-*]\s*\*\*(?:修复方案|正确方案|核心方案|处理)[：:]\*\*\s*(.+)$/);
      if (altFix) {
        currentSolution = currentSolution
          ? currentSolution + '；' + altFix[1].trim().slice(0, 200)
          : altFix[1].trim().slice(0, 200);
        inSolutionBlock = false;
        continue;
      }

      // 解决方案块内的 - 子项
      if (inSolutionBlock && line.startsWith('- ') && !line.includes('**')) {
        const subItem = line.replace(/^[-*]\s*/, '').trim();
        if (subItem && subItem.length > 5) {
          currentSolution = currentSolution
            ? currentSolution + '；' + subItem.slice(0, 150)
            : subItem.slice(0, 150);
        }
        continue;
      }

      // 非修复块内的修复行
      if (!inSolutionBlock && line.startsWith('- ') && /修复|解决|改为|改用/.test(line) && !line.includes('**')) {
        if (!currentSolution && line.length < 200) {
          currentSolution = line.replace(/^[-*]\s*/, '').trim().slice(0, 200);
        }
        continue;
      }

      if (inSolutionBlock && line.startsWith('- ') && line.includes('**')) {
        inSolutionBlock = false;
      }
    }

    // 最后一个条目
    if (currentProblem || currentSolution) {
      entries.push(makeEntry(defaultDate, sectionTitle, currentProblem, currentSolution, currentStatus, [...currentTagIds]));
    }
  }

  // 为没有显式标签的条目匹配模块
  for (const entry of entries) {
    if (entry._tagModuleIds.length === 0) {
      entry._tagModuleIds = matchByKeywords(entry, keywordMap);
    }
  }

  return formatResults(entries);
}

/**
 * 根据关键词匹配模块 ID
 */
function matchByKeywords(entry, keywordMap) {
  const searchText = (
    (entry.title || '') + ' ' +
    (entry.problem || '') + ' ' +
    (entry.solution || '')
  ).toLowerCase();

  const matchedIds = [];
  for (const id in keywordMap) {
    const mod = keywordMap[id];
    if (mod.keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
      matchedIds.push(id);
    }
  }
  return matchedIds;
}

/** 组装条目 */
function makeEntry(date, title, problem, solution, status, tagIds) {
  return {
    date,
    title: title.slice(0, 50),
    problem: problem || title.slice(0, 100),
    solution: solution || '详见原文',
    status: status || (solution ? 'resolved' : 'pending'),
    _tagModuleIds: tagIds || [],
  };
}

/** 展平为 fileEntry 格式 */
function formatResults(entries) {
  const results = [];
  for (const entry of entries) {
    const matchedIds = entry._tagModuleIds && entry._tagModuleIds.length > 0
      ? entry._tagModuleIds
      : [];
    if (matchedIds.length > 0) {
      for (const mid of matchedIds) {
        results.push({ moduleId: mid, ...entry });
      }
    }
  }
  return results;
}
