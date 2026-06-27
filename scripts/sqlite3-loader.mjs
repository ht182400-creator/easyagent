/**
 * better-sqlite3 原生模块版本自动切换器
 *
 * 问题: 系统 Node.js v24 (MODULE=137) 与 Electron 30 (MODULE=123) 需要不同的 .node 二进制
 * 解决: build-sqlite3.bat 预先编译两套 → 此脚本在启动时检测并自动切换
 *
 * 用法:
 *   node scripts/sqlite3-loader.mjs          # 自动检测并切换
 *   node scripts/sqlite3-loader.mjs system   # 强制切为系统 Node 版本
 *   node scripts/sqlite3-loader.mjs electron # 强制切为 Electron 版本
 */

import { existsSync, copyFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('sqlite3-loader');
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '..');

// better-sqlite3 在 pnpm 中的实际位置
const SQLITE_DIR = resolve(
  PROJECT_DIR,
  'node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3',
);

const CURRENT = resolve(SQLITE_DIR, 'build/Release/better_sqlite3.node');
const SYSTEM_BUILD = resolve(SQLITE_DIR, 'build/Release/better_sqlite3_system.node');
const ELECTRON_BUILD = resolve(SQLITE_DIR, 'build/Release/better_sqlite3_electron.node');

// Node.js MODULE_VERSION 对应关系
// Electron 30 = Node 20 = MODULE 123
// Node 24 = MODULE 137
const ELECTRON_MODULE = '123';

/**
 * 主入口
 */
function main() {
  const forceTarget = process.argv[2]?.toLowerCase();
  const currentModule = process.versions.modules;

  let targetBuild;
  let targetName;

  if (forceTarget === 'system') {
    targetBuild = SYSTEM_BUILD;
    targetName = '系统 Node';
  } else if (forceTarget === 'electron') {
    targetBuild = ELECTRON_BUILD;
    targetName = 'Electron';
  } else {
    // 自动检测: 系统 Node v24=137, Electron=123
    if (currentModule === ELECTRON_MODULE) {
      targetBuild = ELECTRON_BUILD;
      targetName = 'Electron';
    } else {
      targetBuild = SYSTEM_BUILD;
      targetName = '系统 Node';
    }
  }

  log.info(`当前 Node MODULE_VERSION=${currentModule}, 目标: ${targetName}`);

  if (!existsSync(targetBuild)) {
    log.error(`缺少预编译文件: ${targetBuild}`);
    log.error('请先运行: build-sqlite3.bat');
    process.exit(1);
  }

  // 检查当前文件是否需要切换
  let needSwitch = true;
  if (existsSync(CURRENT)) {
    try {
      // 简单比较文件大小来判断是否相同版本
      const curStat = statSync(CURRENT);
      const tgtStat = statSync(targetBuild);
      needSwitch = curStat.size !== tgtStat.size;
    } catch {
      // 无法比较，强制切换
    }
  }

  if (needSwitch) {
    copyFileSync(targetBuild, CURRENT);
    log.ok(`已切换为 ${targetName} 版本 (better_sqlite3.node)`);
  } else {
    log.ok(`已是 ${targetName} 版本，无需切换`);
  }
}

main();
