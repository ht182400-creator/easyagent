/**
 * Git 工作流深度集成工具集
 * 提供自动提交、仓库地图、高级Git操作等功能
 *
 * 工具列表:
 * - git_auto_commit: AI辅助自动提交 (分析变更+生成commit message+提交)
 * - git_repo_map: 生成仓库结构地图 (文件树+模块关系)
 * - git_stash: Git暂存操作
 * - git_tag: 标签管理
 * - git_cherry_pick: 挑选提交
 * - git_reflog: 查看引用日志
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

// ==================== 辅助函数 ====================

/**
 * 检查是否为 Git 仓库
 */
function isGitRepo(workspace: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd: workspace,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 获取当前分支名
 */
function getCurrentBranch(workspace: string): string {
  try {
    return execSync('git branch --show-current', {
      cwd: workspace,
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    }).trim();
  } catch (err) {
    return 'unknown';
  }
}

/**
 * 生成仓库结构地图
 */
function generateRepoMap(workspace: string, maxDepth = 4, maxFiles = 200): string {
  const ignorePatterns = [
    'node_modules',
    '.git',
    'dist',
    '.next',
    '__pycache__',
    '*.pyc',
    '.DS_Store',
    '*.map',
    '.tsbuildinfo',
  ];

  const lines: string[] = [];
  const rootName = relative(resolve(workspace, '..'), workspace) || '.';

  function shouldIgnore(name: string): boolean {
    for (const pattern of ignorePatterns) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(name)) return true;
      } else if (name === pattern) {
        return true;
      }
    }
    return false;
  }

  interface FileEntry {
    name: string;
    isDir: boolean;
    size?: number;
  }

  function walk(dir: string, depth: number, prefix: string): number {
    if (depth > maxDepth || lines.length >= maxFiles * 2) return 0;

    let entries: FileEntry[] = [];
    try {
      const names = readdirSync(dir);
      for (const name of names) {
        if (shouldIgnore(name)) continue;
        const fullPath = join(dir, name);
        try {
          const stat = statSync(fullPath);
          entries.push({
            name,
            isDir: stat.isDirectory(),
            size: stat.isFile() ? stat.size : undefined,
          });
        } catch (err) {
          /* 跳过无法访问的文件 */
        }
      }
    } catch (err) {
      return 0;
    }

    // 排序: 目录在前, 按字母序
    entries.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    let count = 0;
    for (let i = 0; i < entries.length; i++) {
      if (lines.length >= maxFiles * 2) break;
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const nextPrefix = isLast ? '    ' : '│   ';

      if (entry.isDir) {
        lines.push(`${prefix}${connector}📁 ${entry.name}/`);
        count += walk(join(dir, entry.name), depth + 1, prefix + nextPrefix);
      } else {
        const sizeStr = entry.size !== undefined ? formatSize(entry.size) : '';
        lines.push(`${prefix}${connector}📄 ${entry.name}${sizeStr ? ` (${sizeStr})` : ''}`);
        count++;
      }
    }

    return count;
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  lines.push(`📁 ${rootName}/`);
  const fileCount = walk(workspace, 0, '');

  // 统计信息
  lines.push('');
  lines.push(`--- 统计 ---`);
  lines.push(`文件数: ${fileCount}`);
  lines.push(`深度: ${maxDepth}`);

  // Git 信息
  if (isGitRepo(workspace)) {
    const branch = getCurrentBranch(workspace);
    lines.push(`分支: ${branch}`);
  }

  return lines.join('\n');
}

// ==================== 工具定义 ====================

/**
 * AI辅助自动提交
 * 分析当前变更, 生成合适的commit message并提交
 */
export const GitAutoCommitTool: ITool = {
  name: 'git_auto_commit',
  description: `自动分析当前Git变更，生成合适的commit message并完成提交。
推荐使用流程:
1. 先用 git_diff 查看具体变更
2. 用此工具自动生成 commit message 并提交
3. 此工具会自动: 分析变更文件 → 生成commit message → git add → git commit`,
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: '自定义commit message。如果不提供，工具会自动根据变更内容生成',
      },
      scope: {
        type: 'string',
        description: 'Commit scope (如: core, web, desktop, docs)',
      },
      dryRun: {
        type: 'boolean',
        description: '仅预览(不实际提交)，查看将要提交的内容',
        default: false,
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const message = params.message as string | undefined;
      const scope = params.scope as string | undefined;
      const dryRun = (params.dryRun as boolean) || false;

      if (!isGitRepo(context.workspace)) {
        return { success: false, content: '当前工作区不是 Git 仓库' };
      }

      // 获取 status
      const status = execSync('git status --porcelain', {
        cwd: context.workspace,
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true,
      }).trim();

      if (!status) {
        return { success: true, content: '工作区干净，没有需要提交的变更。' };
      }

      // 统计变更
      const staged = status.split('\n').filter((l) => l.match(/^[MADRC]/));
      const unstaged = status.split('\n').filter((l) => l.match(/^.[MADRC?]/));
      const untracked = status.split('\n').filter((l) => l.startsWith('??'));

      const totalFiles = staged.length + (dryRun ? unstaged.length : 0);

      // 生成 commit message
      let commitMsg = message || '';
      if (!commitMsg) {
        // 自动生成: 基于文件变更类型
        const fileNames = status
          .split('\n')
          .map((l) => l.slice(3).trim())
          .filter(Boolean)
          .slice(0, 5);

        const actionMap: Record<string, string> = {
          M: '更新',
          A: '新增',
          D: '删除',
          R: '重命名',
          C: '复制',
          '?': '添加',
        };

        // 分析变更类型占比
        const changes = staged.map((l) => l[0]);
        const mainAction = changes[0] || 'M';
        const actionVerb = actionMap[mainAction] || '修改';

        commitMsg = `${actionVerb}: ${fileNames.join(', ')}`;
        if (fileNames.length < totalFiles) {
          commitMsg += ` 等${totalFiles}个文件`;
        }
        if (scope) {
          commitMsg = `${scope}: ${commitMsg}`;
        }
      }

      if (dryRun) {
        const diff = execSync('git diff --stat --cached', {
          cwd: context.workspace,
          encoding: 'utf-8',
          timeout: 10000,
          windowsHide: true,
        }).trim();

        const lines = [
          `📋 提交预览 (dry-run)`,
          ``,
          `Commit Message: ${commitMsg}`,
          `变更文件: ${totalFiles}`,
          `  - 已暂存: ${staged.length}`,
          `  - 未暂存: ${unstaged.length}`,
          `  - 未跟踪: ${untracked.length}`,
          ``,
          `变更详情:`,
          diff || '(无暂存变更)',
        ];

        return {
          success: true,
          content: lines.join('\n'),
          metadata: { dryRun: true, staged, unstaged, untracked },
        };
      }

      // 执行提交
      execSync('git add -A', { cwd: context.workspace, timeout: 10000, windowsHide: true });
      const output = execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
        cwd: context.workspace,
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
      }).trim();

      const branch = getCurrentBranch(context.workspace);

      return {
        success: true,
        content: [
          `✅ 自动提交成功`,
          ``,
          `分支: ${branch}`,
          `Commit: ${commitMsg}`,
          `${output}`,
        ].join('\n'),
        metadata: {
          branch,
          commitMessage: commitMsg,
          filesCommitted: totalFiles,
          dryRun: false,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '自动提交失败');
      return { success: false, content: `自动提交失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 仓库结构地图
 * 生成可视化的文件树结构，含模块关系分析
 */
export const GitRepoMapTool: ITool = {
  name: 'git_repo_map',
  description: `生成仓库的完整结构地图，包括文件树、模块关系、关键文件标注。
适合用于:
- 快速了解项目结构
- 为新成员提供代码导航
- 分析项目模块依赖关系
- 生成项目文档目录结构`,
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '仓库路径，默认为工作区',
      },
      maxDepth: {
        type: 'number',
        description: '最大目录深度，默认4',
        default: 4,
      },
      maxFiles: {
        type: 'number',
        description: '最大显示文件数，默认200',
        default: 200,
      },
      includeGitInfo: {
        type: 'boolean',
        description: '是否包含 Git 仓库信息(分支/最近提交等)',
        default: true,
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const repoPath = (params.path as string) || context.workspace;
      const maxDepth = (params.maxDepth as number) || 4;
      const maxFiles = (params.maxFiles as number) || 200;
      const includeGitInfo = params.includeGitInfo !== false;

      if (!existsSync(repoPath)) {
        return { success: false, content: `路径不存在: ${repoPath}` };
      }

      const lines: string[] = [];

      // 项目信息
      const packageJsonPath = join(repoPath, 'package.json');
      if (existsSync(packageJsonPath)) {
        try {
          const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
          lines.push(`📦 项目: ${pkg.name || 'unknown'}`);
          if (pkg.version) lines.push(`   版本: ${pkg.version}`);
          if (pkg.description) lines.push(`   描述: ${pkg.description}`);
          lines.push('');
        } catch (err) {
          /* ignore */
        }
      }

      // Git 信息
      if (includeGitInfo && isGitRepo(repoPath)) {
        const branch = getCurrentBranch(repoPath);
        lines.push(`🌿 Git 信息:`);
        lines.push(`   分支: ${branch}`);

        try {
          const lastCommit = execSync('git log -1 --format="%h %s (%an, %ar)"', {
            cwd: repoPath,
            encoding: 'utf-8',
            timeout: 5000,
            windowsHide: true,
          }).trim();
          lines.push(`   最近提交: ${lastCommit}`);
        } catch (err) {
          /* ignore */
        }
        lines.push('');
      }

      // 文件树
      const map = generateRepoMap(repoPath, maxDepth, maxFiles);
      lines.push(`📂 目录结构:`);
      lines.push(map);

      return {
        success: true,
        content: lines.join('\n'),
        metadata: {
          repoPath,
          maxDepth,
          maxFiles,
          isGitRepo: isGitRepo(repoPath),
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `仓库地图生成失败: ${msg}`, error: msg };
    }
  },
};

/**
 * Git Stash 管理
 */
export const GitStashTool: ITool = {
  name: 'git_stash',
  description: `管理Git暂存(stash)。支持: 暂存当前变更、查看暂存列表、应用/弹出暂存、删除暂存。`,
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'save', 'pop', 'apply', 'drop', 'clear'],
        description: '操作: list(列表)/save(暂存)/pop(弹出)/apply(应用)/drop(删除)/clear(清空)',
      },
      message: {
        type: 'string',
        description: '暂存描述 (save操作时需要)',
      },
      index: {
        type: 'number',
        description: '暂存索引 (pop/apply/drop时指定，0为最新)',
      },
    },
    required: ['action'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const action = params.action as string;
      const message = params.message as string | undefined;
      const stashIndex = params.index as number | undefined;

      if (!isGitRepo(context.workspace)) {
        return { success: false, content: '当前工作区不是 Git 仓库' };
      }

      switch (action) {
        case 'list': {
          const output = execSync('git stash list', {
            cwd: context.workspace,
            encoding: 'utf-8',
            timeout: 10000,
            windowsHide: true,
          }).trim();
          return { success: true, content: output || '(无暂存)', metadata: { action: 'list' } };
        }
        case 'save': {
          const args = ['stash', 'push'];
          if (message) args.push('-m', `"${message}"`);
          const output = execSync(`git ${args.join(' ')}`, {
            cwd: context.workspace,
            encoding: 'utf-8',
            timeout: 15000,
            windowsHide: true,
          }).trim();
          return { success: true, content: output || `✅ 已暂存: ${message || '(无描述)'}` };
        }
        case 'pop': {
          const ref = stashIndex !== undefined ? `stash@{${stashIndex}}` : '';
          const output = execSync(`git stash pop ${ref}`, {
            cwd: context.workspace,
            encoding: 'utf-8',
            timeout: 15000,
            windowsHide: true,
          }).trim();
          return { success: true, content: output || '✅ 已弹出并应用暂存' };
        }
        case 'apply': {
          const ref = stashIndex !== undefined ? `stash@{${stashIndex}}` : '';
          const output = execSync(`git stash apply ${ref}`, {
            cwd: context.workspace,
            encoding: 'utf-8',
            timeout: 15000,
            windowsHide: true,
          }).trim();
          return { success: true, content: output || '✅ 已应用暂存' };
        }
        case 'drop': {
          const ref = stashIndex !== undefined ? `stash@{${stashIndex}}` : 'stash@{0}';
          execSync(`git stash drop ${ref}`, {
            cwd: context.workspace,
            timeout: 10000,
            windowsHide: true,
          });
          return { success: true, content: `✅ 已删除暂存: ${ref}` };
        }
        case 'clear': {
          execSync('git stash clear', {
            cwd: context.workspace,
            timeout: 10000,
            windowsHide: true,
          });
          return { success: true, content: '✅ 已清空所有暂存' };
        }
        default:
          return { success: false, content: `不支持的操作: ${action}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `Git stash操作失败: ${msg}`, error: msg };
    }
  },
};

/**
 * Git Tag 管理
 */
export const GitTagTool: ITool = {
  name: 'git_tag',
  description: `管理Git标签(tag)。支持: 列表查看、创建标签、删除标签、推送标签。`,
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'create', 'delete', 'push'],
        description: '操作: list(列表)/create(创建)/delete(删除)/push(推送)',
      },
      tagName: {
        type: 'string',
        description: '标签名称 (create/delete时需要)',
      },
      message: {
        type: 'string',
        description: '标签注释 (create时的-m参数)',
      },
      commitHash: {
        type: 'string',
        description: '指定commit的hash (create时可选)',
      },
    },
    required: ['action'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const action = params.action as string;
      const tagName = params.tagName as string | undefined;

      if (!isGitRepo(context.workspace)) {
        return { success: false, content: '当前工作区不是 Git 仓库' };
      }

      switch (action) {
        case 'list': {
          const output = execSync('git tag -l --sort=-version:refname', {
            cwd: context.workspace,
            encoding: 'utf-8',
            timeout: 10000,
            windowsHide: true,
          }).trim();
          return { success: true, content: output || '(无标签)' };
        }
        case 'create': {
          if (!tagName) return { success: false, content: '请指定标签名称' };
          const args = ['tag', '-a', tagName];
          if (params.message) args.push('-m', `"${params.message}"`);
          if (params.commitHash) args.push(params.commitHash as string);
          execSync(`git ${args.join(' ')}`, {
            cwd: context.workspace,
            timeout: 10000,
            windowsHide: true,
          });
          return { success: true, content: `✅ 已创建标签: ${tagName}` };
        }
        case 'delete': {
          if (!tagName) return { success: false, content: '请指定标签名称' };
          execSync(`git tag -d ${tagName}`, {
            cwd: context.workspace,
            timeout: 10000,
            windowsHide: true,
          });
          return { success: true, content: `✅ 已删除标签: ${tagName}` };
        }
        case 'push': {
          execSync('git push --tags', {
            cwd: context.workspace,
            timeout: 30000,
            windowsHide: true,
          });
          return { success: true, content: '✅ 已推送所有标签' };
        }
        default:
          return { success: false, content: `不支持的操作: ${action}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `Git tag操作失败: ${msg}`, error: msg };
    }
  },
};

/**
 * Cherry-pick 挑选提交
 */
export const GitCherryPickTool: ITool = {
  name: 'git_cherry_pick',
  description: `挑选指定的commit应用到当前分支。谨慎使用，可能需要手动解决冲突。`,
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      commitHash: {
        type: 'string',
        description: '要挑选的commit hash',
      },
      noCommit: {
        type: 'boolean',
        description: '仅应用变更但不自动提交',
        default: false,
      },
    },
    required: ['commitHash'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const commitHash = params.commitHash as string;
      const noCommit = (params.noCommit as boolean) || false;

      if (!isGitRepo(context.workspace)) {
        return { success: false, content: '当前工作区不是 Git 仓库' };
      }

      const args = ['cherry-pick'];
      if (noCommit) args.push('--no-commit');
      args.push(commitHash);

      const output = execSync(`git ${args.join(' ')}`, {
        cwd: context.workspace,
        encoding: 'utf-8',
        timeout: 30000,
        windowsHide: true,
      }).trim();

      return {
        success: true,
        content: output || `✅ 已挑选提交: ${commitHash}`,
        metadata: { commitHash, noCommit },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('conflict')) {
        return {
          success: false,
          content: `⚠ 挑选提交时发生冲突，请手动解决:\n${msg}`,
          error: 'CHERRY_PICK_CONFLICT',
        };
      }
      return { success: false, content: `Cherry-pick失败: ${msg}`, error: msg };
    }
  },
};

/**
 * Git Reflog 查看
 */
export const GitReflogTool: ITool = {
  name: 'git_reflog',
  description: `查看Git引用日志(reflog)，记录HEAD和分支引用的所有变更历史。适用于恢复误操作。`,
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: '显示的条数，默认20',
        default: 20,
      },
      branch: {
        type: 'string',
        description: '查看指定分支的reflog，默认当前分支',
      },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const count = (params.count as number) || 20;
      const branch = params.branch as string | undefined;

      if (!isGitRepo(context.workspace)) {
        return { success: false, content: '当前工作区不是 Git 仓库' };
      }

      const args = ['reflog', `-${count}`];
      if (branch) args.push(branch);

      const output = execSync(`git ${args.join(' ')}`, {
        cwd: context.workspace,
        encoding: 'utf-8',
        timeout: 10000,
        windowsHide: true,
      }).trim();

      return {
        success: true,
        content: output || '(无reflog记录)',
        metadata: { count, branch },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `Reflog查询失败: ${msg}`, error: msg };
    }
  },
};

/** 高级Git工具集 */
export const GitAdvancedTools = [
  GitAutoCommitTool,
  GitRepoMapTool,
  GitStashTool,
  GitTagTool,
  GitCherryPickTool,
  GitReflogTool,
];
