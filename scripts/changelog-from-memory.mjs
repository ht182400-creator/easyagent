/**
 * 从 .codebuddy/memory 记录文件自动生成 CHANGELOG 条目
 *
 * 用法:
 *   node scripts/changelog-from-memory.mjs              # 交互式选择日期范围
 *   node scripts/changelog-from-memory.mjs 0.6.2         # 指定版本号，自动从上次 tag 日期到今天
 *   node scripts/changelog-from-memory.mjs --since 2026-06-25  # 指定起始日期
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const memoryDir = join(root, '.codebuddy', 'memory');

function log(msg) {
  console.log(`  ${msg}`);
}
function success(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
function warn(msg) {
  console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
}
function info(msg) {
  console.log(`\x1b[36mℹ\x1b[0m ${msg}`);
}

/** 询问用户 */
function askQuestion(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** 获取上一个 release tag 的日期 (YYYY-MM-DD) */
function getLastTagDate() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { cwd: root, encoding: 'utf-8' }).trim();
    const date = execSync(`git log -1 --format=%ai ${tag}`, {
      cwd: root,
      encoding: 'utf-8',
    }).trim();
    return date.split(' ')[0]; // "2026-06-26 11:09:00 +0800" → "2026-06-26"
  } catch {
    // 无 tag 时返回 7 天前
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }
}

/** 读取并解析 memory 文件，提取结构化条目 */
function parseMemoryFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const entries = [];

  // 按 ## 标题分割（跳过文件标题 # 2026-06-27 工作日志）
  const sections = content.split(/^## /m).slice(1);

  for (const section of sections) {
    // 提取标题和时间戳：## 标题名 (HH:MM)
    const titleMatch = section.match(/^(.+?)\s+\((\d{2}:\d{2})\)/m);
    if (!titleMatch) continue;

    const title = titleMatch[1].trim();
    const time = titleMatch[2];

    // 提取结构化字段
    const problemMatch = section.match(/\*\*问题\*\*[：:]\s*(.+)/);
    const rootCauseMatch = section.match(/\*\*根因\*\*[：:]\s*(.+)/);
    const fixMatch = section.match(/\*\*修复\*\*[：:]\s*(.+)/i);
    const prodMatch = section.match(/\*\*(?:产物|需求|实施(?:内容|修改)|背景)\*\*[：:]\s*(.+)/);
    const statusMatch = section.match(/\*\*状态\*\*[：:]\s*(.+)/);

    // 跳过未 resolve 的条目
    if (statusMatch && !statusMatch[1].includes('✅')) continue;

    // 确定分类
    let category = 'Changed';
    if (/fix|修复|bug/i.test(title)) category = 'Fixed';
    else if (/feat|新增|创建|添加|新功能|支持/i.test(title)) category = 'Added';
    else if (/移除|删除|deprecate/i.test(title)) category = 'Removed';

    // 生成描述
    const desc = problemMatch?.[1] || prodMatch?.[1] || title;

    entries.push({
      category,
      desc,
      title,
      time,
      hasDetail: !!(problemMatch || fixMatch || prodMatch),
    });
  }

  return entries;
}

/** 收集日期区间内的 memory 文件 */
function getMemoryFiles(sinceDate) {
  if (!existsSync(memoryDir)) return [];

  const files = readdirSync(memoryDir)
    .filter((f) => f.endsWith('.md') && f.match(/^\d{4}-\d{2}-\d{2}\.md$/))
    .filter((f) => f >= `${sinceDate}.md`)
    .sort();

  return files.map((f) => join(memoryDir, f));
}

/** 生成 Keep a Changelog 格式的条目 */
function buildChangelogEntry(entries, version) {
  const today = new Date().toISOString().split('T')[0];

  const groups = { Added: [], Changed: [], Fixed: [], Removed: [] };
  for (const e of entries) {
    groups[e.category].push(e);
  }

  let out = `## [${version}] - ${today}\n`;
  let totalCount = 0;

  for (const [cat, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    out += `\n### ${cat}\n`;
    for (const item of items) {
      out += `- ${item.desc}\n`;
      totalCount++;
    }
  }

  if (totalCount === 0) {
    out += `\n### Changed\n- 新版本发布\n`;
  }

  return out;
}

/** 主流程 */
async function main() {
  console.log('═'.repeat(50));
  console.log('  从 Memory 记录生成 CHANGELOG');
  console.log('═'.repeat(50));

  // 确定版本号和日期范围
  let version = process.argv[2];
  let sinceDate;

  if (version && version === '--since') {
    sinceDate = process.argv[3];
    version = null;
  } else if (version && /^\d+\.\d+\.\d+$/.test(version)) {
    // 指定了版本号，自动取上次 tag 日期
    const lastTagDate = getLastTagDate();
    info(`上次 release tag 日期: ${lastTagDate}`);
    sinceDate = lastTagDate;
  } else {
    version = null;
  }

  if (!sinceDate) {
    sinceDate = await askQuestion('起始日期 (YYYY-MM-DD, 默认 7 天前): ');
    if (!sinceDate) {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      sinceDate = d.toISOString().split('T')[0];
    }
  }

  if (!version) {
    version = await askQuestion('目标版本号 (如 0.6.2): ');
    if (!version) {
      warn('未输入版本号，退出');
      process.exit(0);
    }
  }

  // 读取 memory 文件
  const files = getMemoryFiles(sinceDate);
  if (files.length === 0) {
    warn(`在 ${memoryDir} 中未找到 ${sinceDate} 之后的记录文件`);
    process.exit(0);
  }
  info(`找到 ${files.length} 个记录文件: ${files.map((f) => f.split(/[/\\]/).pop()).join(', ')}`);

  // 解析所有条目
  const allEntries = [];
  for (const file of files) {
    const entries = parseMemoryFile(file);
    allEntries.push(...entries);
  }

  if (allEntries.length === 0) {
    warn('未从 memory 记录中提取到任何已完成条目');
    process.exit(0);
  }

  // 按分类统计
  const countByCat = {};
  for (const e of allEntries) {
    countByCat[e.category] = (countByCat[e.category] || 0) + 1;
  }
  info(`解析到 ${allEntries.length} 条变更:`);
  for (const [cat, n] of Object.entries(countByCat)) {
    log(`${cat}: ${n} 条`);
  }

  // 生成 CHANGELOG 条目
  const entry = buildChangelogEntry(allEntries, version);

  console.log('\n' + '─'.repeat(50));
  console.log('生成的 CHANGELOG 条目预览:');
  console.log('─'.repeat(50));
  console.log(entry);
  console.log('─'.repeat(50));

  const confirm = await askQuestion('\n插入到 CHANGELOG.md？[y/N] ');
  if (confirm.toLowerCase() !== 'y') {
    info('已取消，条目仅预览');
    process.exit(0);
  }

  // 写入 CHANGELOG.md
  const changelogPath = join(root, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    writeFileSync(changelogPath, '# Changelog\n\n', 'utf-8');
  }

  let changelog = readFileSync(changelogPath, 'utf-8');
  // 移除文件中可能已存在的相同版本空标题（避免重复）
  changelog = changelog.replace(
    new RegExp(`## \\[${version}\\] - \\d{4}-\\d{2}-\\d{2}\\n*`, 'g'),
    '',
  );

  const insertPos = changelog.indexOf('## [');
  if (insertPos === -1) {
    const titleEnd = changelog.indexOf('\n\n');
    changelog =
      changelog.substring(0, titleEnd + 2) + entry + '\n' + changelog.substring(titleEnd + 2);
  } else {
    changelog = changelog.substring(0, insertPos) + entry + '\n' + changelog.substring(insertPos);
  }

  writeFileSync(changelogPath, changelog, 'utf-8');
  success(`CHANGELOG.md 已更新 (v${version}, ${allEntries.length} 条变更)`);
  info('现在可以运行 release.mjs 或 release-server.bat 发布版本');
}

main().catch((err) => {
  console.error(`失败: ${err.message}`);
  process.exit(1);
});
