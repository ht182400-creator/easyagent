/**
 * Desktop 包 postinstall 脚本
 * 确保 better-sqlite3 为 Electron 30 (Node v20, MODULE_VERSION=123) 编译
 * 解决开发模式下 pnpm install 用系统 Node.js 编译导致的版本不匹配问题
 *
 * 运行时机: pnpm install 后自动执行
 * 跳过条件: 已为 Electron 编译过且未重新安装
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXPECTED_VERSION = '123'; // Electron 30 = Node.js v20
const CACHE_FILE = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', '.module_version_cache');
const NODE_FILE = path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const REBUILD_CMD = 'pnpm exec @electron/rebuild -f -w better-sqlite3 -v 30.0.0';

function main() {
  console.log('[postinstall] Checking better-sqlite3 module version...');

  // 1. 检查 .node 文件是否存在
  if (!fs.existsSync(NODE_FILE)) {
    console.log('[postinstall] better_sqlite3.node not found - may not be installed yet');
    return;
  }

  // 2. 检查系统 Node.js 的 MODULE_VERSION
  const currentVersion = process.versions.modules;
  console.log(`[postinstall] System Node modules version: ${currentVersion}`);

  // 3. 检查缓存
  let cachedVersion = '';
  try {
    cachedVersion = fs.readFileSync(CACHE_FILE, 'utf8').trim();
  } catch (e) {/* 无缓存 */}

  // 4. 如果系统 Node 正好是 v20 (MODULE_VERSION=123)，无需 rebuild
  if (currentVersion === EXPECTED_VERSION) {
    console.log('[postinstall] System Node matches Electron 30 - no rebuild needed');
    try { fs.writeFileSync(CACHE_FILE, EXPECTED_VERSION); } catch (e) {/* ignore */}
    return;
  }

  // 5. 如果已缓存为 Electron 版本，跳过
  if (cachedVersion === EXPECTED_VERSION) {
    console.log('[postinstall] Already built for Electron 30 (cached) - skipping rebuild');
    return;
  }

  // 6. 需要 rebuild
  console.log(`[postinstall] Mismatch: system Node v${currentVersion}, need v${EXPECTED_VERSION} for Electron 30`);
  console.log('[postinstall] Rebuilding better-sqlite3 for Electron 30...');

  try {
    execSync(REBUILD_CMD, { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit' 
    });
    fs.writeFileSync(CACHE_FILE, EXPECTED_VERSION);
    console.log('[postinstall] electron-rebuild completed successfully');
  } catch (err) {
    console.warn('[postinstall] electron-rebuild failed:', err.message);
    console.warn('[postinstall] You may need to manually run: cd packages/desktop && pnpm exec @electron/rebuild -f -w better-sqlite3 -v 30.0.0');
    // 不阻止安装继续
  }
}

main();
