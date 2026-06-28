import { execSync } from 'child_process';

const repo = 'ht182400-creator/easyagent';

// 获取最新 commit 的所有 check runs
const checkRunsRaw = execSync(
  `gh api repos/${repo}/commits/HEAD/check-runs`,
  { encoding: 'utf-8' }
);
const checkRunsData = JSON.parse(checkRunsRaw);

console.log('=== CHECK RUNS WITH ANNOTATIONS ===\n');
for (const cr of checkRunsData.check_runs || []) {
  if (cr.output && cr.output.annotations_count > 0) {
    console.log(`Check: ${cr.name} | ${cr.conclusion || cr.status}`);
    console.log(`  Title: ${cr.output.title}`);
    console.log(`  Summary: ${cr.output.summary}`);
    console.log(`  Annotations: ${cr.output.annotations_count}`);
    
    // 获取该 check run 的具体 annotations
    if (cr.output.annotations_url) {
      try {
        const annRaw = execSync(`gh api ${cr.output.annotations_url}`, { encoding: 'utf-8', stdio: 'pipe' });
        const anns = JSON.parse(annRaw);
        for (const a of anns.slice(0, 20)) {
          console.log(`    [${a.annotation_level.toUpperCase()}] ${a.path || ''}:${a.start_line || ''} - ${a.message}`);
        }
        if (anns.length > 20) console.log(`    ... 还有 ${anns.length - 20} 条`);
      } catch (e) {
        console.log(`    (无法获取详细 annotations: ${e.message.slice(0, 100)})`);
      }
    }
    console.log('');
  }
}

// 如果 check runs 没有 annotations，检查 CI 和 Release 两个 run
console.log('\n=== 最近的 RUN SUMMARY ===\n');
const ciRuns = execSync(`gh run list --limit 3 --json conclusion,displayTitle,name,status`, { encoding: 'utf-8' });
console.log(ciRuns);
