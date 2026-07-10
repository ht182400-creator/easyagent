import type { DocNode } from '../types';
import { extractWikiLinks, resolveWikiLink } from './wikiLinkParser';

/** 最大读取文件数，防止极端大目录卡死 */
const MAX_FILES = 5000;

/**
 * 文件系统加载服务
 * 两阶段加载：先快速扫描目录结构（不读内容），再后台批量异步读取文件内容
 */

/**
 * 阶段一：快速扫描目录结构，只收集文件路径/元数据，不读取文件内容
 * @param onProgress 进度回调 (已发现文件数)
 * @returns 文档树 + 展平节点 + 文件句柄映射（用于阶段二批量读取）
 */
export async function scanDirectoryStructure(
  onProgress?: (count: number, message: string) => void,
): Promise<{
  rootNodes: DocNode[];
  flatNodes: DocNode[];
  fileHandles: Map<string, FileSystemFileHandle>;
}> {
  try {
    const root = await (window as any).showDirectoryPicker();
    const progress = { count: 0 };
    const fileHandles = new Map<string, FileSystemFileHandle>();

    const result = await fastScanDirectory(root, '', onProgress, progress, fileHandles);
    return { rootNodes: result.nodes, flatNodes: result.flat, fileHandles };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new AbortError('用户取消了目录选择');
    }
    throw error;
  }
}

/**
 * 快速扫描目录，仅收集路径/元数据，不读取文件内容
 */
async function fastScanDirectory(
  dirHandle: FileSystemDirectoryHandle,
  relativePath: string,
  onProgress?: (count: number, message: string) => void,
  progress?: { count: number },
  fileHandles?: Map<string, FileSystemFileHandle>,
): Promise<{ nodes: DocNode[]; flat: DocNode[] }> {
  const nodes: DocNode[] = [];
  const flat: DocNode[] = [];
  progress = progress ?? { count: 0 };

  for await (const [name, handle] of (dirHandle as any).entries()) {
    // 跳过所有层级的 node_modules（目录条目过多，且极少包含有用的 .md 文档）
    if (handle.kind === 'directory' && name === 'node_modules') {
      continue;
    }

    const childRelativePath = relativePath ? `${relativePath}/${name}` : name;

    if (handle.kind === 'directory') {
      const child = await fastScanDirectory(
        handle,
        childRelativePath,
        onProgress,
        progress,
        fileHandles,
      );
      // 只保留包含 .md 文件的目录
      if (child.nodes.length > 0) {
        const folderNode: DocNode = {
          id: childRelativePath,
          name,
          type: 'folder',
          path: childRelativePath,
          children: child.nodes,
          links: [],
          backlinks: [],
        };
        nodes.push(folderNode);
        flat.push(...child.flat);
      }
    } else if (handle.kind === 'file' && isMarkdownFile(name)) {
      if (progress.count >= MAX_FILES) {
        console.warn(`[fileLoader] 已达到最大文件数限制 ${MAX_FILES}，停止扫描`);
        break;
      }

      // 存储文件句柄，阶段二再读取内容
      fileHandles!.set(childRelativePath, handle);

      const docNode: DocNode = {
        id: childRelativePath,
        name: removeMarkdownExtension(name),
        type: 'file',
        path: childRelativePath,
        content: undefined, // 阶段二填充
        links: [],
        backlinks: [],
      };
      nodes.push(docNode);
      flat.push(docNode);
      progress.count += 1;

      // 每 50 个文件更新一次进度
      if (progress.count % 50 === 0) {
        onProgress?.(progress.count, `已发现 ${progress.count} 个 Markdown 文件...`);
      }
    }
  }

  // 排序：文件夹在前，文件在后，均按字母序
  nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name, 'zh-CN');
    return a.type === 'folder' ? -1 : 1;
  });

  return { nodes, flat };
}

/**
 * 阶段二：批量异步读取文件内容（并发控制）
 * @param fileHandles 文件句柄映射 (path → handle)
 * @param concurrency 最大并发读取数，默认 8
 * @param onProgress 进度回调 (已读取数, 总数, 提示消息)
 * @returns 文件路径 → 内容的映射
 */
export async function loadFileContents(
  fileHandles: Map<string, FileSystemFileHandle>,
  concurrency: number = 8,
  onProgress?: (loaded: number, total: number, message: string) => void,
): Promise<Map<string, string>> {
  const contentMap = new Map<string, string>();
  const entries = Array.from(fileHandles.entries());
  const total = entries.length;
  let loaded = 0;

  if (total === 0) return contentMap;

  // 分批并行读取
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async ([id, handle]) => {
        try {
          const file = await handle.getFile();
          const content = await readFileText(file);
          return { id, content };
        } catch (err) {
          console.warn(`[fileLoader] 读取文件内容失败: ${id}`, err);
          return { id, content: '' };
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        contentMap.set(result.value.id, result.value.content);
      }
      loaded++;
    }

    onProgress?.(loaded, total, `已读取 ${loaded}/${total} 个文件内容...`);
  }

  return contentMap;
}

/**
 * 重建所有文档的链接关系 (基于相对路径解析)
 */
export function rebuildDocumentLinks(docs: DocNode[]): DocNode[] {
  // 建立路径到文档的快速映射
  const docMap = new Map<string, DocNode>();
  const pathIndex = new Map<string, string>(); // 小写路径 → 真实 id

  for (const doc of docs) {
    docMap.set(doc.id, doc);
    pathIndex.set(doc.path.toLowerCase(), doc.id);
    pathIndex.set(doc.id.toLowerCase(), doc.id);
    pathIndex.set(removeMarkdownExtension(doc.path).toLowerCase(), doc.id);
  }

  // 重置链接
  for (const doc of docs) {
    doc.links = doc.content ? extractWikiLinks(doc.content) : [];
    doc.backlinks = [];
  }

  // 解析并验证链接
  for (const doc of docs) {
    const resolvedLinks: string[] = [];
    for (const rawLink of doc.links) {
      const resolvedId = resolveWikiLink(rawLink, doc.path, pathIndex);
      if (resolvedId && resolvedId !== doc.id) {
        resolvedLinks.push(resolvedId);
        const target = docMap.get(resolvedId);
        if (target && !target.backlinks.includes(doc.id)) {
          target.backlinks.push(doc.id);
        }
      }
    }
    doc.links = [...new Set(resolvedLinks)];
  }

  return docs;
}

/**
 * 判断是否为 Markdown 文件
 */
function isMarkdownFile(name: string): boolean {
  return name.toLowerCase().endsWith('.md');
}

/**
 * 移除 Markdown 扩展名
 */
function removeMarkdownExtension(name: string): string {
  return name.replace(/\.md$/i, '');
}

/**
 * 读取文件文本内容
 */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * 用户取消错误
 */
export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}
