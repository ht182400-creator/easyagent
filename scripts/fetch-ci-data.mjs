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
import { createLogger } from './lib/logger.mjs';

const log = createLogger('fetch-ci');
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
  pollInterval: 30,
};

// ===== CLI 参数 =====
const args = process.argv.slice(2);
const options = {
  timeout: 600,
  noWait: false,
  skipDownload: false,
  fetchLogs: true,
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
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const tokenPath = resolve(__dirname, '.release_token');
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, 'utf-8').trim();
  }
  throw new Error(
    '未找到 GitHub Token。请设置 GITHUB_TOKEN 环境变量或创建 scripts/.release_token 文件',
  );
}

/** GitHub API 请求 */
function githubRequest(path) {
  return new Promise((resolve, reject) => {
    const token = loadToken();
    const url = new URL(path, `https://api.github.com`);
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: url.pathname + url.search,
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'EasyAgent-CI-Sync/1.0',
        },
      },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          resolve(githubRequest(redirectUrl));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      },
    );
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
  try {
    const psCmd = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    execSync(`powershell -NoProfile -Command "${psCmd}"`, { stdio: 'pipe' });
    return true;
  } catch (e) {
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'pipe' });
      return true;
    } catch {
      log.error('解压失败: 缺少 PowerShell 或 tar 命令');
      return false;
    }
  }
}

/** 获取 job 原始日志文本 */
function fetchJobLog(jobId) {
  return new Promise((resolve, reject) => {
    const token = loadToken();
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/jobs/${jobId}/logs`,
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'EasyAgent-CI-Sync/1.0',
        },
      },
      (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location;
          https
            .get(redirectUrl, (res2) => {
              let data = '';
              res2.on('data', (c) => {
                data += c;
              });
              res2.on('end', () => resolve(data));
              res2.on('error', reject);
            })
            .on('error', reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => resolve(data));
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    req.end();
  });
}

/** 从原始日志中提取失败相关行 */
function extractFailureLines(logText) {
  const lines = logText.split('\n');
  const result = [];
  let inFailureBlock = false;

  for (const line of lines) {
    const clean = line
      .replace(/\x1b\[\d+(;\d+)*m/g, '')
      .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z\s*/, '');

    if (clean.includes('FAIL ') && (clean.includes('.test.') || clean.includes('__tests__'))) {
      result.push(clean.trim());
      inFailureBlock = true;
      continue;
    }
    if (clean.includes('Error: Test timed out') || clean.includes('Error: Timeout')) {
      result.push(clean.trim());
      inFailureBlock = true;
      continue;
    }
    if (clean.includes('Error: ') && (clean.includes('.ts') || clean.includes('.test'))) {
      result.push(clean.trim());
      inFailureBlock = true;
      continue;
    }
    if (
      inFailureBlock &&
      (clean.includes('AssertionError') ||
        clean.includes('Expected') ||
        clean.includes('Received') ||
        clean.includes('× ') ||
        clean.includes('✕ ') ||
        clean.match(/^\s{2,}(Expected|Received|at\s)/))
    ) {
      result.push(clean.trim());
      continue;
    }
    if (inFailureBlock && clean.trim() === '' && result.length > 0) {
      inFailureBlock = false;
    }
  }

  return result;
}

// ===== 主流程 =====

async function main() {
  log.title('CI 数据回取');

  // 1. 获取当前 commit
  const headSha = getHeadSha();
  log.info(`当前 HEAD: ${headSha?.substring(0, 7)}`);

  // 2. 查找对应的 CI workflow run
  log.info('查找 CI workflow run...');
  let runs;
  try {
    runs = await githubRequest(
      `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?branch=${CONFIG.branch}&event=push&per_page=10`,
    );
  } catch (e) {
    log.error(`无法访问 GitHub API: ${e.message}`);
    process.exit(1);
  }

  let targetRun = null;
  const workflowRuns = runs.workflow_runs || [];
  for (const run of workflowRuns) {
    if (run.name === CONFIG.workflowName && run.head_sha === headSha) {
      targetRun = run;
      break;
    }
  }
  if (!targetRun) {
    for (const run of workflowRuns) {
      if (run.name === CONFIG.workflowName) {
        targetRun = run;
        log.warn(`未找到精确匹配的 commit，使用最新 CI run (sha: ${run.head_sha.substring(0, 7)})`);
        break;
      }
    }
  }
  if (!targetRun) {
    log.error('未找到任何 CI workflow run');
    process.exit(1);
  }

  const runId = targetRun.id;
  log.ok(`CI Run #${runId}:`);
  log.info(`  URL: ${targetRun.html_url}`);
  log.info(`  SHA: ${targetRun.head_sha}`);
  log.info(`  状态: ${targetRun.status} / ${targetRun.conclusion || '进行中...'}`);

  // 3. 等待 CI 完成
  if (
    !options.noWait &&
    (targetRun.status === 'in_progress' ||
      targetRun.status === 'queued' ||
      targetRun.status === 'pending')
  ) {
    log.info(`等待 CI 完成 (超时: ${options.timeout}s, 轮询: ${CONFIG.pollInterval}s)...`);
    const startTime = Date.now();
    let pollCount = 0;

    while (true) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      if (elapsed >= options.timeout) {
        log.warn(`超时 (${options.timeout}s)。CI 可能仍在运行，继续处理...`);
        break;
      }

      await sleep(CONFIG.pollInterval * 1000);
      pollCount++;

      let currentRun;
      try {
        currentRun = await githubRequest(
          `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}`,
        );
      } catch (e) {
        log.debug(`[轮询 ${pollCount}] API 错误: ${e.message}, 继续等待...`);
        continue;
      }

      const status = currentRun.status;
      const conclusion = currentRun.conclusion;
      const elapsedStr = `${elapsed}s`;

      if (status === 'completed') {
        log.ok(`[轮询 ${pollCount}, ${elapsedStr}] 完成: ${conclusion}`);
        targetRun = currentRun;
        break;
      } else {
        log.debug(`[轮询 ${pollCount}, ${elapsedStr}] 状态: ${status}...`);
      }
    }
  } else if (targetRun.status === 'completed') {
    log.ok('CI 已完成，直接处理。');
  }

  // 4. 获取 job 状态摘要
  log.info('CI Job 摘要:');
  try {
    const jobs = await githubRequest(
      `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/jobs`,
    );
    if (jobs.jobs) {
      for (const job of jobs.jobs) {
        const icon =
          job.conclusion === 'success'
            ? '✅'
            : job.conclusion === 'failure'
              ? '❌'
              : job.conclusion === 'skipped'
                ? '⏭️'
                : '⏳';
        const duration =
          job.completed_at && job.started_at
            ? ` (${Math.round((new Date(job.completed_at) - new Date(job.started_at)) / 1000)}s)`
            : '';
        log.info(`  ${icon} ${job.name}: ${job.conclusion || job.status}${duration}`);
      }
    }
  } catch (e) {
    log.warn(`  无法获取 job 详情: ${e.message}`);
  }

  // 4.5 回取失败 job 的原始日志
  if (options.fetchLogs) {
    log.info('回取失败 job 的原始日志...');
    try {
      const jobsData = await githubRequest(
        `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/jobs`,
      );
      const allJobs = jobsData.jobs || [];
      const failedJobs = allJobs.filter((j) => j.conclusion === 'failure');

      if (failedJobs.length === 0) {
        log.ok('无失败 job，跳过日志回取');
      } else {
        const logsDir = resolve(CONFIG.pipelineDir, 'ci-logs');
        if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

        for (const job of failedJobs) {
          try {
            log.info(`  获取 ${job.name} 日志 (job_id: ${job.id})...`);
            const logText = await fetchJobLog(job.id);
            if (logText && logText.length > 0) {
              const logPath = resolve(logsDir, `${job.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.log`);
              writeFileSync(logPath, logText, 'utf-8');
              log.ok(
                `  已保存: ci-logs/${basename(logPath)} (${(logText.length / 1024).toFixed(0)} KB)`,
              );

              const failLines = extractFailureLines(logText);
              if (failLines.length > 0) {
                log.warn(`  失败摘要 (${failLines.length} 行):`);
                failLines.slice(0, 12).forEach((l) => log.warn(`      ${l}`));
                if (failLines.length > 12) log.warn(`      ... 还有 ${failLines.length - 12} 行`);
              }
            }
          } catch (e) {
            log.warn(`  ${job.name} 日志获取失败: ${e.message}`);
          }
        }
      }
    } catch (e) {
      log.warn(`  日志回取异常: ${e.message}`);
    }
  }

  // 5. 下载 vitest artifacts
  if (!options.skipDownload) {
    log.info('下载 CI vitest 报告...');
    try {
      const artifacts = await githubRequest(
        `/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/artifacts`,
      );
      const artifactList = artifacts.artifacts || [];

      if (!existsSync(CONFIG.pipelineDir)) {
        mkdirSync(CONFIG.pipelineDir, { recursive: true });
      }

      let downloadedCount = 0;
      for (const artName of CONFIG.artifactNames) {
        const art = artifactList.find((a) => a.name === artName);
        if (!art) {
          log.warn(`  artifact "${artName}" 不在该 run 中（可能被 skip）`);
          continue;
        }
        log.info(`  下载 ${artName} (${(art.size_in_bytes / 1024).toFixed(0)} KB)...`);

        const zipPath = resolve(CONFIG.pipelineDir, `_${artName}.zip`);
        await downloadArtifact(art.archive_download_url, zipPath);

        if (existsSync(zipPath)) {
          extractSingleFileZip(zipPath, CONFIG.pipelineDir);
          try {
            require('fs').unlinkSync(zipPath);
          } catch {}
          log.ok(`  ${artName} → docs/pipeline/`);
          downloadedCount++;
        }
      }
      log.info(`  共下载 ${downloadedCount}/${CONFIG.artifactNames.length} 个 artifact`);
    } catch (e) {
      log.warn(`  artifact 下载失败: ${e.message}`);
      log.warn('  将使用本地 fallback 数据继续...');
    }
  }

  // 6. git pull 获取 CI-synced 管线数据
  log.info('git pull 获取 CI 同步的管线数据...');
  try {
    const result = execSync('git pull --no-edit', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });
    const changed = (result.match(/(\d+) file.*changed/) || [])[0] || '无变更';
    log.info(`  ${changed.trim()}`);
    log.ok('git pull 完成');
  } catch (e) {
    const msg = e.stderr || e.stdout || e.message;
    if (msg.includes('Already up to date') || msg.includes('已经是最新的')) {
      log.info('  已是最新');
    } else if (msg.includes('error: cannot pull') && msg.includes('Need to specify')) {
      try {
        execSync('git pull --no-edit --no-rebase', { cwd: ROOT, stdio: 'pipe', timeout: 30000 });
        log.ok('git pull (no-rebase) 完成');
      } catch (e2) {
        log.warn('  git pull 失败: ' + (e2.stderr || e2.message || '').split('\n')[0]);
      }
    } else {
      log.warn('  git pull 异常: ' + msg.split('\n')[0]);
    }
  }

  // 7. 验证下载的 vitest 文件
  log.info('验证 vitest 报告文件:');
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
        log.ok(`  _${artName}.json: ${sizeKB} KB, ${total}T / ${passed}P / ${failed}F`);
      } catch {
        log.warn(`  _${artName}.json 解析失败`);
      }
    } else {
      log.info(`  _${artName}.json 不存在（将用本地 fallback）`);
    }
  }

  log.ok('CI 数据回取完成');
}

/** 下载 URL 到文件 */
function downloadArtifact(url, destPath) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const token = loadToken();

    const makeRequest = (fullUrl) => {
      const urlObj2 = new URL(fullUrl);
      https
        .get(
          urlObj2,
          {
            headers: {
              Authorization: `token ${token}`,
              'User-Agent': 'EasyAgent-CI-Sync/1.0',
            },
          },
          (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              makeRequest(res.headers.location);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
              return;
            }
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
          },
        )
        .on('error', reject);
    };

    makeRequest(url);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== 执行 =====
main().catch((e) => {
  log.error(`致命错误: ${e.message}`);
  log.debug('堆栈:', e.stack?.split('\n').slice(0, 3).join('\n'));
  process.exit(1);
});
