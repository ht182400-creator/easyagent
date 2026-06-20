/**
 * EasyAgent 版本发布脚本
 * 
 * 功能: 版本号同步 → 代码构建 → Git 提交/Tag → GitHub Release 创建
 * 
 * 用法:
 *   node scripts/release.mjs <version>            # 发布指定版本
 *   node scripts/release.mjs patch               # 自动递增 patch (0.3.0 → 0.3.1)
 *   node scripts/release.mjs minor               # 自动递增 minor (0.3.0 → 0.4.0)
 *   node scripts/release.mjs major               # 自动递增 major (0.3.0 → 1.0.0)
 *   node scripts/release.mjs --dry-run 0.4.0     # 预览模式，不实际修改
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** 命令行颜色 */
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(msg, color = 'reset') {
  console.log(`${c[color]}${msg}${c.reset}`);
}

function warn(msg) { log(`⚠  ${msg}`, 'yellow'); }
function error(msg) { log(`✖  ${msg}`, 'red'); }
function success(msg) { log(`✔  ${msg}`, 'green'); }
function info(msg) { log(`➤  ${msg}`, 'cyan'); }
function header(msg) { log(`\n${c.bold}${c.cyan}${msg}${c.reset}\n`); }

/** 判断是否为 dry-run */
const isDryRun = process.argv.includes('--dry-run');

/** 计算新版本号 */
function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3) throw new Error(`无效的版本号: ${current}`);

  switch (type) {
    case 'major': return `${parts[0] + 1}.0.0`;
    case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

/** 获取目标版本号 */
function getTargetVersion() {
  const arg = process.argv[2];

  // 跳过程序名和 --dry-run
  const targetArg = process.argv.find(a => !a.startsWith('--') && a !== process.argv[1]?.split(/[\\/]/).pop());
  
  if (targetArg === 'patch' || targetArg === 'minor' || targetArg === 'major') {
    const currentVersion = JSON.parse(readFileSync(join(root, 'version.json'), 'utf-8')).version;
    return bumpVersion(currentVersion, targetArg);
  }
  if (targetArg && /^\d+\.\d+\.\d+$/.test(targetArg)) {
    return targetArg;
  }
  
  // 没有参数，默认 patch
  const currentVersion = JSON.parse(readFileSync(join(root, 'version.json'), 'utf-8')).version;
  return bumpVersion(currentVersion, 'patch');
}

/** 询问用户确认 */
function askQuestion(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(query, answer => { rl.close(); resolve(answer); });
  });
}

/** 检查仓库状态 */
function checkRepoStatus() {
  try {
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
    if (status) {
      warn('工作区有未提交的更改:');
      const lines = status.split('\n').slice(0, 10);
      lines.forEach(l => console.log(`  ${l}`));
      if (status.split('\n').length > 10) {
        console.log(`  ... 还有 ${status.split('\n').length - 10} 个文件`);
      }
      return false;
    }
    return true;
  } catch (err) {
    error(`无法检查 git 状态: ${err.message}`);
    return false;
  }
}

/** 生成当前版本的 changelog 条目（从最近的 git commits） */
function generateChangelogEntry(version) {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // 获取上一个 tag 以来的提交
    let since = '';
    try {
      since = execSync('git describe --tags --abbrev=0', { cwd: root, encoding: 'utf-8' }).trim();
    } catch { since = ''; }

    const logArgs = since ? `git log ${since}..HEAD --pretty=format:"- %s (%an)"` : '';
    
    if (!logArgs) return `## [${version}] - ${today}\n\n### Changed\n- 新版本发布\n`;

    const commits = execSync(logArgs, { cwd: root, encoding: 'utf-8' }).trim();
    const lines = commits.split('\n').filter(Boolean);

    // 分类提交
    const added = [];
    const changed = [];
    const fixed = [];
    const other = [];

    for (const line of lines) {
      const l = line.trim();
      if (l.toLowerCase().includes('add') || l.toLowerCase().includes('feat')) added.push(l);
      else if (l.toLowerCase().includes('fix') || l.toLowerCase().includes('bug')) fixed.push(l);
      else if (l.toLowerCase().includes('change') || l.toLowerCase().includes('refactor')) changed.push(l);
      else other.push(l);
    }

    let entry = `## [${version}] - ${today}\n`;
    if (added.length) entry += `\n### Added\n${added.map(l => l).join('\n')}\n`;
    if (changed.length) entry += `\n### Changed\n${changed.map(l => l).join('\n')}\n`;
    if (fixed.length) entry += `\n### Fixed\n${fixed.map(l => l).join('\n')}\n`;
    if (other.length && !added.length && !changed.length && !fixed.length) {
      entry += `\n### Changed\n${other.map(l => l).join('\n')}\n`;
    }

    return entry;
  } catch (err) {
    warn(`无法从 git 生成 changelog: ${err.message}`);
    return `## [${version}] - ${today}\n\n### Changed\n- 新版本发布\n`;
  }
}

/** 更新 CHANGELOG.md */
function updateChangelog(version) {
  const changelogPath = join(root, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    warn('CHANGELOG.md 不存在，创建中...');
    writeFileSync(changelogPath, '# Changelog\n\n', 'utf-8');
  }

  const changelog = readFileSync(changelogPath, 'utf-8');
  const entry = generateChangelogEntry(version);
  
  // 插入到第一个 ## [ 之前
  const insertPos = changelog.indexOf('## [');
  let newChangelog;
  if (insertPos === -1) {
    // 在标题后插入
    const titleEnd = changelog.indexOf('\n\n');
    newChangelog = changelog.substring(0, titleEnd + 2) + entry + '\n' + changelog.substring(titleEnd + 2);
  } else {
    newChangelog = changelog.substring(0, insertPos) + entry + '\n' + changelog.substring(insertPos);
  }

  if (!isDryRun) {
    writeFileSync(changelogPath, newChangelog, 'utf-8');
  }
  success(`CHANGELOG.md 已更新`);
}

/** 主流程 */
async function main() {
  const targetVersion = getTargetVersion();
  
  header(`╔══════════════════════════════════╗`);
  header(`║  EasyAgent Release v${targetVersion}${isDryRun ? ' (DRY RUN)' : ''}       ║`);
  header(`╚══════════════════════════════════╝`);

  // 1. 检查仓库状态
  info('检查仓库状态...');
  if (!isDryRun && !checkRepoStatus()) {
    const answer = await askQuestion('是否继续？（有未提交更改）[y/N] ');
    if (answer.toLowerCase() !== 'y') {
      error('已取消发布');
      process.exit(1);
    }
  }

  // 2. 更新 version.json
  info('更新 version.json...');
  const versionPath = join(root, 'version.json');
  const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
  const oldVersion = versionData.version;
  versionData.version = targetVersion;
  versionData.releaseDate = new Date().toISOString().split('T')[0];
  if (!isDryRun) {
    writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');
  }
  success(`version.json: ${oldVersion} → ${targetVersion}`);

  // 3. 同步版本到所有 package.json
  info('同步版本号到子包...');
  if (!isDryRun) {
    execSync(`node "${join(__dirname, 'sync-version.mjs')}"`, { cwd: root, stdio: 'inherit' });
  }

  // 4. 更新 CHANGELOG
  info('更新 CHANGELOG.md...');
  updateChangelog(targetVersion);

  if (isDryRun) {
    header('🎯 DRY RUN 完成 - 未实际修改任何文件');
    return;
  }

  // 5. 确认发布
  info(`\n即将创建: Git commit → tag v${targetVersion} → GitHub Release`);
  const confirm = await askQuestion(`确认发布 v${targetVersion}？[y/N] `);
  if (confirm.toLowerCase() !== 'y') {
    warn('已取消发布');
    process.exit(0);
  }

  // 6. Git 操作
  header('Git 操作...');
  try {
    execSync('git add .', { cwd: root, stdio: 'inherit' });
    execSync(`git commit -m "release: v${targetVersion}"`, { cwd: root, stdio: 'inherit' });
    success(`Git commit: release v${targetVersion}`);
    
    execSync(`git tag -a v${targetVersion} -m "EasyAgent v${targetVersion}"`, { cwd: root, stdio: 'inherit' });
    success(`Git tag: v${targetVersion}`);
    
    execSync('git push origin main --follow-tags', { cwd: root, stdio: 'inherit' });
    success('已推送到 GitHub (main + tags)');
  } catch (err) {
    error(`Git 操作失败: ${(err && err.message) || err}`);
    process.exit(1);
  }

  header('🚀 发布完成！');
  info(`版本: v${targetVersion}`);
  info(`仓库: https://github.com/ht182400-creator/easyagent`);
  info(`Release: https://github.com/ht182400-creator/easyagent/releases/tag/v${targetVersion}`);
  info(`\n下一步: 在 GitHub Release 页面手动补充 Release Notes`);
}

main().catch(err => {
  error(`发布失败: ${(err && err.message) || err}`);
  process.exit(1);
});
