/**
 * better-sqlite3 双版本编译 + 验证
 *
 * 关键陷阱:
 *   1. node-gyp rebuild 会清除 build/Release/ 下所有 .node 文件
 *   2. 字节扫描 MODULE_VERSION 不可靠 (总是读到 sqlite3 源码中的巧合值 116)
 *   3. 正确验证方式: 加载模块测试 (系统 Node) / 对比文件哈希 (Electron)
 *
 * 用法: node scripts/rebuild-sqlite3.mjs [--verify]
 *       --verify  只验证不编译
 */
import { execSync } from 'child_process';
import { existsSync, copyFileSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import { createHash } from 'crypto';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('rebuild-sqlite3');
const PROJECT = resolve(import.meta.dirname, '..');
const SQLITE_DIR = resolve(
  PROJECT,
  'node_modules/.pnpm/better-sqlite3@12.11.1/node_modules/better-sqlite3',
);
const RELEASE = resolve(SQLITE_DIR, 'build/Release');
const CURRENT = resolve(RELEASE, 'better_sqlite3.node');
const SYSTEM = resolve(RELEASE, 'better_sqlite3_system.node');
const ELECTRON = resolve(RELEASE, 'better_sqlite3_electron.node');
const CACHE = resolve(PROJECT, '.codebuddy/sqlite3-cache');

// 临时安全保存目录 (不在 build/Release 下)
const TMP = resolve(PROJECT, 'temp/sqlite3-build');
const verifyOnly = process.argv.includes('--verify');

// 计算文件 SHA256 用于精确比对
function sha256(path) {
  if (!existsSync(path)) return 'MISSING';
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

// 通过实际加载验证 system 版本 (唯一可靠方式)
// 必须从 packages/core 加载，因为 better-sqlite3 只安装在 packages/core
function verifySystem(path) {
  try {
    // 先切换到 system 版本再加载
    if (existsSync(path)) copyFileSync(path, CURRENT);
    const corePkg = resolve(PROJECT, 'packages/core/package.json');
    const req = createRequire(corePkg);
    const b = req('better-sqlite3');
    const db = new b(':memory:');
    db.exec('SELECT 1');
    db.close();
    return true;
  } catch (e) {
    log.debug('verifySystem 错误:', e.message);
    return false;
  }
}

// 通过文件大小+哈希验证 electron 版本
function verifyElectron(path) {
  if (!existsSync(path)) return false;
  const sz = statSync(path).size;
  // electron 编译产物通常比 system 小 (不同编译选项)
  // 且必须不等于 system 版本 (否则说明编译失败)
  if (existsSync(SYSTEM)) {
    const sysSz = statSync(SYSTEM).size;
    if (sz === sysSz && sha256(path) === sha256(SYSTEM)) {
      return false; // electron 与 system 完全相同 → 编译失败
    }
  }
  return sz > 1000000; // 至少 >1MB 才是有效编译
}

function buildAndSave(title, extraArgs, savePath) {
  log.info(`[${title}] 编译中...`);
  const cmd = `npx node-gyp rebuild ${extraArgs || ''}`.trim();
  execSync(cmd, { cwd: SQLITE_DIR, stdio: 'inherit', shell: true });
  if (!existsSync(CURRENT)) {
    log.error(`[${title}] 编译失败! better_sqlite3.node 未生成`);
    process.exit(1);
  }
  writeFileSync(savePath, readFileSync(CURRENT));
  log.info(
    `  -> 产物: ${savePath.split(/[/\\]/).pop()} (${statSync(savePath).size} bytes, SHA256=${sha256(savePath)})`,
  );
}

// ================================================================
if (verifyOnly) {
  log.title('better-sqlite3 验证模式');

  // System 验证
  log.info('[System 版本验证]');
  if (existsSync(SYSTEM)) {
    if (verifySystem(SYSTEM)) {
      log.ok(`加载成功 (${statSync(SYSTEM).size}B, SHA256=${sha256(SYSTEM)})`);
    } else {
      log.fail('加载失败 - 需要重新编译');
    }
  } else {
    log.fail('文件不存在');
  }

  // Electron 验证
  log.info('[Electron 版本验证]');
  if (existsSync(ELECTRON)) {
    if (verifyElectron(ELECTRON)) {
      log.ok(`文件有效 (${statSync(ELECTRON).size}B, SHA256=${sha256(ELECTRON)}, 与system不同)`);
    } else {
      log.fail('文件无效 (与 system 版本相同, 可能编译失败)');
    }
  } else {
    log.fail('文件不存在');
  }

  // 当前激活版本
  log.info('[当前激活版本]');
  if (existsSync(CURRENT)) {
    const curHash = sha256(CURRENT);
    const sysHash = sha256(SYSTEM);
    const elHash = sha256(ELECTRON);
    if (curHash === sysHash) log.info('  System (Node v24)');
    else if (curHash === elHash) log.info('  Electron 30');
    else log.warn('  未知版本');
  }

  process.exit(0);
}

// ================================================================
// 编译模式
// ================================================================
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

log.title('better-sqlite3 双版本编译');
log.info(`目标: Electron 30 + System Node ${process.version}`);
log.debug(`源目录: ${SQLITE_DIR}`);

// Step 1: Electron 30 (保存到临时目录)
buildAndSave(
  'Electron 30',
  '--target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers',
  resolve(TMP, 'better_sqlite3_electron.node'),
);

// Step 2: System Node (保存到临时目录)
buildAndSave('System Node', '', resolve(TMP, 'better_sqlite3_system.node'));

// Step 3: 部署到 Release 目录
copyFileSync(resolve(TMP, 'better_sqlite3_system.node'), SYSTEM);
copyFileSync(resolve(TMP, 'better_sqlite3_electron.node'), ELECTRON);
copyFileSync(resolve(TMP, 'better_sqlite3_system.node'), CURRENT);

// Step 4: 更新缓存
copyFileSync(
  resolve(TMP, 'better_sqlite3_system.node'),
  resolve(CACHE, 'better_sqlite3_system.node'),
);
copyFileSync(
  resolve(TMP, 'better_sqlite3_electron.node'),
  resolve(CACHE, 'better_sqlite3_electron.node'),
);

// Step 5: 验证
log.title('验证结果');

const sysOk = verifySystem(CURRENT);
log.info(`System 加载测试: ${sysOk ? '✅ 通过' : '❌ 失败'}`);

const elOk = verifyElectron(ELECTRON);
log.info(`Electron 文件检查: ${elOk ? '✅ 通过' : '❌ 失败'}`);

const sysHash = sha256(SYSTEM);
const elHash = sha256(ELECTRON);
log.info(
  `文件对比: System≠Electron ${sysHash !== elHash ? '✅ 不同 (正确)' : '❌ 相同 (编译失败!)'}`,
);

log.info('文件摘要:');
log.info(`  System:   ${statSync(SYSTEM).size} bytes | SHA256=${sysHash}`);
log.info(`  Electron: ${statSync(ELECTRON).size} bytes | SHA256=${elHash}`);
log.info(`  Active:   ${statSync(CURRENT).size} bytes | SHA256=${sha256(CURRENT)}`);
log.info(
  `  Cache:    ${statSync(resolve(CACHE, 'better_sqlite3_system.node')).size} / ${statSync(resolve(CACHE, 'better_sqlite3_electron.node')).size} bytes`,
);

if (!sysOk || !elOk || sysHash === elHash) {
  log.fail('验证失败, 请检查编译环境');
  process.exit(1);
}

log.ok('编译验证全部通过');
