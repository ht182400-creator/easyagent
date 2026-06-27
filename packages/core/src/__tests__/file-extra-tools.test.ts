/**
 * 文件扩展工具测试
 * 覆盖 FileInfoTool, CreateDirTool, MoveFileTool, BatchEditTool
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestDir(): string {
  const dir = resolve(
    tmpdir(),
    `ea-fe-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const ctx = (ws: string) => ({ workspace: ws, sessionId: 'test-session' });

// ==================== FileInfoTool ====================
describe('FileInfoTool - 文件信息', () => {
  let FileInfoTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/FileExtraTools.js');
    FileInfoTool = mod.FileInfoTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('应能获取文件基本信息', async () => {
    writeFileSync(join(workspace, 'test.txt'), 'Hello World\nLine 2\nLine 3');
    const result = await FileInfoTool.execute({ filePath: 'test.txt' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('test.txt');
  });

  it('文件不存在应返回错误', async () => {
    const result = await FileInfoTool.execute({ filePath: 'nonexistent.txt' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });

  it('应能获取目录信息', async () => {
    mkdirSync(join(workspace, 'subdir'));
    const result = await FileInfoTool.execute({ filePath: 'subdir' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('目录');
  });

  it('应能获取文件的行数(如果小于50MB)', async () => {
    writeFileSync(join(workspace, 'multiline.txt'), Array(10).fill('line').join('\n'));
    const result = await FileInfoTool.execute({ filePath: 'multiline.txt' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('行数: 10');
  });

  it('工作区外路径应被拦截', async () => {
    const result = await FileInfoTool.execute({ filePath: '../../etc/passwd' }, ctx(workspace));
    expect(result.success).toBe(false);
  });

  it('应包含修改时间和创建时间', async () => {
    writeFileSync(join(workspace, 'time.txt'), 'test');
    const result = await FileInfoTool.execute({ filePath: 'time.txt' }, ctx(workspace));
    expect(result.content).toContain('修改时间');
    expect(result.content).toContain('创建时间');
  });

  it('应包含文件权限信息', async () => {
    writeFileSync(join(workspace, 'perm.txt'), 'test');
    const result = await FileInfoTool.execute({ filePath: 'perm.txt' }, ctx(workspace));
    expect(result.content).toContain('权限');
  });
});

// ==================== CreateDirTool ====================
describe('CreateDirTool - 创建目录', () => {
  let CreateDirTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/FileExtraTools.js');
    CreateDirTool = mod.CreateDirTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('应能创建新目录', async () => {
    const result = await CreateDirTool.execute({ dirPath: 'newfolder' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('已创建');
    expect(existsSync(join(workspace, 'newfolder'))).toBe(true);
  });

  it('目录已存在应静默成功', async () => {
    mkdirSync(join(workspace, 'existing'));
    const result = await CreateDirTool.execute({ dirPath: 'existing' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('已存在');
  });

  it('应能递归创建父目录', async () => {
    const result = await CreateDirTool.execute({ dirPath: 'a/b/c/d' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'a/b/c/d'))).toBe(true);
  });

  it('多级目录已存在部分路径应成功', async () => {
    mkdirSync(join(workspace, 'level1'), { recursive: true });
    const result = await CreateDirTool.execute({ dirPath: 'level1/level2' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'level1/level2'))).toBe(true);
  });

  it('空目录名应能处理', async () => {
    // 空字符串会被创建，为工作区目录
    const result = await CreateDirTool.execute({ dirPath: '' }, ctx(workspace));
    expect(result.success).toBe(true);
  });
});

// ==================== MoveFileTool ====================
describe('MoveFileTool - 移动文件', () => {
  let MoveFileTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/FileExtraTools.js');
    MoveFileTool = mod.MoveFileTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('应能移动文件到新位置', async () => {
    writeFileSync(join(workspace, 'source.txt'), 'content');
    const result = await MoveFileTool.execute(
      { sourcePath: 'source.txt', destPath: 'dest.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'dest.txt'))).toBe(true);
    expect(existsSync(join(workspace, 'source.txt'))).toBe(false);
  });

  it('源文件不存在应返回错误', async () => {
    const result = await MoveFileTool.execute(
      { sourcePath: 'nonexistent.txt', destPath: 'dest.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });

  it('应能重命名文件', async () => {
    writeFileSync(join(workspace, 'old.txt'), 'rename me');
    const result = await MoveFileTool.execute(
      { sourcePath: 'old.txt', destPath: 'new.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'new.txt'))).toBe(true);
    expect(existsSync(join(workspace, 'old.txt'))).toBe(false);
  });

  it('应能移动文件到子目录', async () => {
    writeFileSync(join(workspace, 'file.txt'), 'data');
    mkdirSync(join(workspace, 'sub'));
    const result = await MoveFileTool.execute(
      { sourcePath: 'file.txt', destPath: 'sub/file.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'sub/file.txt'))).toBe(true);
  });

  it('应能创建目标目录并移动', async () => {
    writeFileSync(join(workspace, 'item.txt'), 'content');
    const result = await MoveFileTool.execute(
      { sourcePath: 'item.txt', destPath: 'newdir/nested/item.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'newdir/nested/item.txt'))).toBe(true);
  });

  it('工作区外路径应被拦截', async () => {
    writeFileSync(join(workspace, 'ok.txt'), 'ok');
    const result = await MoveFileTool.execute(
      { sourcePath: 'ok.txt', destPath: '../../../outside.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
  });
});

// ==================== BatchEditTool ====================
describe('BatchEditTool - 批量编辑', () => {
  let BatchEditTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/FileExtraTools.js');
    BatchEditTool = mod.BatchEditTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('应能执行全局替换', async () => {
    writeFileSync(join(workspace, 'code.ts'), 'const foo = 1;\nconst bar = foo + foo;');
    const result = await BatchEditTool.execute(
      { filePath: 'code.ts', pattern: 'foo', replacement: 'baz' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('3处替换');
    const content = readFileSync(join(workspace, 'code.ts'), 'utf-8');
    expect(content).toContain('baz');
    expect(content).not.toContain('foo');
  });

  it('未找到匹配应返回错误', async () => {
    writeFileSync(join(workspace, 'data.txt'), 'hello world');
    const result = await BatchEditTool.execute(
      { filePath: 'data.txt', pattern: 'xyz_not_found', replacement: 'replaced' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('未找到匹配');
  });

  it('应支持正则捕获组替换', async () => {
    writeFileSync(join(workspace, 'vars.ts'), 'const name = "Alice";\nconst city = "Beijing";');
    const result = await BatchEditTool.execute(
      { filePath: 'vars.ts', pattern: '"(.*?)"', replacement: "'$1'" },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    const content = readFileSync(join(workspace, 'vars.ts'), 'utf-8');
    expect(content).toContain("'Alice'");
    expect(content).toContain("'Beijing'");
  });

  it('应支持正则标志(全局+大小写不敏感)', async () => {
    writeFileSync(join(workspace, 'mixed.txt'), 'HELLO hello Hello');
    const result = await BatchEditTool.execute(
      { filePath: 'mixed.txt', pattern: 'hello', replacement: 'hey', flags: 'gi' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    const content = readFileSync(join(workspace, 'mixed.txt'), 'utf-8');
    expect(content).toBe('hey hey hey');
  });

  it('文件不存在应返回错误', async () => {
    const result = await BatchEditTool.execute(
      { filePath: 'nonexistent.ts', pattern: 'x', replacement: 'y' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });

  it('requiresConfirm应为true(批量编辑需确认)', () => {
    expect(BatchEditTool.requiresConfirm).toBe(true);
  });

  it('工作区外路径应被拦截', async () => {
    const result = await BatchEditTool.execute(
      { filePath: '../../../etc/hosts', pattern: 'x', replacement: 'y' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
  });
});

// ==================== FileExtraTools 导出验证 ====================
describe('FileExtraTools - 导出完整性', () => {
  it('FileExtraTools应包含4个工具', async () => {
    const mod = await import('../tools/FileExtraTools.js');
    expect(mod.FileExtraTools).toHaveLength(4);
    const names = mod.FileExtraTools.map((t: any) => t.name);
    expect(names).toContain('file_info');
    expect(names).toContain('create_dir');
    expect(names).toContain('move_file');
    expect(names).toContain('batch_edit');
  });
});
