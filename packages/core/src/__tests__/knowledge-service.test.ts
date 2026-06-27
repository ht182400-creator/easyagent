/**
 * KnowledgeService 单元测试
 * 覆盖文档 CRUD、搜索、统计、标签等全部公开方法
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import type { KnowledgeService as KS } from '../knowledge/KnowledgeService.js';

/** 创建临时工作区目录 */
function createTestWorkspace(): string {
  const dir = resolve(
    tmpdir(),
    `ea-ks-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('KnowledgeService - 文档 CRUD', () => {
  let KnowledgeService: typeof KS;
  let service: KS;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../knowledge/KnowledgeService.js');
    KnowledgeService = mod.KnowledgeService;
  });

  beforeEach(() => {
    workspace = createTestWorkspace();
    service = new KnowledgeService(workspace);
  });

  afterEach(() => {
    if (existsSync(workspace)) {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  // ==================== 添加文档 ====================
  describe('addDocument', () => {
    it('应成功添加文档并返回 docId', () => {
      const result = service.addDocument({
        title: '测试文档',
        content: '这是一段测试内容',
        category: 'test',
        tags: ['测试', '单元测试'],
      });

      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();
      expect(result.docId).toMatch(/^doc_/);
    });

    it('应从文件路径读取内容', () => {
      const filePath = join(workspace, 'test.txt');
      writeFileSync(filePath, '从文件读取的内容', 'utf-8');

      const result = service.addDocument({
        title: '文件导入文档',
        filePath: 'test.txt',
      });

      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();
    });

    it('应拒绝不存在的文件路径', () => {
      const result = service.addDocument({
        title: '不存在的文件',
        filePath: 'nonexistent.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });

    it('应拒绝无内容也无文件的添加', () => {
      const result = service.addDocument({
        title: '空文档',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('请提供 content 或 filePath');
    });

    it('同类名文档应更新索引合并新字段但不增重复条目', () => {
      // 同名文档会更新索引条目，但 content 块仍指向旧 docId(旧内容保留)
      service.addDocument({ title: '同名文档', content: 'Hello', category: 'test' });
      service.addDocument({ title: '同名文档', content: 'World', category: 'test' });

      const docs = service.listDocuments();
      expect(docs.length).toBe(1);
      // 索引元信息已更新到最新值
      expect(docs[0].tags).toEqual([]); // tags 合并自新 addDocument
    });

    it('未指定 category 应默认为 general', () => {
      service.addDocument({ title: '默认分类文档', content: 'content' });
      const docs = service.listDocuments();
      expect(docs[0].category).toBe('general');
    });
  });

  // ==================== 列出文档 ====================
  describe('listDocuments', () => {
    it('空知识库应返回空数组', () => {
      expect(service.listDocuments()).toEqual([]);
    });

    it('应按 category 过滤', () => {
      service.addDocument({ title: 'Doc A', content: 'a', category: 'test' });
      service.addDocument({ title: 'Doc B', content: 'b', category: 'general' });

      const filtered = service.listDocuments({ category: 'test' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Doc A');
    });

    it('应按 tag 过滤', () => {
      service.addDocument({ title: 'Tag Doc', content: 'x', tags: ['important'] });
      service.addDocument({ title: 'No Tag', content: 'y' });

      const filtered = service.listDocuments({ tag: 'important' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].title).toBe('Tag Doc');
    });

    it('应按更新时间降序排列', () => {
      service.addDocument({ title: 'First', content: '1' });
      // 短暂等待确保时间戳不同
      const now = Date.now();
      while (Date.now() === now) {
        /* wait */
      }
      service.addDocument({ title: 'Second', content: '2' });

      const docs = service.listDocuments();
      expect(docs.length).toBe(2);
      expect(new Date(docs[0].updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(docs[1].updatedAt).getTime(),
      );
    });
  });

  // ==================== 获取文档 ====================
  describe('getDocument', () => {
    it('应返回文档完整内容', () => {
      const { docId } = service.addDocument({
        title: '完整读取',
        content: 'Hello World 完整内容测试',
      });

      const result = service.getDocument(docId!);
      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello World 完整内容测试');
      expect(result.doc).toBeDefined();
      expect(result.doc!.title).toBe('完整读取');
    });

    it('不存在的文档应返回错误', () => {
      const result = service.getDocument('doc_nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到');
    });
  });

  // ==================== 删除文档 ====================
  describe('removeDocument', () => {
    it('应成功删除文档', () => {
      const { docId } = service.addDocument({ title: '待删除', content: 'delete me' });
      const result = service.removeDocument(docId!);

      expect(result.success).toBe(true);
      expect(service.listDocuments().length).toBe(0);
    });

    it('删除不存在的文档应返回错误', () => {
      const result = service.removeDocument('doc_nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('未找到');
    });
  });

  // ==================== 搜索 ====================
  describe('search', () => {
    beforeEach(() => {
      service.addDocument({
        title: 'JavaScript 入门指南',
        content: 'JavaScript 是一种动态类型编程语言，广泛用于 Web 开发。',
        category: 'programming',
        tags: ['js', 'frontend'],
      });
      service.addDocument({
        title: 'Python 数据分析',
        content: 'Python 是数据科学领域最流行的语言之一。',
        category: 'data',
        tags: ['python', 'data-science'],
      });
      service.addDocument({
        title: 'React 组件开发',
        content: 'React 是一个用于构建用户界面的 JavaScript 库。',
        category: 'programming',
        tags: ['js', 'react', 'frontend'],
      });
    });

    it('应通过标题搜索文档', () => {
      const { results } = service.search({ query: 'Python' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].document.title).toContain('Python');
    });

    it('应通过内容搜索文档', () => {
      const { results } = service.search({ query: '动态类型' });
      expect(results.length).toBe(1);
      expect(results[0].document.title).toBe('JavaScript 入门指南');
    });

    it('应返回评分和片段', () => {
      const { results } = service.search({ query: 'JavaScript' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].snippet).toBeTruthy();
    });

    it('应按 category 过滤搜索结果', () => {
      const { results } = service.search({ query: '数据', category: 'data' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.document.category === 'data')).toBe(true);
    });

    it('应按 tag 过滤搜索结果', () => {
      const { results } = service.search({ query: '', tag: 'frontend' });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.every((r) => r.document.tags.includes('frontend'))).toBe(true);
    });

    it('应限制最大结果数', () => {
      const { results } = service.search({ query: 'JavaScript', maxResults: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('空查询应返回所有结果(受 filter 约束)', () => {
      const { results } = service.search({ query: '' });
      expect(results.length).toBe(3);
    });

    it('无匹配应返回空结果', () => {
      const { results } = service.search({ query: 'zzzzz_not_found' });
      expect(results.length).toBe(0);
    });
  });

  // ==================== 统计 ====================
  describe('getStats', () => {
    it('空知识库应返回零统计', () => {
      const stats = service.getStats();
      expect(stats.totalDocs).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.categories).toEqual({});
    });

    it('应正确统计文档数量和分类', () => {
      service.addDocument({ title: 'Doc1', content: '12345', category: 'a' });
      service.addDocument({ title: 'Doc2', content: '123', category: 'a' });
      service.addDocument({ title: 'Doc3', content: '1', category: 'b' });

      const stats = service.getStats();
      expect(stats.totalDocs).toBe(3);
      expect(stats.totalSize).toBe(9); // 5+3+1
      expect(stats.categories['a']).toBe(2);
      expect(stats.categories['b']).toBe(1);
    });
  });

  // ==================== 标签 ====================
  describe('getAllTags', () => {
    it('空知识库应返回空数组', () => {
      expect(service.getAllTags()).toEqual([]);
    });

    it('应返回去重排序后的标签', () => {
      service.addDocument({ title: 'A', content: 'a', tags: ['beta', 'alpha'] });
      service.addDocument({ title: 'B', content: 'b', tags: ['alpha', 'gamma'] });

      const tags = service.getAllTags();
      expect(tags).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  // ==================== 导入文件 ====================
  describe('importFromFile', () => {
    it('应成功从文件导入', () => {
      const filePath = join(workspace, 'import-test.md');
      writeFileSync(filePath, '# 导入测试\n\n这是导入的内容', 'utf-8');

      const result = service.importFromFile('import-test.md');
      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();

      // 验证已添加到索引
      const docs = service.listDocuments();
      expect(docs.length).toBe(1);
      expect(docs[0].title).toBe('import-test');
    });

    it('不存在的文件应返回错误', () => {
      const result = service.importFromFile('no-such-file.md');
      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });
  });

  // ==================== 绝对路径导入（项目外文件） ====================
  describe('importFromAbsolutePath', () => {
    it('应成功从绝对路径导入任意位置文件', () => {
      const externalFile = resolve(tmpdir(), `ea-ext-${Date.now()}.md`);
      writeFileSync(externalFile, '# 外部文档\n\n来自项目外部的文件内容', 'utf-8');

      const result = service.importFromAbsolutePath(externalFile);
      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();

      const docs = service.listDocuments();
      expect(docs.length).toBe(1);
      expect(docs[0].source).toContain('上传:');

      // 清理
      if (existsSync(externalFile)) rmSync(externalFile);
    });

    it('不存在的绝对路径应返回错误', () => {
      // 使用工作区内的路径，但文件不存在 — 验证文件存在检查生效
      const nonexistentFile = resolve(service.workspace, 'nonexistent-file.md');
      const result = service.importFromAbsolutePath(nonexistentFile);
      expect(result.success).toBe(false);
      expect(result.error).toContain('文件不存在');
    });

    it('workspace 外的绝对路径应返回安全限制错误', () => {
      const result = service.importFromAbsolutePath('/etc/passwd');
      expect(result.success).toBe(false);
      expect(result.error).toContain('安全限制');
    });
  });

  // ==================== 内容导入（无文件） ====================
  describe('importFromContent', () => {
    it('应成功从内容字符串导入并生成正确的 source 标签', () => {
      const result = service.importFromContent('test-file.py', 'print("hello")', 'code', [
        'python',
      ]);
      expect(result.success).toBe(true);
      expect(result.docId).toBeDefined();

      const docs = service.listDocuments();
      expect(docs.length).toBe(1);
      expect(docs[0].title).toBe('test-file');
      expect(docs[0].source).toBe('上传: test-file.py');
      expect(docs[0].category).toBe('code');
      expect(docs[0].tags).toEqual(['python']);
    });

    it('未指定分类和标签应使用默认值', () => {
      const result = service.importFromContent('readme.md', '# Hello');
      expect(result.success).toBe(true);

      const docs = service.listDocuments();
      expect(docs[0].category).toBe('general');
      expect(docs[0].tags).toEqual([]);
    });
  });

  // ==================== 全局作用域 ====================
  describe('全局作用域 (Global Scope)', () => {
    it('getGlobal 应返回单例', () => {
      const g1 = KnowledgeService.getGlobal();
      const g2 = KnowledgeService.getGlobal();
      expect(g1).toBe(g2); // 单例
    });

    it('全局实例 scope 应为 global', () => {
      const gs = KnowledgeService.getGlobal();
      expect(gs.getScope()).toBe('global');
    });

    it('项目实例 scope 应为 project', () => {
      const ps = new KnowledgeService(workspace, 'project');
      expect(ps.getScope()).toBe('project');
    });

    it('全局实例添加的文档应带 scope: global', () => {
      const gs = KnowledgeService.getGlobal();
      const result = gs.addDocument({ title: '全局文档', content: 'global content' });
      expect(result.success).toBe(true);

      const doc = gs.getDocument(result.docId!);
      expect(doc.success).toBe(true);
      expect(doc.doc!.scope).toBe('global');

      // 清理
      gs.removeDocument(result.docId!);
    });

    it('项目实例添加的文档应带 scope: project', () => {
      const result = service.addDocument({ title: '项目文档', content: 'project content' });
      expect(result.success).toBe(true);

      const doc = service.getDocument(result.docId!);
      expect(doc.doc!.scope).toBe('project');
    });

    it('项目和全局实例的文档应互不干扰', () => {
      // 向项目实例添加
      service.addDocument({ title: '项目专用', content: 'project-only' });
      // 向全局实例添加
      const gs = KnowledgeService.getGlobal();
      const gr = gs.addDocument({ title: '全局专用', content: 'global-only' });

      // 项目列表不包含全局文档
      const projectDocs = service.listDocuments();
      expect(projectDocs.every((d) => d.title !== '全局专用')).toBe(true);

      // 全局列表不包含项目文档
      const globalDocs = gs.listDocuments();
      expect(globalDocs.every((d) => d.title !== '项目专用')).toBe(true);

      // 清理
      gs.removeDocument(gr.docId!);
    });
  });

  // ==================== 持久化 ====================
  describe('数据持久化', () => {
    it('数据应在重建实例后仍然存在', () => {
      service.addDocument({ title: '持久化测试', content: 'persist me', category: 'test' });

      // 重建 service(同一 workspace)
      const service2 = new KnowledgeService(workspace);
      const docs = service2.listDocuments();
      expect(docs.length).toBe(1);
      expect(docs[0].title).toBe('持久化测试');
    });
  });

  // ==================== 长文本分块 ====================
  describe('长文本分块存储', () => {
    it('长文本应被分块但可完整读取', () => {
      const longContent = 'A'.repeat(2500); // 超过 chunkSize=1000, 分3块
      const { docId } = service.addDocument({
        title: '长文本',
        content: longContent,
      });

      const result = service.getDocument(docId!);
      expect(result.content).toBe(longContent);
      expect(result.doc!.chunkCount).toBe(3);
    });
  });
});
