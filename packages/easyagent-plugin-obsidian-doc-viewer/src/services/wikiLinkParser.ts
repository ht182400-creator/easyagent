import type { DocNode } from '../types';

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const MARKDOWN_LINK_REGEX = /(?<!\!)\[(?:[^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

/**
 * 从 Markdown 内容中提取文档链接目标
 * 支持：
 *   - WikiLink: [[Doc Name]] 和 [[Doc Name|Display Text]]
 *   - 标准 Markdown: [Text](./path/to/doc.md) 或 [Text](doc.md)
 *
 * 会自动过滤：
 *   - 代码块 / 行内代码中的链接
 *   - 图片链接 ![...](...)
 *   - 锚点链接 (#section)
 *   - 外部 URL / 邮件 / 电话等
 */
export function extractWikiLinks(content: string): string[] {
  const links = new Set<string>();
  const plain = stripCodeBlocks(content);

  let match: RegExpExecArray | null;

  // 1. 提取 [[WikiLink]]
  WIKI_LINK_REGEX.lastIndex = 0;
  while ((match = WIKI_LINK_REGEX.exec(plain)) !== null) {
    const target = match[1].trim();
    if (target) links.add(normalizeLinkTarget(target));
  }

  // 2. 提取标准 Markdown 链接 [Text](target)
  MARKDOWN_LINK_REGEX.lastIndex = 0;
  while ((match = MARKDOWN_LINK_REGEX.exec(plain)) !== null) {
    const target = match[1].trim();
    if (isInternalLinkTarget(target)) {
      links.add(normalizeLinkTarget(target));
    }
  }

  return Array.from(links);
}

/**
 * 判断是否为内部文档链接目标
 */
function isInternalLinkTarget(target: string): boolean {
  if (!target) return false;
  // 忽略锚点
  if (target.startsWith('#')) return false;
  // 忽略外部 URL、邮件、电话、FTP、Data URI 等
  if (/^(https?:|mailto:|tel:|ftp:|data:|file:|\/\/)/i.test(target)) return false;
  return true;
}

/**
 * 移除 Markdown 代码块和行内代码，避免提取到代码中的链接
 */
function stripCodeBlocks(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`]*`/g, '');
}

/**
 * 规范化链接目标
 * 例如 "01_整体架构" → "01_整体架构.md"
 * 保留已有扩展名 (如 .json/.html) 但返回空字符串表示非 md 忽略
 */
function normalizeLinkTarget(target: string): string {
  const trimmed = target.trim();
  if (/\.[a-zA-Z0-9]+$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.md`;
}


/**
 * 重建所有文档的 links 和 backlinks
 * @deprecated 请使用 fileLoader.ts 中的 rebuildDocumentLinks，支持相对路径解析
 */
export function rebuildLinks(docs: DocNode[]): DocNode[] {
  // 重置 backlinks
  for (const doc of docs) {
    doc.links = doc.content ? extractWikiLinks(doc.content) : [];
    doc.backlinks = [];
  }

  // 构建 backlinks
  for (const doc of docs) {
    for (const linkId of doc.links) {
      const target = docs.find((d) => d.id === linkId);
      if (target && !target.backlinks.includes(doc.id)) {
        target.backlinks.push(doc.id);
      }
    }
  }

  return docs;
}

/**
 * 将 WikiLink 解析为真实文档 ID
 *
 * @param rawLink 原始链接目标，如 "../README.md" 或 "01_整体架构.md"
 * @param sourcePath 源文档相对路径，如 "docs/00_项目规划.md"
 * @param pathIndex 路径索引 (小写路径 -> 文档ID)
 */
export function resolveWikiLink(
  rawLink: string,
  sourcePath: string,
  pathIndex: Map<string, string>,
): string | null {
  // 1. 直接匹配 (绝对路径 / 同级文件名)
  const directKey = rawLink.toLowerCase();
  if (pathIndex.has(directKey)) return pathIndex.get(directKey)!;

  // 2. 尝试在源文档同级目录下解析
  const sourceDir = sourcePath.includes('/') ? sourcePath.split('/').slice(0, -1).join('/') : '';

  const candidates: string[] = [];

  if (sourceDir) {
    candidates.push(`${sourceDir}/${rawLink}`);
  }

  // 3. 处理相对路径 ../
  if (rawLink.startsWith('../') || rawLink.startsWith('./')) {
    const resolved = resolveRelativePath(sourceDir, rawLink);
    if (resolved) candidates.push(resolved);
  }

  // 4. 不带扩展名时尝试补全 .md
  if (!/\.[a-zA-Z0-9]+$/i.test(rawLink)) {
    candidates.push(`${rawLink}.md`);
    if (sourceDir) {
      candidates.push(`${sourceDir}/${rawLink}.md`);
    }
  }

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (pathIndex.has(key)) return pathIndex.get(key)!;
  }

  return null;
}

/**
 * 解析相对路径
 */
function resolveRelativePath(sourceDir: string, rawLink: string): string | null {
  const parts = sourceDir ? sourceDir.split('/') : [];
  const linkParts = rawLink.split('/');

  for (const part of linkParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (parts.length === 0) return null; // 超出根目录
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}
