/**
 * 批量替换脚本：将所有 fetch('/api/...') 替换为 apiFetch('/api/...')
 * 并自动添加 import { apiFetch } 导入
 */
import { readFileSync, writeFileSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join, relative, dirname, basename } from 'path';

const RENDERER_DIR = join(import.meta.dirname, '..', 'src', 'renderer');

/** 收集所有 .ts 和 .tsx 文件 */
function collectFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'api.ts' || entry === 'App.tsx' || entry === 'main.tsx') continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = collectFiles(RENDERER_DIR);
let updatedCount = 0;

for (const filePath of files) {
  let content = readFileSync(filePath, 'utf-8');

  // 检查是否包含 fetch('/api/ 或 fetch("/api/
  const hasApiFetch = /fetch\(['"`]\/api\//.test(content);
  if (!hasApiFetch) continue;

  // 计算导入路径
  const relDir = relative(dirname(filePath), RENDERER_DIR).replace(/\\/g, '/') || '.';
  const importPath = relDir + '/api';

  // 检查是否已经有 apiFetch 导入
  const hasImport = content.includes("from '" + importPath + "'") || content.includes('from "' + importPath + '"');

  // 替换 fetch('/api/ → apiFetch('/api/ 和 fetch("/api/ → apiFetch("/api/
  let newContent = content.replace(/fetch\((['"`])\/api\//g, 'apiFetch($1/api/');

  if (!hasImport) {
    // 在最后一个 import 语句之后添加 import
    // 找到最后一个 import 语句的位置
    const importLines = [...newContent.matchAll(/^import\s+.*$/gm)];
    if (importLines.length > 0) {
      const lastImport = importLines[importLines.length - 1];
      const insertPos = lastImport.index + lastImport[0].length;
      newContent = newContent.slice(0, insertPos)
        + `\nimport { apiFetch } from '${importPath}';`
        + newContent.slice(insertPos);
    } else {
      // 如果没有 import，在文件开头添加
      newContent = `import { apiFetch } from '${importPath}';\n` + newContent;
    }
  }

  // 处理 .js 文件中的 fetch 调用（如果有）
  if (newContent !== content) {
    writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✓ ${relative(RENDERER_DIR, filePath)}`);
    updatedCount++;
  }
}

console.log(`\n总计更新 ${updatedCount} 个文件`);
