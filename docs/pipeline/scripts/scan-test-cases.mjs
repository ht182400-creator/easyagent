/**
 * 扫描所有测试文件，生成测试用例对照表 test-case-mapping.json
 * 
 * 用法: node docs/pipeline/scripts/scan-test-cases.mjs
 * 
 * 该脚本会：
 * 1. 扫描 packages 下 src 目录内的测试文件
 * 2. 扫描 docs pipeline tests 目录内的测试文件
 * 3. 统计每个文件中的 it/test 块数量
 * 4. 按 pipeline 模块分组
 * 5. 输出 test-case-mapping.json 作为唯一数据源
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, relative, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');

// ==================== 测试文件→模块 映射规则 ====================
// key: 文件路径匹配模式, value: { moduleId, subModule }
const FILE_MODULE_MAP = [
  // P0 基础层
  { pattern: /adapter-factor/i, moduleId: 'f1', subModule: '通用适配器工厂' },
  { pattern: /agent-engine/i, moduleId: 'f2', subModule: 'Agent 引擎核心' },
  { pattern: /session-manager/i, moduleId: 'f2', subModule: 'Session 管理器' },
  { pattern: /core\.test/i,   moduleId: 'f2', subModule: '核心集成测试' },
  { pattern: /tool-registry/i, moduleId: 'f3', subModule: '工具注册中心' },
  { pattern: /builtin-tools/i, moduleId: 'f3', subModule: '内置工具' },
  { pattern: /code-tools/i,    moduleId: 'f3', subModule: '代码工具' },
  { pattern: /file-extra-tools/i, moduleId: 'f3', subModule: '文件扩展工具' },
  { pattern: /project-tools/i, moduleId: 'f3', subModule: '项目工具' },
  { pattern: /preview-media-tools/i, moduleId: 'f3', subModule: '预览/媒体工具' },
  { pattern: /subagent-db-tools/i, moduleId: 'f3', subModule: '子Agent/数据库工具' },
  { pattern: /automation-manager/i, moduleId: 'f3', subModule: '自动化管理器' },

  // P2 扩展层
  { pattern: /knowledge-service/i, moduleId: 'f4', subModule: '知识库服务' },
  { pattern: /knowledge-tools/i, moduleId: 'f4', subModule: '知识库工具' },
  { pattern: /mcp-client/i, moduleId: 'f5', subModule: 'MCP Client' },
  { pattern: /mcp-server/i, moduleId: 'f5', subModule: 'MCP Server' },
  { pattern: /mcp/i, moduleId: 'f5', subModule: 'MCP 协议' },
  { pattern: /sandbox/i, moduleId: 'f6', subModule: '沙箱执行' },

  // 通用基础模块
  { pattern: /config-manager/i, moduleId: 'f2', subModule: '配置管理' },
  { pattern: /encryption/i, moduleId: '_utils', subModule: '加密工具' },
  { pattern: /semantic/i, moduleId: 'f4', subModule: '语义分析' },
  { pattern: /utils\.test/i, moduleId: '_utils', subModule: '通用工具' },

  // P1 交互层
  { pattern: /cli|ink|terminal|readline|repl/i, moduleId: 'f7', subModule: 'Ink CLI', package: 'cli' },
  { pattern: /api\.test|static-files|socket/i, moduleId: 'f8', subModule: 'Web API', package: 'server' },
  { pattern: /store|component|routing|zustand/i, moduleId: 'f8', subModule: 'Web 前端' },
  { pattern: /desktop|electron|ipc|auto.?updat/i, moduleId: 'f9', subModule: 'Desktop 原生' },

  // P3 平台层
  { pattern: /plugin|skill/i, moduleId: 'f10', subModule: '插件与技能' },
  { pattern: /im-adapter|wechat-adapter|wechat-crypto|telegram|lark|feishu/i, moduleId: 'f11', subModule: 'IM 适配器' },
  { pattern: /i18n|locale|i8n/i, moduleId: 'f12', subModule: '国际化' },

  // P4 发布层
  { pattern: /release|publish|deploy|npm.?publish/i, moduleId: 'f14', subModule: '发布流水线' },
  { pattern: /version|changelog/i, moduleId: 'f16', subModule: '版本/Changelog' },
  { pattern: /ci|cd|action|workflow/i, moduleId: 'f15', subModule: 'CI/CD' },

  // P5 管线运维
  { pattern: /pipeline-api/i, moduleId: 'p5a', subModule: '管线 API' },
  { pattern: /pipeline-config/i, moduleId: 'p5a', subModule: '管线配置' },
  { pattern: /pipeline-cache/i, moduleId: 'p5b', subModule: '缓存系统' },
  { pattern: /pipeline-parser/i, moduleId: 'p5c', subModule: '问题解析' },
];

// 其他未匹配的归为 通用/辅助
const DEFAULT_MODULE = { moduleId: '_unmapped', subModule: '未归类' };

/**
 * 递归获取目录下所有测试文件
 */
function findTestFiles(dir, excludeNodeModules = true) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludeNodeModules && (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist')) continue;
        results.push(...findTestFiles(fullPath, excludeNodeModules));
      } else if (/\.(test|spec)\.(ts|tsx|mjs|js)$/i.test(entry.name)) {
        // 排除 node_modules 下的文件
        if (!fullPath.includes('node_modules')) {
          results.push(fullPath);
        }
      }
    }
  } catch (e) { /* 忽略权限错误 */ }
  return results;
}

/**
 * 统计文件中 it/test 块的数量
 */
function countTestCases(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    // 匹配 it('...' 或 test('...' 或 it(`...` 或 test(`...`
    const itMatches = content.match(/\bit\s*\(/g);
    const testMatches = content.match(/\btest\s*\(/g);
    // 排除 describe/it 中嵌套的其他 test 调用，这里粗略统计
    return (itMatches?.length || 0) + (testMatches?.length || 0);
  } catch {
    return 0;
  }
}

/**
 * 根据文件路径匹配模块
 */
function matchModule(filePath) {
  const relPath = relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
  const fileName = basename(filePath);

  for (const rule of FILE_MODULE_MAP) {
    if (rule.pattern.test(fileName) || rule.pattern.test(relPath)) {
      return { moduleId: rule.moduleId, subModule: rule.subModule };
    }
  }
  return { ...DEFAULT_MODULE };
}

// ==================== 主流程 ====================
console.log('🔍 扫描测试文件...\n');

// 扫描目录
const scanDirs = [
  resolve(PROJECT_ROOT, 'packages/core/src/__tests__'),
  resolve(PROJECT_ROOT, 'packages/server/src/__tests__'),
  resolve(PROJECT_ROOT, 'packages/desktop/src/__tests__'),
  resolve(PROJECT_ROOT, 'docs/pipeline/__tests__'),
];

let allTestFiles = [];
for (const dir of scanDirs) {
  if (existsSync(dir)) {
    const files = findTestFiles(dir, false);
    allTestFiles.push(...files);
  }
}

// 去重：同名 .js 和 .tsx 只保留 .tsx
const dedupedFiles = [];
const seen = new Set();
for (const f of allTestFiles) {
  const base = basename(f);
  const dir = dirname(f);
  // 如果同目录下存在 .tsx 版本，跳过 .js 版本
  if (base.endsWith('.test.js')) {
    const tsxPath = resolve(dir, base.replace(/\.test\.js$/, '.test.tsx'));
    if (allTestFiles.some(x => x === tsxPath)) {
      console.log(`  ⏭ 跳过重复: ${relative(PROJECT_ROOT, f)} (已有 .tsx)`);
      continue;
    }
  }
  if (!seen.has(f)) {
    seen.add(f);
    dedupedFiles.push(f);
  }
}
allTestFiles = dedupedFiles;

console.log(`找到 ${allTestFiles.length} 个测试文件（去重后）\n`);

// 按模块分组
const moduleGroups = {};
let totalCases = 0;
let unmappedCases = 0;

for (const filePath of allTestFiles) {
  const relPath = relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
  const { moduleId, subModule } = matchModule(filePath);
  const caseCount = countTestCases(filePath);

  if (!moduleGroups[moduleId]) {
    moduleGroups[moduleId] = {
      moduleId,
      subModules: {},
      totalCases: 0,
      files: [],
    };
  }

  if (!moduleGroups[moduleId].subModules[subModule]) {
    moduleGroups[moduleId].subModules[subModule] = {
      name: subModule,
      cases: 0,
      files: [],
    };
  }

  moduleGroups[moduleId].subModules[subModule].files.push({ path: relPath, cases: caseCount });
  moduleGroups[moduleId].subModules[subModule].cases += caseCount;
  moduleGroups[moduleId].totalCases += caseCount;
  totalCases += caseCount;

  const status = moduleId === '_unmapped' ? '⚠️' : '✅';
  if (moduleId === '_unmapped') unmappedCases += caseCount;
  console.log(`  ${status} [${moduleId}] ${subModule.padEnd(20)} ${String(caseCount).padStart(3)} cases  ← ${relPath}`);
}

// 构建输出结构
const mapping = {
  _meta: {
    generatedAt: new Date().toISOString(),
    totalTestFiles: allTestFiles.length,
    totalTestCases: totalCases,
    unmappedCases,
    projectRoot: PROJECT_ROOT,
  },
  modules: {},
};

// 按模块ID排序
const sortedModuleIds = Object.keys(moduleGroups).sort((a, b) => {
  if (a === '_unmapped') return 1;
  if (b === '_unmapped') return -1;
  // P0 > P1 > P2 > P3 > P4 > P5 > B1 > B2 > B3
  const order = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4, P5: 5, B1: 6, B2: 7, B3: 8 };
  const aPhase = moduleGroups[a].phase || 'Z';
  const bPhase = moduleGroups[b].phase || 'Z';
  return (order[aPhase] ?? 99) - (order[bPhase] ?? 99) || a.localeCompare(b);
});

for (const moduleId of sortedModuleIds) {
  const grp = moduleGroups[moduleId];
  mapping.modules[moduleId] = {
    moduleId,
    totalCases: grp.totalCases,
    subModules: Object.fromEntries(
      Object.entries(grp.subModules).sort(([,a],[,b]) => b.cases - a.cases)
    ),
  };
}

// 写入文件
const outputPath = resolve(PROJECT_ROOT, 'docs/pipeline/test-case-mapping.json');
writeFileSync(outputPath, JSON.stringify(mapping, null, 2), 'utf-8');

console.log(`\n========================================`);
console.log(`📊 汇总统计`);
console.log(`  测试文件总数: ${allTestFiles.length}`);
console.log(`  测试用例总数: ${totalCases}`);
console.log(`  已归类用例:   ${totalCases - unmappedCases}`);
if (unmappedCases > 0) console.log(`  ⚠️ 未归类:      ${unmappedCases}`);
console.log(`  输出文件:     ${relative(PROJECT_ROOT, outputPath)}`);
console.log(`========================================`);
