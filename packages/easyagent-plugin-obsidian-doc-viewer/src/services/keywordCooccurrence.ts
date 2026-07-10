import type { DocNode } from '../types';

/** 关键字的字符长度下限（短于此长度的"词"太泛化） */
const MIN_KEYWORD_LENGTH = 3;

/** 停用词：高频但无区分度的英文/中文虚词 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'from', 'have', 'are',
  'was', 'not', 'but', 'all', 'can', 'has', 'been', 'its', 'into',
  'also', 'more', 'when', 'will', 'some', 'only', 'then', 'than',
  'just', 'over', 'such', 'each', 'very', 'how', 'use', 'out', 'up',
  'about', 'which', 'does', 'other', 'after', 'well', 'same', 'our',
  'too', 'any', 'where', 'most', 'should', 'could', 'between', 'being',
  '这些', '一些', '或者', '可以', '需要', '使用', '一个', '这个', '通过',
  '进行', '我们', '他们', '它们', '没有', '已经', '因为', '所以', '如果',
  '但是', '所有', '能够', '那么', '以及', '并且', '就是', '的话', '不同',
  '一种', '用于', '之间', '其他', '之后', '之前', '自己', '相关', '什么',
]);

/** 无意义的纯数字/标点模式 */
const NUMBER_ONLY = /^\d+$/;
const PUNCT_ONLY = /^[^\w㄀-鿿⺀-⿕一-鿋]+$/;

/**
 * 提取文档中的关键字集合（小写化）
 * 移除代码块后按空格/标点/换行分词，过滤停用词和短词
 */
export function extractKeywords(content: string | undefined): Set<string> {
  if (!content) return new Set();

  // 去掉代码块和行内代码
  const plain = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`]+`/g, ' ');

  // 按非字母数字/非中文字符拆分
  const tokens = plain.split(/[^\w\u4e00-\u9fff㄀-鿿⺀-⿕]+/);
  const keywords = new Set<string>();

  for (const token of tokens) {
    const trimmed = token.trim().toLowerCase();
    // 过滤条件
    if (trimmed.length < MIN_KEYWORD_LENGTH) continue;
    if (NUMBER_ONLY.test(trimmed)) continue;
    if (PUNCT_ONLY.test(trimmed)) continue;
    if (STOP_WORDS.has(trimmed)) continue;

    keywords.add(trimmed);
  }

  return keywords;
}

/**
 * 关键字共现结果：文档对及其共同关键字
 */
export interface CooccurrencePair {
  /** 源文档 ID */
  sourceId: string;
  /** 目标文档 ID */
  targetId: string;
  /** 共同关键字的数量 */
  sharedCount: number;
  /** 共同关键字列表（调试用） */
  sharedKeywords: string[];
}

/**
 * 分析文档间关键字共现关系
 * @param docs 文档节点列表
 * @param minShared 最小共同关键字数阈值，低于此值不建立关联（默认 2）
 * @returns 满足阈值的文档对列表
 */
export function analyzeKeywordCooccurrence(
  docs: DocNode[],
  minShared: number = 2,
): CooccurrencePair[] {
  // 1. 提取所有文档的关键字
  const docKeywords = new Map<string, Set<string>>();
  for (const doc of docs) {
    docKeywords.set(doc.id, extractKeywords(doc.content));
  }

  // 2. 建立倒排索引：关键字 → 包含它的文档 ID 集合
  const invertedIndex = new Map<string, Set<string>>();
  for (const [docId, keywords] of docKeywords) {
    for (const kw of keywords) {
      if (!invertedIndex.has(kw)) {
        invertedIndex.set(kw, new Set());
      }
      invertedIndex.get(kw)!.add(docId);
    }
  }

  // 3. 对每对文档统计共现关键字数
  // 遍历倒排索引，对每个关键字所覆盖的文档对 +1
  const pairStats = new Map<string, { count: number; kws: Set<string> }>();
  const docIds = docs.map((d) => d.id);
  const docIdSet = new Set(docIds);

  for (const [kw, docSet] of invertedIndex) {
    // 跳过过于泛化的关键字（出现在超过 60% 的文档中）
    if (docSet.size > docs.length * 0.6) continue;

    const docList = Array.from(docSet).filter((id) => docIdSet.has(id));
    // 如果只在单个文档中出现，跳过
    if (docList.length < 2) continue;

    // 对每对文档，增加共现计数
    for (let i = 0; i < docList.length; i++) {
      for (let j = i + 1; j < docList.length; j++) {
        const pairKey = [docList[i], docList[j]].sort().join('|||');
        if (!pairStats.has(pairKey)) {
          pairStats.set(pairKey, { count: 0, kws: new Set() });
        }
        const stat = pairStats.get(pairKey)!;
        stat.count += 1;
        stat.kws.add(kw);
      }
    }
  }

  // 4. 过滤低于阈值的对，输出结果
  const results: CooccurrencePair[] = [];
  for (const [pairKey, stat] of pairStats) {
    if (stat.count < minShared) continue;
    const [id1, id2] = pairKey.split('|||');
    results.push({
      sourceId: id1,
      targetId: id2,
      sharedCount: stat.count,
      sharedKeywords: Array.from(stat.kws).slice(0, 10), // 只保留前 10 个
    });
  }

  // 5. 按共现数量降序排列
  results.sort((a, b) => b.sharedCount - a.sharedCount);

  // 6. 限制最大弱关联边数（防止节点过多时图谱爆炸）
  const MAX_WEAK_LINKS = 500;
  if (results.length > MAX_WEAK_LINKS) {
    console.warn(
      `[keywordCooccurrence] 弱关联边数量 ${results.length} 超过上限，截断至 ${MAX_WEAK_LINKS}`,
    );
    return results.slice(0, MAX_WEAK_LINKS);
  }

  return results;
}
