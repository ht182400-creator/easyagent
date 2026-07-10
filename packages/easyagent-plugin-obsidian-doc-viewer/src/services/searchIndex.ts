import FlexSearch from 'flexsearch';
import type { DocNode, SearchResult } from '../types';

/**
 * 全文搜索索引
 * 使用 FlexSearch 实现高性能本地搜索
 */
let documentIndex: InstanceType<typeof FlexSearch.Document> | null = null;
let docMap: Map<string, DocNode> = new Map();

/**
 * 创建或重建搜索索引
 */
export function createSearchIndex(docs: DocNode[]): void {
  documentIndex = new FlexSearch.Document({
    document: {
      id: 'id',
      index: ['name', 'content'],
      store: ['id', 'name', 'path'],
    },
    tokenize: 'forward',
  });

  docMap.clear();
  for (const doc of docs) {
    if (doc.type !== 'file' || !doc.content) continue;
    docMap.set(doc.id, doc);
    documentIndex.add({
      id: doc.id,
      name: doc.name,
      path: doc.path,
      content: doc.content,
    });
  }
}

/**
 * 搜索文档 (标题 + 内容全文搜索)
 */
export function searchDocuments(query: string, limit: number = 20): SearchResult[] {
  if (!documentIndex || !query.trim()) return [];

  const rawResults = documentIndex.search(query, {
    limit,
    enrich: true,
  }) as unknown as Array<{
    field: string;
    result: Array<{ id: string; doc: { id: string; name: string; path: string }; score: number }>;
  }>;

  const merged = new Map<string, SearchResult>();

  for (const fieldResult of rawResults) {
    for (const item of fieldResult.result) {
      const id = item.id;
      const doc = docMap.get(id);
      if (!doc) continue;

      const existing = merged.get(id);
      const snippet = extractSnippet(doc.content || '', query);

      // 标题匹配优先加分
      const scoreBoost = fieldResult.field === 'name' ? 0.2 : 0;
      const finalScore = item.score + scoreBoost;

      if (!existing || existing.score < finalScore) {
        merged.set(id, {
          id,
          title: item.doc.name,
          path: item.doc.path,
          snippet,
          score: finalScore,
        });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

/**
 * 提取匹配片段
 * 优先返回第一个匹配位置附近的上下文
 */
function extractSnippet(content: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  if (index === -1) return content.slice(0, 120) + (content.length > 120 ? '...' : '');

  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + query.length + 80);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return prefix + content.slice(start, end) + suffix;
}

/**
 * 高亮搜索关键词
 */
export function highlightText(text: string, query: string): string {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return text.replace(regex, '<mark class="rounded bg-yellow-200 px-0.5">$1</mark>');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
