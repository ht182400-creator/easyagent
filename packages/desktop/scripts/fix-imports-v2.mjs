/**
 * 全面修复导入问题：
 * 1. 清理多行 import 中残留的空格
 * 2. 确保 apiFetch 导入在正确位置
 * 3. 确保 apiFetch 导入存在于使用它的文件中
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';

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

      // 1. 修复 import {  双空格问题
      if (content.includes('import {  ')) {
        content = content.replace(/import \{\s{2,}/g, 'import { ');
        modified = true;
      }

      // 2. 检查文件是否使用了 apiFetch 但缺少导入
      if (content.includes('apiFetch(') && !content.includes("import { apiFetch }")) {
        // 计算相对导入路径
        const relDir = relative(dirname(fp), 'src/renderer').replace(/\\/g, '/') || '.';
        const importPath = relDir + '/api';

        // 在最后一个 import 语句后添加
        const lines = content.split('\n');
        let lastImportIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('import ') || line === 'import' || line.startsWith('} from')) {
            lastImportIdx = i;
          } else if (line.startsWith('//') || line.startsWith('/*') || line === '') {
            continue;
          } else if (lastImportIdx >= 0) {
            // 找到第一个非 import/注释/空行
            break;
          }
        }

        if (lastImportIdx >= 0) {
          lines.splice(lastImportIdx + 1, 0, `import { apiFetch } from '${importPath}';`);
        } else {
          lines.unshift(`import { apiFetch } from '${importPath}';`);
        }
        content = lines.join('\n');
        modified = true;
        console.log('  + apiFetch import:', relative('.', fp));
      }

      // 3. 清理双重空行
      if (content.includes('\n\n\n')) {
        content = content.replace(/\n{3,}/g, '\n\n');
        modified = true;
      }

      if (modified) {
        writeFileSync(fp, content, 'utf-8');
        console.log('FIXED:', relative('.', fp));
      }
    }
  }
}

console.log('Scanning src/renderer...');
walk('src/renderer');
console.log('Done');
