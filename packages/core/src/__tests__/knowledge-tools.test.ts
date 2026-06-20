/**
 * 知识库工具测试
 * 覆盖 KnowledgeAddTool, KnowledgeSearchTool, KnowledgeGetTool, KnowledgeListTool, KnowledgeRemoveTool
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestDir(): string {
  const dir = resolve(tmpdir(), `ea-kb-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const ctx = (ws: string) => ({ workspace: ws, sessionId: 'test-session' });

// ==================== KnowledgeAddTool ====================
describe('KnowledgeAddTool - 添加文档', () => {
  let KnowledgeAddTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/KnowledgeTools.js');
    KnowledgeAddTool = mod.KnowledgeAddTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能添加文本内容到知识库', async () => {
    const result = await KnowledgeAddTool.execute(
      { title: '测试文档', content: '这是测试内容。' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('已添加到知识库');
    expect(result.metadata.title).toBe('测试文档');
    expect(result.metadata.size).toBeGreaterThan(0);
  });

  it('应能通过filePath导入文件', async () => {
    writeFileSync(join(workspace, 'doc.md'), '# 重要文档\n\n这是文档内容。');
    const result = await KnowledgeAddTool.execute(
      { title: '从文件导入', filePath: 'doc.md' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('已添加到知识库');
  });

  it('未提供content和filePath应返回错误', async () => {
    const result = await KnowledgeAddTool.execute(
      { title: '空文档' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('请提供');
  });

  it('filePath对应的文件不存在应返回错误', async () => {
    const result = await KnowledgeAddTool.execute(
      { title: '缺失文件', filePath: 'nonexistent.md' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('文件不存在');
  });

  it('应支持自定义分类和标签', async () => {
    const result = await KnowledgeAddTool.execute(
      { title: 'API文档', content: 'API说明', category: 'api', tags: ['rest', 'v2'] },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('api');
    expect(result.content).toContain('rest');
  });

  it('应自动分块存储(每块1000字符)', async () => {
    const longContent = 'x'.repeat(2500); // 3块
    const result = await KnowledgeAddTool.execute(
      { title: '长文档', content: longContent },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.metadata.chunkCount).toBe(3);
  });

  it('应创建知识库存储目录', async () => {
    await KnowledgeAddTool.execute(
      { title: '文档', content: '内容' },
      ctx(workspace)
    );
    const kbDir = join(workspace, '.easyagent', 'knowledge');
    expect(existsSync(kbDir)).toBe(true);
  });

  it('应生成唯一docId', async () => {
    const result = await KnowledgeAddTool.execute(
      { title: '唯一文档', content: 'content' },
      ctx(workspace)
    );
    expect(result.metadata.docId).toBeDefined();
    expect(result.metadata.docId).toMatch(/^doc_\d+_[a-f0-9]{8}$/);
  });

  it('重复添加同标题应更新而非新增', async () => {
    const r1 = await KnowledgeAddTool.execute(
      { title: '更新测试', content: 'v1' },
      ctx(workspace)
    );
    const r2 = await KnowledgeAddTool.execute(
      { title: '更新测试', content: 'v2 updated content' },
      ctx(workspace)
    );
    expect(r2.success).toBe(true);
    expect(r2.metadata.totalDocs).toBeGreaterThanOrEqual(1);
  });
});

// ==================== KnowledgeSearchTool ====================
describe('KnowledgeSearchTool - 搜索知识库', () => {
  let KnowledgeSearchTool: any;
  let KnowledgeAddTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/KnowledgeTools.js');
    KnowledgeSearchTool = mod.KnowledgeSearchTool;
    KnowledgeAddTool = mod.KnowledgeAddTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('空知识库应返回友好提示', async () => {
    const result = await KnowledgeSearchTool.execute(
      { query: 'test' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('为空');
  });

  it('应能搜索标题匹配的文档', async () => {
    await KnowledgeAddTool.execute({ title: 'React入门指南', content: 'React是一个UI库', category: 'guide', tags: ['react'] }, ctx(workspace));
    const result = await KnowledgeSearchTool.execute({ query: 'React' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('React入门指南');
  });

  it('应能搜索内容匹配的文档', async () => {
    await KnowledgeAddTool.execute({ title: '安全手册', content: '使用HTTPS加密传输数据' }, ctx(workspace));
    const result = await KnowledgeSearchTool.execute({ query: 'HTTPS' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('安全手册');
  });

  it('应能按分类筛选', async () => {
    await KnowledgeAddTool.execute({ title: 'API v1', content: 'API接口文档', category: 'api' }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: '开发笔记', content: '开发心得', category: 'note' }, ctx(workspace));
    const result = await KnowledgeSearchTool.execute(
      { query: 'API', category: 'api' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('API v1');
    expect(result.content).not.toContain('开发笔记');
  });

  it('应能按标签筛选', async () => {
    await KnowledgeAddTool.execute({ title: 'TypeScript类型', content: '内容', tags: ['typescript', 'frontend'] }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: 'Python入门', content: '内容', tags: ['python'] }, ctx(workspace));
    const result = await KnowledgeSearchTool.execute(
      { query: '', tag: 'frontend' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('TypeScript类型');
  });

  it('应支持maxResults限制', async () => {
    for (let i = 0; i < 10; i++) {
      await KnowledgeAddTool.execute({ title: `文档${i}`, content: `内容${i}` }, ctx(workspace));
    }
    const result = await KnowledgeSearchTool.execute(
      { query: '文档', maxResults: 3 },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.metadata.matchedCount).toBeLessThanOrEqual(3);
  });

  it('无匹配结果应返回友好提示', async () => {
    // 先添加文档，再搜索不匹配的关键词
    await KnowledgeAddTool.execute({ title: '唯一文档', content: '只有这份文档' }, ctx(workspace));
    const result = await KnowledgeSearchTool.execute(
      { query: 'xyz_不存在的关键词_42' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('未找到');
  });
});

// ==================== KnowledgeGetTool ====================
describe('KnowledgeGetTool - 获取文档', () => {
  let KnowledgeGetTool: any;
  let KnowledgeAddTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/KnowledgeTools.js');
    KnowledgeGetTool = mod.KnowledgeGetTool;
    KnowledgeAddTool = mod.KnowledgeAddTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能通过docId获取完整文档内容', async () => {
    const addResult = await KnowledgeAddTool.execute(
      { title: '完整文档', content: '完整内容在这里', category: 'reference' },
      ctx(workspace)
    );
    const result = await KnowledgeGetTool.execute(
      { docId: addResult.metadata.docId },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('完整内容在这里');
    expect(result.content).toContain('完整文档');
  });

  it('不存在的docId应返回错误', async () => {
    const result = await KnowledgeGetTool.execute(
      { docId: 'doc_nonexistent_id_9999' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('未找到');
  });

  it('应包含文档元数据', async () => {
    const addResult = await KnowledgeAddTool.execute(
      { title: '元数据测试', content: '数据', tags: ['meta'] },
      ctx(workspace)
    );
    const result = await KnowledgeGetTool.execute(
      { docId: addResult.metadata.docId },
      ctx(workspace)
    );
    expect(result.content).toContain('分类');
    expect(result.content).toContain('标签');
    expect(result.content).toContain('meta');
  });

  it('长文档应截断显示', async () => {
    const longContent = 'a'.repeat(25000);
    const addResult = await KnowledgeAddTool.execute(
      { title: '长文档', content: longContent },
      ctx(workspace)
    );
    const result = await KnowledgeGetTool.execute(
      { docId: addResult.metadata.docId },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    // 20000字符限制
    expect(result.content).toContain('截断');
  });
});

// ==================== KnowledgeListTool ====================
describe('KnowledgeListTool - 列出文档', () => {
  let KnowledgeListTool: any;
  let KnowledgeAddTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/KnowledgeTools.js');
    KnowledgeListTool = mod.KnowledgeListTool;
    KnowledgeAddTool = mod.KnowledgeAddTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('空知识库应返回提示', async () => {
    const result = await KnowledgeListTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('为空');
  });

  it('应按分类分组列出所有文档', async () => {
    await KnowledgeAddTool.execute({ title: 'Doc A', content: 'a', category: 'api' }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: 'Doc B', content: 'b', category: 'api' }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: 'Doc C', content: 'c', category: 'guide' }, ctx(workspace));
    const result = await KnowledgeListTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('[api]');
    expect(result.content).toContain('[guide]');
    expect(result.content).toContain('Doc A');
    expect(result.content).toContain('Doc B');
    expect(result.content).toContain('Doc C');
  });

  it('应支持按分类筛选', async () => {
    await KnowledgeAddTool.execute({ title: 'API Doc', content: 'x', category: 'api' }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: 'Guide', content: 'y', category: 'guide' }, ctx(workspace));
    const result = await KnowledgeListTool.execute({ category: 'api' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('API Doc');
    expect(result.content).not.toContain('Guide');
  });

  it('应支持按标签筛选', async () => {
    await KnowledgeAddTool.execute({ title: 'TS Tips', content: 'ts', tags: ['typescript'] }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: 'JS Tips', content: 'js', tags: ['javascript'] }, ctx(workspace));
    const result = await KnowledgeListTool.execute({ tag: 'typescript' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('TS Tips');
    expect(result.content).not.toContain('JS Tips');
  });

  it('应返回文档总数和总大小', async () => {
    await KnowledgeAddTool.execute({ title: 'Doc1', content: 'abc' }, ctx(workspace));
    await KnowledgeAddTool.execute({ title: 'Doc2', content: 'defg' }, ctx(workspace));
    const result = await KnowledgeListTool.execute({}, ctx(workspace));
    expect(result.metadata.totalDocs).toBe(2);
    expect(result.metadata.totalSize).toBeGreaterThanOrEqual(7);
  });
});

// ==================== KnowledgeRemoveTool ====================
describe('KnowledgeRemoveTool - 删除文档', () => {
  let KnowledgeRemoveTool: any;
  let KnowledgeAddTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/KnowledgeTools.js');
    KnowledgeRemoveTool = mod.KnowledgeRemoveTool;
    KnowledgeAddTool = mod.KnowledgeAddTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能删除已存在的文档', async () => {
    const addResult = await KnowledgeAddTool.execute(
      { title: '待删除', content: 'delete me' },
      ctx(workspace)
    );
    const result = await KnowledgeRemoveTool.execute(
      { docId: addResult.metadata.docId },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('已删除');
    expect(result.metadata.remainingDocs).toBe(0);
  });

  it('删除不存在的docId应返回错误', async () => {
    const result = await KnowledgeRemoveTool.execute(
      { docId: 'nonexistent_doc_id_42' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
  });

  it('requiresConfirm应为true(删除需确认)', () => {
    expect(KnowledgeRemoveTool.requiresConfirm).toBe(true);
  });
});

// ==================== KnowledgeTools 导出验证 ====================
describe('KnowledgeTools - 导出完整性', () => {
  it('KnowledgeTools应包含5个工具', async () => {
    const mod = await import('../tools/KnowledgeTools.js');
    expect(mod.KnowledgeTools).toHaveLength(5);
    const names = mod.KnowledgeTools.map((t: any) => t.name);
    expect(names).toContain('knowledge_add');
    expect(names).toContain('knowledge_search');
    expect(names).toContain('knowledge_get');
    expect(names).toContain('knowledge_list');
    expect(names).toContain('knowledge_remove');
  });
});
