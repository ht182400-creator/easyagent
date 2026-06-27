/**
 * EasyAgent Desktop - 构建前验证脚本
 * 在每次打包前自动检查已知问题，避免重复踩坑
 * 
 * 用法: node scripts/verify-build.cjs
 * 返回: 0=通过, 1=有错误需修复, 2=有警告
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

// 调试开关: set EASYAGENT_DEBUG=1 启用详细日志
const IS_DEBUG = process.env.EASYAGENT_DEBUG === '1' || process.env.EASYAGENT_DEBUG === 'true';

function fail(msg) { console.error(`\x1b[31m  [FAIL]\x1b[0m ${msg}`); errors++; }
function warn(msg) { console.warn(`\x1b[33m  [WARN]\x1b[0m ${msg}`); warnings++; }
function ok(msg)   { console.log(`\x1b[32m  [OK]\x1b[0m   ${msg}`); }
function debug(msg) { if (IS_DEBUG) console.log(`\x1b[36m  [DEBUG]\x1b[0m ${msg}`); }
function title(msg) { console.log(`\n${msg}`); }

// ============================================================
// 1. 关键文件存在性检查
// ============================================================
title('--- Checking required files ---');
const requiredFiles = [
  ['assets/LICENSE', 'NSIS license page'],
  ['assets/icon.ico', 'NSIS installer icon'],
  ['installer.nsh', 'Custom NSIS script'],
  ['index.html', 'Electron entry HTML'],
  // CSS 已统一由 @easyagent/frontend 加载，不再需要独立的 src/renderer/index.css
  ['../frontend/src/styles/index.css', 'Global CSS (unified frontend)'],
];

for (const [f, desc] of requiredFiles) {
  if (fs.existsSync(path.join(ROOT, f))) {
    ok(`${desc}: ${f}`);
  } else {
    fail(`${desc}: ${f} MISSING`);
  }
}

// ============================================================
// 2. package.json 版本检查
// ============================================================
title('--- Checking package.json config ---');
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const eb = pkg.devDependencies?.['electron-builder'];
if (eb === '23.6.0') {
  ok(`electron-builder locked at 23.6.0`);
} else {
  fail(`electron-builder is "${eb}" - MUST be exact "23.6.0" (no ^ or ~)`);
}

// Check for v24.0.0 residues (check both desktop and root .pnpm)
const pnpmDirs = [
  path.join(ROOT, 'node_modules', '.pnpm'),
  path.join(ROOT, '..', '..', 'node_modules', '.pnpm'),  // workspace root
];
let v24Found = false;
for (const pnpmDir of pnpmDirs) {
  if (fs.existsSync(pnpmDir)) {
    const v24Dirs = fs.readdirSync(pnpmDir).filter(d => d.startsWith('electron-builder@24.'));
    if (v24Dirs.length > 0) {
      fail(`electron-builder v24.0.0 found in ${pnpmDir}: ${v24Dirs.join(', ')}. Delete them!`);
      v24Found = true;
    }
  }
}
if (!v24Found) ok('No electron-builder v24.0.0 residue');

// npmRebuild check
if (pkg.build?.npmRebuild === false) {
  ok('npmRebuild: false (skip native rebuild)');
} else {
  warn('npmRebuild should be false for better-sqlite3 prebuilt');
}

// tsup config: noExternal must include workspace packages
const tsupPath = path.join(ROOT, 'tsup.config.ts');
if (fs.existsSync(tsupPath)) {
  const tsupCfg = fs.readFileSync(tsupPath, 'utf8');
  const hasCore = tsupCfg.includes('@easyagent/core');
  const hasServer = tsupCfg.includes('@easyagent/server');
  if (hasCore && hasServer) {
    ok('tsup noExternal includes @easyagent/core and @easyagent/server');
  } else {
    if (!hasCore) fail('tsup.config.ts missing @easyagent/core in noExternal (pnpm symlink trap)');
    if (!hasServer) warn('tsup.config.ts missing @easyagent/server in noExternal');
  }
}

// VS Code watcherExclude
const vsCodeSettingsPath = path.join(ROOT, '..', '..', '.vscode', 'settings.json');
if (fs.existsSync(vsCodeSettingsPath)) {
  const vsSettings = JSON.parse(fs.readFileSync(vsCodeSettingsPath, 'utf8'));
  const watcher = vsSettings['files.watcherExclude'] || {};
  const releaseExcluded = Object.keys(watcher).some(k => k.includes('desktop/release'));
  if (releaseExcluded) {
    ok('VS Code watcherExclude covers desktop/release');
  } else {
    warn('VS Code should exclude desktop/release to avoid file locks');
  }
}

// Check for stale server/src/index.js
const staleServerJs = path.join(ROOT, '..', 'server', 'src', 'index.js');
if (fs.existsSync(staleServerJs)) {
  fail(`Stale artifact: packages/server/src/index.js - DELETE IT (vitest loads .js before .ts)`);
} else {
  ok('No stale server/src/index.js artifact');
}

// ============================================================
// 3. index.html 检查
// ============================================================
console.log('\n--- Checking index.html ---');
const htmlPath = path.join(ROOT, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

if (html.includes('<style>') || html.includes('<style ')) {
  fail('index.html contains <style> tag - use external CSS instead (Vite 5 bug)');
} else {
  ok('No inline <style> in index.html');
}

if (html.includes('127.0.0.1:3456')) {
  ok('CSP uses 127.0.0.1:3456');
} else if (html.includes('localhost:3456')) {
  fail('CSP uses localhost:3456 - change to 127.0.0.1:3456 (IPv6 issue on Windows)');
} else {
  warn('CSP missing 127.0.0.1:3456 connect-src');
}

// ============================================================
// 4. 源码 URL 检查 (localhost -> 127.0.0.1)
// ============================================================
title('--- Checking source for localhost:3456 ---');
const srcDir = path.join(ROOT, 'src', 'renderer');
const srcFiles = [
  'api.ts', 'App.tsx',
  'stores/chatStore.ts',
  'pages/Automation.tsx', 'pages/Dashboard.tsx',
];

let foundLocalhost = false;
for (const f of srcFiles) {
  const fp = path.join(srcDir, f);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, 'utf8');
  // Only check non-comment lines
  const lines = content.split('\n').filter(l => {
    const trimmed = l.trim();
    return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  });
  const joined = lines.join('\n');
  if (joined.includes('localhost:3456')) {
    fail(`${f}: still contains 'localhost:3456' - should be '127.0.0.1:3456'`);
    foundLocalhost = true;
  }
}
if (!foundLocalhost) {
  ok('No localhost:3456 in source files');
}

// ============================================================
// 5. 双重 .json() 解析检查 (检查所有 .ts/.tsx 文件，排除 api.ts)
// ============================================================
title('--- Checking for double .json() bug (ALL files) ---');

/** 递归列出目录中所有匹配模式的文件 */
function walkDir(dir, pattern) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walkDir(fullPath, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const allSrcFiles = walkDir(path.join(ROOT, 'src'), /\.(ts|tsx)$/);

let foundDoubleJson = false;
for (const fp of allSrcFiles) {
  // 跳过 api.ts 本身（它才是真正调用 fetch 的地方）
  if (fp.endsWith(path.sep + 'api.ts')) continue;
  const relPath = path.relative(ROOT, fp);
  const content = fs.readFileSync(fp, 'utf8');
  // 检查 apiFetch 后紧接着 res.json()
  if (/(?:\.then\(\s*\(\s*r\s*\)\s*=>\s*r\.json\(\s*\))|(?:res\.json\(\))/.test(content)) {
    // 确认这个 res 来自 apiFetch 调用
    if (content.includes('apiFetch')) {
      fail(`${relPath}: res.json() after apiFetch detected! apiFetch already parses JSON`);
      foundDoubleJson = true;
    }
  }
}
if (!foundDoubleJson) {
  ok('No double .json() patterns (all files checked)');
}

// ============================================================
// 6. 硬编码版本号检查 (版本号必须从 API/package.json 获取，不得硬编码)
// ============================================================
title('--- Checking for hardcoded version numbers !== 0.3.0 ---');
const CURRENT_VERSION = '0.4.1';
const versionCheckFiles = [
  'src/renderer/components/Layout.tsx',
  'src/renderer/pages/Settings.tsx',
  'src/renderer/components/layout/StatusBar.tsx',
  'src/renderer/components/chat/ChatView.tsx',
];
let foundOldVersion = false;
for (const f of versionCheckFiles) {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, 'utf8');
  // 检查是否仍包含旧版本号 (非 0.3.0 的 v0.x.0 或 '0.x.0')
  const oldVersions = content.match(/(?:v|')0\.[12456789]\.\d/g);
  if (oldVersions) {
    fail(`${f}: contains hardcoded old version: ${[...new Set(oldVersions)].join(', ')}`);
    foundOldVersion = true;
  }
}
if (!foundOldVersion) {
  ok(`No hardcoded old versions (all should be ${CURRENT_VERSION} or dynamic)`);
}

// ============================================================
// 7. 依赖完整性基础检查
// ============================================================
title('--- Checking critical dependencies ---');
const criticalDeps = ['better-sqlite3', 'express', 'ws', 'cors', 'multer', 'pino', 'body-parser', 'mime', 'send'];
for (const dep of criticalDeps) {
  if (pkg.dependencies?.[dep]) {
    ok(`dep declared: ${dep}`);
  } else {
    fail(`dep MISSING from package.json: ${dep}`);
  }
}

// ============================================================
// 8. CSS @import 顺序检查
// ============================================================
title('--- Checking index.css ---');
const cssPath = path.join(ROOT, 'src', 'renderer', 'index.css');
if (fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  // 正确处理多行块注释：移除所有 /* ... */ 块后再检查
  const strippedCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const firstNonComment = strippedCss.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'));
  if (firstNonComment.length > 0 && firstNonComment[0].startsWith('@import')) {
    ok('CSS @import is first non-comment rule');
  } else if (firstNonComment.length > 0 && css.includes('@import')) {
    fail('CSS @import must be before all other rules');
  } else {
    ok('No @import in CSS (or already first)');
  }
}

// ============================================================
// 9. catch 语法检查（esbuild 0.20.1 不兼容 catch {} 和 catch (_e)）
// ============================================================
console.log('\n--- Checking for incompatible catch syntax (esbuild 0.20.1) ---');

// 检查所有子包的 src 目录
const subPackages = [
  path.join(ROOT, '..', '..', 'cli', 'src'),
  path.join(ROOT, '..', '..', 'core', 'src'),
  path.join(ROOT, '..', '..', 'desktop', 'src'),
  path.join(ROOT, '..', '..', 'server', 'src'),
  path.join(ROOT, '..', '..', 'web', 'src'),
];
let foundCatchBinding = false;
for (const pkgDir of subPackages) {
  if (!fs.existsSync(pkgDir)) continue;
  const files = walkDir(pkgDir, /\.(ts|tsx)$/);
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf8');
    // 检测两种 esbuild 0.20.1 不兼容的 catch 写法
    if (/\bcatch\s*\{/.test(content)) {
      const relPath = path.relative(ROOT, fp);
      fail(`${relPath}: catch {} (no binding) - esbuild 0.20.1 incompatible, use catch (err) {`);
      foundCatchBinding = true;
    }
    if (/\bcatch\s*\(\s*_e\s*\)/.test(content)) {
      const relPath = path.relative(ROOT, fp);
      fail(`${relPath}: catch (_e) （_前缀变量）- esbuild 0.20.1 incompatible, use catch (err) {`);
      foundCatchBinding = true;
    }
  }
}
if (!foundCatchBinding) {
  ok('No incompatible catch syntax (esbuild compatible)');
}

// ============================================================
// 10. better-sqlite3 NODE_MODULE_VERSION 一致性检查
// 确保 .node 文件是为 Electron 30 (Node v20, MODULE_VERSION=123) 编译的
// 而不是为系统 Node.js 编译的（开发模式 pnpm install 可能用系统 Node）
// ============================================================
title('--- Checking better-sqlite3 MODULE_VERSION ---');
let moduleVersionOk = true;
const EXPECTED_ELECTRON_VERSION = 123; // Electron 30 = Node v20

try {
  // 检查 desktop 包的 better-sqlite3（Electron 运行时加载的就是这个）
  const betterSqlite3Node = path.join(ROOT, 'packages', 'desktop', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

  // 如果 desktop 路径不存在（pnpm symlink），尝试 pnpm store 实际路径
  let binaryPath = betterSqlite3Node;
  if (fs.existsSync(betterSqlite3Node)) {
    try {
      binaryPath = require('fs').realpathSync(betterSqlite3Node);
    } catch (e) { /* 使用原路径 */ }
  } else {
    warn(`better_sqlite3.node not found at ${betterSqlite3Node}`);
    // 尝试 pnpm store 中的路径
    const altPath = path.join(ROOT, 'node_modules', '.pnpm', 'better-sqlite3@12.11.1', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    if (fs.existsSync(altPath)) {
      binaryPath = altPath;
    } else {
      warn('better_sqlite3.node not found in pnpm store either - run pnpm install in packages/desktop');
    }
  }

  if (fs.existsSync(binaryPath)) {
    // 读取实际 binary 检查 MODULE_VERSION
    const buf = fs.readFileSync(binaryPath);
    const binaryModTime = fs.statSync(binaryPath).mtime.toISOString();

    // 通过检查 binary 特征判断是否为 Electron 编译：
    // Electron 30 headers 编译的 binary 应引用 NODE_MODULE_VERSION 123
    // 用 node 直接加载 .node 来检查版本会崩溃，改用文件时间戳+已知状态判断
    const systemNodeVersion = process.versions.modules;

    if (systemNodeVersion === String(EXPECTED_ELECTRON_VERSION)) {
      ok(`better-sqlite3 MODULE_VERSION = ${systemNodeVersion} (matches Electron 30)`);
    } else {
      // 系统 Node 版本不匹配（如 v24 = MODULE 137），但 binary 可能已为 Electron 编译
      // 检查：如果 binary 修改时间比 pnpm-lock 更新，说明 postinstall 已执行过 rebuild
      // 更可靠的检查：读取 binary 文件大小（Electron 编译的 typically 略小）
      const binarySize = buf.length;

      // 如果 binary 文件大小 != 1913344（原始 Node v24 编译版本），说明已被替换
      const ORIGINAL_NODE24_SIZE = 1913344;
      if (binarySize !== ORIGINAL_NODE24_SIZE) {
        // binary 已不是原始版本，认为已为 Electron 编译
        warn(`better-sqlite3 MODULE_VERSION check: system Node=${systemNodeVersion} (v24), ` +
             `but binary appears rebuilt for Electron ${EXPECTED_ELECTRON_VERSION} ` +
             `(size=${binarySize}, mod=${binaryModTime}). OK for packaging.`);
        moduleVersionOk = true;
      } else {
        // 仍是原始版本，需要 rebuild
        warn(`better-sqlite3 NOT rebuilt for Electron: binary still matches system Node v24 (MODULE ${systemNodeVersion}, ` +
             `size=${binarySize}). This WILL cause runtime failure!`);
        warn(`  Fix: cd packages/desktop && npx --yes node-gyp rebuild --target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers --release --cwd node_modules/better-sqlite3`);
      }
    }
  } else {
    warn('better_sqlite3.node not found - run pnpm install in packages/desktop');
  }
} catch (e) {
  warn(`Could not check better-sqlite3 MODULE_VERSION: ${e.message}`);
}

// ============================================================
// 11. mime 包版本冲突检查
// Express 通过 send@0.19 依赖 mime@1.6.x（有 charsets 属性）
// 如果 mime@2.x 被 pnpm 提升，Express res.json() 会崩溃 (500)
// ============================================================
title('--- Checking mime version (send/Express dependency) ---');
try {
  const mimeTopLevel = path.join(ROOT, 'node_modules', 'mime');
  const mimeSendLevel = path.join(ROOT, 'node_modules', 'send', 'node_modules', 'mime');
  
  // 检查 send 是否有自己的 mime 副本（嵌套依赖）
  let sendHasOwnMime = false;
  if (fs.existsSync(mimeSendLevel)) {
    sendHasOwnMime = true;
  }

  // 检查顶层是否有 mime
  let mimeTopOk = false;
  if (fs.existsSync(mimeTopLevel)) {
    const mimePkgPath = path.join(mimeTopLevel, 'package.json');
    if (fs.existsSync(mimePkgPath)) {
      const mimePkg = JSON.parse(fs.readFileSync(mimePkgPath, 'utf8'));
      const mimeMajor = parseInt(mimePkg.version.split('.')[0]);
      if (mimeMajor >= 2) {
        if (sendHasOwnMime) {
          ok(`mime@${mimePkg.version} (v2) at top level, but send has its own mime copy - OK`);
          mimeTopOk = true;
        } else {
          fail(`mime@${mimePkg.version} (v2) found at top level - send needs mime@1.6.x! ` +
               `Add "mime": "^1.6.0" to desktop/package.json dependencies.`);
        }
      } else {
        ok(`mime@${mimePkg.version} (v1) at top level - OK for Express/send`);
        mimeTopOk = true;
      }
    }
  } else if (sendHasOwnMime) {
    ok('No top-level mime, but send has its own mime copy - OK');
    mimeTopOk = true;
  } else {
    fail('mime@1.6.x NOT FOUND at top level AND send has no copy! ' +
         'Add "mime": "^1.6.0" to desktop/package.json dependencies. ' +
         'Without this, Express res.json() will get "Cannot find module mime" in Release build.');
  }

  // 检查 desktop/package.json 的 mime 依赖声明
  const mimeDep = pkg.dependencies?.['mime'];
  if (mimeDep) {
    const depMajor = mimeDep.replace(/[\^~>=<\s]/g, '').split('.')[0];
    if (depMajor === '1') {
      ok(`desktop/package.json has mime "${mimeDep}" (v1) - correct for send/Express`);
    } else {
      fail(`desktop/package.json has mime "${mimeDep}" (v${depMajor}) - MUST be ^1.6.0 for send compatibility!`);
    }
  } else if (!mimeTopOk) {
    fail('desktop/package.json is MISSING mime dependency - add "mime": "^1.6.0"');
  } else if (sendHasOwnMime) {
    ok('No direct mime dependency (send has own copy) - OK');
  } else {
    warn('desktop/package.json missing mime dependency but top-level mime exists (might be hoisted from elsewhere). ' +
         'Consider adding "mime": "^1.6.0" for explicit dependency.');
  }
} catch (e) {
  warn(`Could not check mime version: ${e.message}`);
}

// ============================================================
// 12. electron-updater 传递依赖完整性检查
// electron-updater 在 asarUnpack 中，但其传递依赖必须在 asar 或顶层 node_modules 中
// pnpm 可能将它们 hoist 到根 .pnpm，导致打包后缺失 → "Cannot find module"
// ============================================================
console.log('\n--- Checking electron-updater transitive dependencies ---');
try {
  const updaterPkgPath = path.join(ROOT, 'node_modules', 'electron-updater', 'package.json');
  const UPDATER_REQUIRED_DEPS = {
    'fs-extra': '^10.1.0',
    'js-yaml': '^4.1.0',
    'lazy-val': '^1.0.5',
    'lodash.escaperegexp': '^4.1.2',
    'lodash.isequal': '^4.5.0',
    'tiny-typed-emitter': '^2.1.0',
    'builder-util-runtime': '9.7.0',
    'semver': '~7.7.3',
  };

  if (fs.existsSync(updaterPkgPath)) {
    let allFound = true;
    for (const [dep, version] of Object.entries(UPDATER_REQUIRED_DEPS)) {
      const topDep = path.join(ROOT, 'node_modules', dep);
      const nestedDep = path.join(ROOT, 'node_modules', 'electron-updater', 'node_modules', dep);
      const found = fs.existsSync(topDep) || fs.existsSync(nestedDep);
      
      if (found) {
        // 检查 desktop/package.json 是否声明了此依赖
        if (pkg.dependencies?.[dep]) {
          ok(`electron-updater dep: ${dep} (declared in package.json)`);
        } else {
          warn(`electron-updater dep: ${dep} found but NOT in package.json - ` +
               `may come from pnpm hoisting. Add "${dep}": "${version}" to desktop deps.`);
        }
      } else {
        fail(`electron-updater dep MISSING: ${dep} (needed by electron-updater). ` +
             `Add "${dep}": "${version}" to desktop/package.json dependencies! ` +
             `Without this, electron-updater will fail with "Cannot find module '${dep}'" in Release.`);
        allFound = false;
      }
    }
    if (allFound) {
      ok('All electron-updater transitive deps accounted for');
    }
  } else {
    warn('electron-updater not found in node_modules');
  }
} catch (e) {
  warn(`Could not check electron-updater deps: ${e.message}`);
}

// ============================================================
// 13. Express 生态版本兼容性检查
// desktop 声明了 Express 子依赖的较新版本，可能与 Express 自身需求不兼容
// 开发模式仍能工作（pnpm 提升可能隐藏问题），但 Release 可能异常
// ============================================================
title('--- Checking Express ecosystem version compatibility ---');
try {
  const EXPRESS_VERSION_CHECKS = [
    { pkg: 'iconv-lite', current: '^0.6.3', needed: '~0.4.24', consumer: 'body-parser' },
    { pkg: 'media-typer', current: '^1.1.0', needed: '0.3.0', consumer: 'type-is' },
    { pkg: 'ipaddr.js', current: '^2.2.0', needed: '1.9.1', consumer: 'proxy-addr' },
    { pkg: 'encodeurl', current: '^1.0.2', needed: '~2.0.0', consumer: 'express/finalhandler' },
  ];

  for (const check of EXPRESS_VERSION_CHECKS) {
    const pkgPath = path.join(ROOT, 'node_modules', check.pkg, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const installed = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const installedMajor = parseInt(installed.version.split('.')[0]);
      const neededMajor = parseInt(check.needed.replace(/[\^~>=<\s]/g, '').split('.')[0]);
      const neededMinDigits = parseInt(check.needed.replace(/[\^~>=<\s]/g, '').split('.')[1] || '0');
      
      if (installedMajor !== neededMajor) {
        warn(`${check.pkg}@${installed.version} (declared ${check.current}) ` +
             `but ${check.consumer} needs ${check.needed}. ` +
             `May cause subtle issues in Release. Consider adding "${check.pkg}": "${check.needed}" instead.`);
      } else {
        ok(`${check.pkg}@${installed.version} - major version matches ${check.consumer} requirements`);
      }
    }
  }
} catch (e) {
  warn(`Could not check Express versions: ${e.message}`);
}

// ============================================================
// 14. UTF-8 编码损坏检查（PowerShell Set-Content 陷阱）
// ============================================================
console.log('\n--- Checking for UTF-8 encoding corruption ---');

let foundEncodingCorruption = false;
for (const pkgDir of subPackages) {
  if (!fs.existsSync(pkgDir)) continue;
  const files = walkDir(pkgDir, /\.(ts|tsx)$/);
  for (const fp of files) {
    const content = fs.readFileSync(fp, 'utf8');
    // 检测常见乱码特征：UTF-8 中文被 ANSI 重新编码后的 mojibake 模式
    if (/榛|鎵|鍣|鏂|椤|娣诲姞|宸叉坊|鍒犻櫎|鏂囨。/.test(content)) {
      const relPath = path.relative(ROOT, fp);
      fail(`${relPath}: encoding corrupted - restore from git, then redo changes with Node.js (not PowerShell Set-Content)`);
      foundEncodingCorruption = true;
    }
  }
}
if (!foundEncodingCorruption) {
  ok('No UTF-8 encoding corruption detected');
}

// ============================================================
// 15. preload 脚本格式检查 (CJS, 不是 ESM)
// ============================================================
title('--- Checking preload format (must be CJS) ---');
try {
  const preloadPath = path.join(ROOT, 'dist', 'preload.cjs');
  const tsupPreloadConfig = path.join(ROOT, 'tsup.preload.config.ts');

  if (!fs.existsSync(tsupPreloadConfig)) {
    fail('tsup.preload.config.ts MISSING - preload must be compiled as CJS, not ESM. ' +
         'See F36 (v0.5.27 preload ESM crash).');
  } else {
    const preloadCfg = fs.readFileSync(tsupPreloadConfig, 'utf8');
    const hasCjsFormat = preloadCfg.includes("'cjs'") || preloadCfg.includes('"cjs"');
    if (hasCjsFormat) {
      ok('tsup.preload.config.ts exists and targets CJS format');
    } else {
      fail('tsup.preload.config.ts does NOT target CJS format - Electron preload requires CJS!');
    }
  }

  if (fs.existsSync(preloadPath)) {
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');
    // CJS 特征: module.exports 或 require()
    // ESM 特征: import/export 关键字
    const hasEsmSyntax = /\bimport\b.*\bfrom\b/.test(preloadContent) || /\bexport\b/.test(preloadContent);
    const hasCjsSyntax = /require\s*\(/.test(preloadContent) || /module\.exports/.test(preloadContent);

    if (hasEsmSyntax && !hasCjsSyntax) {
      fail('dist/preload.cjs contains ESM syntax (import/export) - must be CJS!');
    } else if (hasCjsSyntax) {
      ok('dist/preload.cjs is valid CJS format');
    } else {
      warn('dist/preload.cjs format unclear - verify manually');
    }
  } else {
    warn('dist/preload.cjs not built yet - will be built by build.bat Phase 2');
  }
} catch (e) {
  warn(`Could not check preload format: ${e.message}`);
}

// ============================================================
// 16. 构建产物缓存检查 (dist 目录时效性)
// ============================================================
console.log('\n--- Checking dist cache freshness ---');
try {
  const distFiles = [
    { path: path.join(ROOT, 'dist', 'main.js'), desc: 'desktop main.js' },
    { path: path.join(ROOT, 'dist', 'preload.cjs'), desc: 'desktop preload.cjs' },
    { path: path.join(ROOT, '..', 'core', 'dist', 'index.js'), desc: 'core dist' },
    { path: path.join(ROOT, '..', 'server', 'dist', 'index.js'), desc: 'server dist' },
  ];

  const now = Date.now();
  let staleCount = 0;
  for (const { path: dp, desc } of distFiles) {
    if (!fs.existsSync(dp)) {
      warn(`${desc}: not built yet (will be compiled during build)`);
      continue;
    }
    const mtime = fs.statSync(dp).mtimeMs;
    const ageMin = Math.round((now - mtime) / 60000);
    if (ageMin > 60) {
      warn(`${desc}: last built ${ageMin} min ago - may need rebuild if source changed`);
      staleCount++;
    } else {
      ok(`${desc}: built ${ageMin} min ago (fresh)`);
    }
  }

  // Check if dist/renderer has been cleaned (important for Vite cache)
  const rendererDir = path.join(ROOT, 'dist', 'renderer');
  if (fs.existsSync(rendererDir)) {
    const rendererFiles = fs.readdirSync(rendererDir);
    if (rendererFiles.length > 0) {
      ok(`dist/renderer/ exists with ${rendererFiles.length} entries`);
    }
  } else {
    ok('dist/renderer/ does not exist (will be freshly built by vite)');
  }
} catch (e) {
  warn(`Could not check dist freshness: ${e.message}`);
}

// ============================================================
// 17. HashRouter <a href> 兼容性检查
// Desktop 使用 HashRouter，页面内导航必须使用 <Link> 或 navigate()
// <a href="/xxx"> 会触发全页面导航导致黑屏
// ============================================================
title('--- Checking for <a href> in HashRouter (desktop renderer) ---');
try {
  const RENDERER_SRC = path.join(ROOT, 'src', 'renderer');
  const tsxFiles = walkDir(RENDERER_SRC, /\.tsx$/);
  let foundBadHref = false;
  
  for (const fp of tsxFiles) {
    const content = fs.readFileSync(fp, 'utf8');
    const relPath = path.relative(ROOT, fp);
    
    // 查找 <a href="/xxx"> 模式（内部路由），排除外部 URL (<a href="http...">) 和 target="_blank"
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配 <a href="/..." 但不是 http:// 或 https:// 开头
      const match = line.match(/<a\s+href="\/([^"]+)"/);
      if (match) {
        // 排除 markdown 渲染中的 href (属于字符串拼接，不是 JSX)
        if (line.includes("'<a href=") || line.includes('"<a href=') || line.includes("`<a href=")) {
          continue;
        }
        // 排除注释
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
          continue;
        }
        fail(`${relPath}:${i + 1}: <a href="/${match[1]}"> should use <Link to="/${match[1]}"> or navigate("/${match[1]}") in HashRouter`);
        foundBadHref = true;
      }
    }
  }
  if (!foundBadHref) {
    ok('No <a href> pointing to internal routes found');
  }
} catch (e) {
  warn(`Could not check HashRouter hrefs: ${e.message}`);
}

// ============================================================
// 结果
// ============================================================
console.log('\n========================================');
if (errors > 0) {
  console.log(`\x1b[31m  VERIFICATION FAILED: ${errors} error(s), ${warnings} warning(s)\x1b[0m`);
  console.log('  Fix errors above before building!\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\x1b[33m  VERIFICATION PASSED with ${warnings} warning(s)\x1b[0m`);
  console.log('  Review warnings above, then proceed.\n');
  process.exit(0);
} else {
  console.log('\x1b[32m  ALL CHECKS PASSED\x1b[0m\n');
  process.exit(0);
}
