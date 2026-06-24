/**
 * FileTools 安全测试 (ST-03)
 * 覆盖：路径遍历防护、safePath边界、各工具安全性
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestWorkspace(): string {
  const dir = join(tmpdir(), `ea-fs-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupWorkspace(dir: string) {
  try { rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ================================================================
// 套件 1: safePath 路径遍历防护 (通过 ReadFileTool 间接测试)
// ================================================================
describe('FileTools — 路径遍历防护 (safePath)', () => {
  let ws: string;
  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  /** 尝试读取文件，验证路径被拒绝 */
  async function expectPathBlocked(filePath: string, tool: 'read' | 'write' | 'delete' | 'list' | 'edit' = 'read') {
    const { ReadFileTool, WriteFileTool, DeleteFileTool, ListDirTool, EditFileTool } = await import('../tools/FileTools.js');
    const tools: Record<string, any> = {
      read: ReadFileTool,
      write: WriteFileTool,
      delete: DeleteFileTool,
      list: ListDirTool,
      edit: EditFileTool,
    };

    const params: Record<string, any> = {
      read: { filePath },
      write: { filePath, content: 'test' },
      delete: { filePath },
      list: { targetDirectory: filePath },
      edit: { filePath, oldString: 'a', newString: 'b' },
    };

    const result = await tools[tool].execute(
      params[tool],
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.content).toMatch(/安全限制|无法访问工作区外的路径/);
  }

  // ---- Unix 风格遍历 ----
  it('../../../etc/passwd 应被拒绝', () => expectPathBlocked('../../../etc/passwd'));
  it('../../etc/shadow 应被拒绝', () => expectPathBlocked('../../etc/shadow'));
  it('../ 单层父目录遍历应被拒绝', () => expectPathBlocked('../secret.txt'));

  // ---- Windows 风格遍历 ----
  it('..\\..\\Windows\\System32\\config\\SAM 应被拒绝', () => expectPathBlocked('..\\..\\Windows\\System32\\config\\SAM'));

  // ---- 绝对路径注入 ----
  it('/etc/passwd 绝对路径应被拒绝', () => expectPathBlocked('/etc/passwd'));
  it('C:\\Windows\\System32 绝对路径应被拒绝', () => expectPathBlocked('C:\\Windows\\System32'));

  // ---- 混合绕过 ----
  it('./subdir/../../etc/passwd 混合遍历应被拒绝', () => expectPathBlocked('./subdir/../../etc/passwd'));
  it('../subdir/../secret 来回遍历应被拒绝', () => expectPathBlocked('../subdir/../secret'));

  // ---- 合法路径（应被允许） ----
  it('普通相对路径应被允许', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const testFile = join(ws, 'normal.txt');
    writeFileSync(testFile, 'content', 'utf-8');

    const result = await ReadFileTool.execute(
      { filePath: 'normal.txt' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
  });

  it('子目录中的文件应被允许', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const subDir = join(ws, 'subdir');
    mkdirSync(subDir);
    const testFile = join(subDir, 'deep.txt');
    writeFileSync(testFile, 'deep-content', 'utf-8');

    const result = await ReadFileTool.execute(
      { filePath: 'subdir/deep.txt' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
  });

  it('当前目录 . 应被允许', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    const result = await ListDirTool.execute(
      { targetDirectory: '.' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
  });
});

// ================================================================
// 套件 2: 各工具路径遍历交叉验证
// ================================================================
describe('FileTools — 各工具路径遍历交叉验证', () => {
  let ws: string;
  const TRAVERSAL_PATH = '../../../etc/passwd';

  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  it('WriteFileTool 应拒绝工作区外写入', async () => {
    const { WriteFileTool } = await import('../tools/FileTools.js');
    const result = await WriteFileTool.execute(
      { filePath: TRAVERSAL_PATH, content: 'evil content' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.content).toMatch(/安全限制|无法访问工作区外的路径/);
  });

  it('DeleteFileTool 应拒绝工作区外删除', async () => {
    const { DeleteFileTool } = await import('../tools/FileTools.js');
    const result = await DeleteFileTool.execute(
      { filePath: TRAVERSAL_PATH },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.content).toMatch(/安全限制|无法访问工作区外的路径/);
  });

  it('ListDirTool 应拒绝工作区外目录列出', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    const result = await ListDirTool.execute(
      { targetDirectory: TRAVERSAL_PATH },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.content).toMatch(/安全限制|无法访问工作区外的路径/);
  });

  it('EditFileTool 应拒绝工作区外编辑', async () => {
    const { EditFileTool } = await import('../tools/FileTools.js');
    const result = await EditFileTool.execute(
      { filePath: TRAVERSAL_PATH, oldString: 'a', newString: 'b' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.content).toMatch(/安全限制|无法访问工作区外的路径/);
  });
});

// ================================================================
// 套件 3: EditFileTool 功能测试
// ================================================================
describe('EditFileTool — 编辑功能', () => {
  let ws: string;
  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  it('应正确替换文件中的唯一匹配字符串', async () => {
    const { EditFileTool } = await import('../tools/FileTools.js');
    const testFile = join(ws, 'edit.txt');
    writeFileSync(testFile, 'Hello World\nLine 2', 'utf-8');

    const result = await EditFileTool.execute(
      { filePath: 'edit.txt', oldString: 'World', newString: 'Universe' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    const content = readFileSync(testFile, 'utf-8');
    expect(content).toBe('Hello Universe\nLine 2');
  });

  it('未找到匹配字符串应返回 NO_MATCH 错误', async () => {
    const { EditFileTool } = await import('../tools/FileTools.js');
    const testFile = join(ws, 'nomatch.txt');
    writeFileSync(testFile, 'Hello World', 'utf-8');

    const result = await EditFileTool.execute(
      { filePath: 'nomatch.txt', oldString: 'Goodbye', newString: 'Farewell' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('NO_MATCH');
  });

  it('多次匹配应返回 MULTIPLE_MATCHES 错误', async () => {
    const { EditFileTool } = await import('../tools/FileTools.js');
    const testFile = join(ws, 'multi.txt');
    writeFileSync(testFile, 'dup duplicate dup', 'utf-8');

    const result = await EditFileTool.execute(
      { filePath: 'multi.txt', oldString: 'dup', newString: 'replaced' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('MULTIPLE_MATCHES');
  });

  it('不存在的文件应返回 FILE_NOT_FOUND', async () => {
    const { EditFileTool } = await import('../tools/FileTools.js');
    const result = await EditFileTool.execute(
      { filePath: 'nonexistent.txt', oldString: 'a', newString: 'b' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });
});

// ================================================================
// 套件 4: DeleteFileTool 功能测试
// ================================================================
describe('DeleteFileTool — 删除功能', () => {
  let ws: string;
  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  it('应成功删除存在的文件', async () => {
    const { DeleteFileTool } = await import('../tools/FileTools.js');
    const testFile = join(ws, 'to-delete.txt');
    writeFileSync(testFile, 'delete me', 'utf-8');
    expect(existsSync(testFile)).toBe(true);

    const result = await DeleteFileTool.execute(
      { filePath: 'to-delete.txt' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(existsSync(testFile)).toBe(false);
  });

  it('删除不存在的文件应返回错误', async () => {
    const { DeleteFileTool } = await import('../tools/FileTools.js');
    const result = await DeleteFileTool.execute(
      { filePath: 'ghost.txt' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });

  it('DeleteFileTool 需要用户确认', async () => {
    const { DeleteFileTool } = await import('../tools/FileTools.js');
    expect(DeleteFileTool.requiresConfirm).toBe(true);
  });
});

// ================================================================
// 套件 5: WriteFileTool 路径遍历
// ================================================================
describe('WriteFileTool — 安全写入', () => {
  let ws: string;
  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  it('应能写入文件并自动创建父目录', async () => {
    const { WriteFileTool } = await import('../tools/FileTools.js');
    const result = await WriteFileTool.execute(
      { filePath: 'deep/nested/file.txt', content: 'nested content' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    const created = join(ws, 'deep', 'nested', 'file.txt');
    expect(existsSync(created)).toBe(true);
    expect(readFileSync(created, 'utf-8')).toBe('nested content');
  });

  it('应拒绝写入工作区外的路径 (Windows 风格)', async () => {
    const { WriteFileTool } = await import('../tools/FileTools.js');
    const result = await WriteFileTool.execute(
      { filePath: '..\\..\\out-of-workspace.txt', content: 'escape' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
  });
});

// ================================================================
// 套件 6: ListDirTool 功能测试
// ================================================================
describe('ListDirTool — 目录列表', () => {
  let ws: string;
  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  it('应过滤隐藏文件（以 . 开头）', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    writeFileSync(join(ws, 'visible.txt'), 'visible');
    writeFileSync(join(ws, '.hidden'), 'hidden');
    mkdirSync(join(ws, '.secret-dir'));

    const result = await ListDirTool.execute(
      { targetDirectory: '.' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('visible.txt');
    expect(result.content).not.toContain('.hidden');
    expect(result.content).not.toContain('.secret-dir');
  });

  it('不存在的目录应返回错误', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    const result = await ListDirTool.execute(
      { targetDirectory: 'nonexistent-dir' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
  });

  it('空目录应显示提示', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    const emptyDir = join(ws, 'empty');
    mkdirSync(emptyDir);

    const result = await ListDirTool.execute(
      { targetDirectory: 'empty' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('空目录');
  });
});

// ================================================================
// 套件 7: ReadFileTool 功能验证
// ================================================================
describe('ReadFileTool — 读取功能', () => {
  let ws: string;
  beforeEach(() => { ws = createTestWorkspace(); });
  afterEach(() => { cleanupWorkspace(ws); });

  it('应正确读取文件内容', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const testFile = join(ws, 'read-me.txt');
    writeFileSync(testFile, 'Hello ReadFileTool', 'utf-8');

    const result = await ReadFileTool.execute(
      { filePath: 'read-me.txt' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('Hello ReadFileTool');
  });

  it('不存在的文件应返回错误', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const result = await ReadFileTool.execute(
      { filePath: 'ghost-file.txt' },
      { workspace: ws, sessionId: 'test' }
    );
    expect(result.success).toBe(false);
  });
});
