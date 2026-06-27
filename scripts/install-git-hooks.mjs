#!/usr/bin/env node

/**
 * 安装 Git Hooks
 *
 * 将 post-commit hook 安装到 .git/hooks/ 目录
 * 每次 git commit 后自动运行项目进度检测
 *
 * 使用方式:
 *   node scripts/install-git-hooks.mjs          # 安装 hooks
 *   node scripts/install-git-hooks.mjs --remove # 移除 hooks
 */

import { writeFileSync, existsSync, unlinkSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('git-hooks');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HOOKS_DIR = join(ROOT, '.git', 'hooks');

// post-commit hook 内容（Unix 风格 shell，Windows 下的 git-bash 也可用）
const POST_COMMIT_CONTENT = `#!/bin/bash
# EasyAgent - 项目进度自动更新
# 每次 git commit 后自动检测并更新项目进度管线

SCRIPT_DIR="$(cd "$(dirname "$0")" && cd ../../scripts && pwd)"
NODE="$(which node 2>/dev/null || echo "node")"

echo ""
echo "🔄 [EasyAgent] 更新项目进度管线..."
"$NODE" "$SCRIPT_DIR/update-progress.mjs"

exit 0
`;

const POST_COMMIT_PS1 = `# EasyAgent - 项目进度自动更新 (Windows)
# 每次 git commit 后自动检测并更新项目进度管线

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path "$scriptDir\\..\\.."
$updateScript = Join-Path $root "scripts\\update-progress.mjs"

Write-Host ""
Write-Host "🔄 [EasyAgent] 更新项目进度管线..." -ForegroundColor Cyan
node "$updateScript"
`;

const args = process.argv.slice(2);
const REMOVE = args.includes('--remove') || args.includes('-r');

function main() {
  const hookPath = join(HOOKS_DIR, 'post-commit');
  const hookPs1Path = join(HOOKS_DIR, 'post-commit.ps1');

  if (!existsSync(HOOKS_DIR)) {
    log.error('未找到 .git/hooks 目录，请在 Git 仓库根目录运行此命令');
    process.exit(1);
  }

  if (REMOVE) {
    // 移除 hooks
    if (existsSync(hookPath)) {
      unlinkSync(hookPath);
      log.info('已移除:', hookPath);
    }
    if (existsSync(hookPs1Path)) {
      unlinkSync(hookPs1Path);
      log.info('已移除:', hookPs1Path);
    }
    if (!existsSync(hookPath) && !existsSync(hookPs1Path)) {
      log.ok('没有已安装的 hooks');
    }
    return;
  }

  // 安装 hooks（同时提供 bash 和 PowerShell 版本）
  // Bash hook（Git Bash / WSL / Linux / macOS）
  writeFileSync(hookPath, POST_COMMIT_CONTENT, { mode: 0o755 });
  // 尝试设置可执行权限（Windows 下可能无效，但不报错）
  try {
    chmodSync(hookPath, 0o755);
  } catch {}

  // PowerShell hook（Windows PowerShell / CMD 环境）
  writeFileSync(hookPs1Path, POST_COMMIT_PS1);

  log.ok('Git hooks 安装成功:');
  log.info(`  ${hookPath}  (Bash/Git Bash)`);
  log.info(`  ${hookPs1Path}  (PowerShell)`);
  log.info('');
  log.info('工作方式:');
  log.info('  每次 git commit 成功后，自动运行 scripts/update-progress.mjs');
  log.info('  检测项目文件结构变化，更新 docs/pipeline/project-progress-data.json');
  log.info('');
  log.info('提示:');
  log.info(`  手动运行检测:  node scripts/update-progress.mjs`);
  log.info(`  预览模式:      node scripts/update-progress.mjs --dry`);
  log.info(`  移除 hooks:    node scripts/install-git-hooks.mjs --remove`);
}

main();
