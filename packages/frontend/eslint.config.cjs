/**
 * EasyAgent ESLint Flat Config (CJS)
 * TypeScript + React 项目统一检查规则
 *
 * pnpm isolated mode: require 从本文件所在目录解析，但包在根 .pnpm 目录
 * 使用 createRequire 从 .pnpm 路径加载依赖
 */
const { createRequire } = require('module');
const path = require('path');

// 在 .pnpm 存储中定位 eslint 包路径，创建指向它的 require
function pnpmRequire(pkgName) {
  const rootDir = path.resolve(__dirname, '..', '..');
  const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
  const { readdirSync } = require('fs');

  // pnpm 目录命名格式: @scope+pkg@version_peerDeps...
  // 例如 @eslint/js → 目录前缀 @eslint+js@
  const dirPrefix = pkgName.replace('/', '+') + '@';
  let foundDir = null;
  try {
    const dirs = readdirSync(pnpmDir, { withFileTypes: true });
    for (const dirent of dirs) {
      if (dirent.isDirectory() && dirent.name.startsWith(dirPrefix)) {
        // pkgName 保留完整 scope 路径(如 @eslint/js), path.join 自动处理跨平台分隔符
        foundDir = path.join(pnpmDir, dirent.name, 'node_modules', pkgName);
        break;
      }
    }
  } catch (_) {
    // 忽略
  }

  if (!foundDir) {
    throw new Error(`pnpmRequire: 找不到包 ${pkgName}`);
  }

  // 使用 createRequire 从目标包所在目录解析
  const req = createRequire(path.join(foundDir, 'package.json'));
  return req(pkgName);
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
