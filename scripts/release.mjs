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
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('release');
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

/** 日志包装函数（保持向后兼容的 API） */
function warn(msg) {
  log.warn(msg);
}
function error(msg) {
  log.error(msg);
}
function success(msg) {
  log.ok(msg);
}
function info(msg) {
  log.info(msg);
}
function header(msg) {
  log.title(msg);
}

/** 判断是否为 dry-run */
const isDryRun = process.argv.includes('--dry-run');

/** 计算新版本号 */
function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3) throw new Error(`无效的版本号: ${current}`);

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

/** 获取目标版本号 */
function getTargetVersion() {
  const arg = process.argv[2];

  // 跳过 node 路径和脚本名，取第一个非 -- 参数
  const targetArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

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
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** 检查仓库状态 */
function checkRepoStatus() {
  try {
    const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim();
    if (status) {
      warn('工作区有未提交的更改:');
      const lines = status.split('\n').slice(0, 10);
      lines.forEach((l) => log.info(`  ${l}`));
      if (status.split('\n').length > 10) {
        log.info(`  ... 还有 ${status.split('\n').length - 10} 个文件`);
      }
      return false;
    }
    return true;
  } catch (err) {
    error(`无法检查 git 状态: ${err.message}`);
    return false;
  }
}

/** 从 memory 记录文件提取变更（git log 为空时的 fallback） */
function extractFromMemory(version) {
  const memoryDir = join(root, '.codebuddy', 'memory');
  if (!existsSync(memoryDir)) return null;

  const today = new Date().toISOString().split('T')[0];

  // 确定起始日期：上次 tag 的日期 或 7 天前
  let sinceDate;
  try {
    const lastTag = execSync('git describe --tags --abbrev=0', {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    const tagDate = execSync(`git log -1 --format=%ai ${lastTag}`, {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    sinceDate = tagDate.split(' ')[0];
  } catch {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    sinceDate = d.toISOString().split('T')[0];
  }

  const files = readdirSync(memoryDir)
    .filter((f) => f.endsWith('.md') && f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
    .filter((f) => f >= `${sinceDate}.md`)
    .sort();

  if (files.length === 0) return null;

  // 解析每个文件的结构化条目
  const entries = [];
  for (const f of files) {
    const content = readFileSync(join(memoryDir, f), 'utf-8');
    const sections = content.split(/^## /m).slice(1);

    for (const section of sections) {
      const titleMatch = section.match(/^(.+?)\s+\((\d{2}:\d{2})\)/m);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      const statusMatch = section.match(/\*\*状态\*\*[：:]\s*(.+)/);
      if (statusMatch && !statusMatch[1].includes('✅')) continue;

      // 提取描述字段（优先级：问题 > 背景 > 需求 > 产物 > 标题）
      let desc = '';
      for (const key of ['问题', '背景', '需求', '产物', '实施内容', '实施修改']) {
        const m = section.match(new RegExp(`\\*\\*${key}\\*\\*[：:]\\s*(.+)`));
        if (m) {
          desc = m[1];
          break;
        }
      }
      if (!desc) desc = title;

      // 分类
      let category = 'Changed';
      if (/fix|修复|bug/i.test(title)) category = 'Fixed';
      else if (/feat|新增|创建|添加|新功能|支持/i.test(title)) category = 'Added';
      else if (/移除|删除/i.test(title)) category = 'Removed';

      entries.push({ category, desc });
    }
  }

  if (entries.length === 0) return null;

  // 组装 entry
  const groups = { Added: [], Changed: [], Fixed: [], Removed: [] };
  for (const e of entries) groups[e.category].push(e);

  let out = `## [${version}] - ${today}\n`;
  for (const [cat, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    out += `\n### ${cat}\n`;
    for (const item of items) out += `- ${item.desc}\n`;
  }

  info(`从 memory 记录提取到 ${entries.length} 条变更 (${files.length} 个文件)`);
  return out;
}

/** 生成当前版本的 changelog 条目（git commits 优先，空时从 memory 回退） */
function generateChangelogEntry(version) {
  const today = new Date().toISOString().split('T')[0];

  try {
    // 获取上一个 tag 以来的提交
    let since = '';
    try {
      since = execSync('git describe --tags --abbrev=0', { cwd: root, encoding: 'utf-8' }).trim();
    } catch {
      since = '';
    }

    const logArgs = since ? `git log ${since}..HEAD --pretty=format:"- %s (%an)"` : '';

    if (!logArgs) {
      // 无历史 tag，尝试从 memory 记录提取
      const memEntry = extractFromMemory(version);
      return memEntry || `## [${version}] - ${today}\n\n### Changed\n- 新版本发布\n`;
    }

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
      else if (l.toLowerCase().includes('change') || l.toLowerCase().includes('refactor'))
        changed.push(l);
      else other.push(l);
    }

    let entry = `## [${version}] - ${today}\n`;
    if (added.length) entry += `\n### Added\n${added.map((l) => l).join('\n')}\n`;
    if (changed.length) entry += `\n### Changed\n${changed.map((l) => l).join('\n')}\n`;
    if (fixed.length) entry += `\n### Fixed\n${fixed.map((l) => l).join('\n')}\n`;
    if (other.length && !added.length && !changed.length && !fixed.length) {
      entry += `\n### Changed\n${other.map((l) => l).join('\n')}\n`;
    }

    // 兜底：git log 为空时从 memory 记录回退
    if (!added.length && !changed.length && !fixed.length && !other.length) {
      const memEntry = extractFromMemory(version);
      if (memEntry) return memEntry;
      entry += `\n### Changed\n- 新版本发布\n`;
    }

    return entry;
  } catch (err) {
    warn(`无法从 git 生成 changelog: ${err.message}`);
    return `## [${version}] - ${today}\n\n### Changed\n- 新版本发布\n`;
  }
}

/** 更新 CHANGELOG.md，返回生成的条目文本（供后续 commit message 使用） */
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
    newChangelog =
      changelog.substring(0, titleEnd + 2) + entry + '\n' + changelog.substring(titleEnd + 2);
  } else {
    newChangelog =
      changelog.substring(0, insertPos) + entry + '\n' + changelog.substring(insertPos);
  }

  if (!isDryRun) {
    writeFileSync(changelogPath, newChangelog, 'utf-8');
  }
  success('CHANGELOG.md 已更新');
  return entry;
}

/** 主流程 */
async function main() {
  const targetVersion = getTargetVersion();

  log.hr();
  log.info(`EasyAgent Release v${targetVersion}${isDryRun ? ' (DRY RUN)' : ''}`);
  log.hr();

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
  const changelogEntry = updateChangelog(targetVersion);

  if (isDryRun) {
    log.ok('DRY RUN 完成 - 未实际修改任何文件');
    return;
  }

  // 4.1 检查是否有实质变更（避免 commit 内容为空）
  const commitLines = changelogEntry.split('\n').filter((l) => l.startsWith('- '));
  const hasContent = commitLines.length > 0;
  if (!hasContent) {
    warn('未从 git log 提取到任何提交记录！');
    warn('commit message 将只含版本号，建议手动补充变更说明。');
  }

  // 5. 确认发布
  info(`即将创建: Git commit → tag v${targetVersion} → GitHub Release`);
  const confirm = await askQuestion(`确认发布 v${targetVersion}？[y/N] `);
  if (confirm.toLowerCase() !== 'y') {
    warn('已取消发布');
    process.exit(0);
  }

  // 6. Git 操作
  log.title('Git 操作');
  try {
    // 构造含变更摘要的 commit message
    const changelogSummary = changelogEntry
      .replace(/^## \[.*\] - .*\n/gm, '') // 去掉标题行
      .replace(/^###\s/gm, '') // 保留分类名但去 ### 前缀
      .trim();
    // 注意：不能加 [skip ci]，因为 tag 指向的 commit 含 [skip ci] 会导致 GitHub 连 tag 触发的
    // release.yml 也一并跳过。ci.yml 重复跑一次无害，Release workflow 能正常触发才关键。
    const commitMsg = `release: v${targetVersion}\n\n${changelogSummary}`;

    execSync('git add .', { cwd: root, stdio: 'inherit' });
    execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: root, stdio: 'inherit' });
    success(`Git commit: release v${targetVersion}`);
    info(`  ${commitLines.length} 条变更`);

    execSync(`git tag -a v${targetVersion} -m "EasyAgent v${targetVersion}"`, {
      cwd: root,
      stdio: 'inherit',
    });
    success(`Git tag: v${targetVersion}`);

    // 回退 post-commit hook 可能产生的管线文件修改（避免 rebase 冲突）
    try {
      execSync('git restore docs/pipeline/', { cwd: root, stdio: 'pipe' });
    } catch { /* 没有管线文件修改则跳过 */ }
    // 推送前先 rebase 远程（CI 管线同步可能在此期间推了新 commit）
    execSync('git pull --rebase origin main', { cwd: root, stdio: 'inherit' });

    // 分两次 push：先 commit 再 tag
    // 第二次 push tag 会触发 release.yml（基于 push: tags: ['v*'] 事件）
    execSync('git push origin main', { cwd: root, stdio: 'inherit' });
    success('已推送 commit 到 origin/main');
    execSync(`git push origin v${targetVersion}`, { cwd: root, stdio: 'inherit' });
    success(`已推送 tag v${targetVersion}（release.yml 应自动触发）`);
  } catch (err) {
    error(`Git 操作失败: ${(err && err.message) || err}`);
    process.exit(1);
  }

  log.ok('发布完成！');
  log.info(`版本: v${targetVersion}`);
  log.info(`仓库: https://github.com/ht182400-creator/easyagent`);
  log.info(`Release: https://github.com/ht182400-creator/easyagent/releases/tag/v${targetVersion}`);
  log.info('下一步: 在 GitHub Release 页面手动补充 Release Notes');
}

main().catch((err) => {
  error(`发布失败: ${(err && err.message) || err}`);
  process.exit(1);
});
