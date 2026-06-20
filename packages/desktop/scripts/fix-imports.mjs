/**
 * 修复错误插入的多行 import 问题
 * migrate-api.mjs 在遇到多行 import 时，错误地在 import { 和后续行之间插入了 apiFetch 导入
 * 此脚本将 apiFetch 导入移到多行 import 完成之后
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

function walk(dir) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fp = join(dir, item);
    if (statSync(fp).isDirectory()) {
      if (item !== 'node_modules' && item !== 'dist' && item !== 'renderer_backup') {
        walk(fp);
      }
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      let content = readFileSync(fp, 'utf-8');
      let modified = false;

      // 修复模式: import {\nimport { apiFetch }...\n  something,
      // 应该变成: import {\n  something,\n...\n} ...;\nimport { apiFetch }...
      const badPattern = /^import\s*\{[\r\n]+import\s*\{\s*apiFetch\s*\}\s*from\s*'[^']+';[\r\n]+(\s+\w+)/m;
      const match = content.match(badPattern);
      if (match) {
        // 移除错误的 apiFetch 导入行
        content = content.replace(
          /import\s*\{[\r\n]+import\s*\{\s*apiFetch\s*\}\s*from\s*'[^']+';[\r\n]+/,
          'import {'
        );
        modified = true;
      }

      // 另一种模式: import { 之后直接插入 apiFetch
      const badPattern2 = /^import\s*\{[^}]*import\s*\{\s*apiFetch\s*\}\s*from\s*'[^']+';[^}]*\}/ms;
      if (badPattern2.test(content)) {
        // 移除 import { ... import { apiFetch } ... } 中的 apiFetch 部分
        content = content.replace(
          /\bimport\s*\{\s*apiFetch\s*\}\s*from\s*'[^']+';/g,
          ''
        );
        modified = true;
      }

      if (modified) {
        writeFileSync(fp, content, 'utf-8');
        console.log('FIXED:', relative('.', fp));
      }
    }
  }
}

walk('src/renderer');
console.log('Fix complete');
