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

function fail(msg) { console.error(`\x1b[31m  [FAIL]\x1b[0m ${msg}`); errors++; }
function warn(msg) { console.warn(`\x1b[33m  [WARN]\x1b[0m ${msg}`); warnings++; }
function ok(msg)   { console.log(`\x1b[32m  [OK]\x1b[0m   ${msg}`); }

// ============================================================
// 1. 关键文件存在性检查
// ============================================================
console.log('\n--- Checking required files ---');
const requiredFiles = [
  ['assets/LICENSE', 'NSIS license page'],
  ['assets/icon.ico', 'NSIS installer icon'],
  ['installer.nsh', 'Custom NSIS script'],
  ['index.html', 'Electron entry HTML'],
  ['src/renderer/index.css', 'Global CSS'],
  ['src/renderer/api.ts', 'API client'],
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
console.log('\n--- Checking package.json config ---');
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
console.log('\n--- Checking source for localhost:3456 ---');
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
console.log('\n--- Checking for double .json() bug (ALL files) ---');

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
console.log('\n--- Checking for hardcoded version numbers !== 0.3.0 ---');
const CURRENT_VERSION = '0.3.0';
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
console.log('\n--- Checking critical dependencies ---');
const criticalDeps = ['better-sqlite3', 'express', 'ws', 'cors', 'multer', 'pino', 'body-parser'];
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
console.log('\n--- Checking index.css ---');
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
