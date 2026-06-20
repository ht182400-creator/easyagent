import { execSync } from 'child_process';
const r = execSync('npx vitest --run 2>&1', {
  cwd: process.cwd(),
  encoding: 'utf-8',
  maxBuffer: 10 * 1024 * 1024,
  timeout: 120000,
  env: { ...process.env, NO_COLOR: '1' }
});
// 提取最后几行摘要
const lines = r.split('\n');
const summaryLines = lines.filter(l => l.includes('Tests') || l.includes('Files') || l.includes('passed') || l.includes('failed'));
console.log(summaryLines.slice(-10).join('\n'));
