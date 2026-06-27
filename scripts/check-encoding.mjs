import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('check-encoding');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function walk(dir) {
  let results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        results = results.concat(walk(p));
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        results.push(p);
      }
    }
  } catch (_e) {
    /* skip inaccessible dirs */
  }
  return results;
}

const packages = [
  'packages/cli/src',
  'packages/core/src',
  'packages/desktop/src',
  'packages/server/src',
  'packages/web/src',
];
let badFiles = [];

for (const pkg of packages) {
  const dir = join(ROOT, pkg);
  const files = walk(dir);
  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    // 检测常见的乱码特征 (UTF-8 中文被当作 ANSI 重新编码后的特征模式)
    if (/榛|鎵|鍣|鏂|椤|娣诲姞|宸叉坊|鍒犻櫎|鏂囨。/.test(content)) {
      badFiles.push(relative(ROOT, f));
    }
  }
}

if (badFiles.length > 0) {
  for (const f of badFiles) {
    log.error('CORRUPTED:', f);
  }
  log.fail(`共 ${badFiles.length} 个文件编码损坏`);
  process.exit(1);
} else {
  log.ok('所有文件编码正常，未检测到乱码');
}
