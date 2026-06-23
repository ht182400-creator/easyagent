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
        i => i.date === entry.date && i.title === entry.title && i.problem === entry.problem
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

    // 跳过纯操作类标题（但若有显式标签则放行，允许后续关键词匹配）
    // 注意：不再因"GitHub"、"发布"等开头就完全跳过——这些可能是 CI/CD 模块的合法内容
    if (sectionTagIds.length === 0 && /^(前后端|编译|启动|重启|停止|验证|测试通过|清理)/.test(sectionTitle)) {
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
        // 判断是否是问题/解决子段落（同问题延续，不 push 当前条目）
        const isProblemSection = /问题回顾|问题诊断|问题根因|问题修复/.test(line);
        const isSolutionSection = /^###\s*(解决|解决方案|处理[方式方案]?|修复(?:过程|内容|措施|方案)?)(?![一-龥\w])/.test(line);
        const isContinuation = isProblemSection || isSolutionSection;

        // 只在非延续段落时 push 当前累积的条目
        if (!isContinuation && (currentProblem || currentSolution)) {
          entries.push(makeEntry(defaultDate, sectionTitle, currentProblem, currentSolution, currentStatus, [...currentTagIds]));
        }

        const subTagMatch = line.match(/\[模块[：:]\s*(F\d+|B[123][a-e]|p5[a-c])\s*\]/i);
        if (subTagMatch) {
          currentTagIds = [subTagMatch[1].toLowerCase()];
        }

        // 延续段落保留 currentProblem（问题→解决方案过渡），非延续才重置
        if (!isContinuation) {
          currentProblem = '';
          currentSolution = '';
          currentStatus = '';
          inSolutionBlock = false;
        }

        if (isProblemSection) {
          inSolutionBlock = false;  // 当前处于问题描述模式
          continue;
        }
        if (isSolutionSection) {
          inSolutionBlock = true;   // 当前处于解决方案模式
          continue;
        }
        continue;
      }

      // --- 新增: 自由格式子段落内容捕获 ---
      // 处于 "问题回顾" 模式下的 - 子项 → 收集为问题描述
      if (!inSolutionBlock && !currentSolution && line.startsWith('- ') && !line.includes('**')) {
        const subItem = line.replace(/^[-*]\s*/, '').trim();
        if (subItem && subItem.length > 5 && sectionTagIds.length > 0) {
          currentProblem = currentProblem
            ? currentProblem + '；' + subItem.slice(0, 200)
            : subItem.slice(0, 200);
        }
        continue;
      }
      // 问题捕获模式下 - **key**: value 格式（非标准字段名，如"提供商不存在"）
      if (!inSolutionBlock && !currentSolution && line.startsWith('- **') && sectionTagIds.length > 0) {
        const kvMatch = line.match(/^[-*]\s*\*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
        if (kvMatch && !/^(问题|根因|现象|排查|排查结果|状态|修复|修复方案|正确方案|核心方案|处理|修复过程|修复内容)$/.test(kvMatch[1])) {
          const subItem = kvMatch[1] + ': ' + kvMatch[2].trim().slice(0, 180);
          currentProblem = currentProblem
            ? currentProblem + '；' + subItem
            : subItem;
          continue;
        }
        // 标准字段名（问题/根因/状态/修复）交给下方专用处理器
        // 未匹配到键值对的行则跳过
        if (!kvMatch) continue;
      }

      // 状态字段（兼容冒号在 ** 内外的两种写法）
      const statusMatch = line.match(/^[-*]\s*\*\*状态[：:]?\*\*\s*(.+)$/);
      if (statusMatch) {
        const st = statusMatch[1].trim().toLowerCase();
        if (st.includes('resolved') || st.includes('解决') || st.includes('✅')) currentStatus = 'resolved';
        else if (st.includes('pending') || st.includes('进行') || st.includes('⏳')) currentStatus = 'pending';
        else if (st.includes('open') || st.includes('未解决') || st.includes('❌')) currentStatus = 'open';
        continue;
      }

      // 问题描述（兼容两种格式: **问题：**内容 和 **问题**: 内容）
      const probMatch = line.match(/^[-*]\s*\*\*问题[：:]?\*\*\s*(.+)$/);
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

      // 根因（兼容冒号在 ** 内外的两种写法）
      const rootMatch = line.match(/^[-*]\s*\*\*根因[：:]?\*\*\s*(.+)$/);
      if (rootMatch) {
        currentProblem = currentProblem
          ? currentProblem + ' [根因] ' + rootMatch[1].trim().slice(0, 200)
          : rootMatch[1].trim().slice(0, 200);
        continue;
      }

      // 现象（兼容冒号在 ** 内外的两种写法）
      const symMatch = line.match(/^[-*]\s*\*\*现象[：:]?\*\*\s*(.+)$/);
      if (symMatch) {
        if (!currentProblem) currentProblem = '[现象] ' + symMatch[1].trim().slice(0, 200);
        continue;
      }

      // 排查（兼容冒号在 ** 内外的两种写法）
      const diagMatch = line.match(/^[-*]\s*\*\*(?:排查|排查结果)[：:]?\*\*\s*(.+)$/);
      if (diagMatch) {
        currentProblem = currentProblem
          ? currentProblem + ' [排查] ' + diagMatch[1].trim().slice(0, 150)
          : diagMatch[1].trim().slice(0, 150);
        continue;
      }

      // 修复（兼容多种写法: **修复[X]**/ **修复（描述）**/ **修复方案**/ **正确方案**/ **核心方案**/ **最终方案(...)**/ **解决**）
      // 匹配任何包含"修复/正确方案/核心方案/最终方案/解决"的粗体标签
      const fixStart = line.match(/^[-*]\s*\*\*(?:.*(?:修复|正确方案|核心方案|最终方案|解决).*)\*\*[^:：]*[：:]\s*(.+)$/);
      if (fixStart) {
        currentSolution = fixStart[1].trim().slice(0, 200);
        inSolutionBlock = !currentSolution.endsWith('.') && currentSolution.length > 0;
        continue;
      }

      // 修复标题行（无行内内容的粗体标签，如 "**修复** (path):" / "**最终方案 (22:54)**:"）
      const fixHeader = line.match(/^[-*]\s*\*\*(?:.*(?:修复|正确方案|核心方案|最终方案|解决).*)\*\*/);
      if (fixHeader) {
        currentSolution = '';
        inSolutionBlock = true;
        continue;
      }

      // 修复方案/正确方案/处理（附加修复行，冒号在粗体内外兼容两种写法）
      const altFix = line.match(/^[-*]\s*\*\*(?:修复方案|正确方案|核心方案|处理|最终方案|解决)[：:]?\*\*\s*(.+)$/);
      if (altFix) {
        currentSolution = currentSolution
          ? currentSolution + '；' + altFix[1].trim().slice(0, 200)
          : altFix[1].trim().slice(0, 200);
        inSolutionBlock = false;
        continue;
      }

      // 解决方案块内的所有行都采集为修复内容（支持 - 、 **N. 、 - **key**: 三种格式）
      if (inSolutionBlock) {
        if (line.startsWith('- ') && !line.includes('**')) {
          // 普通子弹
          const subItem = line.replace(/^[-*]\s*/, '').trim();
          if (subItem && subItem.length > 5) {
            currentSolution = currentSolution
              ? currentSolution + '；' + subItem.slice(0, 150)
              : subItem.slice(0, 150);
          }
          continue;
        }
        if (line.startsWith('- **')) {
          // 粗体键值对如 "- **Pages**: Providers.tsx(2)..."
          const kvMatch = line.match(/^[-*]\s*\*\*(.+?)\*\*\s*[：:]\s*(.+)$/);
          if (kvMatch) {
            const subItem = kvMatch[1] + ': ' + kvMatch[2].trim().slice(0, 130);
            currentSolution = currentSolution
              ? currentSolution + '；' + subItem
              : subItem;
          }
          continue;
        }
        if (line.startsWith('**') && line.length > 10) {
          // 编号条目如 **1. 修复描述**—— 提取为修复文本
          const cleaned = line.replace(/^\*\*[\d一二三四五六七八九十]+[\.、)]?\s*/, '').replace(/\*\*\s*$/, '').trim();
          if (cleaned && cleaned.length > 5) {
            currentSolution = currentSolution
              ? currentSolution + '；' + cleaned.slice(0, 150)
              : cleaned.slice(0, 150);
          }
          continue;
        }
        // 非子弹且非**开头的普通文字行（排除空行、代码块）
        if (!line.startsWith('`') && !line.startsWith('```') && line.length > 10 && !line.startsWith('- ') && !line.startsWith('**')) {
          currentSolution = currentSolution
            ? currentSolution + ' ' + line.slice(0, 150)
            : line.slice(0, 150);
          continue;
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
