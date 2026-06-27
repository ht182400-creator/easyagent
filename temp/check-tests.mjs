import { readFileSync } from 'fs';

const files = [
  'core',
  'server',
  'desktop',
  'frontend',
  'web',
];

let totalPass = 0, totalFail = 0, totalFiles = 0;
for (const name of files) {
  try {
    const d = JSON.parse(readFileSync(`docs/pipeline/_vitest-${name}.json`, 'utf8'));
    const tf = d.testResults ? d.testResults.length : 0;
    const p = d.numPassedTests || 0;
    const fl = d.numFailedTests || 0;
    const s = d.success ? '✅' : '❌';
    totalPass += p;
    totalFail += fl;
    totalFiles += tf;
    console.log(`${name.padEnd(10)} ${s}  ${p}/${p + fl} passed, ${tf} files`);
  } catch (e) {
    console.log(`${name.padEnd(10)} ⚠️  REPORT NOT FOUND (${e.message})`);
  }
}
console.log(`\n══════════════════════════════`);
console.log(`TOTAL: ${totalPass}/${totalPass + totalFail} passed (${totalFiles} test files)`);
