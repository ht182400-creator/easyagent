import { execSync } from 'child_process';

const repo = 'ht182400-creator/easyagent';
const releaseRunId = '28317810785';
const ciRunId = '28317920208';

async function getAnnotations(runId, label) {
  // 通过 GitHub API 获取 run 下的所有 check runs
  const checksUrl = `repos/${repo}/actions/runs/${runId}/jobs`;
  const jobsRaw = execSync(`gh api ${checksUrl} --jq ".jobs[] | {id, name, conclusion, check_run_url}"`, { encoding: 'utf-8', stdio: 'pipe' });
  if (!jobsRaw.trim()) return;
  
  const lines = jobsRaw.split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const job = JSON.parse(line);
      console.log(`\n## ${label} - ${job.name} (${job.conclusion})`);
      
      // 获取 check run 的 annotations
      if (job.check_run_url) {
        const crRaw = execSync(`gh api ${job.check_run_url}`, { encoding: 'utf-8', stdio: 'pipe' });
        const cr = JSON.parse(crRaw);
        const ac = cr.output?.annotations_count || 0;
        if (ac > 0) {
          console.log(`  Annotations count: ${ac}`);
          const anns = cr.output?.annotations_url;
          if (anns) {
            try {
              const aRaw = execSync(`gh api ${anns} --jq ".[] | \"[\(.annotation_level)] \(.path):\(.start_line) \(.message)\""`, { encoding: 'utf-8', stdio: 'pipe' });
              if (aRaw.trim()) {
                console.log(aRaw.split('\n').filter(l => l.trim()).map(l => `  ${l}`).join('\n'));
              }
            } catch (e) {
              console.log(`  获取 annotations 详情失败`);
            }
          }
        }
      }
    } catch (e) {
      // skip malformed JSON
    }
  }
}

async function main() {
  console.log('=== RELEASE RUN ===');
  await getAnnotations(releaseRunId, 'RELEASE');
  
  console.log('\n\n=== CI RUN (最新 docs 提交) ===');
  await getAnnotations(ciRunId, 'CI');
}

main().catch(console.error);
