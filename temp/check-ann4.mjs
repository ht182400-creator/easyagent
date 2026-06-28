import { execSync } from 'child_process';

const repo = 'ht182400-creator/easyagent';

// Release run check suite
const csUrl = 'repos/ht182400-creator/easyagent/check-suites/76446948774';
const runs = JSON.parse(execSync(`gh api ${csUrl}/check-runs`, { encoding: 'utf-8' }));

for (const run of (runs.check_runs || [])) {
  const ac = run.output?.annotations_count || 0;
  console.log(`\n[${run.name}] status=${run.status} conclusion=${run.conclusion} annotations=${ac}`);
  if (ac > 0) {
    const annUrl = `repos/${repo}/check-runs/${run.id}/annotations`;
    try {
      const anns = JSON.parse(execSync(`gh api ${annUrl}`, { encoding: 'utf-8', stdio: 'pipe' }));
      for (const a of (anns || [])) {
        console.log(`  [${a.annotation_level}] ${a.path}:${a.start_line}: ${a.message}`);
      }
    } catch (e) {
      console.log(`  (无法获取: ${e.toString().slice(0,100)})`);
    }
  }
}

// 特定查看 Lint 的 failure annotations 详情
console.log('\n\n=== LINT FAILURE DETAILS ===');
// CI 的 Lint check run id: 我们不知道，需要重新获取
