/**
 * 知识库服务层
 * 封装 KnowledgeTools 的存储逻辑，提供简洁的 CRUD 接口供 HTTP API 使用
 * 
 * 支持两种作用域:
 * - project: 项目级知识库，存储在 {workspace}/.easyagent/knowledge/
 * - global:  全局知识库，存储在 ~/.easyagent/knowledge/，跨项目共享
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';

/** 知识库作用域 */
export type KBScope = 'project' | 'global';

/** 文档索引条目标识 */
export interface DocIndex {
  id: string;
  title: string;
  source: string;
  category: string;
  type: string;
  chunkCount: number;
  size: number;
  addedAt: string;
  updatedAt: string;
  tags: string[];
  /** 文档所属作用域 */
  scope?: KBScope;
}

/** 知识库统计信息 */
export interface KBStats {
  totalDocs: number;
  totalSize: number;
  categories: Record<string, number>;
}

/** 搜索结果 */
export interface KBSearchResult {
  document: DocIndex;
  score: number;
  snippet: string;
}

/**
 * 知识库服务 - 管理工作区知识库文档的存储与检索
 * 
 * 两种模式:
 * - project: 数据存储在 {workspace}/.easyagent/knowledge/ 目录下
 * - global:  数据存储在 ~/.easyagent/knowledge/ 目录下，跨项目共享
 */
export class KnowledgeService {
  private workspace: string;
  private scope: KBScope;
  /** 全局单例（跨项目） */
  private static globalInstance: KnowledgeService | null = null;

  constructor(workspace: string, scope: KBScope = 'project') {
    this.workspace = workspace;
    this.scope = scope;
  }

  /**
   * 获取全局知识库服务单例
   * 数据存储在用户目录 ~/.easyagent/knowledge/，跨所有项目共享
   */
  static getGlobal(): KnowledgeService {
    if (!KnowledgeService.globalInstance) {
      KnowledgeService.globalInstance = new KnowledgeService(
        resolve(homedir(), '.easyagent'),
        'global'
      );
    }
    return KnowledgeService.globalInstance;
  }

  /** 获取当前作用域 */
  getScope(): KBScope {
    return this.scope;
  }

  /** 知识库存储目录 */
  private get knowledgeDir(): string {
    const dir = resolve(this.workspace, '.easyagent', 'knowledge');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** 索引文件路径 */
  private get indexFile(): string {
    return join(this.knowledgeDir, 'index.json');
  }

  /** 读取索引 */
  loadIndex(): DocIndex[] {
    if (!existsSync(this.indexFile)) return [];
    try {
      return JSON.parse(readFileSync(this.indexFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  /** 保存索引 */
  private saveIndex(index: DocIndex[]): void {
    writeFileSync(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 添加文档到知识库
   */
  addDocument(params: {
    title: string;
    content?: string;
    filePath?: string;
    category?: string;
    tags?: string[];
  }): { success: boolean; docId?: string; error?: string } {
    try {
      const title = params.title;
      let content = params.content;
      const filePath = params.filePath;
      const category = params.category || 'general';
      const tags = params.tags || [];

      // 从文件读取
      if (!content && filePath) {
        const fullPath = resolve(this.workspace, filePath);
        if (!existsSync(fullPath)) {
          return { success: false, error: `文件不存在: ${filePath}` };
        }
        content = readFileSync(fullPath, 'utf-8');
      }

      if (!content) {
        return { success: false, error: '请提供 content 或 filePath 参数' };
      }

      const docId = `doc_${Date.now()}_${createHash('md5').update(title).digest('hex').slice(0, 8)}`;

      // 分块存储
      const chunkSize = 1000;
      const chunks: string[] = [];
      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.slice(i, i + chunkSize));
      }

      const chunkDir = join(this.knowledgeDir, docId);
      mkdirSync(chunkDir, { recursive: true });
      chunks.forEach((chunk, i) => {
        writeFileSync(join(chunkDir, `chunk_${String(i).padStart(4, '0')}.txt`), chunk, 'utf-8');
      });

      // 更新索引
      const index = this.loadIndex();
      const existingIdx = index.findIndex((d) => d.title === title);

      const docEntry: DocIndex = {
        id: docId,
        title,
        source: filePath || '手动输入',
        category,
        type: filePath ? extname(filePath).slice(1) : 'text',
        chunkCount: chunks.length,
        size: content.length,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags,
        scope: this.scope,
      };

      if (existingIdx >= 0) {
        index[existingIdx] = { ...index[existingIdx], ...docEntry, id: index[existingIdx].id };
      } else {
        index.push(docEntry);
      }

      this.saveIndex(index);
      logger.info({ title, category, size: content.length }, '文档已添加到知识库');

      return { success: true, docId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '添加知识失败');
      return { success: false, error: msg };
    }
  }

  /**
   * 搜索知识库
   */
  search(params: {
    query: string;
    category?: string;
    tag?: string;
    maxResults?: number;
  }): { results: KBSearchResult[]; totalDocs: number } {
    const query = params.query.toLowerCase();
    const category = params.category;
    const tag = params.tag;
    const maxResults = params.maxResults || 20;

    const index = this.loadIndex();

    // 筛选
    let matched = index.filter((doc) => {
      if (category && doc.category !== category) return false;
      if (tag && !doc.tags.includes(tag)) return false;

      if (query) {
        const titleMatch = doc.title.toLowerCase().includes(query);
        const tagMatch = doc.tags.some((t) => t.toLowerCase().includes(query));
        const categoryMatch = doc.category.toLowerCase().includes(query);
        const sourceMatch = doc.source.toLowerCase().includes(query);

        let contentMatch = false;
        const chunkDir = join(this.knowledgeDir, doc.id);
        if (existsSync(chunkDir)) {
          try {
            const chunkFiles = readdirSync(chunkDir).filter((f) => f.startsWith('chunk_'));
            for (const f of chunkFiles.slice(0, 3)) {
              if (readFileSync(join(chunkDir, f), 'utf-8').toLowerCase().includes(query)) {
                contentMatch = true;
                break;
              }
            }
          } catch { /* ignore */ }
        }

        return titleMatch || tagMatch || categoryMatch || sourceMatch || contentMatch;
      }
      return true;
    });

    // 评分排序
    const results: KBSearchResult[] = matched.map((doc) => {
      let score = 0;
      let snippet = '';

      if (doc.title.toLowerCase().includes(query)) score += 0.4;
      if (doc.tags.some((t) => t.toLowerCase().includes(query))) score += 0.2;
      if (doc.category.toLowerCase().includes(query)) score += 0.1;

      // 提取内容片段
      const chunkDir = join(this.knowledgeDir, doc.id);
      if (existsSync(chunkDir)) {
        try {
          const chunkFiles = readdirSync(chunkDir)
            .filter((f) => f.startsWith('chunk_'))
            .sort();
          if (chunkFiles.length > 0) {
            const firstChunk = readFileSync(join(chunkDir, chunkFiles[0]), 'utf-8');
            const idx = firstChunk.toLowerCase().indexOf(query);
            if (idx >= 0) {
              score += 0.3;
              const start = Math.max(0, idx - 40);
              const end = Math.min(firstChunk.length, idx + query.length + 80);
              snippet = (start > 0 ? '...' : '') + firstChunk.slice(start, end) + (end < firstChunk.length ? '...' : '');
            } else {
              snippet = firstChunk.slice(0, 150);
            }
          }
        } catch { /* ignore */ }
      }

      return { document: doc, score, snippet };
    });

    results.sort((a, b) => b.score - a.score);
    return {
      results: results.slice(0, maxResults),
      totalDocs: index.length,
    };
  }

  /**
   * 获取文档完整内容
   */
  getDocument(docId: string): { success: boolean; doc?: DocIndex; content?: string; error?: string } {
    const index = this.loadIndex();
    const doc = index.find((d) => d.id === docId);

    if (!doc) {
      return { success: false, error: `未找到ID为 "${docId}" 的文档` };
    }

    const chunkDir = join(this.knowledgeDir, docId);
    let fullContent = '';
    if (existsSync(chunkDir)) {
      const chunkFiles = readdirSync(chunkDir)
        .filter((f) => f.startsWith('chunk_'))
        .sort();
      for (const f of chunkFiles) {
        fullContent += readFileSync(join(chunkDir, f), 'utf-8');
      }
    }

    return { success: true, doc, content: fullContent };
  }

  /**
   * 列出所有文档
   */
  listDocuments(params?: { category?: string; tag?: string }): DocIndex[] {
    let index = this.loadIndex();

    if (params?.category) {
      index = index.filter((d) => d.category === params.category);
    }
    if (params?.tag) {
      index = index.filter((d) => d.tags.includes(params.tag));
    }

    return index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * 删除文档
   */
  removeDocument(docId: string): { success: boolean; error?: string } {
    try {
      const index = this.loadIndex();
      const doc = index.find((d) => d.id === docId);

      if (!doc) {
        return { success: false, error: `未找到ID为 "${docId}" 的文档` };
      }

      // 删除分块目录
      const chunkDir = join(this.knowledgeDir, docId);
      if (existsSync(chunkDir)) {
        rmSync(chunkDir, { recursive: true, force: true });
      }

      // 更新索引
      const newIndex = index.filter((d) => d.id !== docId);
      this.saveIndex(newIndex);

      logger.info({ docId, title: doc.title }, '文档已从知识库删除');
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '删除知识库文档失败');
      return { success: false, error: msg };
    }
  }

  /**
   * 获取知识库统计
   */
  getStats(): KBStats {
    const index = this.loadIndex();
    const categories: Record<string, number> = {};
    let totalSize = 0;

    for (const doc of index) {
      categories[doc.category] = (categories[doc.category] || 0) + 1;
      totalSize += doc.size;
    }

    return {
      totalDocs: index.length,
      totalSize,
      categories,
    };
  }

  /**
   * 获取所有唯一标签
   */
  getAllTags(): string[] {
    const index = this.loadIndex();
    return [...new Set(index.flatMap((d) => d.tags))].sort();
  }

  /**
   * 从文件导入文档（相对于工作区路径）
   */
  importFromFile(filePath: string): { success: boolean; docId?: string; error?: string } {
    try {
      const fullPath = resolve(this.workspace, filePath);
      if (!existsSync(fullPath)) {
        return { success: false, error: `文件不存在: ${filePath}` };
      }

      const content = readFileSync(fullPath, 'utf-8');
      const baseName = filePath.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');

      return this.addDocument({
        title: baseName,
        content,
        filePath,
        category: 'general',
        tags: [],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * 从绝对路径导入文档（支持项目外任意文件）
   * 用于文件上传场景或导入系统任意位置的文件
   */
  importFromAbsolutePath(absolutePath: string): { success: boolean; docId?: string; error?: string } {
    try {
      if (!existsSync(absolutePath)) {
        return { success: false, error: `文件不存在: ${absolutePath}` };
      }

      const content = readFileSync(absolutePath, 'utf-8');
      const fileName = basename(absolutePath);
      const baseName = fileName.replace(/\.[^.]+$/, '');
      // 源路径显示原始文件名（用于 UI 展示）
      const sourceLabel = `上传: ${fileName}`;

      return this.addDocument({
        title: baseName,
        content,
        filePath: sourceLabel,
        category: 'general',
        tags: [],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }

  /**
   * 从内容字符串导入文档（无需文件）
   * @param fileName 文件名（用于推断标题和类型）
   * @param content  文件内容
   * @param category 分类
   * @param tags     标签
   */
  importFromContent(
    fileName: string,
    content: string,
    category?: string,
    tags?: string[]
  ): { success: boolean; docId?: string; error?: string } {
    try {
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const sourceLabel = `上传: ${fileName}`;

      return this.addDocument({
        title: baseName,
        content,
        filePath: sourceLabel,
        category: category || 'general',
        tags: tags || [],
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  }
}
