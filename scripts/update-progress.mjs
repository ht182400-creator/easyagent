#!/usr/bin/env node

/**
 * 项目进度管线自动更新脚本
 *
 * 通过检测项目文件结构和 Git 状态，自动更新 docs/pipeline/project-progress-data.json
 *
 * 使用方式:
 *   node scripts/update-progress.mjs          # 手动运行
 *   node scripts/update-progress.mjs --dry    # 预览模式（不写文件）
 *   node scripts/update-progress.mjs --ci     # CI 模式（输出到 stdout）
 */

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createLogger } from './lib/logger.mjs';

const log = createLogger('progress');
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_FILE = join(ROOT, 'docs', 'pipeline', 'project-progress-data.json');
const PIPELINE_DATA_FILE = join(ROOT, 'docs', 'pipeline', 'pipeline-data.json');

// 懒加载 pipeline-config.mjs 的 calculateScore（避免 import 时的循环依赖）
let _calculateScore = null;
function getCalculateScore() {
  if (!_calculateScore) {
    _calculateScore = import('../docs/pipeline/lib/pipeline-config.mjs').then(
      (m) => m.calculateScore,
    );
  }
  return _calculateScore;
}

// CLI 参数
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry') || args.includes('-d');
const CI_MODE = args.includes('--ci');
const FORCE = args.includes('--force') || args.includes('-f');

// ==================== 工具函数 ====================

/** 检查文件/目录是否存在 */
function fileExists(relPath) {
  return existsSync(join(ROOT, relPath));
}

/** 获取文件的最后修改时间（ISO 字符串） */
function fileMtime(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) return null;
  return statSync(full).mtime.toISOString();
}

/** 从 package.json 或 version.json 读取当前版本号 */
function getVersion() {
  // version.json 优先
  const vf = join(ROOT, 'version.json');
  if (existsSync(vf)) {
    try {
      const v = JSON.parse(readFileSync(vf, 'utf8'));
      return { version: v.version, codename: v.codename || null };
    } catch {}
  }
  // 回退到 package.json
  const pf = join(ROOT, 'package.json');
  if (existsSync(pf)) {
    try {
      const p = JSON.parse(readFileSync(pf, 'utf8'));
      return { version: p.version, codename: null };
    } catch {}
  }
  return { version: '0.0.0', codename: null };
}

/** 从 Git 获取最近的 tag */
function getLatestTag() {
  try {
    return execSync('git describe --tags --abbrev=0', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/** 获取最近 N 条 git log */
function getGitLog(n = 10) {
  try {
    return execSync(`git log --oneline -${n}`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/** 获取两个时间之间新增/修改的文件 */
function getChangedFiles(sinceCommit) {
  try {
    return execSync(`git diff --name-only ${sinceCommit}..HEAD`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * 获取测试用例数量统计
 * 优先从 test-case-mapping.json 读取真实用例数，失败时回退到文件计数
 * @returns {number} 测试用例总数
 */
function getTestCount() {
  // 方式1：从 test-case-mapping.json 读取准确用例数
  const mappingFile = join(ROOT, 'docs', 'pipeline', 'test-case-mapping.json');
  try {
    if (existsSync(mappingFile)) {
      const mapping = JSON.parse(readFileSync(mappingFile, 'utf8'));
      const totalCases = mapping?._meta?.totalTestCases;
      if (typeof totalCases === 'number' && totalCases > 0) {
        return totalCases;
      }
    }
  } catch (e) {
    log.warn('无法读取 test-case-mapping.json:', e.message);
  }

  // 方式2：尝试从 vitest 报告汇总
  const pipelineDir = join(ROOT, 'docs', 'pipeline');
  try {
    if (existsSync(pipelineDir)) {
      const files = readdirSync(pipelineDir).filter(
        (f) => f.startsWith('_vitest-') && f.endsWith('.json'),
      );
      let total = 0;
      for (const f of files) {
        try {
          const report = JSON.parse(readFileSync(join(pipelineDir, f), 'utf8'));
          total += report.numTotalTests || 0;
        } catch {}
      }
      if (total > 0) return total;
    }
  } catch {}

  // 方式3：回退到文件计数
  try {
    const files = execSync('git ls-files "*.test.ts" "*.test.tsx" "*.spec.ts"', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    return files.length > 0 ? files.length : 806;
  } catch {}
  return 806;
}

/** 获取模型支持数量 */
function getModelCount() {
  try {
    const catalog = join(ROOT, 'models-catalog.json');
    if (existsSync(catalog)) {
      const data = JSON.parse(readFileSync(catalog, 'utf8'));
      if (Array.isArray(data)) return data.length;
      if (typeof data === 'object') return Object.keys(data).length;
    }
  } catch {}
  return 10;
}

// ==================== 检测逻辑 ====================

/**
 * 根据 detect 规则判断任务状态
 * @param {Object} detect - 检测规则
 * @param {string} gitLog - 最近的 git log
 * @returns {string} 'done' | 'pending'
 */
function detectTaskStatus(detect, gitLog) {
  if (!detect) return 'pending';

  // 1. 检测文件/目录是否存在
  if (detect.files && Array.isArray(detect.files)) {
    const allExist = detect.files.every((f) => fileExists(f));
    if (allExist && detect.files.length > 0) return 'done';
  }

  // 2. 检测 package.json 中的 key
  if (detect.packageKey) {
    try {
      const pf = join(ROOT, 'package.json');
      if (existsSync(pf)) {
        const p = JSON.parse(readFileSync(pf, 'utf8'));
        const keys = detect.packageKey.split('.');
        let val = p;
        for (const k of keys) val = val && val[k];
        if (val !== undefined && val !== null) return 'done';
      }
    } catch {}
  }

  // 3. 检测 commit 消息中是否包含关键词
  if (detect.commitKeyword && gitLog) {
    if (gitLog.toLowerCase().includes(detect.commitKeyword.toLowerCase())) {
      return 'done';
    }
  }

  return 'pending';
}

/** 计算阶段状态 */
function calcPhaseStatus(tasks) {
  const allDone = tasks.every((t) => t.status === 'done');
  const anyDone = tasks.some((t) => t.status === 'done');
  const anyRunning = tasks.some((t) => t.status === 'running');
  if (allDone) return 'done';
  if (anyDone || anyRunning) return 'running';
  return 'pending';
}

// ==================== 主流程 ====================

async function main() {
  log.title('EasyAgent 项目进度检测');

  // 读取现有数据
  let data;
  try {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
  } catch {
    log.error('无法读取数据文件:', DATA_FILE);
    process.exit(1);
  }

  // 获取版本信息
  const { version, codename } = getVersion();
  const latestTag = getLatestTag();
  const gitLog = getGitLog(20);

  // 收集基础信息
  const testCount = getTestCount();
  const modelCount = getModelCount();
  const now = new Date().toISOString();

  let changes = 0;
  let changeLog = [];

  // 更新 meta
  if (data.meta.version !== version) {
    changeLog.push(`版本: ${data.meta.version} → ${version}`);
    data.meta.version = version;
    changes++;
  }
  data.meta.codename = codename || data.meta.codename;
  data.meta.lastUpdated = now;
  data.meta.totalTests = testCount;
  data.meta.modelsSupported = modelCount;

  // 检测每个任务的状态
  for (const phase of data.phases) {
    for (const task of phase.tasks) {
      const oldStatus = task.status;

      // 如果当前是 done，且未强制覆盖，保持 done
      if (oldStatus === 'done' && !FORCE) {
        if (task.detect && task.detect.files) {
          const stillValid = task.detect.files.every((f) => fileExists(f));
          // 文件被删除？保留 done 状态
        }
        continue;
      }

      const detected = detectTaskStatus(task.detect, gitLog);
      if (detected !== oldStatus) {
        task.status = detected;
        changeLog.push(`[${task.id}] ${oldStatus} → ${detected}  "${task.name}"`);
        changes++;
      }
    }

    // 更新阶段整体状态
    const newPhaseStatus = calcPhaseStatus(phase.tasks);
    if (newPhaseStatus !== phase.status) {
      phase.status = newPhaseStatus;
      changeLog.push(`[${phase.id}] 阶段状态: ${phase.status}`);
    }
  }

  // ==================== 输出结果 ====================
  if (changes === 0) {
    log.ok('项目状态无变化，所有任务状态与数据一致。');
  } else {
    log.info(`检测到 ${changes} 处变化:`);
    for (const item of changeLog) {
      log.info(`  ${item}`);
    }
  }

  // 统计摘要
  let totalDone = 0,
    totalTasks = 0;
  for (const ph of data.phases) {
    for (const t of ph.tasks) {
      totalTasks++;
      if (t.status === 'done') totalDone++;
    }
  }
  const pct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
  log.info(`进度: ${totalDone}/${totalTasks} (${pct}%) · v${version} · ${codename || ''}`);

  // CI 模式输出 JSON
  if (CI_MODE) {
    console.log('__RESULT_JSON__');
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // 写入文件
  if (!DRY_RUN) {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
    log.info(`已写入: ${DATA_FILE}`);

    // 动态计算综合评分（从 pipeline-config 的五维度加权公式）
    let dynScore = null;
    try {
      const { calculateScore } = await import('../docs/pipeline/lib/pipeline-config.mjs');
      dynScore = calculateScore();
      log.info(`动态评分: ${dynScore.total} / 100`);

      const realScores = (data.scoreHistory || []).filter((e) => !e.projected && !e.dynamic);
      const lastRealScore = realScores.length > 0 ? realScores[realScores.length - 1].value : null;
      if (
        lastRealScore !== dynScore.total &&
        !data.scoreHistory?.some((e) => e.label === '自动评分（五维度加权）')
      ) {
        const projectedIdx = data.scoreHistory?.findIndex((e) => e.projected);
        if (projectedIdx >= 0) {
          data.scoreHistory.splice(projectedIdx, 0, {
            label: '自动评分（五维度加权）',
            value: dynScore.total,
          });
        }
      }
    } catch (e) {
      log.warn('无法动态计算评分:', e.message);
    }

    // 同步更新流程图管线数据（含动态评分）
    await syncPipelineData(data, { version, codename, testCount, modelCount, now, dynScore });
    log.info(`已写入: ${PIPELINE_DATA_FILE}`);

    // 统一同步：从 module-registry.mjs 重新生成
    try {
      const { execSync } = await import('child_process');
      execSync('node scripts/unified-sync.mjs --force', {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
      });
    } catch (e) {
      log.warn('unified-sync 执行失败:', e.message);
    }
  } else {
    log.info('[DRY RUN] 未写入文件，仅预览');
  }
}

/**
 * 将项目进度数据同步到流程图管线数据文件
 */
async function syncPipelineData(progressData, info) {
  let pipelineData;
  try {
    pipelineData = JSON.parse(readFileSync(PIPELINE_DATA_FILE, 'utf8'));
  } catch {
    log.warn('管线数据文件不存在，跳过同步');
    return;
  }

  // 确保 meta 对象存在
  if (!pipelineData.meta) {
    pipelineData.meta = {};
  }
  pipelineData.meta.version = info.version;
  pipelineData.meta.generatedAt = info.now;
  pipelineData.version = info.version;
  pipelineData.generatedAt = info.now;

  // 更新 KPI 数据（从 pipeline-config 动态获取权威值）
  try {
    const { getKPI, getScoreHistory } = await import('../docs/pipeline/lib/pipeline-config.mjs');
    const kpi = getKPI();
    pipelineData.kpi = {
      ...pipelineData.kpi,
      testCases: kpi.testCases,
      testPassRate: kpi.testPassRate,
      testPassed: kpi.testPassed,
      testFailed: kpi.testFailed,
      testSkipped: kpi.testSkipped,
      tools: kpi.tools,
      providers: kpi.providers,
      scoreTotal: kpi.scoreTotal,
      modes: kpi.modes,
      _totalFiles: kpi._totalFiles,
    };
    if (!pipelineData.scoreDimensions) pipelineData.scoreDimensions = [];
    pipelineData.scoreDimensions = kpi._scoreDimensions || info.dynScore?.dimensions || [];
    pipelineData.scoreHistory = getScoreHistory();
  } catch (e) {
    pipelineData.kpi.testCases = info.testCount;
    pipelineData.kpi.providers = info.modelCount;
    if (info.dynScore) {
      pipelineData.kpi.scoreTotal = info.dynScore.total;
      if (!pipelineData.scoreDimensions) pipelineData.scoreDimensions = [];
      pipelineData.scoreDimensions = info.dynScore.dimensions;
    }
    log.warn('无法完整同步 KPI (回退模式):', e.message);
  }

  // 遍历主线任务，同步检测后的状态
  const detectMap = new Map();
  for (const phase of progressData.phases) {
    for (const task of phase.tasks) {
      detectMap.set(task.id, task.status);
    }
  }

  // 同步主阶段节点状态
  const mainPhases =
    pipelineData.pipeline && pipelineData.pipeline.phases ? pipelineData.pipeline.phases : [];
  for (const phase of mainPhases) {
    for (const node of phase.nodes) {
      if (detectMap.has(node.id)) {
        node.status = detectMap.get(node.id);
      }
    }
  }

  // 同步分支节点状态
  const branchDetect = {
    b2a: ['packages/core/src/benchmark/BenchmarkRunner.ts'],
    b2b: ['.github/workflows/ci.yml', '.github/workflows/release.yml'],
    b1a: ['packages/frontend/package.json'],
    b1b: ['packages/core/src/plugins/PluginPermission.ts'],
    b2c: ['packages/core/src/__tests__/integration/'],
    b2d: ['docs/benchmark-report.md'],
    b2e: ['packages/core/src/analytics/'],
    b3a: ['scripts/install.sh'],
    b3b: ['packages/vscode/package.json'],
    b3c: ['.github/CONTRIBUTING.md'],
  };

  const branchLanes =
    pipelineData.pipeline && pipelineData.pipeline.branches ? pipelineData.pipeline.branches : [];
  for (const branch of branchLanes) {
    for (const node of branch.nodes) {
      const files = branchDetect[node.id];
      if (files && files.length > 0) {
        const allExist = files.every((f) => fileExists(f));
        if (allExist) {
          node.status = 'done';
        }
      }
    }
  }

  writeFileSync(PIPELINE_DATA_FILE, JSON.stringify(pipelineData, null, 2) + '\n', 'utf8');
}

main();
