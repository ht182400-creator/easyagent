/**
 * 内置工具全面测试
 * 覆盖FileTools、SearchTools、ExecTools、QualityTools等工具的基础功能
 * 重点测试工具的name、description、parameters定义正确性
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/** 创建临时测试目录和文件 */
function createTestWorkspace(): string {
  const dir = join(tmpdir(), `easyagent-tool-test-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupWorkspace(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (_) { /* 测试清理失败不影响结果 */ }
}

describe('FileTools - 工具定义验证', () => {
  it('ReadFileTool应有正确的名称和参数定义', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    expect(ReadFileTool.name).toBe('read_file');
    expect(ReadFileTool.description).toBeTruthy();
    expect(ReadFileTool.parameters.required).toContain('filePath');
    expect(ReadFileTool.parameters.properties.filePath).toBeDefined();
    expect(ReadFileTool.parameters.properties.offset).toBeDefined();
    expect(ReadFileTool.parameters.properties.limit).toBeDefined();
    expect(ReadFileTool.requiresConfirm).toBe(false);
  });

  it('WriteFileTool应有正确的名称和参数定义', async () => {
    const { WriteFileTool } = await import('../tools/FileTools.js');
    expect(WriteFileTool.name).toBe('write_file');
    expect(WriteFileTool.parameters.required).toContain('filePath');
    expect(WriteFileTool.parameters.required).toContain('content');
    expect(WriteFileTool.parameters.properties.filePath).toBeDefined();
    expect(WriteFileTool.parameters.properties.content).toBeDefined();
  });

  it('EditFileTool应有正确的名称和参数定义', async () => {
    const { EditFileTool } = await import('../tools/FileTools.js');
    expect(EditFileTool.name).toBe('edit_file');
    expect(EditFileTool.parameters.required).toContain('filePath');
  });

  it('DeleteFileTool应有正确的名称和参数定义', async () => {
    const { DeleteFileTool } = await import('../tools/FileTools.js');
    expect(DeleteFileTool.name).toBe('delete_file');
    // 实际参数名是 filePath
    expect(DeleteFileTool.parameters.required).toContain('filePath');
    expect(DeleteFileTool.requiresConfirm).toBe(true); // 删除需要确认
  });

  it('ListDirTool应有正确的名称和参数定义', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    expect(ListDirTool.name).toBe('list_dir');
    // 实际参数名是 targetDirectory
    expect(ListDirTool.parameters.required).toContain('targetDirectory');
    expect(ListDirTool.parameters.properties.targetDirectory).toBeDefined();
    expect(ListDirTool.requiresConfirm).toBe(false);
  });
});

describe('FileTools - 执行功能', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = createTestWorkspace();
  });

  afterEach(() => {
    cleanupWorkspace(workspace);
  });

  it('ReadFileTool应能读取文件内容', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const testFile = join(workspace, 'test.txt');
    writeFileSync(testFile, 'Hello World\nLine 2\nLine 3', 'utf-8');

    const result = await ReadFileTool.execute(
      { filePath: 'test.txt' },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('Hello World');
    expect(result.content).toContain('Line 2');
    expect(result.content).toContain('Line 3');
  });

  it('ReadFileTool应支持offset和limit', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const testFile = join(workspace, 'lines.txt');
    const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);
    writeFileSync(testFile, lines.join('\n'), 'utf-8');

    const result = await ReadFileTool.execute(
      { filePath: 'lines.txt', offset: 3, limit: 2 },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    // 应包含第3-4行
    expect(result.content).toContain('Line 3');
    expect(result.content).toContain('Line 4');
  });

  it('ReadFileTool读取不存在的文件应返回错误', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const result = await ReadFileTool.execute(
      { filePath: 'nonexistent.txt' },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });

  it('ReadFileTool读取目录应返回错误', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const subDir = join(workspace, 'subdir');
    mkdirSync(subDir);

    const result = await ReadFileTool.execute(
      { filePath: 'subdir' },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('IS_DIRECTORY');
  });

  it('ReadFileTool访问工作区外路径应被拒绝', async () => {
    const { ReadFileTool } = await import('../tools/FileTools.js');
    const result = await ReadFileTool.execute(
      { filePath: '../../../etc/passwd' },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
  });

  it('WriteFileTool应能写入文件', async () => {
    const { WriteFileTool } = await import('../tools/FileTools.js');
    const result = await WriteFileTool.execute(
      { filePath: 'output.txt', content: 'Test content' },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    expect(existsSync(join(workspace, 'output.txt'))).toBe(true);
  });

  it('ListDirTool应能列出目录内容', async () => {
    const { ListDirTool } = await import('../tools/FileTools.js');
    writeFileSync(join(workspace, 'a.txt'), 'a');
    writeFileSync(join(workspace, 'b.txt'), 'b');
    mkdirSync(join(workspace, 'sub'));

    const result = await ListDirTool.execute(
      { targetDirectory: workspace },
      { workspace, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('a.txt');
    expect(result.content).toContain('b.txt');
    expect(result.content).toContain('sub');
  });
});

describe('SearchTools - 工具定义验证', () => {
  it('GrepTool应有正确的名称和参数定义', async () => {
    const { GrepTool } = await import('../tools/SearchTools.js');
    expect(GrepTool.name).toBe('grep');
    expect(GrepTool.parameters.required).toContain('pattern');
    expect(GrepTool.parameters.properties.pattern).toBeDefined();
    expect(GrepTool.parameters.properties.path).toBeDefined();
    expect(GrepTool.parameters.properties.include).toBeDefined();
    expect(GrepTool.parameters.properties.caseSensitive).toBeDefined();
    expect(GrepTool.parameters.properties.outputMode).toBeDefined();
  });

  it('GlobTool应有正确的名称和参数定义', async () => {
    const { GlobTool } = await import('../tools/SearchTools.js');
    expect(GlobTool.name).toBe('glob');
    expect(GlobTool.parameters.required).toContain('pattern');
  });

  it('WebSearchTool应有正确的名称和参数定义', async () => {
    const { WebSearchTool } = await import('../tools/SearchTools.js');
    expect(WebSearchTool.name).toBe('web_search');
    expect(WebSearchTool.parameters.required).toContain('query');
  });

  it('WebFetchTool应有正确的名称和参数定义', async () => {
    const { WebFetchTool } = await import('../tools/SearchTools.js');
    expect(WebFetchTool.name).toBe('web_fetch');
    expect(WebFetchTool.parameters.required).toContain('url');
  });
});

describe('ExecTools - 工具定义验证', () => {
  it('ExecTool应有正确的名称和参数定义', async () => {
    const { ExecTool } = await import('../tools/ExecTools.js');
    expect(ExecTool.name).toBe('exec');
    expect(ExecTool.parameters.required).toContain('command');
    expect(ExecTool.requiresConfirm).toBe(true);
  });

  it('ExecTool应阻止危险命令', async () => {
    const { ExecTool } = await import('../tools/ExecTools.js');
    const result = await ExecTool.execute(
      { command: 'rm -rf /' },
      { workspace: '/tmp', sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('DANGEROUS_COMMAND');
  });

  it('ExecTool应阻止git push --force', async () => {
    const { ExecTool } = await import('../tools/ExecTools.js');
    const result = await ExecTool.execute(
      { command: 'git push --force origin main' },
      { workspace: '/tmp', sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('DANGEROUS_COMMAND');
  });

  it('GitStatusTool应有正确的名称', async () => {
    const { GitStatusTool } = await import('../tools/ExecTools.js');
    expect(GitStatusTool.name).toBe('git_status');
  });

  it('GitDiffTool应有正确的名称', async () => {
    const { GitDiffTool } = await import('../tools/ExecTools.js');
    expect(GitDiffTool.name).toBe('git_diff');
  });

  it('GitLogTool应有正确的名称', async () => {
    const { GitLogTool } = await import('../tools/ExecTools.js');
    expect(GitLogTool.name).toBe('git_log');
  });

  it('GitBranchTool应有正确的名称', async () => {
    const { GitBranchTool } = await import('../tools/ExecTools.js');
    expect(GitBranchTool.name).toBe('git_branch');
  });

  it('GitBlameTool应有正确的名称', async () => {
    const { GitBlameTool } = await import('../tools/ExecTools.js');
    expect(GitBlameTool.name).toBe('git_blame');
  });

  it('GitCommitTool应有正确的名称', async () => {
    const { GitCommitTool } = await import('../tools/ExecTools.js');
    expect(GitCommitTool.name).toBe('git_commit');
  });
});

describe('QualityTools - 工具定义验证', () => {
  it('LintCodeTool应有正确的名称', async () => {
    const { LintCodeTool } = await import('../tools/QualityTools.js');
    expect(LintCodeTool.name).toBe('lint_code');
  });

  it('FormatCodeTool应有正确的名称', async () => {
    const { FormatCodeTool } = await import('../tools/QualityTools.js');
    expect(FormatCodeTool.name).toBe('format_code');
  });

  it('ReadLintsTool应有正确的名称', async () => {
    const { ReadLintsTool } = await import('../tools/QualityTools.js');
    expect(ReadLintsTool.name).toBe('read_lints');
  });

  it('TypeCheckTool应有正确的名称', async () => {
    const { TypeCheckTool } = await import('../tools/QualityTools.js');
    expect(TypeCheckTool.name).toBe('type_check');
  });
});

describe('内置工具 - 全部工具导出验证', () => {
  it('tools/index.ts应导出所有13个工具分组', async () => {
    const toolsMod = await import('../tools/index.js');
    // 13个分组 + ToolRegistry + ITool + getAllBuiltinTools
    expect(toolsMod.ToolRegistry).toBeDefined();
    expect(toolsMod.FileTools).toBeDefined();
    expect(toolsMod.FileExtraTools).toBeDefined();
    expect(toolsMod.SearchTools).toBeDefined();
    expect(toolsMod.ExecTools).toBeDefined();
    expect(toolsMod.CodeTools).toBeDefined();
    expect(toolsMod.QualityTools).toBeDefined();
    expect(toolsMod.ProjectTools).toBeDefined();
    expect(toolsMod.MemoryTools).toBeDefined();
    expect(toolsMod.PreviewTools).toBeDefined();
    expect(toolsMod.MediaTools).toBeDefined();
    expect(toolsMod.DatabaseTools).toBeDefined();
    expect(toolsMod.KnowledgeTools).toBeDefined();
    expect(toolsMod.SubAgentTools).toBeDefined();
  });

  it('每个分组应导出对应的具体工具类', async () => {
    const toolsMod = await import('../tools/index.js');
    // FileTools
    expect(toolsMod.ReadFileTool).toBeDefined();
    expect(toolsMod.WriteFileTool).toBeDefined();
    expect(toolsMod.EditFileTool).toBeDefined();
    expect(toolsMod.DeleteFileTool).toBeDefined();
    expect(toolsMod.ListDirTool).toBeDefined();
    // ExecTools
    expect(toolsMod.ExecTool).toBeDefined();
    expect(toolsMod.GitStatusTool).toBeDefined();
    expect(toolsMod.GitDiffTool).toBeDefined();
    expect(toolsMod.GitCommitTool).toBeDefined();
  });
});
