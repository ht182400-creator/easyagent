import { readFileSync } from 'fs';

const d = JSON.parse(readFileSync('docs/pipeline/_vitest-desktop.json', 'utf8'));
let totalFailed = 0;

for (const r of d.testResults || []) {
  if (r.status !== 'passed') {
    const failures = (r.assertionResults || []).filter(a => a.status === 'failed');
    console.log(`\n📄 ${r.name.split('/').pop()}: ${failures.length} failed`);
    for (const a of failures) {
      totalFailed++;
      console.log(`  ❯ ${a.fullName}`);
      const msg = (a.failureMessages || ['(no message)'])[0];
      console.log(`    ${msg.substring(0, 200)}`);
    }
  }
}
console.log(`\n════════════════`);
console.log(`Total failed: ${totalFailed} / ${d.numTotalTests}`);
