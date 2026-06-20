// 分析所有 external 包及其完整依赖树
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const PNPM_DIR = './node_modules/.pnpm';
const DESKTOP_PKG = JSON.parse(readFileSync('./packages/desktop/package.json', 'utf-8'));

// 获取所有 dependencies（排除 workspace 内部包）
const externalDeps = Object.keys(DESKTOP_PKG.dependencies).filter(k => !k.startsWith('@easyagent'));
const devDeps = Object.keys(DESKTOP_PKG.devDependencies || {});

// 已声明在 package.json 中的依赖集合
const declared = new Set(externalDeps);

// 递归查找所有依赖
const allDepTree = new Map();
const visited = new Set();

function findPkgDir(pkgName, parentDir) {
  // 在 .pnpm 目录中查找包
  const entries = readdirSync(PNPM_DIR, { withFileTypes: true });
  // 匹配包名@版本格式
  const escapedName = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedName}@`);
  
  for (const entry of entries) {
    if (entry.isDirectory() && regex.test(entry.name)) {
      const nodeModulePath = join(PNPM_DIR, entry.name, 'node_modules', pkgName);
      if (existsSync(nodeModulePath)) {
        return nodeModulePath;
      }
    }
  }
  
  // 第二优先级：在 .pnpm 目录中查找任意版本的包
  for (const entry of entries) {
    if (entry.isDirectory() && regex.test(entry.name)) {
      // 版本内联路径
      const baseDir = join(PNPM_DIR, entry.name);
      return baseDir;
    }
  }
  
  return null;
}

function getDeps(pkgPath) {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'));
    return pkg.dependencies || {};
  } catch {
    return {};
  }
}

function resolvePkg(pkgName, depth) {
  if (visited.has(pkgName)) return;
  if (depth > 10) return;
  visited.add(pkgName);
  
  const pkgDir = findPkgDir(pkgName);
  if (!pkgDir) {
    console.log(`  [NOT FOUND] ${'  '.repeat(depth)}${pkgName}`);
    return;
  }
  
  const deps = getDeps(pkgDir);
  const depNames = Object.keys(deps);
  allDepTree.set(pkgName, depNames);
  
  // 递归子依赖
  for (const depName of depNames) {
    resolvePkg(depName, depth + 1);
  }
}

// 只分析外部依赖树（排除 workspace 内部包和 React/Vite 等前端打包工具链）
const entryPoints = externalDeps.filter(d => !d.startsWith('@'));

console.log(`共 ${entryPoints.length} 个外部入口包\n`);

for (const entry of entryPoints) {
  resolvePkg(entry, 0);
}

// 找出所有未被声明的依赖
const allTransitive = new Set();
for (const [parent, children] of allDepTree) {
  for (const child of children) {
    allTransitive.add(child);
  }
}

// 找出缺失的
const missing = new Set();
for (const dep of allTransitive) {
  if (!declared.has(dep) && !externalDeps.includes(dep)) {
    missing.add(dep);
  }
}

console.log('=== 已声明的入口包 ===');
console.log([...externalDeps].sort().join('\n'));

console.log('\n=== 依赖树（入口 → 子依赖）===');
for (const [parent, children] of [...allDepTree.entries()].sort((a,b) => a[0].localeCompare(b[0]))) {
  if (children.length > 0) {
    console.log(`${parent}`);
    for (const child of children) {
      const status = declared.has(child) ? '✅' : '❌';
      console.log(`  ${status} ${child}`);
    }
  }
}

console.log('\n=== 需要补充的依赖（未在 package.json 中声明）===');
const missingList = [...missing].sort();
for (const m of missingList) {
  console.log(m);
}
console.log(`\n共 ${missingList.length} 个缺失依赖`);
