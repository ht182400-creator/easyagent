/**
 * EasyAgent ESLint Flat Config (CJS)
 * TypeScript + React 项目统一检查规则
 *
 * pnpm workspace 下子包无法直接 require 根依赖。
 * 双策略回退：
 *   1. 优先从根 package.json 的 createRequire 解析（pnpm public-hoist-pattern 生效时）
 *   2. 回退到 .pnpm 目录扫描（pnpm 严格隔离模式）
 *
 * 注意：不再使用 pkgName.split('/').pop()，直接用完整 pkgName 拼接路径。
 */
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..', '..');
const rootRequire = createRequire(path.join(rootDir, 'package.json'));

/**
 * 从 .pnpm 目录扫描定位包路径，创建 require
 * @param {string} pkgName - 如 "@eslint/js" 或 "typescript-eslint"
 * @returns {*} require(pkgName) 的结果
 */
function pnpmRequire(pkgName) {
  // 策略 1：尝试从根 package.json 解析（public-hoist-pattern 环境下包被提升到顶层）
  try {
    return rootRequire(pkgName);
  } catch {
    // 策略 2：回退到 .pnpm 目录扫描（严格隔离模式）
  }

  const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
  const dirPrefix = pkgName.replace('/', '+') + '@';  // @eslint/js → @eslint+js@
  let foundDir = null;
  try {
    const entries = fs.readdirSync(pnpmDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(dirPrefix)) {
        // pkgName 保留完整 scope 路径，path.join 自动处理平台分隔符
        foundDir = path.join(pnpmDir, entry.name, 'node_modules', pkgName);
        break;
      }
    }
  } catch { /* pnpmDir 不存在则跳过 */ }

  if (!foundDir) {
    throw new Error(
      `pnpmRequire: 找不到包 ${pkgName}（根解析失败 + .pnpm 扫描未匹配前缀 "${dirPrefix}"）`
    );
  }

  const pkgRequire = createRequire(path.join(foundDir, 'package.json'));
  return pkgRequire(pkgName);
}

const eslint = pnpmRequire('@eslint/js');
const tseslint = pnpmRequire('typescript-eslint');

module.exports = tseslint.config(
  // 基础推荐规则
  eslint.configs.recommended,
  // TypeScript 推荐规则
  ...tseslint.configs.recommended,
  // 全局忽略
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/release/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '**/generated-images/**',
      'temp/**',
      'docs/**',
      'scripts/**',
    ],
  },
  // 针对 TypeScript 源文件的规则
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // 宽松规则：不阻塞开发流程
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-debugger': 'warn',
      // 防止常见问题
      '@typescript-eslint/no-empty-interface': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
);
