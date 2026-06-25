/**
 * 自动发布脚本 — 非交互版本
 * 用法: node scripts/auto-release.mjs patch  (或其他 bump 类型)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function log(msg) { console.log(`  ${msg}`); }
function success(msg) { console.log(`  ✅ ${msg}`); }
function error(msg) { console.log(`  ❌ ${msg}`); }

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${parts[0] + 1}.0.0`;
    case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    default: return type; // custom version like "0.6.0"
  }
}

// 1. 获取目标版本
const type = process.argv[2] || 'patch';
const currentVersion = JSON.parse(readFileSync(join(root, 'version.json'), 'utf-8')).version;
const targetVersion = bumpVersion(currentVersion, type);
const today = new Date().toISOString().split('T')[0];

console.log(`\n🚀 Auto Release: ${currentVersion} → ${targetVersion} (${type})\n`);

// 2. 更新 version.json
log('更新 version.json...');
const versionPath = join(root, 'version.json');
const versionData = JSON.parse(readFileSync(versionPath, 'utf-8'));
versionData.version = targetVersion;
versionData.releaseDate = today;
writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n', 'utf-8');
success(`version.json: ${currentVersion} → ${targetVersion}`);

// 3. 同步版本到子包
log('同步版本号...');
execSync(`node "${join(__dirname, 'sync-version.mjs')}"`, { cwd: root, stdio: 'inherit' });

// 4. 更新 CHANGELOG
log('更新 CHANGELOG.md...');
const changelogPath = join(root, 'CHANGELOG.md');
let changelog = readFileSync(changelogPath, 'utf-8');

// 从 git log 生成 changelog entry
let entry = `## [${targetVersion}] - ${today}\n\n`;
try {
  let since = '';
  try { since = execSync('git describe --tags --abbrev=0', { cwd: root, encoding: 'utf-8' }).trim(); } catch {}
  if (since) {
    const commits = execSync(`git log ${since}..HEAD --pretty=format:"- %s (%an)"`, { cwd: root, encoding: 'utf-8' }).trim();
    const lines = commits.split('\n').filter(Boolean);
    const added = [], fixed = [], changed = [];
    for (const line of lines) {
      const l = line.trim();
      if (/(add|feat|新增)/i.test(l)) added.push(l);
      else if (/(fix|bug|修复|修正)/i.test(l)) fixed.push(l);
      else changed.push(l);
    }
    if (added.length) entry += `### Added\n${added.join('\n')}\n\n`;
    if (changed.length) entry += `### Changed\n${changed.join('\n')}\n\n`;
    if (fixed.length) entry += `### Fixed\n${fixed.join('\n')}\n\n`;
  } else {
    entry += `### Changed\n- 新版本发布\n\n`;
  }
} catch (e) {
  entry += `### Changed\n- 新版本发布\n\n`;
}

const insertPos = changelog.indexOf('## [');
if (insertPos === -1) {
  const titleEnd = changelog.indexOf('\n\n');
  changelog = changelog.substring(0, titleEnd + 2) + entry + '\n' + changelog.substring(titleEnd + 2);
} else {
  changelog = changelog.substring(0, insertPos) + entry + '\n' + changelog.substring(insertPos);
}
writeFileSync(changelogPath, changelog, 'utf-8');
success('CHANGELOG.md 已更新');

// 5. Git 操作
console.log('\n📦 Git 操作...\n');
try {
  execSync('git add .', { cwd: root, stdio: 'inherit' });
  success(`git add .`);
  
  execSync(`git commit -m "release: v${targetVersion}"`, { cwd: root, stdio: 'inherit' });
  success(`git commit: release v${targetVersion}`);
  
  execSync(`git tag -a v${targetVersion} -m "EasyAgent v${targetVersion}"`, { cwd: root, stdio: 'inherit' });
  success(`git tag: v${targetVersion}`);
  
  execSync('git push origin main --follow-tags', { cwd: root, stdio: 'inherit' });
  success('已推送到 GitHub (main + tags)');
} catch (err) {
  error(`Git 操作失败: ${err.message}`);
  process.exit(1);
}

console.log(`\n✅ v${targetVersion} 发布完成！\n`);
console.log(`   Release: https://github.com/ht182400-creator/easyagent/releases/tag/v${targetVersion}`);
