/**
 * CI 数据回取脚本 —— wait for CI + download vitest artifacts + fetch failure logs
 * 
 * 流程:
 *   1. 找到当前 commit 对应的 CI workflow run
 *   2. 轮询等待 CI 所有 job 完成（超时可配）
 *   3. 回取失败 job 的原始日志 → docs/pipeline/ci-logs/
 *   4. 下载 vitest 报告 artifacts 到 docs/pipeline/
 *   5. git pull 获取 CI-synced 管线数据
 *   6. 输出 CI 状态摘要 + 失败日志摘要
 * 
 * 用法: node scripts/fetch-ci-data.mjs [--timeout 600] [--no-wait] [--skip-download] [--no-logs]
 * 
 * 注意: 需要 GitHub Token（scripts/.release_token 或 GITHUB_TOKEN 环境变量）
 *       Token 需要 repo scope 才能访问 actions artifacts 和 logs API
 */

import { execSync } from 'child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ===== 配置 =====
const CONFIG = {
  owner: 'ht182400-creator',
  repo: 'easyagent',
  branch: 'main',
  workflowName: 'CI',
  artifactNames: ['vitest-core', 'vitest-server', 'vitest-desktop'],
  pipelineDir: resolve(ROOT, 'docs/pipeline'),
  pollInterval: 30, // 轮询间隔秒
};

// ===== CLI 参数 =====
const args = process.argv.slice(2);
const options = {
  timeout: 600, // 默认10分钟超时
  noWait: false,
  skipDownload: false,
  fetchLogs: true,  // 默认回取失败 job 日志
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--timeout' && args[i + 1]) options.timeout = parseInt(args[i + 1]);
  if (args[i] === '--no-wait') options.noWait = true;
  if (args[i] === '--skip-download') options.skipDownload = true;
  if (args[i] === '--no-logs') options.fetchLogs = false;
}

// ===== 工具函数 =====

/** 读取 GitHub Token */
function loadToken() {
  // 优先级: 环境变量 > .release_token 文件
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const tokenPath = resolve(__dirname, '.release_token');
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, 'utf-8').trim();
  }
  throw new Error('未找到 GitHub Token。请设置 GITHUB_TOKEN 环境变量或创建 scripts/.release_token 文件');
}

/** GitHub API 请求 */
function githubRequest(path) {
  return new Promise((resolve, reject) => {
    const token = loadToken();
    const url = new URL(path, `https://api.github.com`);
    const req = https.request({
      hostname: 'api.github.com',
      path: url.pathname + url.search,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'EasyAgent-CI-Sync/1.0',
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        resolve(githubRequest(redirectUrl));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** 获取当前 HEAD commit SHA */
function getHeadSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/** 最简单的 ZIP 解压（单文件场景） */
function extractSingleFileZip(zipPath, destDir) {
  // 使用 PowerShell 解压
  try {
    const psCmd = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    // 尝试使用 tar（部分 Node.js 版本内置）
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
      return true;
    } catch {
      console.error('   解压失败: 缺少 PowerShell 或 tar 命令');
      return false;
    }
  }
}

/** 
 * 获取 job 原始日志文本（通过 GitHub API 302 重定向到原始日志 URL）
 */
function fetchJobLog(jobId) {
  return new Promise((resolve, reject) => {
    const token = loadToken();
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/jobs/${jobId}/logs`,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'EasyAgent-CI-Sync/1.0',
      },
    }, res => {
      // API 返回 302 重定向到原始日志 URL
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        https.get(redirectUrl, res2 => {
          let data = '';
          res2.on('data', c => { data += c; });
          res2.on('end', () => resolve(data));
          res2.on('error', reject);
        }).on('error', reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

/** 
 * 从原始日志中提取失败相关行
 * 识别: vitest FAIL 行、AssertionError、EXPECTED/RECEIVED、Error:、超时等
 * 
 * 注意: CI 日志中的 ANSI 码可能包含多个参数 (如 \\x1b[31;1;7m)
 *       需要用 * 而非 ? 来匹配所有 ;\d+ 组合
 */
function extractFailureLines(logText) {
  const lines = logText.split('\n');
  const result = [];
  let inFailureBlock = false;

  for (const line of lines) {
    // 去除 ANSI 颜色码 (支持多参数: \\x1b[31m, \\x1b[31;1;7m) 和时间戳前缀
    const clean = line
      .replace(/\x1b\[\d+(;\d+)*m/g, '')
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z\s*/, '');

    // vitest FAIL 标记 (ANSI 高亮行)
    if (clean.includes('FAIL ') && (clean.includes('.test.') || clean.includes('__tests__'))) {
      result.push(clean.trim());
      inFailureBlock = true;
      continue;
    }
    // 超时错误
    if (clean.includes('Error: Test timed out') || clean.includes('Error: Timeout')) {
      result.push(clean.trim());
      inFailureBlock = true;
      continue;
    }
    // 错误信息
    if (clean.includes('Error: ') && (clean.includes('.ts') || clean.includes('.test'))) {
      result.push(clean.trim());
      inFailureBlock = true;
      continue;
    }
    // AssertionError 或期望值不匹配 (在 FAIL 块内)
    if (inFailureBlock && (clean.includes('AssertionError') || 
        clean.includes('Expected') || clean.includes('Received') ||
        clean.includes('× ') || clean.includes('✕ ') ||
        clean.match(/^\s{2,}(Expected|Received|at\s)/))) {
      result.push(clean.trim());
      continue;
    }
    // 退出失败块 (空行)
    if (inFailureBlock && clean.trim() === '' && result.length > 0) {
      inFailureBlock = false;
    }
  }

  return result;
}

// ===== 主流程 =====

async function main() {
  console.log('========================================');
  console.log('CI 数据回取开始: ' + new Date().toLocaleString());
  console.log('========================================\n');

  // 1. 获取当前 commit
  const headSha = getHeadSha();
  console.log(`📌 当前 HEAD: ${headSha?.substring(0, 7)}\n`);

  // 2. 查找对应的 CI workflow run
  console.log('🔍 查找 CI workflow run...');
  let runs;
  try {
    runs = await githubRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?branch=${CONFIG.branch}&event=push&per_page=10`);
  } catch (e) {
    console.error(`❌ 无法访问 GitHub API: ${e.message}`);
    process.exit(1);
  }

  // 优先匹配 HEAD commit，次选最新
  let targetRun = null;
  const workflowRuns = runs.workflow_runs || [];
  for (const run of workflowRuns) {
    if (run.name === CONFIG.workflowName && run.head_sha === headSha) {
      targetRun = run;
      break;
    }
  }
  if (!targetRun) {
    // 如果没有精确匹配，取最近的 CI 运行
    for (const run of workflowRuns) {
      if (run.name === CONFIG.workflowName) {
        targetRun = run;
        console.log(`⚠️ 未找到精确匹配的 commit，使用最新 CI run (sha: ${run.head_sha.substring(0, 7)})`);
        break;
      }
    }
  }
  if (!targetRun) {
    console.error('❌ 未找到任何 CI workflow run');
    process.exit(1);
  }

  const runId = targetRun.id;
  console.log(`✅ CI Run #${runId}:`);
  console.log(`   URL: ${targetRun.html_url}`);
  console.log(`   SHA: ${targetRun.head_sha}`);
  console.log(`   状态: ${targetRun.status} / ${targetRun.conclusion || '进行中...'}`);
  console.log('');

  // 3. 等待 CI 完成
  if (!options.noWait && (targetRun.status === 'in_progress' || targetRun.status === 'queued' || targetRun.status === 'pending')) {
    console.log(`⏳ 等待 CI 完成 (超时: ${options.timeout}s, 轮询: ${CONFIG.pollInterval}s)...`);
    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed >= options.timeout) {
        console.log(`\n⚠️ 超时 (${options.timeout}s)。CI 可能仍在运行，继续处理...`);
        break;
      }

      await sleep(CONFIG.pollInterval * 1000);
      pollCount++;

      let currentRun;
      try {
        currentRun = await githubRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}`);
      } catch (e) {
        console.log(`   [轮询 ${pollCount}] API 错误: ${e.message}, 继续等待...`);
        continue;
      }

      const status = currentRun.status;
      const conclusion = currentRun.conclusion;
      const elapsedStr = `${elapsed}s`;

      if (status === 'completed') {
        console.log(`   [轮询 ${pollCount}, ${elapsedStr}] ✅ 完成: ${conclusion}`);
        targetRun = currentRun;
        break;
      } else {
        console.log(`   [轮询 ${pollCount}, ${elapsedStr}] 状态: ${status}...`);
      }
    }
  } else if (targetRun.status === 'completed') {
    console.log('✅ CI 已完成，直接处理。');
  }

  // 4. 获取 job 状态摘要
  console.log('\n📊 CI Job 摘要:');
  try {
    const jobs = await githubRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/jobs`);
    if (jobs.jobs) {
      for (const job of jobs.jobs) {
        const icon = job.conclusion === 'success' ? '✅' 
                    : job.conclusion === 'failure' ? '❌'
                    : job.conclusion === 'skipped' ? '⏭️'
                    : '⏳';
        const duration = job.completed_at && job.started_at
          ? ` (${Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000)}s)`
          : '';
        console.log(`   ${icon} ${job.name}: ${job.conclusion || job.status}${duration}`);
      }
    }
  } catch (e) {
    console.warn(`   ⚠️ 无法获取 job 详情: ${e.message}`);
  }

  // 4.5 回取失败 job 的原始日志
  if (options.fetchLogs) {
    console.log('\n📝 回取失败 job 的原始日志...');
    try {
      const jobsData = await githubRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/jobs`);
      const allJobs = jobsData.jobs || [];
      const failedJobs = allJobs.filter(j => j.conclusion === 'failure');

      if (failedJobs.length === 0) {
        console.log('   ✅ 无失败 job，跳过日志回取');
      } else {
        const logsDir = resolve(CONFIG.pipelineDir, 'ci-logs');
        if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

        for (const job of failedJobs) {
          try {
            console.log(`   获取 ${job.name} 日志 (job_id: ${job.id})...`);
            const logText = await fetchJobLog(job.id);
            if (logText && logText.length > 0) {
              // 保存完整日志
              const logPath = resolve(logsDir, `${job.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.log`);
              writeFileSync(logPath, logText, 'utf-8');
              console.log(`   ✅ 已保存: ci-logs/${basename(logPath)} (${(logText.length / 1024).toFixed(0)} KB)`);

              // 提取关键失败行到摘要
              const failLines = extractFailureLines(logText);
              if (failLines.length > 0) {
                console.log(`   🔴 失败摘要 (${failLines.length} 行):`);
                failLines.slice(0, 12).forEach(l => console.log(`      ${l}`));
                if (failLines.length > 12) console.log(`      ... 还有 ${failLines.length - 12} 行`);
              }
            }
          } catch (e) {
            console.warn(`   ⚠️ ${job.name} 日志获取失败: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`   ⚠️ 日志回取异常: ${e.message}`);
    }
  }

  // 5. 下载 vitest artifacts
  if (!options.skipDownload) {
    console.log('\n📥 下载 CI vitest 报告...');
    try {
      const artifacts = await githubRequest(`/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/artifacts`);
      const artifactList = artifacts.artifacts || [];

      // 确保 pipeline 目录存在
      if (!existsSync(CONFIG.pipelineDir)) {
        mkdirSync(CONFIG.pipelineDir, { recursive: true });
      }

      let downloadedCount = 0;
      for (const artName of CONFIG.artifactNames) {
        const art = artifactList.find(a => a.name === artName);
        if (!art) {
          console.log(`   ⚠️ artifact "${artName}" 不在该 run 中（可能被 skip）`);
          continue;
        }
        console.log(`   下载 ${artName} (${(art.size_in_bytes / 1024).toFixed(0)} KB)...`);

        const zipPath = resolve(CONFIG.pipelineDir, `_${artName}.zip`);
        await downloadArtifact(art.archive_download_url, zipPath);

        if (existsSync(zipPath)) {
          extractSingleFileZip(zipPath, CONFIG.pipelineDir);
          // 清理 zip 文件
          try { require('fs').unlinkSync(zipPath); } catch {}
          console.log(`   ✅ ${artName} → docs/pipeline/`);
          downloadedCount++;
        }
      }
      console.log(`   共下载 ${downloadedCount}/${CONFIG.artifactNames.length} 个 artifact`);
    } catch (e) {
      console.warn(`   ⚠️ artifact 下载失败: ${e.message}`);
      console.warn('   将使用本地 fallback 数据继续...');
    }
  }

  // 6. git pull 获取 CI-synced 管线数据
  console.log('\n🔄 git pull 获取 CI 同步的管线数据...');
  try {
    const result = execSync('git pull --no-edit', { 
      cwd: ROOT, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    // 提取关键信息
    const changed = (result.match(/(\d+) file.*changed/) || [])[0] || '无变更';
    console.log(`   ${changed.trim()}`);
    console.log('   ✅ git pull 完成');
  } catch (e) {
    const msg = e.stderr || e.stdout || e.message;
    // 检查是否为 "Already up to date"
    if (msg.includes('Already up to date') || msg.includes('已经是最新的')) {
      console.log('   ℹ️ 已是最新');
    } else if (msg.includes('error: cannot pull') && msg.includes('Need to specify')) {
      // 需要指定 merge/rebase
      try {
        execSync('git pull --no-edit --no-rebase', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
        console.log('   ✅ git pull (no-rebase) 完成');
      } catch (e2) {
        console.warn('   ⚠️ git pull 失败: ' + (e2.stderr || e2.message || '').split('\n')[0]);
      }
    } else {
      console.warn('   ⚠️ git pull 异常: ' + msg.split('\n')[0]);
    }
  }

  // 7. 验证下载的 vitest 文件
  console.log('\n📋 验证 vitest 报告文件:');
  for (const artName of CONFIG.artifactNames) {
    const filePath = resolve(CONFIG.pipelineDir, `_${artName}.json`);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const report = JSON.parse(raw);
        const total = report.numTotalTests || report.testResults?.length || '?';
        const passed = report.numPassedTests ?? '?';
        const failed = report.numFailedTests ?? '?';
        const sizeKB = (Buffer.byteLength(raw) / 1024).toFixed(0);
        console.log(`   ✅ _${artName}.json: ${sizeKB} KB, ${total}T / ${passed}P / ${failed}F`);
      } catch {
        console.log(`   ⚠️ _${artName}.json 解析失败`);
      }
    } else {
      console.log(`   ⚪ _${artName}.json 不存在（将用本地 fallback）`);
    }
  }

  console.log('\n========================================');
  console.log('CI 数据回取完成: ' + new Date().toLocaleString());
  console.log('========================================');
}

/** 下载 URL 到文件 */
function downloadArtifact(url, destPath) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const token = loadToken();

    const makeRequest = (fullUrl) => {
      const urlObj2 = new URL(fullUrl);
      https.get(urlObj2, {
        headers: {
          'Authorization': `token ${token}`,
          'User-Agent': 'EasyAgent-CI-Sync/1.0',
        },
      }, (res) => {
        // 处理重定向
        if (res.statusCode === 302 || res.statusCode === 301) {
          makeRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }
        // 处理压缩响应
        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = res.pipe(zlib.createInflate());
        }

        const fileStream = createWriteStream(destPath);
        stream.pipe(fileStream);
        fileStream.on('finish', () => resolve());
        fileStream.on('error', reject);
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 执行 =====
main().catch(e => {
  console.error(`\n❌ 致命错误: ${e.message}`);
  console.error(e.stack?.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
