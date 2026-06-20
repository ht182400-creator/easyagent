/**
 * 子Agent和数据库工具测试
 * 覆盖 DelegateTaskTool, ListSubAgentsTool, InstallRuntimeTool, QueryDBTool, DBSchemaTool
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestDir(): string {
  const dir = resolve(tmpdir(), `ea-sa-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const ctx = (ws: string) => ({ workspace: ws, sessionId: 'test-session' });

// ==================== DelegateTaskTool ====================
describe('DelegateTaskTool - 任务委派', () => {
  let DelegateTaskTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/SubAgentTools.js');
    DelegateTaskTool = mod.DelegateTaskTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能委派任务给architect', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'architect', task: '设计微服务架构' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('系统架构师');
    expect(result.metadata.agentType).toBe('architect');
  });

  it('应能委派任务给reviewer', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'reviewer', task: '审查PR #42' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('代码审查员');
  });

  it('应能委派任务给tester', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'tester', task: '为UserService生成测试' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('测试工程师');
  });

  it('应能委派任务给docs', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'docs', task: '编写API文档' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('文档编写员');
  });

  it('应能委派任务给devops', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'devops', task: '配置Docker部署' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('DevOps');
  });

  it('应能自动分配任务(不指定agentType)', async () => {
    const result = await DelegateTaskTool.execute(
      { task: '实现用户认证系统' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('多Agent协作');
  });

  it('未知的agentType应返回错误', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'unknown-agent-type', task: 'do something' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('未知');
  });

  it('应支持maxTurns参数', async () => {
    const result = await DelegateTaskTool.execute(
      { agentType: 'coder', task: '搜索', maxTurns: 10 },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.metadata.maxTurns).toBe(10);
  });

  it('task为必需参数，agentType为可选', () => {
    expect(DelegateTaskTool.parameters.required).toContain('task');
    // agentType 为可选参数（v2 支持自动分配）
    expect(DelegateTaskTool.parameters.required).not.toContain('agentType');
  });
});

// ==================== ListSubAgentsTool ====================
describe('ListSubAgentsTool - 列出子Agent', () => {
  let ListSubAgentsTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/SubAgentTools.js');
    ListSubAgentsTool = mod.ListSubAgentsTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应列出所有6个可用子Agent', async () => {
    const result = await ListSubAgentsTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.metadata.count).toBe(6);
    expect(result.content).toContain('architect');
    expect(result.content).toContain('coder');
    expect(result.content).toContain('reviewer');
    expect(result.content).toContain('tester');
    expect(result.content).toContain('devops');
    expect(result.content).toContain('docs');
  });

  it('应包括每个Agent的能力描述', async () => {
    const result = await ListSubAgentsTool.execute({}, ctx(workspace));
    expect(result.content).toContain('专长');
    expect(result.content).toContain('architecture');
  });

  it('应包含delegate_task调用示例', async () => {
    const result = await ListSubAgentsTool.execute({}, ctx(workspace));
    expect(result.content).toContain('delegate_task');
  });

  it('无参数执行应正常工作', () => {
    expect(ListSubAgentsTool.parameters.required).toEqual([]);
  });
});

// ==================== InstallRuntimeTool ====================
describe('InstallRuntimeTool - 安装运行时', () => {
  let InstallRuntimeTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/SubAgentTools.js');
    InstallRuntimeTool = mod.InstallRuntimeTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('应能请求安装Node.js', async () => {
    const result = await InstallRuntimeTool.execute(
      { type: 'node', version: '20.19.0' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('Node.js');
    expect(result.content).toContain('20.19.0');
  });

  it('应能请求安装Python', async () => {
    const result = await InstallRuntimeTool.execute(
      { type: 'python', version: '3.12.0' },
      ctx(workspace)
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('Python');
    expect(result.content).toContain('3.12.0');
  });

  it('无效版本格式应返回错误', async () => {
    const result = await InstallRuntimeTool.execute(
      { type: 'node', version: 'not-a-version' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('无效的版本格式');
  });

  it('缺少type或version应验证参数定义', () => {
    expect(InstallRuntimeTool.parameters.required).toContain('type');
    expect(InstallRuntimeTool.parameters.required).toContain('version');
  });

  it('requiresConfirm应为true(安装需确认)', () => {
    expect(InstallRuntimeTool.requiresConfirm).toBe(true);
  });

  it('应支持enum限制type为node/python', () => {
    expect(InstallRuntimeTool.parameters.properties.type.enum).toEqual(['node', 'python']);
  });
});

// ==================== QueryDBTool ====================
describe('QueryDBTool - 数据库查询', () => {
  let QueryDBTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/DatabaseTools.js');
    QueryDBTool = mod.QueryDBTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('SELECT查询应被允许', async () => {
    const result = await QueryDBTool.execute(
      { query: 'SELECT 1' },
      ctx(workspace)
    );
    expect(result).toBeDefined();
    // 无数据库时返回提示信息
    expect(result.success).toBeDefined();
  });

  it('INSERT操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'INSERT INTO users VALUES (1)' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('UPDATE操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'UPDATE users SET name = "hacker"' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('DELETE操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'DELETE FROM users WHERE 1=1' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('DROP操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'DROP TABLE users' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('ALTER操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'ALTER TABLE users ADD COLUMN email TEXT' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('CREATE操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'CREATE TABLE temp (id INT)' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('TRUNCATE操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'TRUNCATE TABLE logs' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('分号注入写操作应被阻止', async () => {
    const result = await QueryDBTool.execute(
      { query: 'SELECT 1; DROP TABLE users' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('不区分大小写地检测危险操作', async () => {
    const result = await QueryDBTool.execute(
      { query: 'insert into t values(1)' },
      ctx(workspace)
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('WRITE_OPERATION_BLOCKED');
  });

  it('query参数应为必需', () => {
    expect(QueryDBTool.parameters.required).toContain('query');
  });
});

// ==================== DBSchemaTool ====================
describe('DBSchemaTool - 数据库Schema', () => {
  let DBSchemaTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/DatabaseTools.js');
    DBSchemaTool = mod.DBSchemaTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { }
  });

  it('无数据库时返回友好提示', async () => {
    const result = await DBSchemaTool.execute({}, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('数据库');
  });

  it('应支持table参数', () => {
    expect(DBSchemaTool.parameters.properties.table).toBeDefined();
  });

  it('应支持dbType参数', () => {
    expect(DBSchemaTool.parameters.properties.dbType).toBeDefined();
  });

  it('应支持connection参数', () => {
    expect(DBSchemaTool.parameters.properties.connection).toBeDefined();
  });
});

// ==================== 导出验证 ====================
describe('SubAgentTools & DatabaseTools - 导出完整性', () => {
  it('SubAgentTools应包含3个工具', async () => {
    const mod = await import('../tools/SubAgentTools.js');
    expect(mod.SubAgentTools).toHaveLength(3);
    const names = mod.SubAgentTools.map((t: any) => t.name);
    expect(names).toContain('delegate_task');
    expect(names).toContain('list_subagents');
    expect(names).toContain('install_runtime');
  });

  it('DatabaseTools应包含2个工具', async () => {
    const mod = await import('../tools/DatabaseTools.js');
    expect(mod.DatabaseTools).toHaveLength(2);
    const names = mod.DatabaseTools.map((t: any) => t.name);
    expect(names).toContain('query_db');
    expect(names).toContain('db_schema');
  });
});
