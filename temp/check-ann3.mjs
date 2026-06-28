import { execSync } from 'child_process';

const repo = 'ht182400-creator/easyagent';

// 获取最新 commit SHA 的 check suites
const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();

// 方案1: 获取 check suites
const suites = JSON.parse(execSync(`gh api repos/${repo}/commits/${sha}/check-suites`, { encoding: 'utf-8' }));

for (const suite of (suites.check_suites || [])) {
  console.log(`\n=== Check Suite: ${suite.id} - ${suite.status} ===`);
  
  // 获取该 check suite 下的 check runs
  const runs = JSON.parse(execSync(`gh api repos/${repo}/check-suites/${suite.id}/check-runs`, { encoding: 'utf-8' }));
  
  for (const run of (runs.check_runs || [])) {
    const ac = run.output?.annotations_count || 0;
    if (ac > 0) {
      console.log(`\n  [${run.name}] status=${run.status} conclusion=${run.conclusion} annotations=${ac}`);
      console.log(`  Title: ${run.output.title}`);
      console.log(`  Summary length: ${(run.output.summary || '').length}`);
      
      // 获取详细 annotations
      const annUrl = `repos/${repo}/check-runs/${run.id}/annotations`;
      try {
        const anns = JSON.parse(execSync(`gh api ${annUrl}`, { encoding: 'utf-8', stdio: 'pipe' }));
        for (const a of (anns || [])) {
          console.log(`    [${a.annotation_level}] ${a.path || ''}:${a.start_line || ''}: ${a.message}`);
        }
      } catch (e) {
        console.log(`    获取 annotations 失败: ${e.toString().slice(0, 200)}`);
      }
    }
  }
}

// 方案2: 也看 CI run
console.log('\n\n===== RELEASE RUN CHECKS =====');
// 用 workflow run 获取 check suite
const runData = JSON.parse(execSync(`gh api repos/${repo}/actions/runs/28317810785`, { encoding: 'utf-8' }));
console.log(`Check suite URL: ${runData.check_suite_url}`);
const suiteData = JSON.parse(execSync(`gh api ${runData.check_suite_url}`, { encoding: 'utf-8', stdio: 'pipe' }).toString());
console.log(`Check suite status: ${suiteData.status} conclusion: ${suiteData.conclusion}`);
