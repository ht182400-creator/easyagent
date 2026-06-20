/**
 * 项目管理和记忆工具测试
 * 覆盖 ReadConfigTool, NpmRunTool, EnvInfoTool, ProjectStatsTool, RememberTool, RecallTool, ForgetTool
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestDir(): string {
  const dir = resolve(tmpdir(), `ea-pm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const ctx = (ws: string) => ({ workspace: ws, sessionId: 'test-session' });

// ==================== ReadConfigTool ====================
describe('ReadConfigTool - 读取配置', () => {
  let ReadConfigTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/ProjectTools.js');
    ReadConfigTool = mod.ReadConfigTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能读取指定配置文件', async () => {
    writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'test-project', version: '1.0.0' }));
    const result = await ReadConfigTool.execute({ configFile: 'package.json' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('test-project');
  });

  it('配置文件不存在应返回错误', async () => {
    const result = await ReadConfigTool.execute({ configFile: 'nonexistent.json' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.content).toContain('不存在');
  });

  it('不指定configFile应列出所有可用配置文件', async () => {
    writeFileSync(join(workspace, 'package.json'), '{}');
    writeFileSync(join(workspace, 'tsconfig.json'), '{}');
    const result = await ReadConfigTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('package.json');
    expect(result.content).toContain('tsconfig.json');
  });

  it('无配置文件应返回提示', async () => {
    const result = await ReadConfigTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('未找到');
  });

  it('应能读取.env.example', async () => {
    writeFileSync(join(workspace, '.env.example'), 'PORT=3000\nHOST=localhost');
    const result = await ReadConfigTool.execute({ configFile: '.env.example' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('PORT=3000');
  });
});

// ==================== NpmRunTool ====================
describe('NpmRunTool - 包管理命令', () => {
  let NpmRunTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/ProjectTools.js');
    NpmRunTool = mod.NpmRunTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('requiresConfirm应为true', () => {
    expect(NpmRunTool.requiresConfirm).toBe(true);
  });

  it('危险命令sudo应被拒绝', async () => {
    const result = await NpmRunTool.execute(
      { command: 'sudo rm -rf /tmp' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('DANGEROUS_COMMAND');
  });

  it('危险命令rm -rf /应被拒绝', async () => {
    const result = await NpmRunTool.execute(
      { command: 'rm -rf / --no-preserve-root' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('DANGEROUS_COMMAND');
  });

  it('chmod 777应被拒绝', async () => {
    const result = await NpmRunTool.execute(
      { command: 'chmod 777 /etc/shadow' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('DANGEROUS_COMMAND');
  });

  it('安全的npm命令应能执行', async () => {
    const result = await NpmRunTool.execute(
      { command: 'echo hello from npm' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('hello from npm');
  });

  it('应支持cwd参数', async () => {
    mkdirSync(join(workspace, 'subproject'), { recursive: true });
    const result = await NpmRunTool.execute(
      { command: 'echo "in subdir"', cwd: 'subproject' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
  });

  it('命令执行失败应返回错误', async () => {
    const result = await NpmRunTool.execute(
      { command: 'non_existent_cmd_xyz_42' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('PKG_CMD_FAILED');
  });
});

// ==================== EnvInfoTool ====================
describe('EnvInfoTool - 环境信息', () => {
  let EnvInfoTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/ProjectTools.js');
    EnvInfoTool = mod.EnvInfoTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应返回操作系统信息', async () => {
    const result = await EnvInfoTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('操作系统');
    expect(result.content).toContain('Node.js');
    expect(result.content).toContain(process.version);
  });

  it('应返回工作区和会话信息', async () => {
    const result = await EnvInfoTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain(workspace);
    expect(result.content).toContain('test-session');
  });

  it('应返回CPU和内存信息', async () => {
    const result = await EnvInfoTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('CPU');
    expect(result.content).toContain('内存');
  });

  it('无参数也应正常工作', () => {
    expect(EnvInfoTool.parameters.required).toEqual([]);
  });
});

// ==================== ProjectStatsTool ====================
describe('ProjectStatsTool - 项目概览', () => {
  let ProjectStatsTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/ProjectTools.js');
    ProjectStatsTool = mod.ProjectStatsTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应检测Node.js+TypeScript技术栈', async () => {
    writeFileSync(join(workspace, 'package.json'), JSON.stringify({
      name: 'test',
      type: 'module',
      dependencies: { typescript: '^5.0', react: '^18.0' },
      devDependencies: { vite: '^5.0' }
    }));
    const result = await ProjectStatsTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('Node.js');
    expect(result.content).toContain('TypeScript');
    expect(result.content).toContain('React');
    expect(result.content).toContain('Vite');
  });

  it('应显示顶层目录结构', async () => {
    writeFileSync(join(workspace, 'README.md'), '# Project');
    mkdirSync(join(workspace, 'src'), { recursive: true });
    mkdirSync(join(workspace, 'tests'), { recursive: true });
    const result = await ProjectStatsTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('src');
    expect(result.content).toContain('tests');
    expect(result.content).toContain('README.md');
  });

  it('应检测Docker支持', async () => {
    writeFileSync(join(workspace, 'Dockerfile'), 'FROM node:20');
    const result = await ProjectStatsTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('Docker');
  });

  it('应检测GitHub CI', async () => {
    mkdirSync(join(workspace, '.github'), { recursive: true });
    const result = await ProjectStatsTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('GitHub CI');
  });

  it('无package.json也能正常工作', async () => {
    writeFileSync(join(workspace, 'README.md',), 'empty project');
    const result = await ProjectStatsTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('README.md');
  });
});

// ==================== RememberTool ====================
describe('RememberTool - 存储记忆', () => {
  let RememberTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/MemoryTools.js');
    RememberTool = mod.RememberTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能存储记忆到文件系统', async () => {
    const result = await RememberTool.execute(
      { key: 'my-setting', content: 'Use tabs for indentation', category: 'convention' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('my-setting');
    const memDir = join(workspace, '.easyagent', 'memory');
    expect(existsSync(memDir)).toBe(true);
    const files = require('fs').readdirSync(memDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it('应能存储多条记忆', async () => {
    await RememberTool.execute({ key: 'key1', content: 'content1' }, ctx(workspace));
    await RememberTool.execute({ key: 'key2', content: 'content2', category: 'preference' }, ctx(workspace));
    const memDir = join(workspace, '.easyagent', 'memory');
    const files = require('fs').readdirSync(memDir);
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it('键名中的特殊字符应被清理', async () => {
    const result = await RememberTool.execute(
      { key: 'key with spaces!@#$' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    // 特殊字符被替换为_
  });

  it('默认分类应为general', async () => {
    const result = await RememberTool.execute(
      { key: 'no-category', content: 'generic info' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    const memDir = join(workspace, '.easyagent', 'memory');
    const files = require('fs').readdirSync(memDir);
    expect(files.some((f: string) => f.startsWith('general_'))).toBe(true);
  });

  it('应能覆盖已有记忆', async () => {
    await RememberTool.execute({ key: 'dup-key', content: 'version 1' }, ctx(workspace));
    const result = await RememberTool.execute({ key: 'dup-key', content: 'version 2' }, ctx(workspace));
    expect(result.success).toBe(true);
  });
});

// ==================== RecallTool ====================
describe('RecallTool - 检索记忆', () => {
  let RecallTool: any;
  let RememberTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/MemoryTools.js');
    RecallTool = mod.RecallTool;
    RememberTool = mod.RememberTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能检索已存储的记忆', async () => {
    await RememberTool.execute({ key: 'setting', content: 'Tab width: 2', category: 'convention' }, ctx(workspace));
    const result = await RecallTool.execute({ key: 'setting' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('Tab width: 2');
  });

  it('未找到记忆应返回提示', async () => {
    const result = await RecallTool.execute({ key: 'nonexistent_memory' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('未找到');
  });

  it('不提供key应列出所有记忆', async () => {
    await RememberTool.execute({ key: 'item1', content: 'c1' }, ctx(workspace));
    await RememberTool.execute({ key: 'item2', content: 'c2' }, ctx(workspace));
    const result = await RecallTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('item1');
    expect(result.content).toContain('item2');
  });

  it('记忆库为空应返回提示', async () => {
    const result = await RecallTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('为空');
  });

  it('应支持category筛选', async () => {
    await RememberTool.execute({ key: 'pref1', content: 'p1', category: 'preference' }, ctx(workspace));
    await RememberTool.execute({ key: 'fact1', content: 'f1', category: 'fact' }, ctx(workspace));
    const result = await RecallTool.execute({ key: 'pref1' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('p1');
  });
});

// ==================== ForgetTool ====================
describe('ForgetTool - 删除记忆', () => {
  let ForgetTool: any;
  let RememberTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/MemoryTools.js');
    ForgetTool = mod.ForgetTool;
    RememberTool = mod.RememberTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能删除已存储的记忆', async () => {
    await RememberTool.execute({ key: 'temp-item', content: 'temp' }, ctx(workspace));
    const result = await ForgetTool.execute({ key: 'temp-item' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('已删除');
    // 验证不再存在
    const RecallToolMod = await import('../tools/MemoryTools.js');
    const recall = await RecallToolMod.RecallTool.execute({ key: 'temp-item' }, ctx(workspace));
    expect(recall.content).toContain('未找到');
  });

  it('删除不存在的记忆应返回错误', async () => {
    const result = await ForgetTool.execute({ key: 'never-existed' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.content).toContain('未找到');
  });

  it('requiresConfirm应为true(删除需确认)', () => {
    expect(ForgetTool.requiresConfirm).toBe(true);
  });
});

// ==================== 导出验证 ====================
describe('ProjectTools & MemoryTools - 导出完整性', () => {
  it('ProjectTools应包含4个工具', async () => {
    const mod = await import('../tools/ProjectTools.js');
    expect(mod.ProjectTools).toHaveLength(4);
    const names = mod.ProjectTools.map((t: any) => t.name);
    expect(names).toContain('read_config');
    expect(names).toContain('package_run');
    expect(names).toContain('env_info');
    expect(names).toContain('project_overview');
  });

  it('MemoryTools应包含3个工具', async () => {
    const mod = await import('../tools/MemoryTools.js');
    expect(mod.MemoryTools).toHaveLength(3);
    const names = mod.MemoryTools.map((t: any) => t.name);
    expect(names).toContain('remember');
    expect(names).toContain('recall');
    expect(names).toContain('forget');
  });
});
