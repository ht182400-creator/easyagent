/**
 * 统一管线同步脚本 —— UNIFIED SYNC
 * 
 * 数据流: module-registry.mjs (唯一权威源) → 扫描测试文件计数 → 
 *        生成 test-case-mapping.json + 更新 pipeline-data.json
 * 
 * 用法: node scripts/unified-sync.mjs [--force]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PIPELINE_DIR = resolve(ROOT, 'docs/pipeline');

// ===== 1. 加载模块注册表 =====
const registryPath = resolve(PIPELINE_DIR, 'lib/module-registry.mjs');
if (!existsSync(registryPath)) {
  console.error('❌ module-registry.mjs 不存在，请先创建');
  process.exit(1);
}
// Windows 兼容：将路径转换为 file:// URL
const registryUrl = pathToFileURL(registryPath).href;
const { MODULE_REGISTRY, PHASE_DEFINITIONS, BRANCH_DEFINITIONS } = await import(registryUrl);

console.log('📋 模块注册表已加载:');
console.log(`   主线模块: ${PHASE_DEFINITIONS.flatMap(p => p.nodeIds).length} 个`);
console.log(`   分支模块: ${BRANCH_DEFINITIONS.flatMap(b => b.nodeIds).length} 个`);
console.log(`   总计: ${Object.keys(MODULE_REGISTRY).length} 个模块\n`);

// ===== 2. 收集项目中所有测试文件 =====
function findAllTestFiles(dir, results = []) {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = resolve(dir, entry);
      try {
        const st = statSync(fullPath);
        if (st.isDirectory()) {
          if (!entry.startsWith('.') && !['node_modules', 'dist', '.git'].includes(entry)) {
            findAllTestFiles(fullPath, results);
          }
        } else if (/\.test\.(ts|tsx)$/.test(entry)) {
          results.push(fullPath);
        }
      } catch (e) { /* skip permission errors */ }
    }
  } catch (e) { /* skip */ }
  return results;
}

const allTestFiles = findAllTestFiles(resolve(ROOT, 'packages'));
console.log(`🔍 共发现 ${allTestFiles.length} 个测试文件`);

// ===== 3. 统计每个测试文件的用例数 =====
// 优先级: ① vitest 报告 ② 文件解析 (count it/test blocks)

/** 从 vitest JSON 报告中获取每个文件的用例数 */
function loadVitestFileCounts() {
  const fileCounts = new Map();
  try {
    const files = readdirSync(PIPELINE_DIR).filter(f => f.startsWith('_vitest-') && f.endsWith('.json'));
    for (const file of files) {
      const raw = readFileSync(resolve(PIPELINE_DIR, file), 'utf-8');
      const report = JSON.parse(raw);
      if (report.testResults) {
        for (const tr of report.testResults) {
          const relPath = tr.name || '';
          const count = tr.assertionResults?.length || 0;
          if (relPath && count > 0) {
            // 从绝对路径提取相对路径
            const normalized = relPath.replace(/\\/g, '/');
            // 匹配 package/xxx 部分
            const pkgMatch = normalized.match(/(packages\/.*\.(ts|tsx))$/i);
            const key = pkgMatch ? pkgMatch[1].toLowerCase() : normalized.toLowerCase();
            fileCounts.set(key, count);
          }
        }
      }
    }
    console.log(`   vitest 报告覆盖: ${fileCounts.size} 个文件`);
  } catch (e) {
    console.warn('   ⚠ 无 vitest 报告可用:', e.message);
  }
  return fileCounts;
}

/** 
 * 通过解析源码统计 it/test 块用例数
 * 支持: it(, test(, it.skip(, test.skip(, it.only(, test.only(
 * 支持: it.each(...)(, test.each(...)(   (参数化测试)
 */
function countTestCasesInFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let count = 0;
    
    // 匹配独立 it/test 调用（行首可出现任意空白）
    // 模式: it('name', ...) 或 test('name', ...) 
    const singleMatch = content.match(/^\s*(it|test)\s*\(\s*['"`]/gm);
    count += singleMatch ? singleMatch.length : 0;
    
    // 匹配 it.skip / test.skip
    const skipMatch = content.match(/^\s*(it|test)\.skip\s*\(\s*['"`]/gm);
    count += skipMatch ? skipMatch.length : 0;
    
    // 匹配 it.only / test.only
    const onlyMatch = content.match(/^\s*(it|test)\.only\s*\(\s*['"`]/gm);
    count += onlyMatch ? onlyMatch.length : 0;
    
    // 匹配 it.each`...`( 和 test.each`...`( 参数化测试
    // 每个参数化模板中的条目代表一个测试用例
    const eachMatch = content.match(/(it|test)\.each`([\s\S]*?)`\s*\(/g);
    if (eachMatch) {
      for (const match of eachMatch) {
        // 提取模板内容中的数组条目数
        const templateMatch = match.match(/\.each`([\s\S]*?)`/);
        if (templateMatch) {
          const template = templateMatch[1];
          // 按换行分割，每行一个测试条目
          const lines = template.split('\n').filter(l => l.trim().startsWith('[') || l.trim().startsWith('{'));
          count += Math.max(1, lines.length); // 至少 1 个
        }
      }
    }
    
    return count;
  } catch (e) {
    return 0;
  }
}

const vitestFileCounts = loadVitestFileCounts();

// ===== 4. 生成新的 test-case-mapping.json =====
const modules = {};
let totalTestCases = 0;
let totalTestFiles = 0;
let unmappedFiles = [];
const mappedFileSet = new Set();

for (const [modId, mod] of Object.entries(MODULE_REGISTRY)) {
  const subModules = {};
  let moduleTotal = 0;
  
  if (mod.testFiles && mod.testFiles.length > 0) {
    // 分组：同目录的文件合并为一个子模块组
    const groups = {};
    for (const tf of mod.testFiles) {
      const dir = tf.split('/')[0]; // core, server, desktop
      const subDir = tf.split('/').slice(0, -1).join('/');
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(tf);
    }
    
    for (const [groupName, fileList] of Object.entries(groups)) {
      const fileEntries = [];
      let groupCases = 0;
      
      for (const tf of fileList) {
        // 在项目中找到匹配的测试文件
        const normalized = tf.replace(/\\/g, '/').toLowerCase();
        mappedFileSet.add(normalized);
        
        let cases = 0;
        // 查找 vitest 报告中的计数
        for (const [reportPath, count] of vitestFileCounts.entries()) {
          if (reportPath.includes(normalized)) {
            cases = count;
            break;
          }
        }
        // 回退：文件源码解析
        if (cases === 0) {
          const fullPath = resolve(ROOT, 'packages', tf);
          if (existsSync(fullPath)) {
            cases = countTestCasesInFile(fullPath);
          }
        }
        
        groupCases += cases;
        totalTestFiles++;
        
        fileEntries.push({
          path: `packages/${tf.replace(/\\/g, '/')}`,
          cases,
        });
      }
      
      const groupLabel = groupName === 'core' ? mod.name : 
                         groupName === 'server' ? `${mod.name}·服务器` :
                         groupName === 'desktop' ? `${mod.name}·桌面端` :
                         mod.name;
      
      subModules[groupName] = {
        name: groupLabel,
        cases: groupCases,
        files: fileEntries,
      };
      moduleTotal += groupCases;
    }
  }
  
  modules[modId] = {
    moduleId: modId,
    totalCases: moduleTotal,
    subModules,
  };
  totalTestCases += moduleTotal;
}

// 找出未被任何模块覆盖的测试文件
for (const tf of allTestFiles) {
  const rel = relative(resolve(ROOT, 'packages'), tf).replace(/\\/g, '/').toLowerCase();
  if (!mappedFileSet.has(rel)) {
    unmappedFiles.push(rel);
  }
}

// _utils 模块（跨模块通用工具测试）
const utilsFiles = [];
let utilsCases = 0;
for (const uf of unmappedFiles) {
  const fullPath = resolve(ROOT, 'packages', uf);
  const cases = countTestCasesInFile(fullPath);
  utilsCases += cases;
  utilsFiles.push({
    path: `packages/${uf.replace(/\\/g, '/')}`,
    cases,
  });
}
modules._utils = {
  moduleId: '_utils',
  totalCases: utilsCases,
  subModules: utilsFiles.length > 0 ? {
    '通用工具': {
      name: '通用工具（未分类）',
      cases: utilsCases,
      files: utilsFiles,
    },
  } : {},
};

totalTestCases += utilsCases;

const mapping = {
  _meta: {
    generatedAt: new Date().toISOString(),
    totalTestFiles,
    totalTestCases,
    unmappedCases: utilsCases,
    projectRoot: ROOT,
    source: 'module-registry.mjs (统一注册表)',
  },
  modules,
};

const mappingPath = resolve(PIPELINE_DIR, 'test-case-mapping.json');
writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf-8');
console.log(`\n✅ test-case-mapping.json 已生成:`);
console.log(`   总用例: ${totalTestCases}`);
console.log(`   已映射: ${totalTestCases - utilsCases}`);
console.log(`   未分类: ${utilsCases}`);
console.log(`   模块数: ${Object.keys(MODULE_REGISTRY).length}`);

// ===== 5. 使用真实 KPI + Dashboard 生成器（与 API 同源）=====
const pipelineConfigUrl = pathToFileURL(resolve(PIPELINE_DIR, 'lib/pipeline-config.mjs')).href;
const { getKPI, generateDashboardDetails } = await import(pipelineConfigUrl);
const mappingKPI = getKPI();  // 与 /api/pipeline 完全同源的 KPI

// ===== 6. 解析问题数据（在写入 pipeline-data.json 之前）=====
let issueResult = null;
let issueSummaryItems = [];
try {
  const memoryDir = resolve(ROOT, '.codebuddy/memory');
  const cacheFilePath = resolve(PIPELINE_DIR, '_issue_cache.json');
  // 强制清除缓存，确保全量重解析
  if (existsSync(cacheFilePath)) {
    console.log('🗑 清除旧问题缓存，强制重解析...');
    try { unlinkSync(cacheFilePath); } catch (e) { /* ok */ }
  }
  const { parseMemoryIssues } = await import(pathToFileURL(resolve(PIPELINE_DIR, 'lib/pipeline-parser.mjs')).href);
  issueResult = parseMemoryIssues(memoryDir, cacheFilePath);
  console.log(`📋 已解析: ${issueResult._totalIssues} 个问题, ${Object.keys(issueResult.modules).length} 个模块`);
  
  // 生成问题摘要列表（供仪表板使用）
  for (const [mid, mod] of Object.entries(issueResult.modules)) {
    if (mod.issues && mod.issues.length > 0) {
      const pendingCount = mod.issues.filter(i => i.status === 'pending' || i.status === 'open').length;
      issueSummaryItems.push({
        label: mod.name || mid,
        val: mod.issues.length + ' 个',
        note: pendingCount > 0 ? (pendingCount + ' 个待解决') : '全部已解决',
      });
    }
  }
  // 按问题数量降序排列
  issueSummaryItems.sort((a, b) => parseInt(b.val) - parseInt(a.val));
} catch (e) {
  console.warn(`  ⚠ 问题解析失败: ${e.message}`);
}

// ===== 7. 更新 pipeline-data.json =====
const pdPath = resolve(PIPELINE_DIR, 'pipeline-data.json');
const oldPD = existsSync(pdPath) ? JSON.parse(readFileSync(pdPath, 'utf-8')) : {};

// 构建 testCount 映射（从已计算的结果中获取）
const modTestCountMap = {};
for (const [modId, modData] of Object.entries(mapping.modules || {})) {
  if (!modId.startsWith('_')) {
    modTestCountMap[modId] = modData.totalCases || 0;
  }
}

// 从模块注册表生成 phases 节点（含 testCount）
const phases = PHASE_DEFINITIONS.map(p => ({
  id: p.id,
  label: p.label,
  period: p.period,
  nodes: p.nodeIds.map(id => {
    const m = MODULE_REGISTRY[id];
    if (!m) {
      console.warn(`  ⚠ 模块 ${id} 在注册表中不存在，跳过`);
      return null;
    }
    return {
      id: m.id,
      icon: m.icon,
      label: m.name,
      desc: m.desc,
      status: m.status,
      testCount: modTestCountMap[m.id] || 0,
    };
  }).filter(Boolean),
  status: p.nodeIds.every(id => MODULE_REGISTRY[id]?.status === 'done') ? 'done' : 'in-progress',
}));

const branches = BRANCH_DEFINITIONS.map(b => ({
  id: b.id,
  label: b.label,
  source: b.sourcePhase || 'P4',
  nodes: b.nodeIds.map(id => {
    const m = MODULE_REGISTRY[id];
    if (!m) return null;
    return {
      id: m.id,
      icon: m.icon,
      label: m.name,
      desc: m.desc,
      status: m.status,
      testCount: modTestCountMap[m.id] || 0,
    };
  }).filter(Boolean),
}));

// Score history
const scoreHistory = [
  { version: 'v0.1.0', date: '2026-06-18', score: 30 },
  { version: 'v0.2.0', date: '2026-06-19', score: 55 },
  { version: 'v0.3.0', date: '2026-06-20', score: 65 },
  { version: 'v0.4.0', date: '2026-06-22', score: 68 },
  { version: 'v0.4.1', date: '2026-06-23', score: 75, note: '前端合并+CI/CD完成' },
  { version: 'v0.5.0', date: '2026-06-24', score: 86, note: 'P0-P3全模块完成+SWE-bench' },
  { version: 'v0.5.1', date: '2026-06-25', score: 96, note: '分支10项+集成测试106' },
  { version: 'v0.5.2', date: '2026-06-25', score: 100, note: `${Object.keys(MODULE_REGISTRY).length}/${Object.keys(MODULE_REGISTRY).length}模块+${totalTestCases}用例` },
];

// 生成 dashboard（含问题摘要注入）
const rawDashboard = generateDashboardDetails(mappingKPI);
if (issueResult && issueResult._totalIssues > 0 && rawDashboard.issues) {
  rawDashboard.issues.title = `问题记录详情 (${issueResult._totalIssues})`;
  rawDashboard.issues.subtitle = `实时追踪 · ${issueResult._totalIssues} 个问题`;
  rawDashboard.issues.items = issueSummaryItems.slice(0, 30);
  rawDashboard.issues.summary = `共 ${issueResult._totalIssues} 个问题记录，覆盖 ${Object.keys(issueResult.modules).filter(k => issueResult.modules[k].issues.length > 0).length} 个模块。点击流程图中任意模块节点或「问题记录」卡片查看详情。`;
}

const pipelineData = {
  pipeline: { phases, branches },
  kpi: mappingKPI,
  scoreHistory,
  dashboard: rawDashboard,
  lastUpdated: new Date().toISOString(),
  source: 'module-registry.mjs (统一注册表同步)',
};

writeFileSync(pdPath, JSON.stringify(pipelineData, null, 2), 'utf-8');
console.log(`\n✅ pipeline-data.json 已更新:`);
console.log(`   阶段数: ${phases.length}, 分支数: ${branches.length}`);
console.log(`   节点数: ${phases.flatMap(p => p.nodes).length + branches.flatMap(b => b.nodes).length}`);
console.log(`   KPI: ${mappingKPI.testCases} 用例, ${mappingKPI.scoreTotal}/100 分`);
console.log(`   Dashboard: ${Object.keys(pipelineData.dashboard).length} 个面板`);
console.log(`   评分历史: ${scoreHistory.length} 条`);

// ===== 8. 生成 issue-data.json（离线回退文件）=====
if (issueResult) {
  const issueDataPath = resolve(PIPELINE_DIR, 'issue-data.json');
  writeFileSync(issueDataPath, JSON.stringify({
    modules: issueResult.modules,
    _totalIssues: issueResult._totalIssues,
    _generatedAt: issueResult._generatedAt,
    _sourceFiles: issueResult._sourceFiles,
    _cacheStats: issueResult._cacheStats,
    meta: { exports: 'unified-sync 自动导出', exportedAt: new Date().toISOString() }
  }, null, 2), 'utf-8');
  console.log(`✅ issue-data.json 已生成: ${issueResult._totalIssues} 个问题`);
}

// ===== 9. 验证 =====
console.log('\n===== 验证报告 =====');
const allModIds = Object.keys(MODULE_REGISTRY);
const withTests = allModIds.filter(id => (MODULE_REGISTRY[id].testFiles?.length || 0) > 0);
const withoutTests = allModIds.filter(id => !MODULE_REGISTRY[id].testFiles || MODULE_REGISTRY[id].testFiles.length === 0);

console.log(`✅ 有测试文件的模块: ${withTests.length}/${allModIds.length}`);
if (withoutTests.length > 0) {
  console.log(`ℹ️  无测试文件的模块 (${withoutTests.length}): ${withoutTests.join(', ')}`);
  console.log('   这些是非代码类基础设施模块，属正常现象');
}

// 统计实际测试覆盖率
const nonInfraMods = allModIds.filter(id => {
  const m = MODULE_REGISTRY[id];
  return m.phase !== 'P5' || (m.tags && !m.tags.includes('devops'));
});
const coveredRunMods = nonInfraMods.filter(id => (modules[id]?.totalCases || 0) > 0);
console.log(`✅ 实际可测试模块 ${nonInfraMods.length} 个, 已覆盖 ${coveredRunMods.length} 个`);
console.log(`✅ 测试用例覆盖率: ${totalTestCases - utilsCases}/${totalTestCases} (${Math.round((totalTestCases - utilsCases) / totalTestCases * 100)}%)`);

console.log('\n🎉 统一同步完成!');
