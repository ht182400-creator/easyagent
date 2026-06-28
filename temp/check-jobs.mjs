import { execSync } from 'child_process';

const runId = '28317810785';
const repo = 'ht182400-creator/easyagent';

// 获取所有 jobs
const jobsJson = execSync(
  `gh api repos/${repo}/actions/runs/${runId}/attempts/1/jobs`,
  { encoding: 'utf-8' }
);
const data = JSON.parse(jobsJson);

for (const job of data.jobs) {
  console.log(`\n=== ${job.name} (${job.conclusion}) ===`);
  // 获取该 job 的 annotations
  try {
    const annJson = execSync(
      `gh api repos/${repo}/actions/jobs/${job.id}/annotations`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    const anns = JSON.parse(annJson);
    if (anns && anns.length > 0) {
      for (const a of anns) {
        console.log(`  [${a.annotation_level.toUpperCase()}] ${a.message}`);
        if (a.title) console.log(`    title: ${a.title}`);
        if (a.path) console.log(`    path: ${a.path}:${a.start_line || ''}`);
      }
    } else {
      console.log('  (无 annotations)');
    }
  } catch (e) {
    console.log(`  获取 annotations 失败: ${e.message}`);
  }
}
