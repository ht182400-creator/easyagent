import { execSync } from 'node:child_process';

const lock = execSync('git show 148b951:pnpm-lock.yaml', { encoding: 'utf8' });
const specIdx = lock.indexOf('specifiers:');
const depIdx = lock.indexOf('dependencies:');
const specSection = lock.substring(specIdx, depIdx);

const pkgs = ['@eslint/js', 'eslint', 'typescript-eslint', 'prettier'];
for (const pkg of pkgs) {
  const re = new RegExp(String.raw`${pkg.replace('/', '\\/')}:\\s*(.+)`, 'm');
  const m = specSection.match(re);
  if (m) console.log(`${pkg}: ${m[1]}`);
}

// Also check the importers section for root package.json
const importersIdx = lock.indexOf('importers:');
const importersEnd = lock.indexOf('lockfileVersion:');
const importerSection = lock.substring(importersIdx, importersEnd);
const rootIdx = importerSection.indexOf('.:');
const rootSection = importerSection.substring(rootIdx, importerSection.indexOf('\n  ', rootIdx + 200) > 0 ? importerSection.indexOf('\n  ', rootIdx + 200) : importerSection.length);

console.log('\n--- Root importer devDependencies from lockfile ---');
const devDepIdx = rootSection.indexOf('devDependencies:');
if (devDepIdx > 0) {
  const devSection = rootSection.substring(devDepIdx);
  for (const pkg of pkgs) {
    const re = new RegExp(String.raw`${pkg.replace('/', '\\/')}:\\s*(.+)`, 'm');
    const m = devSection.match(re);
    if (m) console.log(`${pkg}: ${m[1]}`);
  }
}
