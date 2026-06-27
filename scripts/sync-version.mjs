/**
 * 版本同步脚本
 * 从 version.json 读取版本号，同步到所有子包的 package.json
 *
 * 用法: node scripts/sync-version.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('sync-version');
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const isDryRun = process.argv.includes('--dry-run');

/** 读取根版本号 */
const versionJson = JSON.parse(readFileSync(join(root, 'version.json'), 'utf-8'));
const version = versionJson.version;

log.info(`EasyAgent 版本同步: v${version}${isDryRun ? ' (dry-run)' : ''}`);

/** 需要同步的 package.json 列表（共 7 个包，根 + 6 子包） */
const packages = [
  { name: '根', path: join(root, 'package.json') },
  { name: '@easyagent/core', path: join(root, 'packages', 'core', 'package.json') },
  { name: '@easyagent/cli', path: join(root, 'packages', 'cli', 'package.json') },
  { name: '@easyagent/server', path: join(root, 'packages', 'server', 'package.json') },
  { name: '@easyagent/web', path: join(root, 'packages', 'web', 'package.json') },
  { name: '@easyagent/desktop', path: join(root, 'packages', 'desktop', 'package.json') },
  { name: '@easyagent/frontend', path: join(root, 'packages', 'frontend', 'package.json') },
];

/** 同步内部 workspace 依赖版本 */
function syncWorkspaceDeps(pkg) {
  if (pkg.dependencies) {
    for (const key of Object.keys(pkg.dependencies)) {
      if (key.startsWith('@easyagent/') && pkg.dependencies[key] === 'workspace:*') {
        // workspace:* 由 pnpm 处理，无需修改
        continue;
      }
    }
  }
}

let updatedCount = 0;

for (const { name, path: pkgPath } of packages) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const oldVersion = pkg.version;

  if (oldVersion === version) {
    log.info(`  ✅ ${name}: v${oldVersion} (已是最新)`);
    continue;
  }

  pkg.version = version;
  syncWorkspaceDeps(pkg);

  if (!isDryRun) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
  }

  log.info(`  🔄 ${name}: v${oldVersion} → v${version}`);
  updatedCount++;
}

// 同时更新 server/src/index.ts 中的硬编码版本号
const serverIndexPath = join(root, 'packages', 'server', 'src', 'index.ts');
let serverIndex = readFileSync(serverIndexPath, 'utf-8');
const oldServerVersion = serverIndex.match(/version: '([\d.]+)'/);
if (oldServerVersion && oldServerVersion[1] !== version) {
  serverIndex = serverIndex.replace(/version: '[\d.]+'/, `version: '${version}'`);
  if (!isDryRun) {
    writeFileSync(serverIndexPath, serverIndex, 'utf-8');
  }
  log.info(`  🔄 server/src/index.ts: version '${oldServerVersion[1]}' → '${version}'`);
  updatedCount++;
}

// 更新 server 启动横幅版本号
serverIndex = readFileSync(serverIndexPath, 'utf-8');
const oldBannerVersion = serverIndex.match(/EasyAgent Server v([\d.]+)/);
if (oldBannerVersion && oldBannerVersion[1] !== version) {
  serverIndex = serverIndex.replace(/EasyAgent Server v[\d.]+/, `EasyAgent Server v${version}`);
  if (!isDryRun) {
    writeFileSync(serverIndexPath, serverIndex, 'utf-8');
  }
  log.info(`  🔄 server 启动横幅: v${oldBannerVersion[1]} → v${version}`);
}

log.ok(`${isDryRun ? '预览完成' : '同步完成'}，共更新 ${updatedCount} 处`);
