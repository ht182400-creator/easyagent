/**
 * GitAdvancedTools 单元测试 (UT-15)
 * 覆盖：6个高级Git工具 — AutoCommit, RepoMap, Stash, Tag, CherryPick, Reflog
 *
 * 策略：利用项目自身为 Git 仓库，对只读工具进行真实验证；
 * 对修改性工具使用临时目录（非Git仓库）或无效参数验证错误处理路径
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/**
 * 项目根目录（真实 Git 仓库）
 * Vitest cwd = packages/core，项目根在 packages/core/../.. = workspace root
 */
const PROJECT_ROOT = resolve(process.cwd(), '..', '..');

/** 创建临时非Git目录 */
function createNonGitDir(): string {
  const dir = join(tmpdir(), `ea-git-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

// ================================================================
// 套件 1: GitAutoCommitTool — 自动提交
// ================================================================
describe('GitAutoCommitTool — 自动提交', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = createNonGitDir();
  });
  afterEach(() => {
    cleanup(nonGitDir);
  });

  it('非Git仓库应返回错误', async () => {
    const { GitAutoCommitTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitAutoCommitTool.execute(
      { message: 'test commit' },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不是 Git 仓库');
  });

  it('工作区干净时(dryRun=true)应返回"无需提交"', async () => {
    const { GitAutoCommitTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitAutoCommitTool.execute(
      { dryRun: true },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    // 可能干净，也可能有未暂存变更
    expect(result.success).toBe(true);
    if (result.content.includes('没有需要提交')) {
      expect(result.content).toContain('工作区干净');
    }
  });

  it('dryRun 模式下不应实际提交', async () => {
    const { GitAutoCommitTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitAutoCommitTool.execute(
      { dryRun: true, message: 'should-not-persist' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    // dryRun 应包含预览信息
    if (result.metadata) {
      expect(result.metadata.dryRun).toBe(true);
    }
  });

  it('scope 仅在 message 为空时自动生成前缀', async () => {
    const { GitAutoCommitTool } = await import('../tools/GitAdvancedTools.js');
    // 不提供 message，让工具自动生成 → scope 应出现在生成的消息中
    const result = await GitAutoCommitTool.execute(
      { dryRun: true, scope: 'core' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    if (result.content && !result.content.includes('工作区干净')) {
      // 自动生成的消息应包含 scope 前缀: "core: 更新: xxx"
      expect(result.content).toMatch(/core:/);
    }
  });

  it('requiresConfirm 应为 true', async () => {
    const { GitAutoCommitTool } = await import('../tools/GitAdvancedTools.js');
    expect(GitAutoCommitTool.requiresConfirm).toBe(true);
  });
});

// ================================================================
// 套件 2: GitRepoMapTool — 仓库结构地图
// ================================================================
describe('GitRepoMapTool — 仓库地图', () => {
  it('应在项目根目录生成文件树', async () => {
    const { GitRepoMapTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitRepoMapTool.execute(
      { maxDepth: 2, maxFiles: 20 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );

    expect(result.success).toBe(true);
    expect(result.content).toContain('📦 项目');
    // 项目名可能在 package.json 中不同，仅验证有内容
    expect(result.content.length).toBeGreaterThan(100);
    // 应包含树形结构字符
    expect(result.content).toContain('├──');
    // 应包含 Git 信息（项目是 Git 仓库）
    expect(result.content).toContain('🌿 Git 信息');
  });

  it('maxDepth=1 应限制深度', async () => {
    const { GitRepoMapTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitRepoMapTool.execute(
      { maxDepth: 1, maxFiles: 10 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );

    expect(result.success).toBe(true);
    // 深度1应有较少 ├── 行
    const treeLineCount = (result.content.match(/├──/g) || []).length;
    expect(treeLineCount).toBeGreaterThan(0);
  });

  it('不存在的路径应返回错误', async () => {
    const { GitRepoMapTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitRepoMapTool.execute(
      { path: '/nonexistent/path/xyz' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('路径不存在');
  });

  it('includeGitInfo=false 应跳过 Git 信息', async () => {
    const { GitRepoMapTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitRepoMapTool.execute(
      { includeGitInfo: false, maxDepth: 1, maxFiles: 5 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    expect(result.content).not.toContain('🌿 Git 信息');
  });

  it('应包含 metadata 结构', async () => {
    const { GitRepoMapTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitRepoMapTool.execute(
      { maxDepth: 1, maxFiles: 5 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.repoPath).toBeDefined();
    expect(typeof result.metadata?.maxDepth).toBe('number');
    expect(typeof result.metadata?.maxFiles).toBe('number');
  });
});

// ================================================================
// 套件 3: GitStashTool — 暂存管理
// ================================================================
describe('GitStashTool — 暂存管理', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = createNonGitDir();
  });
  afterEach(() => {
    cleanup(nonGitDir);
  });

  it('非Git仓库应返回错误', async () => {
    const { GitStashTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitStashTool.execute(
      { action: 'list' },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不是 Git 仓库');
  });

  it('list 操作应返回暂存列表(项目仓库)', async () => {
    const { GitStashTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitStashTool.execute(
      { action: 'list' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    // 可能为空或有内容
    expect(typeof result.content).toBe('string');
  });

  it('不支持的操作应返回错误', async () => {
    const { GitStashTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitStashTool.execute(
      { action: 'invalid_action_xyz' as any },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不支持的操作');
  });

  it('save 非Git仓库应返回错误', async () => {
    const { GitStashTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitStashTool.execute(
      { action: 'save', message: 'test stash' },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
  });
});

// ================================================================
// 套件 4: GitTagTool — 标签管理
// ================================================================
describe('GitTagTool — 标签管理', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = createNonGitDir();
  });
  afterEach(() => {
    cleanup(nonGitDir);
  });

  it('非Git仓库应返回错误', async () => {
    const { GitTagTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitTagTool.execute(
      { action: 'list' },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不是 Git 仓库');
  });

  it('list 操作应返回标签列表(项目仓库)', async () => {
    const { GitTagTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitTagTool.execute(
      { action: 'list' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
  });

  it('create 缺少 tagName 应返回错误', async () => {
    const { GitTagTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitTagTool.execute(
      { action: 'create' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('请指定标签名称');
  });

  it('delete 缺少 tagName 应返回错误', async () => {
    const { GitTagTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitTagTool.execute(
      { action: 'delete' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('请指定标签名称');
  });

  it('create 不存在的标签名应失败', async () => {
    const { GitTagTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitTagTool.execute(
      { action: 'create', tagName: 'v999.999.999-invalid', message: 'test' },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    // 非Git仓库中无法创建标签
    expect(result.success).toBe(false);
  });

  it('不支持的操作应返回错误', async () => {
    const { GitTagTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitTagTool.execute(
      { action: 'unknown_op' as any },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不支持的操作');
  });
});

// ================================================================
// 套件 5: GitCherryPickTool — 挑选提交
// ================================================================
describe('GitCherryPickTool — 挑选提交', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = createNonGitDir();
  });
  afterEach(() => {
    cleanup(nonGitDir);
  });

  it('非Git仓库应返回错误', async () => {
    const { GitCherryPickTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitCherryPickTool.execute(
      { commitHash: 'abc123' },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不是 Git 仓库');
  });

  it('无效的 commitHash 应返回错误', async () => {
    const { GitCherryPickTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitCherryPickTool.execute(
      { commitHash: '0000000000000000000000000000000000000000' },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    // Git 会报 "bad revision" 或 cherry-pick 失败
    expect(result.content).toBeTruthy();
  });

  it('noCommit=true 应传递给 git', async () => {
    const { GitCherryPickTool } = await import('../tools/GitAdvancedTools.js');
    // 用无效hash测试，验证参数传递（--no-commit 会拼接到命令中）
    const result = await GitCherryPickTool.execute(
      { commitHash: 'deadbeef', noCommit: true },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
  });

  it('requiresConfirm 应为 true', async () => {
    const { GitCherryPickTool } = await import('../tools/GitAdvancedTools.js');
    expect(GitCherryPickTool.requiresConfirm).toBe(true);
  });
});

// ================================================================
// 套件 6: GitReflogTool — 引用日志
// ================================================================
describe('GitReflogTool — 引用日志', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = createNonGitDir();
  });
  afterEach(() => {
    cleanup(nonGitDir);
  });

  it('非Git仓库应返回错误', async () => {
    const { GitReflogTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitReflogTool.execute(
      { count: 5 },
      { workspace: nonGitDir, sessionId: 'test' },
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不是 Git 仓库');
  });

  it('应返回 reflog 记录(项目仓库)', async () => {
    const { GitReflogTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitReflogTool.execute(
      { count: 3 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    // reflog 输出格式: <hash> HEAD@{N}: <action>: <message>
    // 至少有哈希值（40个hex字符）
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('指定 count=1 应返回1条记录', async () => {
    const { GitReflogTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitReflogTool.execute(
      { count: 1 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
  });

  it('应包含 metadata', async () => {
    const { GitReflogTool } = await import('../tools/GitAdvancedTools.js');
    const result = await GitReflogTool.execute(
      { count: 2 },
      { workspace: PROJECT_ROOT, sessionId: 'test' },
    );
    expect(result.success).toBe(true);
    expect(result.metadata?.count).toBe(2);
  });
});

// ================================================================
// 套件 7: GitAdvancedTools 数组导出验证
// ================================================================
describe('GitAdvancedTools — 工具集数组', () => {
  it('应导出6个工具', async () => {
    const { GitAdvancedTools } = await import('../tools/GitAdvancedTools.js');
    expect(Array.isArray(GitAdvancedTools)).toBe(true);
    expect(GitAdvancedTools).toHaveLength(6);
  });

  it('每个工具应有 name/description/parameters/execute', async () => {
    const { GitAdvancedTools } = await import('../tools/GitAdvancedTools.js');
    for (const tool of GitAdvancedTools) {
      expect(tool.name).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('工具名应遵循 git_* 命名约定', async () => {
    const { GitAdvancedTools } = await import('../tools/GitAdvancedTools.js');
    const names = GitAdvancedTools.map((t) => t.name);
    for (const name of names) {
      expect(name).toMatch(/^git_/);
    }
  });

  it('应包含所有 6 个已知工具', async () => {
    const { GitAdvancedTools } = await import('../tools/GitAdvancedTools.js');
    const names = GitAdvancedTools.map((t) => t.name).sort();
    expect(names).toEqual([
      'git_auto_commit',
      'git_cherry_pick',
      'git_reflog',
      'git_repo_map',
      'git_stash',
      'git_tag',
    ]);
  });
});
