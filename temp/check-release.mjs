// 检查 release workflow 最新运行状态
const { execSync } = require('child_process');

try {
  const result = execSync(
    'gh api repos/ht182400-creator/easyagent/actions/workflows/release.yml/runs --jq ".workflow_runs[0:5][] | {status, conclusion, head_branch, created_at, html_url}"',
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );
  console.log(result);
} catch (e) {
  // 兜底：用 run list
  const result = execSync('gh run list --workflow=release.yml --limit 5 --json status,conclusion,headBranch,createdAt,url', { encoding: 'utf-8' });
  console.log(result);
}
