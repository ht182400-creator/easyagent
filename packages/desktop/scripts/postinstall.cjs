/**
 * Desktop 包 postinstall 脚本 (精简版)
 * 
 * 不再触碰 better_sqlite3.node 文件！
 * 双版本管理统一由以下两个脚本负责:
 *   scripts/rebuild-sqlite3.mjs    — 编译系统+Electron 双版本 (仅需运行一次)
 *   scripts/sqlite3-loader.mjs     — 启动时自动切换正确版本
 * 
 * 运行时机: pnpm install 后自动执行 (仅打印信息)
 */
const fs = require('fs');
const path = require('path');

function main() {
  const PROJECT_DIR = path.resolve(__dirname, '..', '..', '..');
  const SQLITE_DIR = path.join(
    PROJECT_DIR, 'node_modules', '.pnpm', 'better-sqlite3@12.11.1', 'node_modules', 'better-sqlite3'
  );
  const NODE_FILE = path.join(SQLITE_DIR, 'build', 'Release', 'better_sqlite3.node');
  const SYSTEM_FILE = path.join(SQLITE_DIR, 'build', 'Release', 'better_sqlite3_system.node');
  const ELECTRON_FILE = path.join(SQLITE_DIR, 'build', 'Release', 'better_sqlite3_electron.node');

  console.log('[postinstall] better-sqlite3 双版本检查:');
  
  if (fs.existsSync(NODE_FILE)) {
    console.log('  better_sqlite3.node     :', fs.statSync(NODE_FILE).size, 'bytes');
  } else {
    console.log('  better_sqlite3.node     : 缺失');
  }
  if (fs.existsSync(SYSTEM_FILE)) {
    console.log('  better_sqlite3_system   :', fs.statSync(SYSTEM_FILE).size, 'bytes');
  }
  if (fs.existsSync(ELECTRON_FILE)) {
    console.log('  better_sqlite3_electron :', fs.statSync(ELECTRON_FILE).size, 'bytes');
  }

  // 检查是否需要编译双版本
  if (!fs.existsSync(SYSTEM_FILE) || !fs.existsSync(ELECTRON_FILE)) {
    console.log('[postinstall] ⚠ 双版本文件不完整，请运行: node scripts/rebuild-sqlite3.mjs');
  } else {
    console.log('[postinstall] ✅ 双版本文件就绪');
  }
}

main();
