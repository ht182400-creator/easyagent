import { readdirSync, statSync, unlinkSync } from 'fs';
import { join, relative } from 'path';

function walk(dir) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fp = join(dir, item);
    if (statSync(fp).isDirectory()) {
      if (item !== 'node_modules' && item !== 'dist') {
        walk(fp);
      }
    } else {
      const isArtifact = item.endsWith('.js') || item.endsWith('.d.ts') || item.endsWith('.map');
      if (isArtifact) {
        unlinkSync(fp);
        console.log('DEL:', relative('.', fp));
      }
    }
  }
}

walk('src/renderer');
console.log('Cleanup done');
