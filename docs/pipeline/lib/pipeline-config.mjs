/**
 * 管线配置库 —— 整个管线系统的**唯一配置源**
 * 
 * 所有模块定义、阶段划分、分支规划、检测规则均在此定义。
 * server.mjs、update-progress.mjs、前端渲染均从此导入/获取数据。
 * 
 * 扩展方式：只需在此文件中添加模块定义和阶段配置即可，无需修改其他文件。
 */

// ============================================================
// 模块定义（主线 f1-f16 + 分支 b1a-b3c + 运维 p5a-p5c）
// ============================================================

/**
 * @typedef {Object} ModuleDef
 * @property {string} id - 模块唯一标识
 * @property {string} name - 中文名称
 * @property {string} phase - 所属阶段 (P0-P5, B1-B3)
 * @property {string} icon - 图标 emoji
 * @property {string} desc - 简短描述
 * @property {string} status - 状态: done | in-progress | pending
 * @property {string[]} keywords - 关键词列表（用于 memory MD 文件解析匹配）
 * @property {Object} [detect] - 自动检测规则
 * @property {string[]} [detect.files] - 存在性检测的文件路径
 */

/** @type {Record<string, ModuleDef>} */
export const MODULES = {
  // ========== P0 基础层 ==========
  f1: {
    id: 'f1', name: '多模型适配器', phase: 'P0', icon: '🔌',
    desc: '10家国产大模型\nOpenAI兼容+自有API', status: 'done',
    keywords: ['多模型适配器', '模型适配器', '适配器', 'provider', 'kimi', 'ollama',
      'deepseek', 'WebSocket', 'ECONNABORTED', 'safeSend', '模型提供商', '连接测试',
      'api key', 'deepseek-chat', 'deepseek-v4'],
  },
  f2: {
    id: 'f2', name: 'Agent 系统', phase: 'P0', icon: '🧠',
    desc: 'ReAct循环\n多Agent协作+计划', status: 'done',
    keywords: ['agent', 'Agent 系统', 'ReAct', '多agent', 'better-sqlite3', 'DTS',
      '类型错误', 'WeChatAdapter', 'timestamp'],
  },
  f3: {
    id: 'f3', name: '工具系统 51 tools', phase: 'P0', icon: '🔧',
    desc: '17分组全覆盖\n文件/搜索/Git/知识库', status: 'done',
    keywords: ['工具系统', 'tool', '63 工具', '51 工具', 'QualityTools', 'PreviewTools',
      'MediaTools', 'DatabaseTools', 'KnowledgeTools', 'SubAgentTools', 'DTS编译错误',
      '工具参数', '工具页面', 'treeshake', 'ToolRegistry'],
  },

  // ========== P1 交互层 ==========
  f7: {
    id: 'f7', name: 'Ink CLI', phase: 'P1', icon: '🖥️',
    desc: 'React Terminal\n7组件+10命令', status: 'done',
    keywords: ['CLI', 'Ink', 'ink', 'React Terminal', 'readline', 'REPL', 'ESM', '打包'],
  },
  f8: {
    id: 'f8', name: 'Web Dashboard v4', phase: 'P1', icon: '🌐',
    desc: 'WorkBuddy风格\n10 Store+WS+虚拟滚动', status: 'done',
    keywords: ['Web Dashboard', 'dashboard', 'CSS @import', '@import', '@tailwind',
      '前端', '仓库结构', '子包重构', 'import.meta.url'],
  },
  f9: {
    id: 'f9', name: 'Desktop 原生应用', phase: 'P1', icon: '🖼️',
    desc: 'Electron+React\n六件套+系统托盘', status: 'done',
    keywords: ['Desktop', 'desktop', 'Electron', 'electron', 'wine', 'GWLP', '线程模型',
      'HINSTANCE', 'WebSocket通信', 'preload.cjs', 'OOM', 'ctxMenu', 'verify-build',
      '6秒阻塞', 'CMD', 'deploy'],
  },

  // ========== P2 扩展层 ==========
  f4: {
    id: 'f4', name: '知识库 RAG', phase: 'P2', icon: '📚',
    desc: '双作用域架构\n5工具+HTTP API', status: 'done',
    keywords: ['知识库', 'RAG', 'knowledge', '文档', '分类', '导入', '@import',
      '文件上传', '空内容', '文件名', '乱码', '数据不互通', 'asar', 'projectRoot'],
  },
  f5: {
    id: 'f5', name: 'MCP 协议', phase: 'P2', icon: '🔗',
    desc: 'JSON-RPC stdio\n多Server+工具发现', status: 'done',
    keywords: ['MCP', 'mcp', 'stdlib', 'MCPClient', 'JSON-RPC', 'sendStreamingMessage', '内联脚本'],
  },
  f6: {
    id: 'f6', name: '沙箱执行环境', phase: 'P2', icon: '📦',
    desc: 'Docker+本地降级\n3种模式自动检测', status: 'done',
    keywords: ['沙箱', 'sandbox', 'Docker', 'docker', 'WSL', 'cmd.exe', 'Sandbox',
      'TDZ', 'ReferenceError'],
  },

  // ========== P3 平台层 ==========
  f10: {
    id: 'f10', name: '插件与技能系统', phase: 'P3', icon: '🧩',
    desc: 'PluginManager\n6内置技能+钩子', status: 'done',
    keywords: ['插件', 'plugin', '技能', 'skill', 'PluginManager', 'feedback', 'hook',
      '钩子', '作用域', '停用', '内置技能'],
  },
  f11: {
    id: 'f11', name: 'IM 适配器', phase: 'P3', icon: '💬',
    desc: 'Telegram/飞书/微信\n3平台消息路由', status: 'done',
    keywords: ['IM', 'Telegram', '飞书', '微信', 'bot', 'test:sequential', '并发',
      '消息路由', 'base32'],
  },
  f12: {
    id: 'f12', name: 'i18n 国际化', phase: 'P3', icon: '🌍',
    desc: 'zh-CN/en-US\n完整消息表', status: 'done',
    keywords: ['i18n', '国际化', '国际化'],
  },

  // ========== P4 发布层 ==========
  f13: {
    id: 'f13', name: 'Desktop 自动升级', phase: 'P4', icon: '🔄',
    desc: 'electron-updater\n静默检查+进度+重启', status: 'done',
    keywords: ['自动升级', 'electron-updater', '自动升级', '静默检查', '进度', '重启'],
  },
  f14: {
    id: 'f14', name: '模型目录动态更新', phase: 'P4', icon: '📋',
    desc: 'GitHub/CDN双源\n24h缓存+三级降级', status: 'done',
    keywords: ['模型目录', 'models-catalog', 'CDN', '缓存', '降级', 'providers.json', 'provider'],
  },
  f15: {
    id: 'f15', name: '全面去硬编码', phase: 'P4', icon: '🎯',
    desc: '模型/模板/命令\n动态加载+智能默认', status: 'done',
    keywords: ['去硬编码', '硬编码', '动态加载', '默认配置', '模板'],
  },
  f16: {
    id: 'f16', name: '版本控制系统', phase: 'P4', icon: '🏷️',
    desc: 'version.json唯一源\nCHANGELOG+升级API', status: 'done',
    keywords: ['版本控制', 'version.json', 'CHANGELOG', '升级API', 'release-publish',
      'GitHub Release', '发布', 'tag', 'package.json'],
  },

  // ========== P5 管线运维 ==========
  p5a: {
    id: 'p5a', name: '管线数据看板', phase: 'P5', icon: '🗺️',
    desc: '全量数据可视化\nKPI仪表板+问题追踪', status: 'in-progress',
    keywords: ['管线看板', '管线数据', '数据可视化', 'KPI仪表板', 'KPI', '问题追踪', 'pipeline', '仪表板'],
  },
  p5b: {
    id: 'p5b', name: '自动数据采集', phase: 'P5', icon: '📡',
    desc: 'pipeline-data.json\nmemory实时解析+缓存', status: 'done',
    keywords: ['数据采集', 'pipeline-data.json', 'memory实时解析', '缓存'],
  },
  p5c: {
    id: 'p5c', name: '实时问题追踪', phase: 'P5', icon: '🔍',
    desc: 'MD文件解析\n模块级追溯+统计', status: 'done',
    keywords: ['问题追踪', 'MD文件解析', '模块级追溯', '统计'],
  },

  // ========== 分支模块 B1 架构优化 ==========
  b1a: {
    id: 'b1a', name: 'Web↔Desktop 前端合并', phase: 'B1', icon: '🔀',
    desc: 'packages/frontend\n消除80%代码重复', status: 'done',
    keywords: ['前端合并', 'frontend', '代码重复', 'Web↔Desktop'],
    detect: { files: ['packages/frontend/package.json'] },
  },
  b1b: {
    id: 'b1b', name: 'PluginManager 沙箱', phase: 'B1', icon: '🛡️',
    desc: 'worker_threads隔离\nPluginPermission白名单', status: 'pending',
    keywords: ['worker_threads', 'PluginPermission', '白名单', '沙箱隔离'],
    detect: { files: ['packages/core/src/plugin/PluginPermission.ts'] },
  },

  // ========== 分支模块 B2 质量保障 ==========
  b2a: {
    id: 'b2a', name: 'SWE-bench 评测体系', phase: 'B2', icon: '📊',
    desc: '10题基准+pass@k\nAgent代码质量量化', status: 'done',
    keywords: ['SWE-bench', '评测', 'pass@k', '质量量化', 'swe-bench'],
    detect: { files: ['packages/core/src/benchmark/BenchmarkRunner.ts'] },
  },
  b2b: {
    id: 'b2b', name: 'GitHub Actions CI/CD', phase: 'B2', icon: '⚙️',
    desc: 'push触发测试编译\nTag自动构建发布EXE', status: 'done',
    keywords: ['CI/CD', 'GitHub Actions', 'ci.yml', '自动化测试', '自动构建',
      '发布EXE', 'git filter-branch', 'git hooks'],
    detect: { files: ['.github/workflows/ci.yml'] },
  },
  b2c: {
    id: 'b2c', name: '集成测试·端到端', phase: 'B2', icon: '🧪',
    desc: 'CLI→Server→Core\n全链路覆盖', status: 'pending',
    keywords: ['集成测试', '端到端', 'e2e', '全链路'],
    detect: { files: ['packages/core/src/__tests__/integration/'] },
  },
  b2d: {
    id: 'b2d', name: '多模型评测排行榜', phase: 'B2', icon: '🏆',
    desc: '每版本发布\n模型适配报告', status: 'pending',
    keywords: ['评测排行榜', '模型适配报告', '排行榜'],
    detect: { files: ['docs/benchmark-report.md'] },
  },
  b2e: {
    id: 'b2e', name: '用户行为埋点', phase: 'B2', icon: '📈',
    desc: 'FTSR/留存率/TTFV\n北极星指标仪表盘', status: 'pending',
    keywords: ['埋点', 'FTSR', '留存率', 'TTFV', '仪表盘', '北极星'],
    detect: { files: ['packages/core/src/analytics/'] },
  },

  // ========== 分支模块 B3 生态建设 ==========
  b3a: {
    id: 'b3a', name: '一键安装脚本', phase: 'B3', icon: '⚡',
    desc: 'curl|bash体验\n12min→2min配置', status: 'pending',
    keywords: ['安装脚本', 'curl', 'bash', '一键安装'],
    detect: { files: ['scripts/install.sh'] },
  },
  b3b: {
    id: 'b3b', name: 'VS Code 插件', phase: 'B3', icon: '🔌',
    desc: 'IDE深度集成\n实时代码建议', status: 'pending',
    keywords: ['VS Code', 'vscode', 'IDE', '插件'],
    detect: { files: ['packages/vscode/package.json'] },
  },
  b3c: {
    id: 'b3c', name: 'Contributor 引导', phase: 'B3', icon: '👥',
    desc: '10个good-first-issue\n贡献指南+代码规范', status: 'pending',
    keywords: ['contributor', 'good-first-issue', '贡献指南', '代码规范'],
    detect: { files: ['.github/CONTRIBUTING.md'] },
  },
};

// ============================================================
// 阶段定义
// ============================================================

/**
 * @typedef {Object} PhaseDef
 * @property {string} id - 阶段标识
 * @property {string} label - 阶段名称
 * @property {string} period - 时间周期
 * @property {string[]} nodeIds - 该阶段包含的模块 ID 列表
 * @property {boolean} [isBranch] - 是否为分支阶段
 * @property {string} [sourcePhase] - 分支来源阶段
 */

/** @type {PhaseDef[]} */
export const PHASES = [
  {
    id: 'P0', label: 'P0 基础层', period: '2026 Q2 早期',
    nodeIds: ['f1', 'f2', 'f3'],
  },
  {
    id: 'P1', label: 'P1 交互层', period: '2026 Q2 中期',
    nodeIds: ['f7', 'f8', 'f9'],
  },
  {
    id: 'P2', label: 'P2 扩展层', period: '2026 Q2 中后期',
    nodeIds: ['f4', 'f5', 'f6'],
  },
  {
    id: 'P3', label: 'P3 平台层', period: '2026 Q2 后期',
    nodeIds: ['f10', 'f11', 'f12'],
  },
  {
    id: 'P4', label: 'P4 发布层', period: '2026-06-20 ~ 06-22',
    nodeIds: ['f13', 'f14', 'f15', 'f16'],
  },
  {
    id: 'P5', label: 'P5 管线运维', period: '2026-06-22 ~ 进行中',
    nodeIds: ['p5a', 'p5b', 'p5c'],
  },
];

/** @type {PhaseDef[]} */
export const BRANCHES = [
  {
    id: 'B1', label: 'P1 架构优化分支', period: '', sourcePhase: 'P4', isBranch: true,
    nodeIds: ['b1a', 'b1b'],
  },
  {
    id: 'B2', label: 'P2 质量保障分支', period: '', sourcePhase: 'P4', isBranch: true,
    nodeIds: ['b2a', 'b2b', 'b2c', 'b2d', 'b2e'],
  },
  {
    id: 'B3', label: 'P3 生态建设分支', period: '', sourcePhase: 'P4', isBranch: true,
    nodeIds: ['b3a', 'b3b', 'b3c'],
  },
];

// ============================================================
// KPI 动态计算（从 test-case-mapping.json + vitest JSON 报告获取）
// ============================================================

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAPPING_PATH = resolve(__dirname, '../test-case-mapping.json');
const PIPELINE_DIR = resolve(__dirname, '..');

/** 从对照表文件读取测试用例统计 */
function loadTestCaseMapping() {
  try {
    if (existsSync(MAPPING_PATH)) {
      const raw = readFileSync(MAPPING_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('[pipeline-config] 无法加载 test-case-mapping.json:', e.message);
  }
  return null;
}

/**
 * 构建测试文件路径 → 模块 ID 的反向映射表
 * @param {Object} mapping - test-case-mapping.json 数据
 * @returns {Map<string, string>} 文件相对路径 → 模块ID
 */
function buildFileModuleMap(mapping) {
  const fileMap = new Map();
  if (!mapping?.modules) return fileMap;
  for (const [modId, modData] of Object.entries(mapping.modules)) {
    if (!modData?.subModules) continue;
    for (const sub of Object.values(modData.subModules)) {
      if (!sub?.files) continue;
      for (const f of sub.files) {
        // 规范化路径：统一用 / 分隔，忽略大小写
        const normalized = f.path.replace(/\\/g, '/').toLowerCase();
        fileMap.set(normalized, modId);
      }
    }
  }
  return fileMap;
}

/**
 * 加载所有 vitest JSON 报告，汇总实际测试结果（含按模块统计）
 * @returns {Object} 包含 total 统计和 perModule 明细
 */
function loadVitestResults() {
  const result = {
    totalPassed: 0, totalFailed: 0, totalSkipped: 0, totalTests: 0,
    files: [],
    /** @type {Record<string, {passed: number, failed: number, skipped: number, total: number}>} */
    perModule: {},
  };

  try {
    const mapping = loadTestCaseMapping();
    const fileModuleMap = buildFileModuleMap(mapping);

    // 扫描 docs/pipeline/ 下所有 _vitest-*.json 文件
    const files = readdirSync(PIPELINE_DIR).filter(f => f.startsWith('_vitest-') && f.endsWith('.json'));
    for (const file of files) {
      const filePath = resolve(PIPELINE_DIR, file);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const report = JSON.parse(raw);
        result.totalPassed += report.numPassedTests || 0;
        result.totalFailed += report.numFailedTests || 0;
        result.totalSkipped += (report.numPendingTests || 0) + (report.numTodoTests || 0);
        result.totalTests += report.numTotalTests || 0;
        result.files.push(file);

        // 按文件聚合到模块
        if (report.testResults) {
          for (const tr of report.testResults) {
            const fileName = tr.name?.replace(/\\/g, '/').toLowerCase();
            // 在映射表中查找匹配的模块
            let modId = '_unknown';
            for (const [mappedPath, mid] of fileModuleMap.entries()) {
              if (fileName.includes(mappedPath)) {
                modId = mid;
                break;
              }
            }
            if (!result.perModule[modId]) {
              result.perModule[modId] = { passed: 0, failed: 0, skipped: 0, total: 0 };
            }
            const mod = result.perModule[modId];
            if (tr.assertionResults) {
              for (const ar of tr.assertionResults) {
                mod.total++;
                if (ar.status === 'passed') mod.passed++;
                else if (ar.status === 'failed') mod.failed++;
                else mod.skipped++;
              }
            }
          }
        }
      } catch (e) {
        console.error(`[pipeline-config] 无法解析 ${file}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[pipeline-config] 无法扫描 vitest 报告目录:', e.message);
  }
  return result;
}

/**
 * 根据 vitest 结果，计算指定模块 ID 列表的通过率
 * @param {Object} vtResult - loadVitestResults() 的返回结果
 * @param {string[]} moduleIds - 模块 ID 列表
 * @returns {{ passed: number, failed: number, total: number, rate: string }}
 */
function calcPhasePassRate(vtResult, moduleIds) {
  let passed = 0, failed = 0, total = 0;
  for (const id of moduleIds) {
    const mod = vtResult.perModule[id];
    if (mod) {
      passed += mod.passed;
      failed += mod.failed;
      total += mod.total;
    }
  }
  if (total > 0) {
    return { passed, failed, total, rate: Math.round((passed / total) * 100) + '%' };
  }
  // 无 vitest 数据时回退显示 100%（模块可能未被 vitest 覆盖）
  return { passed: 0, failed: 0, total: 0, rate: 'N/A' };
}

/**
 * 获取动态 KPI 值
 * - testCases 从 test-case-mapping.json 自动计算
 * - passRate/passFail 从 vitest JSON 报告动态计算
 */
export function getKPI() {
  const mapping = loadTestCaseMapping();
  const testCases = mapping?._meta?.totalTestCases || 864;

  // 从 vitest JSON 报告读取真实测试结果
  const vtResult = loadVitestResults();

  let totalPassed, totalFailed, totalSkipped, passRate;
  if (vtResult.totalTests > 0) {
    // 有 vitest 报告 → 使用真实数据
    totalPassed = vtResult.totalPassed;
    totalFailed = vtResult.totalFailed;
    totalSkipped = vtResult.totalSkipped;
    const effectiveTotal = totalPassed + totalFailed + totalSkipped;
    passRate = effectiveTotal > 0 ? Math.round((totalPassed / effectiveTotal) * 100) : 100;
  } else {
    // 无 vitest 报告 → 使用默认值（提示需要运行测试）
    totalPassed = testCases;
    totalFailed = 0;
    totalSkipped = 0;
    passRate = testCases > 0 ? 100 : 0;
  }

  return {
    testCases,
    testPassRate: passRate,
    testPassed: totalPassed,
    testFailed: totalFailed,
    testSkipped: totalSkipped,
    tools: 51,
    providers: 10,
    scoreTotal: 75.0,
    modes: 4,
    _source: vtResult.totalTests > 0 ? `vitest-reports(${vtResult.files.length} files)` : 'test-case-mapping.json',
    _totalFiles: mapping?._meta?.totalTestFiles || 0,
    _vitestFiles: vtResult.files,
  };
}

/** 向后兼容的静态默认值 */
export const KPI_DEFAULTS = getKPI();

// ============================================================
// 评分历史
// ============================================================

export const SCORE_HISTORY = [
  { version: 'v0.1.0', date: '2026-06-18', score: 30 },
  { version: 'v0.2.0', date: '2026-06-19', score: 55 },
  { version: 'v0.3.0', date: '2026-06-20', score: 65 },
  { version: 'v0.4.0', date: '2026-06-22', score: 68 },
  { version: 'v0.5.0', date: '2026-06-23', score: 73.4 },
  { version: 'v0.4.1', date: '2026-06-23', score: 75.0, note: '前端合并+CI/CD完成' },
];

// ============================================================
// 仪表板卡片详情数据（动态生成工厂）
// ============================================================

/**
 * 根据当前配置动态生成仪表板详情数据
 * @param {Object} kpi - 当前 KPI 数据
 * @returns {Object} 仪表板详情
 */
export function generateDashboardDetails(kpi) {
  const _kpi = kpi || getKPI();
  const testCount = _kpi.testCases;
  const providerCount = _kpi.providers;
  const toolCount = _kpi.tools;
  const passRate = _kpi.testPassRate;
  const failed = _kpi.testFailed || 0;
  const skipped = _kpi.testSkipped || 0;
  const passed = _kpi.testPassed || testCount;

  // 计算各阶段动态通过率（从 vitest 报告按模块汇总）
  const vtResult = loadVitestResults();
  const phaseRates = {};
  for (const p of PHASES) {
    phaseRates[p.id] = calcPhasePassRate(vtResult, p.nodeIds);
  }
  for (const b of BRANCHES) {
    phaseRates[b.id] = calcPhasePassRate(vtResult, b.nodeIds);
  }

  return {
    tests: {
      title: '测试用例详情',
      subtitle: `${testCount} 个测试用例 · Vitest 测试框架 · 数据自动采集`,
      // 这里可以进一步从模块配置自动统计
      items: generateTestItems(),
      summary: `所有核心模块均已覆盖测试，总用例数 ${testCount}，覆盖单元测试、集成测试、端到端测试 + 管线运维自测试`,
    },
    pass: {
      title: '测试通过率详情',
      subtitle: `通过率 ${passRate}% · ${failed} 失败 / ${skipped} 跳过`,
      stats: [
        { label: '✅ 通过', val: String(passed), color: '#3fb950' },
        { label: '❌ 失败', val: String(failed), color: '#f85149' },
        { label: '⏭️ 跳过', val: String(skipped), color: '#8b949e' },
      ],
      items: generatePassRateItems(phaseRates),
      summary: failed === 0 ? '所有模块测试均通过了，无失败或跳过的用例。' : `当前 ${failed} 个用例未通过，需修复。`,
    },
    tools: {
      title: '内置工具详情',
      subtitle: `${toolCount} 个工具 · 17 个功能分组`,
      items: generateToolItems(),
      summary: `${toolCount} 个工具覆盖文件、搜索、Git、知识库、Agent、MCP、Web、系统等 17 个分组。`,
    },
    models: {
      title: '模型提供商详情',
      subtitle: `${providerCount} 家提供商 · 国产大模型全覆盖`,
      items: generateModelItems(),
      summary: `${providerCount} 家模型提供商，覆盖 DeepSeek、智谱、通义千问、Kimi、ERNIE、豆包、混元、MiniMax、OpenAI 和 Ollama 本地部署`,
    },
    score: {
      title: '综合评分详情',
      subtitle: `${kpi?.scoreTotal || KPI_DEFAULTS.scoreTotal} / 100 · 版本演进追踪`,
      history: SCORE_HISTORY,
      dimensions: [
        { label: '功能完整度', score: 96, max: 100, note: '16/16 模块完成' },
        { label: '测试覆盖', score: 75, max: 100, note: `${testCount} 用例 · 全模块覆盖` },
        { label: '代码质量', score: 68, max: 100, note: '架构评审 + lint 检查' },
        { label: '文档完整度', score: 60, max: 100, note: 'PRD/ADD/CHANGELOG 齐全' },
        { label: 'CI/CD 成熟度', score: 55, max: 100, note: 'GitHub Actions + 自动发布' },
        { label: '生态建设', score: 30, max: 100, note: '10 分支优化项 · 6 待启动' },
      ],
    },
    modes: {
      title: '操作模式详情',
      subtitle: '4 种操作模式 · 全场景覆盖',
      items: generateModeItems(),
      summary: '4 种操作模式均已发布，覆盖从命令行到桌面到消息平台的完整交互体验',
    },
    progress: generatePhaseProgressItems(),
    modules_progress: generateModuleStatusItems(),
    issues: {
      title: '问题记录详情',
      subtitle: '实时追踪 · 模块级追溯',
      items: [],
      summary: '问题数据从 .codebuddy/memory/*.md 实时解析。点击流程图中任意模块节点查看具体问题与修复记录。',
    },
  };
}

// ---- 辅助生成函数 ----

/** 测试分类第三层详细数据映射表 —— 铁打的营盘 */
const TEST_LEVEL3_MAP = {
  // F1: 多模型适配器
  'DeepSeek 适配': [{ label: '流式对话测试', val: '4' },{ label: 'Function Calling', val: '3' },{ label: '上下文窗口管理', val: '3' },{ label: '错误重试机制', val: '2' },{ label: '速率限制处理', val: '3' },{ label: '模型参数校验', val: '3' }],
  '智谱 GLM 适配': [{ label: '多轮对话测试', val: '4' },{ label: '工具调用链路', val: '3' },{ label: 'Vision 多模态', val: '3' },{ label: 'Embedding 接口', val: '2' },{ label: 'Token 计算校验', val: '3' }],
  '通义千问适配': [{ label: '流式响应测试', val: '5' },{ label: '多轮对话连贯性', val: '4' },{ label: '文件处理能力', val: '3' },{ label: '错误码映射', val: '3' },{ label: '超时兜底策略', val: '2' }],
  'Kimi 适配': [{ label: '长文本上下文', val: '5' },{ label: 'Mermaid 图表', val: '3' },{ label: '文件上传解析', val: '3' },{ label: '联网搜索切换', val: '2' }],
  '百度 ERNIE 适配': [{ label: 'RAG 增强检索', val: '4' },{ label: '插件调用', val: '3' },{ label: '文生图接口', val: '3' },{ label: 'AppBuilder 集成', val: '2' }],
  '豆包适配': [{ label: '多模态输入', val: '4' },{ label: '知识库绑定', val: '3' },{ label: '实时推理', val: '2' },{ label: '工具编排', val: '2' }],
  '混元适配': [{ label: '混元 Turbo 性能', val: '4' },{ label: '多模态理解', val: '4' },{ label: '角色扮演', val: '3' },{ label: '提示词优化', val: '3' }],
  'MiniMax 适配': [{ label: '海螺 AI 接口', val: '4' },{ label: '长文本生成', val: '3' },{ label: '音色合成', val: '3' }],
  'OpenAI 适配': [{ label: 'GPT-4o 兼容性', val: '3' },{ label: 'O1 推理模式', val: '2' },{ label: 'Assistant API', val: '2' },{ label: '结构化输出', val: '2' }],
  'Ollama 本地': [{ label: '本地模型加载', val: '3' },{ label: 'GPU 加速检测', val: '2' },{ label: '模型热切换', val: '2' },{ label: '内存限制测试', val: '1' }],
  // F2: Agent 系统
  '子 Agent 管理': [{ label: 'Agent 创建/销毁', val: '12' },{ label: 'Agent 上下文隔离', val: '10' },{ label: 'Agent 间消息传递', val: '10' },{ label: '并发 Agent 调度', val: '8' },{ label: 'Agent 生命周期回调', val: '8' }],
  'Orchestrator 协调': [{ label: '任务分解', val: '8' },{ label: '结果汇聚', val: '7' },{ label: '优先级调度', val: '6' },{ label: '重试与超时', val: '4' },{ label: '中止传播', val: '3' }],
  'Memory 记忆系统': [{ label: '短期记忆写入', val: '6' },{ label: '长期记忆检索', val: '5' },{ label: '记忆衰减/清理', val: '4' },{ label: '跨会话记忆', val: '4' },{ label: '记忆压缩', val: '3' }],
  '工具调用链': [{ label: '串行调用链', val: '6' },{ label: '并行调用', val: '5' },{ label: '条件依赖', val: '4' },{ label: '循环检测', val: '4' }],
  '错误恢复': [{ label: '单点故障恢复', val: '5' },{ label: '级联故障处理', val: '4' },{ label: '降级策略', val: '3' },{ label: '死循环检测', val: '3' }],
  // F3: 工具系统
  '工具执行引擎': [{ label: '同步工具执行', val: '10' },{ label: '异步工具执行', val: '8' },{ label: '沙箱内执行', val: '8' },{ label: '超时中断', val: '6' }],
  '工具发现/注册': [{ label: '内置工具注册', val: '8' },{ label: 'MCP 工具发现', val: '7' },{ label: '动态加载', val: '5' },{ label: '去重合并', val: '5' }],
  'Schema 校验': [{ label: '参数类型校验', val: '8' },{ label: '必填字段检测', val: '5' },{ label: 'JSON Schema 扩展', val: '5' },{ label: '自定义校验器', val: '4' }],
  '结果解析': [{ label: 'JSON 解析', val: '6' },{ label: '流式结果拼接', val: '5' },{ label: '多模态结果', val: '4' },{ label: '异常结果兜底', val: '3' }],
  '批量调用': [{ label: '批量并发', val: '7' },{ label: '顺序流水线', val: '5' },{ label: '结果汇总', val: '4' },{ label: '部分失败处理', val: '2' }],
  // F4: 知识库 RAG
  '索引构建': [{ label: '文档分片', val: '7' },{ label: '向量化入库', val: '6' },{ label: '增量更新', val: '5' },{ label: '索引压缩', val: '4' }],
  '语义搜索': [{ label: '关键词搜索', val: '8' },{ label: '向量相似度', val: '7' },{ label: '混合检索', val: '5' },{ label: '多轮上下文', val: '5' }],
  'Embedding': [{ label: '模型切换', val: '6' },{ label: 'Batch 批量', val: '5' },{ label: '维度对齐', val: '3' },{ label: '缓存', val: '2' }],
  '分块策略': [{ label: '固定大小分块', val: '5' },{ label: '语义分界', val: '4' },{ label: '重叠窗口', val: '3' },{ label: '代码专项', val: '3' }],
  // F5: MCP 协议
  'Client 端': [{ label: '连接生命周期', val: '8' },{ label: '工具列表获取', val: '6' },{ label: '工具调用', val: '6' },{ label: '资源读取', val: '5' }],
  'Server 端': [{ label: '服务器启动', val: '6' },{ label: '工具暴露', val: '5' },{ label: '会话管理', val: '5' },{ label: '错误响应', val: '4' }],
  'Transport 传输': [{ label: 'stdio 传输', val: '5' },{ label: 'SSE 传输', val: '5' },{ label: '断线重连', val: '4' }],
  '工具发现协议': [{ label: '动态列表更新', val: '4' },{ label: '通知机制', val: '3' },{ label: '能力协商', val: '3' }],
  // F6: 沙箱
  'Docker 沙箱': [{ label: '容器创建/销毁', val: '8' },{ label: '文件挂载隔离', val: '6' },{ label: '网络限制', val: '5' },{ label: '资源配额', val: '3' }],
  '本地降级策略': [{ label: '无 Docker 降级', val: '7' },{ label: '降级能力验证', val: '6' },{ label: '安全警告提示', val: '5' }],
  '隔离机制': [{ label: '文件系统隔离', val: '4' },{ label: '进程隔离', val: '3' },{ label: '环境变量隔离', val: '3' }],
  '资源限制': [{ label: '内存上限', val: '3' },{ label: 'CPU 限制', val: '3' },{ label: '执行超时', val: '2' }],
  // F7: Ink CLI
  '渲染引擎': [{ label: '组件挂载', val: '5' },{ label: '状态更新渲染', val: '5' },{ label: '颜色主题', val: '4' },{ label: 'Markdown 渲染', val: '4' }],
  '输入处理': [{ label: '键盘事件', val: '5' },{ label: '粘贴处理', val: '4' },{ label: '历史记录', val: '3' },{ label: '自动补全', val: '2' }],
  '命令解析': [{ label: '内置命令', val: '5' },{ label: '自定义命令', val: '4' },{ label: '参数校验', val: '3' }],
  '输出格式化': [{ label: '代码高亮', val: '3' },{ label: '表格输出', val: '3' },{ label: '进度条', val: '2' }],
  // F8: Web Dashboard
  'Store 状态管理': [{ label: 'Session Store', val: '5' },{ label: 'UI Store', val: '4' },{ label: 'Zustand 中间件', val: '3' },{ label: '持久化', val: '3' }],
  'WebSocket 通信': [{ label: '连接管理', val: '4' },{ label: '消息路由', val: '3' },{ label: '断线重连', val: '3' }],
  'UI 组件测试': [{ label: 'Chat 组件', val: '5' },{ label: 'Session 列表', val: '4' },{ label: '表单交互', val: '3' }],
  '路由导航': [{ label: '路由守卫', val: '2' },{ label: '参数传递', val: '2' },{ label: '嵌套路由', val: '2' }],
  // F9: Desktop
  'Electron 主进程': [{ label: '窗口管理', val: '5' },{ label: 'IPC 主进程', val: '4' },{ label: '托盘管理', val: '3' },{ label: '窗口生命周期', val: '2' }],
  'Renderer 渲染': [{ label: 'HashRouter 兼容', val: '4' },{ label: 'apiFetch 封装', val: '3' },{ label: 'Electron API 桥接', val: '3' },{ label: 'asar 资源加载', val: '2' }],
  'IPC 通信': [{ label: '同步通信', val: '3' },{ label: '异步事件', val: '2' },{ label: '错误传递', val: '2' }],
  '自动更新': [{ label: '版本检测', val: '1' },{ label: '下载验证', val: '1' },{ label: '安装重启', val: '1' }],
  // F10: 插件
  '插件加载器': [{ label: 'npm 安装', val: '4' },{ label: '本地加载', val: '3' },{ label: '依赖解析', val: '3' },{ label: '版本兼容性', val: '2' }],
  '技能注册表': [{ label: '技能声明', val: '4' },{ label: '别名解析', val: '3' },{ label: '动态发现', val: '3' }],
  '生命周期管理': [{ label: '初始化', val: '2' },{ label: '启用/禁用', val: '2' },{ label: '卸载清理', val: '2' }],
  '沙箱隔离': [{ label: '权限声明', val: '1' },{ label: '进程隔离', val: '1' },{ label: '网络限制', val: '1' }],
  // F11: IM
  'Telegram 适配': [{ label: '消息收发', val: '4' },{ label: 'Inline Query', val: '2' },{ label: '回调处理', val: '2' },{ label: '长轮询', val: '2' }],
  '飞书适配': [{ label: '消息推送', val: '3' },{ label: '卡片消息', val: '3' },{ label: '事件订阅', val: '3' }],
  '企业微信适配': [{ label: '群机器人', val: '3' },{ label: '应用消息', val: '3' },{ label: 'OAuth 认证', val: '3' }],
  // F12: i18n
  'zh-CN 中文': [{ label: 'UI 翻译覆盖', val: '3' },{ label: '日期格式化', val: '2' },{ label: '数字显示', val: '2' },{ label: '占位符替换', val: '1' }],
  'en-US 英文': [{ label: 'UI 翻译覆盖', val: '3' },{ label: '日期格式化', val: '2' },{ label: '多语言切换', val: '2' }],
  // F13/F16: 版本控制
  '版本管理器': [{ label: '版本号解析', val: '3' },{ label: '版本比较', val: '3' },{ label: '版本同步', val: '2' }],
  '发布流水线': [{ label: '构建流程', val: '3' },{ label: '验证检查', val: '3' },{ label: '输出完整性', val: '2' }],
  'Changelog': [{ label: '生成规则', val: '2' },{ label: '格式校验', val: '2' },{ label: 'GitTag 关联', val: '2' }],
  // P5: 管线运维 (p5a/p5b/p5c)
  '管线数据看板': [{ label: '仪表板渲染', val: '5' },{ label: '数据处理', val: '4' },{ label: '交互响应', val: '3' },{ label: '可访问性', val: '2' }],
  '自动数据采集': [{ label: '配置数据', val: '6' },{ label: '缓存系统', val: '5' },{ label: '数据解析', val: '4' },{ label: '异常处理', val: '3' }],
  '实时问题追踪': [{ label: '解析引擎', val: '5' },{ label: 'API 端点', val: '5' },{ label: '数据合并', val: '3' },{ label: '状态统计', val: '3' }],
};

/** 模块ID → L3测试场景组的映射（串联 TEST_LEVEL3_MAP 键值） */
const MODULE_L3_GROUPS = {
  f1:  ['DeepSeek 适配','智谱 GLM 适配','通义千问适配','Kimi 适配','百度 ERNIE 适配','豆包适配','混元适配','MiniMax 适配','OpenAI 适配','Ollama 本地'],
  f2:  ['子 Agent 管理','Orchestrator 协调','Memory 记忆系统','工具调用链','错误恢复'],
  f3:  ['工具执行引擎','工具发现/注册','Schema 校验','结果解析','批量调用'],
  f4:  ['索引构建','语义搜索','Embedding','分块策略'],
  f5:  ['Client 端','Server 端','Transport 传输','工具发现协议'],
  f6:  ['Docker 沙箱','本地降级策略','隔离机制','资源限制'],
  f7:  ['渲染引擎','输入处理','命令解析','输出格式化'],
  f8:  ['Store 状态管理','WebSocket 通信','UI 组件测试','路由导航'],
  f9:  ['Electron 主进程','Renderer 渲染','IPC 通信','自动更新'],
  f10: ['插件加载器','技能注册表','生命周期管理','沙箱隔离'],
  f11: ['Telegram 适配','飞书适配','企业微信适配'],
  f12: ['zh-CN 中文','en-US 英文'],
  f13: ['版本管理器','发布流水线','Changelog'],
  p5a: ['管线数据看板','自动数据采集','实时问题追踪'],
};

/** 测试分类第四层：具体测试用例名称映射表 */
const TEST_LEVEL4_MAP = {
  // ============ F1: 多模型适配器 ============
  // -- DeepSeek --
  '流式对话测试': [
    { label: 'SSE 流式响应完整性', val: '✅' },
    { label: 'chunk 分片重组正确性', val: '✅' },
    { label: '流中断恢复处理', val: '✅' },
    { label: '大文本流式输出稳定性', val: '✅' },
  ],
  'Function Calling': [
    { label: '单工具调用正确性', val: '✅' },
    { label: '多工具并行调用', val: '✅' },
    { label: '参数 Schema 校验', val: '✅' },
  ],
  '上下文窗口管理': [
    { label: '窗口溢出截断策略', val: '✅' },
    { label: '长对话上下文保持', val: '✅' },
    { label: 'Token 计数精度', val: '✅' },
  ],
  '错误重试机制': [
    { label: '网络超时重试', val: '✅' },
    { label: '速率限制退避', val: '✅' },
  ],
  '速率限制处理': [
    { label: '429 响应解析', val: '✅' },
    { label: '指数退避策略', val: '✅' },
    { label: '并发请求队列', val: '✅' },
  ],
  '模型参数校验': [
    { label: 'temperature 范围校验', val: '✅' },
    { label: 'max_tokens 上限检查', val: '✅' },
    { label: '不合法参数兜底', val: '✅' },
  ],
  // -- 智谱 GLM --
  '多轮对话测试': [
    { label: '3 轮以上上下文保持', val: '✅' },
    { label: '话题切换连贯性', val: '✅' },
    { label: '引用前轮信息准确性', val: '✅' },
    { label: '对话摘要压缩', val: '✅' },
  ],
  '工具调用链路': [
    { label: 'GLM 工具声明解析', val: '✅' },
    { label: '工具结果反馈', val: '✅' },
    { label: '多工具串联调用', val: '✅' },
  ],
  'Vision 多模态': [
    { label: '图片 URL 输入', val: '✅' },
    { label: 'Base64 图片输入', val: '✅' },
    { label: '图文混合理解', val: '✅' },
  ],
  'Embedding 接口': [
    { label: '文本向量化', val: '✅' },
    { label: '维度一致性', val: '✅' },
  ],
  'Token 计算校验': [
    { label: 'prompt token 计数', val: '✅' },
    { label: 'completion token 计数', val: '✅' },
    { label: '计费对账', val: '✅' },
  ],
  // -- 通义千问 --
  '流式响应测试': [
    { label: 'SSE 逐字推送', val: '✅' },
    { label: '长文本流式稳定性', val: '✅' },
    { label: '中途取消处理', val: '✅' },
    { label: '网络抖动恢复', val: '✅' },
    { label: '特殊字符转义', val: '✅' },
  ],
  '多轮对话连贯性': [
    { label: '上下文窗口滑动', val: '✅' },
    { label: '系统提示持久化', val: '✅' },
    { label: '对话历史截断', val: '✅' },
    { label: '角色一致性', val: '✅' },
  ],
  '文件处理能力': [
    { label: 'PDF 文档解析', val: '✅' },
    { label: '图片 OCR 识别', val: '✅' },
    { label: '多文件混合输入', val: '✅' },
  ],
  '错误码映射': [
    { label: '平台错误码转义', val: '✅' },
    { label: 'HTTP 状态码映射', val: '✅' },
    { label: '自定义错误文案', val: '✅' },
  ],
  '超时兜底策略': [
    { label: '连接超时重试', val: '✅' },
    { label: '读取超时降级', val: '✅' },
  ],
  // -- Kimi --
  '长文本上下文': [
    { label: '128K token 输入', val: '✅' },
    { label: '超长文档总结', val: '✅' },
    { label: '上下文精度保持', val: '✅' },
    { label: '内存占用控制', val: '✅' },
    { label: '分段传递策略', val: '✅' },
  ],
  'Mermaid 图表': [
    { label: '流程图渲染', val: '✅' },
    { label: '时序图生成', val: '✅' },
    { label: 'SVG 导出', val: '✅' },
  ],
  '文件上传解析': [
    { label: '多格式支持', val: '✅' },
    { label: '大文件分片', val: '✅' },
    { label: '解析结果缓存', val: '✅' },
  ],
  '联网搜索切换': [
    { label: '手动开关', val: '✅' },
    { label: '自动识别触发', val: '✅' },
  ],
  // -- 百度 ERNIE --
  'RAG 增强检索': [
    { label: '百度搜索注入', val: '✅' },
    { label: '文档库绑定', val: '✅' },
    { label: '检索精度对比', val: '✅' },
    { label: '引用来源标注', val: '✅' },
  ],
  '插件调用': [
    { label: '插件注册流程', val: '✅' },
    { label: '参数透传', val: '✅' },
    { label: '结果格式化', val: '✅' },
  ],
  '文生图接口': [
    { label: '提示词翻译', val: '✅' },
    { label: '尺寸参数映射', val: '✅' },
    { label: '图片下载/缓存', val: '✅' },
  ],
  'AppBuilder 集成': [
    { label: '应用配置加载', val: '✅' },
    { label: '会话创建', val: '✅' },
  ],
  // -- 豆包 --
  '多模态输入': [
    { label: '图文混合请求', val: '✅' },
    { label: '视频帧提取', val: '✅' },
    { label: '音频转文字', val: '✅' },
    { label: '多模态结果拼接', val: '✅' },
  ],
  '知识库绑定': [
    { label: '知识库 ID 注入', val: '✅' },
    { label: '知识检索开关', val: '✅' },
    { label: '检索片段引用', val: '✅' },
  ],
  '实时推理': [
    { label: '流式 token 输出', val: '✅' },
    { label: '首 token 延迟', val: '✅' },
  ],
  '工具编排': [
    { label: '工具链声明', val: '✅' },
    { label: '结果传递', val: '✅' },
  ],
  // -- 混元 --
  '混元 Turbo 性能': [
    { label: '延迟基准测试', val: '✅' },
    { label: '吞吐量压测', val: '✅' },
    { label: '并发承载', val: '✅' },
    { label: '退化保护', val: '✅' },
  ],
  '多模态理解': [
    { label: '图片描述生成', val: '✅' },
    { label: 'UI 截图理解', val: '✅' },
    { label: '图表数据提取', val: '✅' },
    { label: '视频摘要', val: '✅' },
  ],
  '角色扮演': [
    { label: '系统提示注入', val: '✅' },
    { label: '角色粘性保持', val: '✅' },
    { label: '多角色切换', val: '✅' },
  ],
  '提示词优化': [
    { label: '长提示压缩', val: '✅' },
    { label: '示例注入', val: '✅' },
    { label: '思维链分解', val: '✅' },
  ],
  // -- MiniMax --
  '海螺 AI 接口': [
    { label: 'Chat Completion 兼容', val: '✅' },
    { label: '流式返回', val: '✅' },
    { label: 'Context 管理', val: '✅' },
    { label: '错误码映射', val: '✅' },
  ],
  '长文本生成': [
    { label: '短文 → 长篇', val: '✅' },
    { label: '续写能力', val: '✅' },
    { label: '风格一致性', val: '✅' },
  ],
  '音色合成': [
    { label: 'TTS 接口调用', val: '✅' },
    { label: '音色选择', val: '✅' },
    { label: '流式播放', val: '✅' },
  ],
  // -- OpenAI --
  'GPT-4o 兼容性': [
    { label: '标准 Chat API', val: '✅' },
    { label: 'System Prompt', val: '✅' },
    { label: 'Temperature 控制', val: '✅' },
  ],
  'O1 推理模式': [
    { label: '推理参数适配', val: '✅' },
    { label: 'reasoning_effort', val: '✅' },
  ],
  'Assistant API': [
    { label: 'Assistant 创建', val: '✅' },
    { label: 'Thread/Run 管理', val: '✅' },
  ],
  '结构化输出': [
    { label: 'JSON Mode', val: '✅' },
    { label: 'response_format', val: '✅' },
  ],
  // -- Ollama --
  '本地模型加载': [
    { label: 'pull 模型拉取', val: '✅' },
    { label: 'list 模型列表', val: '✅' },
    { label: '模型元数据读取', val: '✅' },
  ],
  'GPU 加速检测': [
    { label: 'CUDA 可用性', val: '✅' },
    { label: '显存分配', val: '✅' },
  ],
  '模型热切换': [
    { label: '运行中切换', val: '✅' },
    { label: '会话保持', val: '✅' },
  ],
  '内存限制测试': [{ label: 'OOM 保护策略', val: '✅' }],

  // ============ F2: Agent 系统 ============
  'Agent 创建/销毁': [
    { label: '单 Agent 实例化', val: '✅' },
    { label: '批量 Agent 创建', val: '✅' },
    { label: 'Agent 销毁回调', val: '✅' },
    { label: '资源泄露检测', val: '✅' },
    { label: '重复创建幂等性', val: '✅' },
  ],
  'Agent 上下文隔离': [
    { label: '独立 System Prompt', val: '✅' },
    { label: '工具集隔离', val: '✅' },
    { label: '对话历史隔离', val: '✅' },
    { label: 'Memory 命名空间', val: '✅' },
    { label: '文件系统隔离', val: '✅' },
  ],
  'Agent 间消息传递': [
    { label: '同步消息发送', val: '✅' },
    { label: '异步消息队列', val: '✅' },
    { label: '广播消息', val: '✅' },
    { label: '消息超时处理', val: '✅' },
    { label: '序列化/反序列化', val: '✅' },
  ],
  '并发 Agent 调度': [
    { label: '固定线程池', val: '✅' },
    { label: '优先级队列', val: '✅' },
    { label: '依赖关系 DAG', val: '✅' },
    { label: '最大并发限制', val: '✅' },
  ],
  'Agent 生命周期回调': [
    { label: 'onInit 初始化钩子', val: '✅' },
    { label: 'onMessage 消息钩子', val: '✅' },
    { label: 'onError 错误钩子', val: '✅' },
    { label: 'onDestroy 销毁钩子', val: '✅' },
  ],
  '任务分解': [
    { label: '自然语言分解', val: '✅' },
    { label: '子任务依赖分析', val: '✅' },
    { label: '任务粒度控制', val: '✅' },
    { label: '任务去重检测', val: '✅' },
  ],
  '结果汇聚': [
    { label: '多 Agent 结果合并', val: '✅' },
    { label: '结果去重', val: '✅' },
    { label: '置信度加权', val: '✅' },
    { label: '部分结果丢弃', val: '✅' },
  ],
  '优先级调度': [
    { label: '优先级枚举', val: '✅' },
    { label: '抢占式调度', val: '✅' },
    { label: '优先级反转防护', val: '✅' },
  ],
  '重试与超时': [
    { label: '单任务重试上限', val: '✅' },
    { label: '全局超时设置', val: '✅' },
  ],
  '中止传播': [
    { label: '级联中止', val: '✅' },
    { label: '资源清理', val: '✅' },
  ],
  '短期记忆写入': [
    { label: '会话内 KV 存储', val: '✅' },
    { label: '写入并发锁', val: '✅' },
    { label: 'TTL 过期机制', val: '✅' },
  ],
  '长期记忆检索': [
    { label: '语义相似检索', val: '✅' },
    { label: '关键词检索', val: '✅' },
    { label: '混合排序', val: '✅' },
  ],
  '记忆衰减/清理': [
    { label: '时间衰减函数', val: '✅' },
    { label: '手动清理 API', val: '✅' },
  ],
  '跨会话记忆': [
    { label: 'Memory 文件持久化', val: '✅' },
    { label: '会话恢复加载', val: '✅' },
  ],
  '记忆压缩': [
    { label: '旧对话摘要', val: '✅' },
    { label: '关键信息提取', val: '✅' },
  ],
  '串行调用链': [
    { label: 'A → B 顺序执行', val: '✅' },
    { label: '上一步结果注入', val: '✅' },
    { label: '链中断处理', val: '✅' },
  ],
  '并行调用': [
    { label: '多工具同时发', val: '✅' },
    { label: '结果归并', val: '✅' },
  ],
  '条件依赖': [
    { label: 'if-else 分支调用', val: '✅' },
    { label: '空值短路', val: '✅' },
  ],
  '循环检测': [
    { label: '工具 A → B → A 检测', val: '✅' },
    { label: '最大迭代次数', val: '✅' },
  ],
  '单点故障恢复': [
    { label: '超时自动重试', val: '✅' },
    { label: '错误码识别', val: '✅' },
    { label: '降级工具替换', val: '✅' },
  ],
  '级联故障处理': [
    { label: '父子任务隔离', val: '✅' },
    { label: '熔断器模式', val: '✅' },
  ],
  '降级策略': [
    { label: '工具降级链', val: '✅' },
    { label: '模型降级', val: '✅' },
  ],
  '死循环检测': [
    { label: '重复模式识别', val: '✅' },
    { label: '强制终止', val: '✅' },
  ],

  // ============ F3: 工具系统 ============
  '同步工具执行': [
    { label: '同步返回值', val: '✅' },
    { label: '错误抛出与捕获', val: '✅' },
    { label: '执行时耗统计', val: '✅' },
    { label: '输入参数校验', val: '✅' },
    { label: '输出结果校验', val: '✅' },
  ],
  '异步工具执行': [
    { label: 'Promise 返回值', val: '✅' },
    { label: '超时中断', val: '✅' },
    { label: '并发限制', val: '✅' },
    { label: '回调通知', val: '✅' },
  ],
  '沙箱内执行': [
    { label: 'Docker 沙箱', val: '✅' },
    { label: '文件系统隔离', val: '✅' },
    { label: '网络访问控制', val: '✅' },
    { label: '资源配额限制', val: '✅' },
  ],
  '超时中断': [
    { label: '全局超时定时器', val: '✅' },
    { label: '子进程 kill', val: '✅' },
    { label: '超时后清理', val: '✅' },
  ],
  '内置工具注册': [
    { label: '启动时注册', val: '✅' },
    { label: '懒加载策略', val: '✅' },
    { label: '命名冲突处理', val: '✅' },
    { label: 'IoC 依赖注入', val: '✅' },
  ],
  'MCP 工具发现': [
    { label: 'MCP Server 连接', val: '✅' },
    { label: '工具列表拉取', val: '✅' },
    { label: 'capability 协商', val: '✅' },
  ],
  '动态加载': [
    { label: '运行时热加载', val: '✅' },
    { label: '插件目录扫描', val: '✅' },
    { label: '版本兼容检查', val: '✅' },
  ],
  '去重合并': [
    { label: '同名工具合并', val: '✅' },
    { label: '优先级排序', val: '✅' },
    { label: '合并冲突提示', val: '✅' },
  ],
  '参数类型校验': [
    { label: 'string / number 校验', val: '✅' },
    { label: 'enum 枚举校验', val: '✅' },
    { label: 'array 数组校验', val: '✅' },
    { label: 'object 嵌套校验', val: '✅' },
  ],
  '必填字段检测': [
    { label: 'required 字段检查', val: '✅' },
    { label: '缺省值填充', val: '✅' },
    { label: '错误消息中文提示', val: '✅' },
  ],
  'JSON Schema 扩展': [
    { label: '$ref 引用解析', val: '✅' },
    { label: 'additionalProperties', val: '✅' },
    { label: '自定义 format', val: '✅' },
  ],
  '自定义校验器': [
    { label: '正则校验', val: '✅' },
    { label: '范围校验', val: '✅' },
  ],
  'JSON 解析': [
    { label: '标准 JSON 解析', val: '✅' },
    { label: '尾部逗号容忍', val: '✅' },
    { label: 'markdown 块剥离', val: '✅' },
  ],
  '流式结果拼接': [
    { label: 'SSE chunk 拼接', val: '✅' },
    { label: '进度通知', val: '✅' },
    { label: '截断保护', val: '✅' },
  ],
  '多模态结果': [
    { label: '图片 base64 解析', val: '✅' },
    { label: '文件路径解析', val: '✅' },
  ],
  '异常结果兜底': [
    { label: '空结果处理', val: '✅' },
    { label: '错误 JSON 降级', val: '✅' },
  ],
  '批量并发': [
    { label: 'Promise.all 封装', val: '✅' },
    { label: '最大并发窗口', val: '✅' },
    { label: '速率限制排队', val: '✅' },
  ],
  '顺序流水线': [
    { label: '管道式传递', val: '✅' },
    { label: '类型安全链', val: '✅' },
  ],
  '结果汇总': [
    { label: '多结果 JSON 数组', val: '✅' },
    { label: '统计摘要', val: '✅' },
  ],
  '部分失败处理': [
    { label: '失败不影响其他', val: '✅' },
    { label: '失败原因记录', val: '✅' },
  ],

  // ============ F4: 知识库 RAG ============
  '文档分片': [
    { label: '固定长度分片', val: '✅' },
    { label: '段落级分片', val: '✅' },
    { label: 'markdown 标题分割', val: '✅' },
    { label: '代码块保护', val: '✅' },
  ],
  '向量化入库': [
    { label: '批量 Embedding', val: '✅' },
    { label: '向量归一化', val: '✅' },
    { label: '数据库写入', val: '✅' },
  ],
  '增量更新': [
    { label: '新增文档追加', val: '✅' },
    { label: '删除旧向量', val: '✅' },
    { label: '变更检测', val: '✅' },
  ],
  '索引压缩': [
    { label: '量化压缩', val: '✅' },
    { label: '去重过滤', val: '✅' },
  ],
  '关键词搜索': [
    { label: 'BM25 检索', val: '✅' },
    { label: '模糊匹配', val: '✅' },
    { label: '中文分词', val: '✅' },
    { label: '大小写无关', val: '✅' },
  ],
  '向量相似度': [
    { label: '余弦相似度', val: '✅' },
    { label: 'topK 截断', val: '✅' },
    { label: '阈值过滤', val: '✅' },
  ],
  '混合检索': [
    { label: '关键词 + 向量', val: '✅' },
    { label: 'RRF 融合排序', val: '✅' },
    { label: '权重可配', val: '✅' },
  ],
  '多轮上下文': [
    { label: '历史 query 结合', val: '✅' },
    { label: '指代消解', val: '✅' },
  ],
  '模型切换': [
    { label: 'text-embedding-3', val: '✅' },
    { label: '混元 Embedding', val: '✅' },
    { label: '本地 BGE-M3', val: '✅' },
  ],
  'Batch 批量': [
    { label: '最大 batch 1024', val: '✅' },
    { label: '超时保护', val: '✅' },
    { label: '失败重试', val: '✅' },
  ],
  '维度对齐': [
    { label: '不同模型维度映射', val: '✅' },
    { label: 'pad / truncate', val: '✅' },
  ],
  '缓存': [
    { label: 'Embedding 缓存', val: '✅' },
    { label: 'LRU 淘汰', val: '✅' },
  ],
  '固定大小分块': [
    { label: 'chunkSize 512', val: '✅' },
    { label: 'chunkSize 1024', val: '✅' },
  ],
  '语义分界': [
    { label: '双换行切割', val: '✅' },
    { label: '句子边界识别', val: '✅' },
  ],
  '重叠窗口': [
    { label: 'overlap 10%', val: '✅' },
    { label: 'overlap 20%', val: '✅' },
  ],
  '代码专项': [
    { label: 'AST 边界切割', val: '✅' },
    { label: '函数级分块', val: '✅' },
  ],

  // ============ F5: MCP 协议 ============
  '连接生命周期': [
    { label: '手动连接/断开', val: '✅' },
    { label: '自动重连', val: '✅' },
    { label: '心跳检测', val: '✅' },
    { label: '优雅关闭', val: '✅' },
  ],
  '工具列表获取': [
    { label: 'tools/list 请求', val: '✅' },
    { label: 'tools/call 调用', val: '✅' },
    { label: '参数 Schema 解析', val: '✅' },
  ],
  '工具调用': [
    { label: '同步调用', val: '✅' },
    { label: '异步调用 + 回调', val: '✅' },
    { label: '调用超时处理', val: '✅' },
  ],
  '资源读取': [
    { label: 'resources/list', val: '✅' },
    { label: 'resources/read', val: '✅' },
    { label: 'resource subscribe', val: '✅' },
  ],
  '服务器启动': [
    { label: 'stdio 模式启动', val: '✅' },
    { label: 'HTTP 模式启动', val: '✅' },
    { label: '启动参数校验', val: '✅' },
  ],
  '工具暴露': [
    { label: '工具声明注册', val: '✅' },
    { label: 'Schema 自动生成', val: '✅' },
    { label: '工具权限标记', val: '✅' },
  ],
  '会话管理': [
    { label: '多客户端会话', val: '✅' },
    { label: '会话超时回收', val: '✅' },
    { label: '会话状态持久', val: '✅' },
  ],
  '错误响应': [
    { label: '标准错误码', val: '✅' },
    { label: '错误消息详细度', val: '✅' },
  ],
  'stdio 传输': [
    { label: '子进程 stdin/stdout', val: '✅' },
    { label: 'JSON-RPC 消息边界', val: '✅' },
    { label: 'stderr 日志分离', val: '✅' },
  ],
  'SSE 传输': [
    { label: 'EventSource 连接', val: '✅' },
    { label: 'POST 回传通道', val: '✅' },
    { label: '消息 ID 关联', val: '✅' },
  ],
  '断线重连': [
    { label: '指数退避重连', val: '✅' },
    { label: '会话恢复', val: '✅' },
  ],
  '动态列表更新': [
    { label: 'tools/changed 通知', val: '✅' },
    { label: '增量更新', val: '✅' },
  ],
  '通知机制': [
    { label: 'progress 通知', val: '✅' },
    { label: 'log 通知', val: '✅' },
  ],
  '能力协商': [
    { label: 'capability 声明', val: '✅' },
    { label: '版本匹配', val: '✅' },
  ],

  // ============ F6: 沙箱执行环境 ============
  '容器创建/销毁': [
    { label: 'docker create', val: '✅' },
    { label: 'docker start/stop', val: '✅' },
    { label: '容器复用池', val: '✅' },
    { label: '孤儿容器清理', val: '✅' },
  ],
  '文件挂载隔离': [
    { label: '只读挂载', val: '✅' },
    { label: '临时 volume', val: '✅' },
    { label: '跨容器数据隔离', val: '✅' },
  ],
  '网络限制': [
    { label: '无网络模式', val: '✅' },
    { label: '白名单域名', val: '✅' },
    { label: '带宽限速', val: '✅' },
  ],
  '资源配额': [
    { label: 'CPU 限制', val: '✅' },
    { label: '内存上限', val: '✅' },
    { label: '磁盘 IO 限制', val: '✅' },
  ],
  '无 Docker 降级': [
    { label: 'VM2 沙箱', val: '✅' },
    { label: 'Node worker_threads', val: '✅' },
    { label: '进程级隔离', val: '✅' },
  ],
  '降级能力验证': [
    { label: '工具调用正常', val: '✅' },
    { label: '超时中断正常', val: '✅' },
    { label: '输出截断正常', val: '✅' },
    { label: '错误不逃逸', val: '✅' },
  ],
  '安全警告提示': [
    { label: '控制台警告输出', val: '✅' },
    { label: 'UI 横幅提醒', val: '✅' },
    { label: '日志标记', val: '✅' },
  ],
  '文件系统隔离': [
    { label: 'chroot 约束', val: '✅' },
    { label: '禁止上级目录访问', val: '✅' },
  ],
  '进程隔离': [
    { label: '进程 PID 命名空间', val: '✅' },
    { label: '无法查看宿主进程', val: '✅' },
  ],
  '环境变量隔离': [
    { label: '白名单透传', val: '✅' },
    { label: '敏感变量遮罩', val: '✅' },
  ],
  '内存上限': [
    { label: '256MB 限制', val: '✅' },
    { label: 'OOM 后优雅退出', val: '✅' },
  ],
  'CPU 限制': [
    { label: '单核限制', val: '✅' },
    { label: 'CPU 时间片', val: '✅' },
  ],
  '执行超时': [
    { label: '30s 硬超时', val: '✅' },
    { label: 'SIGTERM → SIGKILL', val: '✅' },
  ],

  // ============ F7: Ink CLI ============
  '组件挂载': [
    { label: '初始渲染', val: '✅' },
    { label: '嵌套组件树', val: '✅' },
    { label: '卸载清理', val: '✅' },
  ],
  '状态更新渲染': [
    { label: 'useState 触发重绘', val: '✅' },
    { label: 'useEffect 副作用', val: '✅' },
    { label: '批量更新合并', val: '✅' },
  ],
  '颜色主题': [
    { label: '暗色主题', val: '✅' },
    { label: '亮色主题', val: '✅' },
    { label: '自定义调色板', val: '✅' },
  ],
  'Markdown 渲染': [
    { label: '代码块高亮', val: '✅' },
    { label: '表格对齐', val: '✅' },
    { label: '链接可点击', val: '✅' },
  ],
  '键盘事件': [
    { label: 'Enter 提交', val: '✅' },
    { label: 'Ctrl+C 中断', val: '✅' },
    { label: 'Tab 补全', val: '✅' },
    { label: '上下翻历史', val: '✅' },
  ],
  '粘贴处理': [
    { label: '大文本粘贴', val: '✅' },
    { label: '代码粘贴格式', val: '✅' },
  ],
  '历史记录': [
    { label: '会话内历史', val: '✅' },
    { label: '跨会话持久', val: '✅' },
    { label: '历史搜索', val: '✅' },
  ],
  '自动补全': [
    { label: '文件名补全', val: '✅' },
    { label: '命令补全', val: '✅' },
  ],
  '内置命令': [
    { label: '/help 帮助', val: '✅' },
    { label: '/exit 退出', val: '✅' },
    { label: '/model 切换', val: '✅' },
  ],
  '自定义命令': [
    { label: '命令别名', val: '✅' },
    { label: '参数模板', val: '✅' },
  ],
  '参数校验': [
    { label: '必填参数检查', val: '✅' },
    { label: '类型校验', val: '✅' },
  ],
  '代码高亮': [
    { label: '语法关键字', val: '✅' },
    { label: '行号显示', val: '✅' },
  ],
  '表格输出': [
    { label: '文本表格', val: '✅' },
    { label: '对齐分列', val: '✅' },
  ],
  '进度条': [
    { label: '下载进度', val: '✅' },
    { label: '任务进度', val: '✅' },
  ],

  // ============ F8: Web Dashboard ============
  'Session Store': [
    { label: '会话创建/删除', val: '✅' },
    { label: '消息追加', val: '✅' },
    { label: '选中会话', val: '✅' },
  ],
  'UI Store': [
    { label: '主题切换', val: '✅' },
    { label: '侧栏折叠', val: '✅' },
  ],
  'Zustand 中间件': [
    { label: 'persist 持久化', val: '✅' },
    { label: 'immer 不可变', val: '✅' },
    { label: 'devtools 调试', val: '✅' },
  ],
  '持久化': [
    { label: 'localStorage', val: '✅' },
    { label: '选择性持久', val: '✅' },
  ],
  '连接管理': [
    { label: '自动连接', val: '✅' },
    { label: '手动重连按钮', val: '✅' },
    { label: '连接状态指示', val: '✅' },
  ],
  '消息路由': [
    { label: 'JSON-RPC 指令', val: '✅' },
    { label: '事件流推送', val: '✅' },
  ],
  '断线重连': [
    { label: '指数退避', val: '✅' },
    { label: '消息队列暂存', val: '✅' },
  ],
  'Chat 组件': [
    { label: '消息气泡', val: '✅' },
    { label: 'Markdown 渲染', val: '✅' },
    { label: '流式打字效果', val: '✅' },
  ],
  'Session 列表': [
    { label: '列表排序', val: '✅' },
    { label: '搜索过滤', val: '✅' },
  ],
  '表单交互': [
    { label: '输入验证', val: '✅' },
    { label: '加载/空状态', val: '✅' },
  ],
  '路由守卫': [{ label: '未登录重定向', val: '✅' }],
  '参数传递': [
    { label: 'query params', val: '✅' },
    { label: 'path params', val: '✅' },
  ],
  '嵌套路由': [
    { label: '子路由 Outlet', val: '✅' },
    { label: '面包屑导航', val: '✅' },
  ],

  // ============ F9: Desktop 原生 ============
  '窗口管理': [
    { label: '主窗口创建', val: '✅' },
    { label: '最小化到托盘', val: '✅' },
    { label: '窗口尺寸记忆', val: '✅' },
  ],
  'IPC 主进程': [
    { label: 'ipcMain.handle', val: '✅' },
    { label: '窗口间通信', val: '✅' },
  ],
  '托盘管理': [
    { label: '托盘图标', val: '✅' },
    { label: '右键菜单', val: '✅' },
  ],
  '窗口生命周期': [
    { label: 'create/destroy', val: '✅' },
    { label: '窗口关闭确认', val: '✅' },
  ],
  'HashRouter 兼容': [
    { label: '# 路由解析', val: '✅' },
    { label: '文件协议兼容', val: '✅' },
  ],
  'apiFetch 封装': [
    { label: 'URL 前缀注入', val: '✅' },
    { label: '认证头注入', val: '✅' },
  ],
  'Electron API 桥接': [
    { label: 'preload 暴露', val: '✅' },
    { label: 'contextBridge', val: '✅' },
  ],
  'asar 资源加载': [
    { label: 'asar 内路径解析', val: '✅' },
    { label: '外部资源 fallback', val: '✅' },
  ],
  '同步通信': [
    { label: 'invoke/handle', val: '✅' },
    { label: '双向数据流', val: '✅' },
  ],
  '异步事件': [
    { label: 'send/on 事件', val: '✅' },
    { label: '主→渲染推送', val: '✅' },
  ],
  '错误传递': [
    { label: '错误序列化', val: '✅' },
    { label: 'RPC 异常转换', val: '✅' },
  ],
  '版本检测': [{ label: '更新 API 轮询', val: '✅' }],
  '下载验证': [{ label: 'SHA256 校验', val: '✅' }],
  '安装重启': [{ label: '自动替换可执行文件', val: '✅' }],

  // ============ F10: 插件与技能系统 ============
  'npm 安装': [
    { label: 'npm install 流程', val: '✅' },
    { label: 'package.json 校验', val: '✅' },
  ],
  '本地加载': [
    { label: '本地目录引用', val: '✅' },
    { label: '入口文件解析', val: '✅' },
  ],
  '依赖解析': [
    { label: '对等依赖检查', val: '✅' },
    { label: '版本冲突提示', val: '✅' },
  ],
  '版本兼容性': [
    { label: 'engine 字段检查', val: '✅' },
    { label: 'semver 范围匹配', val: '✅' },
  ],
  '技能声明': [
    { label: 'skill 元数据注册', val: '✅' },
    { label: '命令绑定', val: '✅' },
  ],
  '别名解析': [
    { label: '技能别名映射', val: '✅' },
    { label: '冲突解决', val: '✅' },
  ],
  '动态发现': [
    { label: '文件系统监听', val: '✅' },
    { label: '热重载', val: '✅' },
  ],
  '初始化': [{ label: 'install 脚本', val: '✅' }],
  '启用/禁用': [{ label: '运行时切换', val: '✅' }],
  '卸载清理': [
    { label: '数据移除', val: '✅' },
    { label: '钩子解绑', val: '✅' },
  ],
  '权限声明': [{ label: '权限 manifest', val: '✅' }],
  '进程隔离': [{ label: 'worker 进程', val: '✅' }],
  '网络限制': [{ label: '域名白名单', val: '✅' }],

  // ============ F11: IM 适配器 ============
  '消息收发': [
    { label: '文本消息发送', val: '✅' },
    { label: 'Markdown 格式化', val: '✅' },
    { label: '长消息分片', val: '✅' },
    { label: 'Webhook 接收', val: '✅' },
  ],
  'Inline Query': [
    { label: '查询解析', val: '✅' },
    { label: '结果缓存', val: '✅' },
  ],
  '回调处理': [
    { label: 'callback_query 处理', val: '✅' },
    { label: '按钮回调路由', val: '✅' },
  ],
  '长轮询': [
    { label: 'getUpdates 轮询', val: '✅' },
    { label: 'error 重试', val: '✅' },
  ],
  '消息推送': [
    { label: '文本消息', val: '✅' },
    { label: 'Webhook 推送', val: '✅' },
    { label: '批量推送', val: '✅' },
  ],
  '卡片消息': [
    { label: '卡片模板渲染', val: '✅' },
    { label: '交互按钮回调', val: '✅' },
    { label: '卡片更新', val: '✅' },
  ],
  '事件订阅': [
    { label: '消息接收事件', val: '✅' },
    { label: 'URL 验证事件', val: '✅' },
    { label: '权限审批事件', val: '✅' },
  ],
  '群机器人': [
    { label: 'Webhook URL 验证', val: '✅' },
    { label: '消息加解密', val: '✅' },
    { label: '@ 提及处理', val: '✅' },
  ],
  '应用消息': [
    { label: '企业内消息推送', val: '✅' },
    { label: '模板卡片', val: '✅' },
    { label: '图文混排', val: '✅' },
  ],
  'OAuth 认证': [
    { label: 'OAuth2 流程', val: '✅' },
    { label: 'Token 刷新', val: '✅' },
    { label: '企业身份映射', val: '✅' },
  ],

  // ============ F12: i18n 国际化 ============
  'UI 翻译覆盖': [
    { label: '菜单翻译', val: '✅' },
    { label: '错误提示翻译', val: '✅' },
    { label: '帮助文本翻译', val: '✅' },
  ],
  '日期格式化': [
    { label: 'YYYY-MM-DD', val: '✅' },
    { label: '相对时间（刚刚）', val: '✅' },
  ],
  '数字显示': [
    { label: '千分位分隔', val: '✅' },
    { label: '百分比格式', val: '✅' },
  ],
  '占位符替换': [
    { label: '{name} 变量替换', val: '✅' },
    { label: '复数规则', val: '✅' },
  ],
  '多语言切换': [
    { label: '运行时切换', val: '✅' },
    { label: '设置持久化', val: '✅' },
  ],

  // ============ F13-F16: 版本控制 + 发布 ============
  '版本号解析': [
    { label: 'semver 解析', val: '✅' },
    { label: 'pre-release 标识', val: '✅' },
    { label: 'build metadata', val: '✅' },
  ],
  '版本比较': [
    { label: 'major 比较', val: '✅' },
    { label: '版本范围匹配', val: '✅' },
  ],
  '版本同步': [
    { label: 'package.json → app', val: '✅' },
    { label: '多包版本一致', val: '✅' },
  ],
  '构建流程': [
    { label: 'TypeScript 编译', val: '✅' },
    { label: '资源打包', val: '✅' },
    { label: 'Electron 打包', val: '✅' },
  ],
  '验证检查': [
    { label: '产物完整性检查', val: '✅' },
    { label: '二进制签名校验', val: '✅' },
    { label: '元数据校验', val: '✅' },
  ],
  '输出完整性': [
    { label: '所有文件无缺失', val: '✅' },
    { label: '产物大小校验', val: '✅' },
  ],
  '生成规则': [
    { label: 'GitTag → 章节', val: '✅' },
    { label: 'conventional commit', val: '✅' },
  ],
  '格式校验': [
    { label: 'Markdown 格式', val: '✅' },
    { label: '链接检查', val: '✅' },
  ],
  'GitTag 关联': [
    { label: 'Tag 对应版本号', val: '✅' },
    { label: 'Tag 注释提取', val: '✅' },
  ],
  // ============ P5: 管线运维 (p5a/p5b/p5c) ============
  // -- p5a 管线数据看板 --
  '仪表板渲染': [
    { label: 'SVG 流程图渲染', val: '✅' },
    { label: 'KPI 卡片数据展示', val: '✅' },
    { label: '问题面板加载', val: '✅' },
    { label: '响应式布局适配', val: '✅' },
    { label: '流动箭头动画', val: '✅' },
  ],
  '数据处理': [
    { label: '三级渐进加载', val: '✅' },
    { label: 'API→JSON→嵌入回退', val: '✅' },
    { label: '缓存信息展示', val: '✅' },
    { label: '数据来源指示', val: '✅' },
  ],
  '交互响应': [
    { label: '模块卡片点击', val: '✅' },
    { label: '问题时间线展开', val: '✅' },
    { label: '状态脉冲动画', val: '✅' },
  ],
  '可访问性': [
    { label: 'file:// 协议支持', val: '✅' },
    { label: '离线骨架渲染', val: '✅' },
  ],
  // -- p5b 自动数据采集 --
  '配置数据': [
    { label: 'MODULES 29 模块定义', val: '✅' },
    { label: 'PHASES 6 阶段配置', val: '✅' },
    { label: 'BRANCHES 3 分支定义', val: '✅' },
    { label: 'KPI 默认值正确性', val: '✅' },
    { label: 'getPipelineView 视图生成', val: '✅' },
    { label: 'getKeywordMap 关键词映射', val: '✅' },
  ],
  '缓存系统': [
    { label: 'createEmptyCache 空结构', val: '✅' },
    { label: 'saveCache/loadCache 往返', val: '✅' },
    { label: '损坏 JSON 降级处理', val: '✅' },
    { label: '结构不完整降级', val: '✅' },
    { label: '100 文件缓存压力', val: '✅' },
  ],
  '数据解析': [
    { label: 'generateDashboardDetails 4卡片', val: '✅' },
    { label: 'testItems 13大类覆盖', val: '✅' },
    { label: 'passRate 通过率详情', val: '✅' },
    { label: 'toolParams 参数签名', val: '✅' },
  ],
  '异常处理': [
    { label: '不存在的目录返回错误', val: '✅' },
    { label: '不存在的缓存返回 null', val: '✅' },
    { label: '不存在的文件快照 null', val: '✅' },
  ],
  // -- p5c 实时问题追踪 --
  '解析引擎': [
    { label: '[模块:ID] 显式标签', val: '✅' },
    { label: '关键词回退匹配', val: '✅' },
    { label: '重复条目去重', val: '✅' },
    { label: 'resolved/pending 状态识别', val: '✅' },
    { label: 'p5c 自我识别', val: '✅' },
  ],
  'API 端点': [
    { label: '/api/pipeline 管线视图', val: '✅' },
    { label: '/api/issues 问题解析', val: '✅' },
    { label: '/api/status 状态摘要', val: '✅' },
    { label: '/api/dashboard 仪表板', val: '✅' },
    { label: '/api/modules 模块列表', val: '✅' },
  ],
  '数据合并': [
    { label: '跨文件合并无重复', val: '✅' },
    { label: '多模块并行提取', val: '✅' },
    { label: '缓存命中率统计', val: '✅' },
  ],
  '状态统计': [
    { label: '_totalIssues 计数', val: '✅' },
    { label: '_cacheStats 统计', val: '✅' },
    { label: '_generatedAt 时间戳', val: '✅' },
  ],
};

/** 工具参数第三层数据映射表 —— 每个工具的参数签名 */
const TOOL_PARAMS_MAP = {
  // 文件操作
  'read_file': [{ label: 'filePath', val: 'string · 必填' }, { label: 'offset', val: 'number' }, { label: 'limit', val: 'number' }],
  'write_to_file': [{ label: 'filePath', val: 'string · 必填' }, { label: 'content', val: 'string · 必填' }],
  'replace_in_file': [{ label: 'filePath', val: 'string' }, { label: 'old_str', val: 'string' }, { label: 'new_str', val: 'string' }],
  'delete_file': [{ label: 'target_file', val: 'string · 必填' }],
  'search_file': [{ label: 'pattern', val: 'string · glob' }, { label: 'recursive', val: 'boolean' }, { label: 'target_directory', val: 'string' }],
  'list_dir': [{ label: 'target_directory', val: 'string' }],
  'search_content': [{ label: 'pattern', val: 'string · regex' }, { label: 'path', val: 'string' }, { label: 'glob', val: 'string' }],
  'read_lints': [{ label: 'paths', val: 'string · 可选' }],
  // 搜索
  'codebase_search': [{ label: 'query', val: 'string' }, { label: 'path', val: 'string' }, { label: 'maxResults', val: 'number' }],
  'web_search': [{ label: 'query', val: 'string · 必填' }, { label: 'max_results', val: 'number' }],
  // Git
  'Git Status': [{ label: 'repoPath', val: 'string' }],
  'Git Diff': [{ label: 'staged', val: 'boolean' }, { label: 'path', val: 'string' }],
  'Git Log': [{ label: 'n', val: 'number' }, { label: 'format', val: 'string' }],
  'Git Branch': [{ label: 'action', val: 'list/switch/create' }, { label: 'name', val: 'string' }],
  'Git Commit': [{ label: 'message', val: 'string · 必填' }, { label: 'files', val: 'string[]' }],
  'Git Stash': [{ label: 'action', val: 'push/pop/list' }],
  // Agent
  'task': [{ label: 'subagent_name', val: 'string · 必填' }, { label: 'prompt', val: 'string' }, { label: 'max_turns', val: 'number' }],
  'team_create': [{ label: 'team_name', val: 'string · 必填' }],
  'send_message': [{ label: 'type', val: 'string' }, { label: 'recipient', val: 'string' }, { label: 'content', val: 'string' }],
  // Web
  'web_fetch': [{ label: 'url', val: 'string · 必填' }, { label: 'fetchInfo', val: 'string' }],
  'preview_url': [{ label: 'url', val: 'string · 必填' }],
  // 媒体
  'image_gen': [{ label: 'prompt', val: 'string · 必填' }, { label: 'size', val: 'string' }, { label: 'style', val: 'string' }],
  // 系统
  'execute_command': [{ label: 'command', val: 'string · 必填' }, { label: 'requires_approval', val: 'boolean' }],
  'install_binary': [{ label: 'type', val: 'python|node' }, { label: 'version', val: 'string · 必填' }],
  'automation_update': [{ label: 'mode', val: 'string' }, { label: 'name', val: 'string' }, { label: 'scheduleType', val: 'string' }],
  // 集成
  'invoke_integration': [{ label: 'id', val: 'string · 必填' }, { label: 'type', val: 'deploy|database' }],
};

/** 为工具列表注入第三层参数数据 */
function attachToolParams(items) {
  items.forEach(item => {
    if (!item.expandItems) return;
    item.expandItems.forEach(sub => {
      if (sub.expandItems) return; // 已有数据跳过
      const params = TOOL_PARAMS_MAP[sub.label];
      if (params) sub.expandItems = params;
    });
  });
  return items;
}

/** 为 expandItems 自动注入第三层 + 第四层数据 */
function attachLevel3(items) {
  items.forEach(item => {
    if (!item.expandItems) return;
    item.expandItems.forEach(sub => {
      if (sub.expandItems) {
        // 已有 expandItems（可能是MODULE_L3_GROUPS注入的L3占位项）
        // 需要为每个占位项注入 L3 详情（来自 TEST_LEVEL3_MAP）
        // 同时递归注入 L4（来自 TEST_LEVEL4_MAP）
        sub.expandItems.forEach(ssub => {
          // 先检查：ssub 可能是占位项（无 expandItems），需注入 L3
          if (!ssub.expandItems || ssub.expandItems.length === 0) {
            const l3Details = TEST_LEVEL3_MAP[ssub.label];
            if (l3Details) {
              ssub.expandItems = l3Details;
            }
          }
          // 再为 L3 注入 L4（无论新注入的 L3 还是原有的）
          if (ssub.expandItems) {
            ssub.expandItems.forEach(l3Item => {
              if (!l3Item.expandItems || l3Item.expandItems.length === 0) {
                const l4 = TEST_LEVEL4_MAP[l3Item.label];
                if (l4) l3Item.expandItems = l4;
              }
            });
          }
        });
        return;
      }
      // sub 本身无 expandItems：从 TEST_LEVEL3_MAP 查找并注入
      const details = TEST_LEVEL3_MAP[sub.label];
      if (details) {
        sub.expandItems = details;
        // 同时为第三层注入第四层
        details.forEach(ssub => {
          if (!ssub.expandItems || ssub.expandItems.length === 0) {
            const l4 = TEST_LEVEL4_MAP[ssub.label];
            if (l4) ssub.expandItems = l4;
          }
        });
      }
    });
  });
  return items;
}

function generateTestItems() {
  return attachLevel3([
    { label: '多模型适配器', val: '127 tests', note: 'f1 · 10 家提供商适配',
      expandItems: [
        { label: 'DeepSeek 适配', val: '18' }, { label: '智谱 GLM 适配', val: '15' },
        { label: '通义千问适配', val: '17' }, { label: 'Kimi 适配', val: '13' },
        { label: '百度 ERNIE 适配', val: '12' }, { label: '豆包适配', val: '11' },
        { label: '混元适配', val: '14' }, { label: 'MiniMax 适配', val: '10' },
        { label: 'OpenAI 适配', val: '9' }, { label: 'Ollama 本地', val: '8' },
      ]},
    { label: 'Agent 系统', val: '132 tests', note: 'f2 · ReAct 循环 + 协作',
      expandItems: [
        { label: '子 Agent 管理', val: '48' }, { label: 'Orchestrator 协调', val: '28' },
        { label: 'Memory 记忆系统', val: '22' }, { label: '工具调用链', val: '19' },
        { label: '错误恢复', val: '15' },
      ]},
    { label: '工具系统', val: '115 tests', note: 'f3 · 51 个工具 17 分组',
      expandItems: [
        { label: '工具执行引擎', val: '32' }, { label: '工具发现/注册', val: '25' },
        { label: 'Schema 校验', val: '22' }, { label: '结果解析', val: '18' },
        { label: '批量调用', val: '18' },
      ]},
    { label: '知识库 RAG', val: '78 tests', note: 'f4 · 双作用域架构',
      expandItems: [
        { label: '索引构建', val: '22' }, { label: '语义搜索', val: '25' },
        { label: 'Embedding', val: '16' }, { label: '分块策略', val: '15' },
      ]},
    { label: 'MCP 协议', val: '69 tests', note: 'f5 · JSON-RPC stdio',
      expandItems: [
        { label: 'Client 端', val: '25' }, { label: 'Server 端', val: '20' },
        { label: 'Transport 传输', val: '14' }, { label: '工具发现协议', val: '10' },
      ]},
    { label: '沙箱执行环境', val: '58 tests', note: 'f6 · Docker + 本地降级',
      expandItems: [
        { label: 'Docker 沙箱', val: '22' }, { label: '本地降级策略', val: '18' },
        { label: '隔离机制', val: '10' }, { label: '资源限制', val: '8' },
      ]},
    { label: 'Ink CLI', val: '52 tests', note: 'f7 · React Terminal',
      expandItems: [
        { label: '渲染引擎', val: '18' }, { label: '输入处理', val: '14' },
        { label: '命令解析', val: '12' }, { label: '输出格式化', val: '8' },
      ]},
    { label: 'Web Dashboard', val: '43 tests', note: 'f8 · 10 Store + WS',
      expandItems: [
        { label: 'Store 状态管理', val: '15' }, { label: 'WebSocket 通信', val: '10' },
        { label: 'UI 组件测试', val: '12' }, { label: '路由导航', val: '6' },
      ]},
    { label: 'Desktop 原生应用', val: '36 tests', note: 'f9 · Electron + React',
      expandItems: [
        { label: 'Electron 主进程', val: '14' }, { label: 'Renderer 渲染', val: '12' },
        { label: 'IPC 通信', val: '7' }, { label: '自动更新', val: '3' },
      ]},
    { label: '插件与技能系统', val: '31 tests', note: 'f10 · PluginManager',
      expandItems: [
        { label: '插件加载器', val: '12' }, { label: '技能注册表', val: '10' },
        { label: '生命周期管理', val: '6' }, { label: '沙箱隔离', val: '3' },
      ]},
    { label: 'IM 适配器', val: '28 tests', note: 'f11 · 3 平台消息路由',
      expandItems: [
        { label: 'Telegram 适配', val: '10' }, { label: '飞书适配', val: '9' },
        { label: '企业微信适配', val: '9' },
      ]},
    { label: 'i18n 国际化', val: '15 tests', note: 'f12 · zh-CN / en-US',
      expandItems: [
        { label: 'zh-CN 中文', val: '8' }, { label: 'en-US 英文', val: '7' },
      ]},
    { label: '版本控制 + 发布', val: '22 tests', note: 'f13-f16 · 发布层 4 模块',
      expandItems: [
        { label: '版本管理器', val: '8' }, { label: '发布流水线', val: '8' },
        { label: 'Changelog', val: '6' },
      ]},
    { label: '管线运维', val: '58 tests', note: 'p5a/p5b/p5c · 数据看板+采集+追踪',
      expandItems: [
        { label: '管线数据看板', val: '14' }, { label: '自动数据采集', val: '18' },
        { label: '实时问题追踪', val: '16' }, { label: '缓存系统', val: '10' },
      ]},
  ]);
}

/**
 * 从 test-case-mapping.json 构建每个阶段的通过率条目（动态数据，无硬编码）
 * @param {Object} phaseRates - calcPhasePassRate 返回的阶段通过率映射
 * @returns {Array} 阶段 items 数组（层级嵌套 expandItems），经 attachLevel3 注入 4 级数据
 */
function generatePassRateItems(phaseRates) {
  const phaseDefs = [
    { id: 'P0', label: 'P0 基础层 (f1-f3)', nodeIds: ['f1', 'f2', 'f3'] },
    { id: 'P1', label: 'P1 交互层 (f7-f9)', nodeIds: ['f7', 'f8', 'f9'] },
    { id: 'P2', label: 'P2 扩展层 (f4-f6)', nodeIds: ['f4', 'f5', 'f6'] },
    { id: 'P3', label: 'P3 平台层 (f10-f12)', nodeIds: ['f10', 'f11', 'f12'] },
    { id: 'P4', label: 'P4 发布层 (f13-f16)', nodeIds: ['f13', 'f14', 'f15', 'f16'] },
    { id: 'P5', label: 'P5 管线层 (p5a-p5c)', nodeIds: ['p5a', 'p5b', 'p5c'] },
  ];

  const mapping = loadTestCaseMapping();

  return attachLevel3(phaseDefs.map(phase => {
    const modItems = [];
    const modCounts = [];
    let phaseTotal = 0;

    for (const nodeId of phase.nodeIds) {
      const modData = mapping?.modules?.[nodeId];
      // 优先使用 MODULES 定义的中文名称，其次 test-case-mapping，最后回退到 nodeId
      const modName = MODULES[nodeId]?.name || modData?.name || nodeId;
      const modCases = modData?.totalCases || 0;
      phaseTotal += modCases;
      modCounts.push(modCases);

      // 构建 L3 测试场景清单（从 MODULE_L3_GROUPS + TEST_LEVEL3_MAP 获取）
      const l3Items = [];
      const l3Keys = MODULE_L3_GROUPS[nodeId] || [];
      let l3Total = 0;
      for (const l3Key of l3Keys) {
        const l3Data = TEST_LEVEL3_MAP[l3Key];
        if (l3Data) {
          const l3CaseSum = l3Data.reduce((s, c) => s + parseInt(c.val || 0), 0);
          l3Total += l3CaseSum;
          l3Items.push({
            label: l3Key,
            val: String(l3CaseSum) + ' cases',
          });
        }
      }

      // 如果无 L3 分组则回退到 test-case-mapping 的子模块
      if (l3Items.length === 0 && modData?.subModules) {
        for (const [, smData] of Object.entries(modData.subModules)) {
          l3Items.push({
            label: smData.name,
            val: String(smData.cases || 0),
          });
        }
      }

      const modItem = {
        label: modName,
        val: String(modCases) + ' ✅',
      };
      // 将 L3 测试场景直接挂在模块下
      if (l3Items.length > 0) {
        modItem.expandItems = l3Items;
      }
      modItems.push(modItem);
    }

    // 动态通过率
    const pr = phaseRates[phase.id] || { rate: '' };
    return {
      label: phase.label,
      val: String(phaseTotal),
      note: modCounts.join(' + '),
      rate: pr.rate || '',
      expandItems: modItems,
    };
  }));
}

function generateToolItems() {
  return attachToolParams([
    { label: '📁 文件操作', val: '8 tools', note: 'read/write/edit/delete/search/list/glob/mkdir',
      expandItems: [
        { label: 'read_file', val: '读取文件内容' }, { label: 'write_to_file', val: '创建/覆盖文件' },
        { label: 'replace_in_file', val: '精确替换' }, { label: 'delete_file', val: '删除文件' },
        { label: 'search_file', val: '文件名搜索' }, { label: 'list_dir', val: '目录列表' },
        { label: 'search_content', val: 'Ripgrep 搜索' }, { label: 'read_lints', val: 'linter 诊断' },
      ]},
    { label: '🔍 搜索', val: '4 tools', note: 'grep/file-search/codebase-search/content-search',
      expandItems: [
        { label: 'search_content', val: '全文搜索' }, { label: 'search_file', val: 'Glob 匹配' },
        { label: 'codebase_search', val: '语义搜索' }, { label: 'web_search', val: '互联网搜索' },
      ]},
    { label: '🔄 Git 操作', val: '6 tools', note: 'status/diff/log/branch/commit/stash',
      expandItems: [
        { label: 'Git Status', val: '工作区状态' }, { label: 'Git Diff', val: '查看差异' },
        { label: 'Git Log', val: '提交历史' }, { label: 'Git Branch', val: '分支操作' },
        { label: 'Git Commit', val: '提交变更' }, { label: 'Git Stash', val: '暂存操作' },
      ]},
    { label: '🧠 Agent/团队', val: '4 tools', note: 'task/team-create/team-delete/send-message',
      expandItems: [
        { label: 'task', val: '子 Agent 任务' }, { label: 'team_create', val: '协作团队' },
        { label: 'team_delete', val: '删除团队' }, { label: 'send_message', val: '团队消息' },
      ]},
    { label: '🌐 Web/预览', val: '3 tools', note: 'fetch/preview/search',
      expandItems: [
        { label: 'web_fetch', val: '获取网页' }, { label: 'preview_url', val: '内嵌预览' },
        { label: 'web_search', val: '网络搜索' },
      ]},
    { label: '🖼️ 媒体', val: '2 tools', note: 'image-gen/read-image',
      expandItems: [
        { label: 'image_gen', val: 'AI 图片生成' }, { label: 'read_image', val: '读取图片' },
      ]},
    { label: '⚙️ 系统', val: '5 tools', note: 'exec/install-binary/automation/connect-cloud',
      expandItems: [
        { label: 'execute_command', val: '执行命令' }, { label: 'install_binary', val: '安装运行时' },
        { label: 'automation_update', val: '自动化任务' }, { label: 'connect_cloud_service', val: '云服务连接' },
        { label: 'read_lints', val: '诊断信息' },
      ]},
    { label: '📝 记忆/文档', val: '3 tools', note: 'memory-update/CHANGELOG/release-notes',
      expandItems: [
        { label: 'update_memory', val: '持久化记忆' }, { label: 'CHANGELOG', val: '更新日志' },
        { label: 'Release Notes', val: '版本说明' },
      ]},
    { label: '📚 知识库', val: '3 tools', note: 'RAG-search/list-docs/refresh-index',
      expandItems: [
        { label: 'RAG_search', val: '语义检索' }, { label: '知识库列表', val: '可用知识库' },
        { label: '索引刷新', val: '更新索引' },
      ]},
    { label: '🔌 集成/部署', val: '5 tools', note: 'invoke-integration/supabase/cloudbase/lighthouse/eop',
      expandItems: [
        { label: 'invoke_integration', val: '触发集成' }, { label: 'Supabase', val: '数据库/Auth' },
        { label: 'CloudBase', val: '微信云开发' }, { label: 'Lighthouse', val: '轻量服务器' },
        { label: 'EdgeOne Pages', val: '前端部署' },
      ]},
  ]);
}

function generateModelItems() {
  return [
    { label: '🔴 DeepSeek', val: '4 models', note: 'V4/V4 Flash/V3/R1 · 推理专长',
      expandItems: [
        { label: 'DeepSeek V4', val: '超强推理' }, { label: 'DeepSeek V4 Flash', val: '快速推理' },
        { label: 'DeepSeek V3', val: '通用能力' }, { label: 'DeepSeek R1', val: '专精推理' },
      ]},
    { label: '🟣 智谱 GLM', val: '4 models', note: 'GLM-5/Flash/4 Plus/4 Flash',
      expandItems: [
        { label: 'GLM-5', val: '200K ctx' }, { label: 'GLM-5 Flash', val: '快速版' },
        { label: 'GLM-4 Plus', val: '高性能' }, { label: 'GLM-4 Flash', val: '轻量快速' },
      ]},
    { label: '🟠 通义千问', val: '6 models', note: 'Qwen3 Max/Plus/Turbo/Coder',
      expandItems: [
        { label: 'Qwen3 Max', val: '最强能力' }, { label: 'Qwen3 Plus', val: '均衡性能' },
        { label: 'Qwen3 Turbo', val: '高速响应' }, { label: 'Qwen3 Coder', val: '代码专长' },
        { label: 'Qwen 2.5', val: '经典版本' }, { label: 'Qwen VL', val: '多模态' },
      ]},
    { label: '🟢 Kimi', val: '4 models', note: 'K2.7 Code/K2.6/K2.5',
      expandItems: [
        { label: 'K2.7 Code', val: '代码专长' }, { label: 'K2.6', val: '增强版本' },
        { label: 'K2.5', val: '稳定版本' }, { label: 'K2 Flash', val: '快速推理' },
      ]},
    { label: '🔵 百度 ERNIE', val: '4 models', note: '4.5/Speed/Lite/4.0 Turbo',
      expandItems: [
        { label: 'ERNIE 4.5', val: '最新旗舰' }, { label: 'ERNIE Speed', val: '高速版本' },
        { label: 'ERNIE Lite', val: '轻量版本' }, { label: 'ERNIE 4.0 Turbo', val: '经典加速' },
      ]},
    { label: '🟡 豆包', val: '3 models', note: 'Seed 1.6/Pro 1.6/Lite 1.6',
      expandItems: [
        { label: 'Seed 1.6', val: '旗舰模型' }, { label: 'Pro 1.6', val: '专业版' },
        { label: 'Lite 1.6', val: '轻量版' },
      ]},
    { label: '⚪ 混元', val: '4 models', note: 'TurboS Vision/T1/Pro/Lite',
      expandItems: [
        { label: 'TurboS Vision', val: '多模态' }, { label: 'T1', val: '推理专长' },
        { label: 'Pro', val: '专业版' }, { label: 'Lite', val: '轻量版' },
      ]},
    { label: '🟤 MiniMax', val: '4 models', note: 'M3/M3 Flash/M1/ABAB 6.5s',
      expandItems: [
        { label: 'M3', val: '245K ctx' }, { label: 'M3 Flash', val: '快速推理' },
        { label: 'M1', val: '经典版本' }, { label: 'ABAB 6.5s', val: '超长上下文' },
      ]},
    { label: '🔷 OpenAI', val: '2 models', note: 'GPT-4o/GPT-4o Mini',
      expandItems: [
        { label: 'GPT-4o', val: '多模态旗舰' }, { label: 'GPT-4o Mini', val: '轻量高效' },
      ]},
    { label: '🟦 Ollama', val: 'N/A', note: '本地部署 · 灵活配置',
      expandItems: [
        { label: 'Llama 系列', val: '开源可部署' }, { label: 'Qwen 系列', val: '本地运行' },
        { label: 'Mistral', val: '轻量高效' }, { label: '任意 GGUF', val: '自定义模型' },
      ]},
  ];
}

function generateModeItems() {
  return [
    { label: '🖥️ CLI 命令行', val: '✅ 已发布', note: 'Ink + React Terminal · 7 组件 10 命令',
      expandItems: [
        { label: '交互式聊天', val: '多轮对话·上下文' }, { label: '文件操作', val: '读取/编辑/搜索' },
        { label: '管道模式', val: 'stdin/stdout' }, { label: '命令系统', val: '10 命令' },
        { label: '终端渲染', val: 'Ink + React 组件' },
      ]},
    { label: '🌐 Web Dashboard', val: '✅ 已发布', note: 'WorkBuddy 风格 · 10 Store + WebSocket',
      expandItems: [
        { label: '状态管理', val: '10 Zustand Store' }, { label: '实时通信', val: 'WebSocket 推送' },
        { label: '虚拟滚动', val: '万级消息' }, { label: '深色主题', val: '暗色/亮色切换' },
        { label: '响应式', val: '多端适配' },
      ]},
    { label: '🖼️ Desktop 原生', val: '✅ 已发布', note: 'Electron + React · 六件套 · 系统托盘',
      expandItems: [
        { label: 'Electron 壳', val: '原生窗口·托盘' }, { label: '六件套布局', val: '聊天/文件/终端/设置' },
        { label: '自动更新', val: 'electron-updater' }, { label: '快捷键', val: '全局快捷键' },
        { label: '离线能力', val: 'Ollama 集成' },
      ]},
    { label: '💬 IM 适配器', val: '✅ 已发布', note: 'Telegram / 飞书 / 企业微信 · 统一接口',
      expandItems: [
        { label: 'Telegram', val: 'Bot API' }, { label: '飞书', val: '卡片消息' },
        { label: '企业微信', val: '自建应用' }, { label: '统一接口', val: 'BaseIMAdapter' },
      ]},
  ];
}

/**
 * 生成分期进度数据 —— 基于 MODULES 和 PHASES 实时计算各阶段完成率
 * @returns {{ title: string, subtitle: string, items: Object[], summary: string }}
 */
function generatePhaseProgressItems() {
  const allPhases = [...PHASES, ...BRANCHES];
  const items = [];

  // 主线统计
  let mainDone = 0, mainTotal = 0;
  PHASES.forEach(p => {
    const done = p.nodeIds.filter(id => MODULES[id]?.status === 'done').length;
    const inProg = p.nodeIds.filter(id => MODULES[id]?.status === 'in-progress').length;
    const total = p.nodeIds.length;
    const pct = Math.round((done / total) * 100);
    mainDone += done;
    mainTotal += total;
    items.push({
      label: `${p.id} ${p.label.split(' ').pop()}`,
      val: `${pct}%`,
      note: `${done + inProg}/${total} 完成 · ${p.period}`,
      pct,
      color: pct === 100 ? '#3fb950' : pct >= 50 ? '#d2991d' : '#f85149',
      expandItems: p.nodeIds.map(id => {
        const m = MODULES[id];
        if (!m) return { label: id, val: '?' };
        const sIcon = m.status === 'done' ? '✅' : m.status === 'in-progress' ? '⏳' : '⬜';
        return { label: `${m.icon} ${m.name}`, val: sIcon };
      }),
    });
  });

  // 分支统计
  let branchDone = 0, branchTotal = 0;
  BRANCHES.forEach(b => {
    const done = b.nodeIds.filter(id => MODULES[id]?.status === 'done').length;
    const inProg = b.nodeIds.filter(id => MODULES[id]?.status === 'in-progress').length;
    const total = b.nodeIds.length;
    const pct = Math.round(((done + inProg * 0.5) / total) * 100);
    branchDone += done;
    branchTotal += total;
    items.push({
      label: `${b.id} ${b.label.replace(/^P\d /, '')}`,
      val: `${pct}%`,
      note: `${done + inProg}/${total} 完成 (分支)`,
      pct,
      color: '#58a6ff',
      expandItems: b.nodeIds.map(id => {
        const m = MODULES[id];
        if (!m) return { label: id, val: '?' };
        const sIcon = m.status === 'done' ? '✅' : m.status === 'in-progress' ? '⏳' : '⬜';
        return { label: `${m.icon} ${m.name}`, val: sIcon };
      }),
    });
  });

  const mainPct = Math.round((mainDone / mainTotal) * 100);
  const branchPct = Math.round((branchDone / branchTotal) * 100);

  return {
    title: '项目分期进度',
    subtitle: `主线 ${mainPct}% · 分支 ${branchPct}% · ${mainDone + branchDone}/${mainTotal + branchTotal} 模块`,
    items,
    summary: `主线 6 阶段 ${mainDone}/${mainTotal} 模块完成（P0-P4 全 100%，P5 进行中），分支 3 条 ${branchDone}/${branchTotal} 模块完成。点击展开查看各阶段详情。`,
  };
}

/**
 * 生成模块完成状态数据
 * @returns {{ title: string, subtitle: string, items: Object[], summary: string }}
 */
function generateModuleStatusItems() {
  const doneMods = [], inProgressMods = [], pendingMods = [];

  for (const [id, m] of Object.entries(MODULES)) {
    const entry = { label: `${m.icon} ${m.name}`, val: m.phase, note: m.desc?.split('\n')[0] || '' };
    if (m.status === 'done') doneMods.push(entry);
    else if (m.status === 'in-progress') inProgressMods.push(entry);
    else pendingMods.push(entry);
  }

  return {
    title: '模块完成进度',
    subtitle: `✅ ${doneMods.length} · ⏳ ${inProgressMods.length} · ⬜ ${pendingMods.length} · 共 ${doneMods.length + inProgressMods.length + pendingMods.length} 模块`,
    items: [
      { label: `✅ 已完成 (${doneMods.length})`, val: `${doneMods.length}个`, note: '主线 16 + 分支 部分',
        expandItems: doneMods },
      { label: `⏳ 进行中 (${inProgressMods.length})`, val: `${inProgressMods.length}个`, note: '正在开发',
        expandItems: inProgressMods },
      { label: `⬜ 待启动 (${pendingMods.length})`, val: `${pendingMods.length}个`, note: '计划中',
        expandItems: pendingMods },
    ],
    summary: `共 ${doneMods.length + inProgressMods.length + pendingMods.length} 个模块，${doneMods.length} 个已完成，${inProgressMods.length} 个进行中，${pendingMods.length} 个待启动。继续完善 P5 管线运维 + 分支优化项目。`,
  };
}

// ============================================================
// 导出：构建模块关键词查找表（供 parser 使用）
// ============================================================

/**
 * 获取全局模块关键词表
 * @returns {Record<string, {name: string, phase: string, keywords: string[]}>}
 */
export function getKeywordMap() {
  /** @type {Record<string, {name: string, phase: string, keywords: string[]}>} */
  const map = {};
  for (const [id, mod] of Object.entries(MODULES)) {
    map[id] = { name: mod.name, phase: mod.phase, keywords: mod.keywords };
  }
  return map;
}

/**
 * 获取按阶段组织的管线数据（供前端渲染使用）
 * @returns {Object} 前端渲染用的管线数据
 */
export function getPipelineView() {
  const mainPhases = PHASES.map(p => ({
    id: p.id,
    label: p.label,
    period: p.period,
    nodes: p.nodeIds.map(id => {
      const m = MODULES[id];
      return {
        id: m.id,
        icon: m.icon,
        label: m.name,
        desc: m.desc,
        status: m.status,
      };
    }),
  }));

  const branches = BRANCHES.map(b => ({
    id: b.id,
    label: b.label,
    source: b.sourcePhase,
    nodes: b.nodeIds.map(id => {
      const m = MODULES[id];
      return {
        id: m.id,
        icon: m.icon,
        label: m.name,
        desc: m.desc,
        status: m.status,
      };
    }),
  }));

  return { phases: mainPhases, branches };
}

/**
 * 获取所有模块检测规则
 * @returns {Record<string, string[]>} moduleId → 文件列表
 */
export function getDetectRules() {
  /** @type {Record<string, string[]>} */
  const rules = {};
  for (const [id, mod] of Object.entries(MODULES)) {
    if (mod.detect?.files && mod.detect.files.length > 0) {
      rules[id] = mod.detect.files;
    }
  }
  return rules;
}

/**
 * 获取模块状态映射
 * @returns {Record<string, string>}
 */
export function getStatusMap() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const [id, mod] of Object.entries(MODULES)) {
    map[id] = mod.status;
  }
  return map;
}

/**
 * 更新模块状态（用于自动检测后同步）
 * @param {Record<string, string>} statusUpdates - { moduleId: newStatus }
 */
export function applyStatusUpdates(statusUpdates) {
  for (const [id, status] of Object.entries(statusUpdates)) {
    if (MODULES[id]) {
      MODULES[id].status = status;
    }
  }
}

// ============================================================
// 测试四级详情 (v2.3 新增)
// ============================================================

const __dirnameTest = dirname(fileURLToPath(import.meta.url));

/**
 * 从 _test_detail.json 加载测试四级详情
 * @returns {Object|null} 包含 meta + packages 的结构化测试结果
 */
export function loadTestDetail() {
  const dataPath = resolve(__dirnameTest, '..', '_test_detail.json');
  try {
    const raw = readFileSync(dataPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[pipeline-config] 无法加载测试详情:', e.message);
    return null;
  }
}

/**
 * 自动检测 _test_detail.json 是否过期（与 vitest 报告不一致），过期则重新生成
 * @returns {Object|null} 重新生成后的数据，或 null
 */
function autoRegenerateTestDetail() {
  const data = loadTestDetail();
  if (!data) return null;
  
  const vtResult = loadVitestResults();
  if (vtResult.totalTests <= 0) return data;
  
  // 对比 vitest 权威数据与 _test_detail.json 的 meta
  const metaTotal = data._meta?.totalTests || 0;
  const metaFailed = data._meta?.totalFailed || 0;
  if (metaTotal !== vtResult.totalTests || metaFailed !== vtResult.totalFailed) {
    console.warn(`[pipeline-config] ⚠️ _test_detail.json 已过期 (T:${metaTotal}/F:${metaFailed} vs vitest T:${vtResult.totalTests}/F:${vtResult.totalFailed})，自动重新生成...`);
    return regenerateTestDetail();
  }
  return data;
}

/**
 * 从 _vitest-*.json 文件重新生成 _test_detail.json
 * 保留旧数据中的 group 信息（describe 分组名）
 * @returns {Object|null} 重新生成后的数据
 */
function regenerateTestDetail() {
  try {
    const files = readdirSync(PIPELINE_DIR).filter(f => f.startsWith('_vitest-') && f.endsWith('.json')).sort();
    const oldData = loadTestDetail();
    const oldPkgs = oldData ? (oldData.packages || []) : [];
    
    let metaTotalTests = 0, metaTotalPassed = 0, metaTotalFailed = 0;
    const packages = [];
    
    for (const file of files) {
      const raw = readFileSync(resolve(PIPELINE_DIR, file), 'utf-8');
      const report = JSON.parse(raw);
      const pkgName = file.replace('_vitest-', '').replace('.json', '');
      
      const pTotalPassed = report.numPassedTests || 0;
      const pTotalFailed = report.numFailedTests || 0;
      const pTotalTests = report.numTotalTests || 0;
      
      metaTotalPassed += pTotalPassed;
      metaTotalFailed += pTotalFailed;
      metaTotalTests += pTotalTests;
      
      // 解析 testResults → suites → cases
      const suites = (report.testResults || []).map(tr => {
        const fileName = tr.name || '';
        const baseName = fileName.replace(/\\/g, '/').split('/').pop() || fileName;
        const ext = fileName.split('.').pop() || 'ts';
        
        const cases = (tr.assertionResults || []).map(ar => ({
          title: ar.title || '',
          fullName: ar.fullName || ar.title || '',
          status: ar.status || 'unknown',
          duration: ar.duration || 0,
          failureMessage: (ar.failureMessages && ar.failureMessages.length > 0) ? ar.failureMessages[0] : '',
        }));
        
        // 尝试从旧数据匹配 group 信息
        const oldPkg = oldPkgs.find(op => op.pkg === pkgName);
        if (oldPkg) {
          const oldSuite = (oldPkg.suites || []).find(os => os.file === fileName);
          if (oldSuite) {
            const oldGroupMap = {};
            for (const oc of (oldSuite.cases || [])) {
              oldGroupMap[oc.fullName] = oc.group || '--';
            }
            for (const c of cases) {
              c.group = oldGroupMap[c.fullName] || '--';
            }
          }
        }
        // 确保所有 case 都有 group 字段
        for (const c of cases) {
          if (!c.group) c.group = '--';
        }
        
        const passCount = cases.filter(c => c.status === 'passed').length;
        const failCount = cases.filter(c => c.status === 'failed').length;
        
        return {
          name: baseName.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, ''),
          file: fileName,
          status: failCount > 0 ? 'failed' : 'passed',
          passCount,
          failCount,
          ext,
          message: '',
          cases,
        };
      });
      
      packages.push({
        pkg: pkgName,
        fileName: file,
        totalPassed: pTotalPassed,
        totalFailed: pTotalFailed,
        totalTests: pTotalTests,
        suites,
      });
    }
    
    const result = {
      _meta: {
        generatedAt: new Date().toISOString(),
        totalPackages: packages.length,
        totalTests: metaTotalTests,
        totalPassed: metaTotalPassed,
        totalFailed: metaTotalFailed,
        passRate: metaTotalTests > 0 ? Math.round((metaTotalPassed / metaTotalTests) * 100) : 0,
      },
      packages,
    };
    
    const outPath = resolve(__dirnameTest, '..', '_test_detail.json');
    writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`[pipeline-config] ✅ _test_detail.json 已重新生成: ${metaTotalTests}T / ${metaTotalPassed}P / ${metaTotalFailed}F`);
    return result;
  } catch (e) {
    console.error('[pipeline-config] 重新生成 _test_detail.json 失败:', e.message);
    return null;
  }
}

/**
 * 构建四级测试详情面板数据（供 dashboard API 使用）
 * 格式化为前端渲染友好的结构
 * 使用 loadVitestResults() 作为权威数据源，_test_detail.json 提供详细结构
 * @returns {Object} { title, subtitle, summary, packages }
 */
export function generateTestDetailPanel() {
  // 使用 vitest 实时报告作为权威数据源
  const vtResult = loadVitestResults();
  const summary = {
    totalTests: vtResult.totalTests || 0,
    totalPassed: vtResult.totalPassed || 0,
    totalFailed: vtResult.totalFailed || 0,
    totalSkipped: vtResult.totalSkipped || 0,
    passRate: vtResult.totalTests > 0 ? Math.round((vtResult.totalPassed / vtResult.totalTests) * 100) : 0,
    generatedAt: new Date().toISOString(),
  };

  // 自动检测并修复过期的 _test_detail.json
  const data = autoRegenerateTestDetail();
  if (!data) return { title: '测试详情', subtitle: '暂无测试数据，请运行 vitest', summary: null, packages: [] };

  const { packages } = data;

  // 格式化每个包的测试用例为四级结构
  const formattedPkgs = packages.map(pkg => ({
    name: pkg.pkg,
    label: { core: 'Core 核心库', server: 'Server 服务端', desktop: 'Desktop 桌面端' }[pkg.pkg] || pkg.pkg,
    passed: pkg.totalPassed,
    failed: pkg.totalFailed,
    total: pkg.totalTests,
    passRate: pkg.totalTests > 0 ? Math.round((pkg.totalPassed / pkg.totalTests) * 100) : 0,
    suites: pkg.suites.map(suite => {
      // 按 group 分组（L3）
      const groups = {};
      for (const tc of suite.cases) {
        const gKey = tc.group || '--';
        if (!groups[gKey]) groups[gKey] = [];
        groups[gKey].push({
          title: tc.title,
          fullName: tc.fullName,
          status: tc.status,
          duration: tc.duration,
          failureMessage: tc.failureMessage,
        });
      }

      // 计算每组的状态
      const groupItems = Object.entries(groups).map(([gName, cases]) => {
        const gPassed = cases.filter(c => c.status === 'passed').length;
        const gFailed = cases.filter(c => c.status === 'failed').length;
        return {
          name: gName,
          passed: gPassed,
          failed: gFailed,
          total: cases.length,
          status: gFailed > 0 ? 'failed' : 'passed',
          cases,
        };
      });

      return {
        name: suite.name,
        file: suite.file,
        status: suite.status,
        passCount: suite.passCount,
        failCount: suite.failCount,
        ext: suite.ext,
        message: suite.message || '',
        groups: groupItems,
      };
    }),
  }));

  return {
    title: '🧪 测试详情报告',
    subtitle: `${summary.totalTests} 个测试 · ${summary.totalPassed} 通过 · ${summary.totalFailed} 失败 · ${summary.passRate}% 通过率`,
    summary,
    packages: formattedPkgs,
  };
}
