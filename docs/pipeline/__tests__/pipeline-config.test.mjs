/**
 * 管线配置模块测试 (p5b)
 * 测试 pipeline-config.mjs 的数据完整性、KPI 默认值、视图生成等
 * 
 * 运行: node docs/pipeline/__tests__/pipeline-config.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULES,
  PHASES,
  BRANCHES,
  KPI_DEFAULTS,
  SCORE_HISTORY,
  getPipelineView,
  generateDashboardDetails,
  getKeywordMap,
  calculateScore,
  getScoreHistory,
  getKPI,
} from '../lib/pipeline-config.mjs';

// ==================== 模块定义测试 ====================

describe('MODULES 定义', () => {
  it('应包含所有主线模块 f1-f16', () => {
    for (let i = 1; i <= 16; i++) {
      const id = `f${i}`;
      assert.ok(MODULES[id], `MODULES 应包含 ${id}`);
      assert.ok(MODULES[id].name, `${id} 应有 name`);
      assert.ok(MODULES[id].phase, `${id} 应有 phase`);
      assert.ok(MODULES[id].status, `${id} 应有 status`);
    }
  });

  it('应包含所有管线模块 p5a/p5b/p5c', () => {
    ['p5a', 'p5b', 'p5c'].forEach(id => {
      assert.ok(MODULES[id], `MODULES 应包含 ${id}`);
      assert.ok(MODULES[id].name, `${id} 应有 name`);
      assert.equal(MODULES[id].phase, 'P5', `${id} 阶段应为 P5`);
    });
  });

  it('应包含所有分支模块 b1a-b3c', () => {
    ['b1a', 'b1b', 'b2a', 'b2b', 'b2c', 'b2d', 'b2e', 'b3a', 'b3b', 'b3c'].forEach(id => {
      assert.ok(MODULES[id], `MODULES 应包含 ${id}`);
    });
  });

  it('模块总数应为 29', () => {
    const count = Object.keys(MODULES).length;
    // 16 主线 + 3 运维 + 10 分支 = 29
    assert.ok(count >= 29, `模块总数 ${count} 应 >= 29`);
  });

  it('模块 status 应为有效值', () => {
    const validStatuses = ['done', 'in-progress', 'pending'];
    for (const [id, mod] of Object.entries(MODULES)) {
      assert.ok(validStatuses.includes(mod.status), `${id} status "${mod.status}" 无效`);
    }
  });

  it('p5b 和 p5c 应为 done 状态', () => {
    assert.equal(MODULES.p5b.status, 'done', 'p5b 自动数据采集 应为 done');
    assert.equal(MODULES.p5c.status, 'done', 'p5c 实时问题追踪 应为 done');
  });

  it('p5a 应为 in-progress 状态', () => {
    assert.equal(MODULES.p5a.status, 'in-progress', 'p5a 管线数据看板 应为 in-progress');
  });
});

// ==================== 阶段配置测试 ====================

describe('PHASES 阶段配置', () => {
  it('应包含 P0-P5 六个阶段', () => {
    const phaseIds = PHASES.map(p => p.id);
    ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].forEach(id => {
      assert.ok(phaseIds.includes(id), `PHASES 应包含 ${id}`);
    });
  });

  it('P5 应包含 p5a/p5b/p5c', () => {
    const p5 = PHASES.find(p => p.id === 'P5');
    assert.ok(p5, '应存在 P5 阶段');
    assert.ok(p5.nodeIds.includes('p5a'), 'P5 应包含 p5a');
    assert.ok(p5.nodeIds.includes('p5b'), 'P5 应包含 p5b');
    assert.ok(p5.nodeIds.includes('p5c'), 'P5 应包含 p5c');
  });

  it('所有阶段 nodeIds 应存在于 MODULES', () => {
    for (const phase of PHASES) {
      for (const nodeId of phase.nodeIds) {
        assert.ok(MODULES[nodeId], `阶段 ${phase.id} 的 ${nodeId} 应在 MODULES 中`);
      }
    }
  });
});

// ==================== 分支配置测试 ====================

describe('BRANCHES 分支配置', () => {
  it('应包含 B1/B2/B3 三个分支', () => {
    const branchIds = BRANCHES.map(b => b.id);
    ['B1', 'B2', 'B3'].forEach(id => {
      assert.ok(branchIds.includes(id), `BRANCHES 应包含 ${id}`);
    });
  });

  it('B2 应包含 CI/CD 模块 b2b', () => {
    const b2 = BRANCHES.find(b => b.id === 'B2');
    assert.ok(b2, '应存在 B2 分支');
    assert.ok(b2.nodeIds.includes('b2b'), 'B2 应包含 b2b');
  });
});

// ==================== KPI 默认值测试 ====================

describe('KPI_DEFAULTS', () => {
  it('应包含所有必要字段', () => {
    assert.ok(typeof KPI_DEFAULTS.testCases === 'number', 'testCases 应为数字');
    assert.ok(typeof KPI_DEFAULTS.testPassRate === 'number', 'testPassRate 应为数字');
    assert.ok(typeof KPI_DEFAULTS.tools === 'number', 'tools 应为数字');
    assert.ok(typeof KPI_DEFAULTS.providers === 'number', 'providers 应为数字');
    assert.ok(typeof KPI_DEFAULTS.scoreTotal === 'number', 'scoreTotal 应为数字');
    assert.ok(typeof KPI_DEFAULTS.modes === 'number', 'modes 应为数字');
  });

  it('testPassRate 应 >= 90（真实 vitest 数据允许少量失败）', () => {
    assert.ok(KPI_DEFAULTS.testPassRate >= 90,
      `testPassRate ${KPI_DEFAULTS.testPassRate} 应 >= 90`);
  });

  it('testCases 应 >= 864', () => {
    assert.ok(KPI_DEFAULTS.testCases >= 864, `testCases ${KPI_DEFAULTS.testCases} 应 >= 864`);
  });

  it('scoreTotal 应在 0-100 范围内', () => {
    assert.ok(KPI_DEFAULTS.scoreTotal >= 0 && KPI_DEFAULTS.scoreTotal <= 100,
      `scoreTotal ${KPI_DEFAULTS.scoreTotal} 应在 0-100 范围内`);
  });
});

// ==================== 管线视图生成测试 ====================

describe('getPipelineView', () => {
  it('应返回 phases 和 branches', () => {
    const view = getPipelineView();
    assert.ok(Array.isArray(view.phases), 'phases 应为数组');
    assert.ok(Array.isArray(view.branches), 'branches 应为数组');
    assert.ok(view.phases.length >= 6, `phases 至少 6 个，实际 ${view.phases.length}`);
    assert.ok(view.branches.length >= 3, `branches 至少 3 个，实际 ${view.branches.length}`);
  });

  it('每个 phase 应有 id/label/nodes', () => {
    for (const phase of getPipelineView().phases) {
      assert.ok(phase.id, `phase 应有 id`);
      assert.ok(phase.label, `phase 应有 label`);
      assert.ok(Array.isArray(phase.nodes), `phase ${phase.id} nodes 应为数组`);
      assert.ok(phase.nodes.length > 0, `phase ${phase.id} 应有至少 1 个 node`);
    }
  });

  it('每个 branch 应有 id/label/nodes', () => {
    for (const branch of getPipelineView().branches) {
      assert.ok(branch.id, `branch 应有 id`);
      assert.ok(branch.label, `branch 应有 label`);
      assert.ok(Array.isArray(branch.nodes), `branch ${branch.id} nodes 应为数组`);
    }
  });

  it('P5 阶段 node IDs 应为 p5a/p5b/p5c', () => {
    const p5 = getPipelineView().phases.find(p => p.id === 'P5');
    assert.ok(p5, '应存在 P5 阶段');
    const nodeIds = p5.nodes.map(n => n.id);
    assert.ok(nodeIds.includes('p5a'), 'P5 应包含 p5a node');
    assert.ok(nodeIds.includes('p5b'), 'P5 应包含 p5b node');
    assert.ok(nodeIds.includes('p5c'), 'P5 应包含 p5c node');
  });
});

// ==================== Dashboard 详情生成测试 ====================

describe('generateDashboardDetails', () => {
  it('应返回 4 张仪表板卡片', () => {
    const details = generateDashboardDetails(KPI_DEFAULTS);
    const cardIds = Object.keys(details);
    assert.ok(cardIds.length >= 4, `至少 4 张卡片，实际 ${cardIds.length}`);
    // 核心卡片应包含
    assert.ok(details.tests, '应有 tests 卡片');
    assert.ok(details.pass, '应有 pass 卡片');
    assert.ok(details.tools, '应有 tools 卡片');
    assert.ok(details.models, '应有 models 卡片');
  });

  it('tests 卡片应有 title/subtitle/items/summary', () => {
    const { tests } = generateDashboardDetails(KPI_DEFAULTS);
    assert.ok(tests.title, 'tests 应有 title');
    assert.ok(tests.subtitle, 'tests 应有 subtitle');
    assert.ok(Array.isArray(tests.items), 'tests items 应为数组');
    assert.ok(tests.items.length >= 13, `tests items 至少 13 个大类`);
    assert.ok(tests.summary, 'tests 应有 summary');
  });

  it('pass 卡片应显示动态通过率', () => {
    const { pass } = generateDashboardDetails(KPI_DEFAULTS);
    // 真实 vitest 数据通过率可能是 95% 等，检查格式而非具体值
    assert.ok(pass.subtitle.includes('%'), `pass subtitle 应包含 %: ${pass.subtitle}`);
    const passStat = pass.stats.find(s => s.label.includes('通过'));
    assert.ok(passStat, '应有"通过"统计项');
  });

  it('tests items 应包含所有 13 个测试大类', () => {
    const { tests } = generateDashboardDetails(KPI_DEFAULTS);
    const labels = tests.items.map(i => i.label);
    const expected = [
      '多模型适配器', 'Agent 系统', '工具系统', '知识库 RAG',
      'MCP 协议', '沙箱执行环境', 'Ink CLI', 'Web Dashboard',
      'Desktop 原生应用', '插件与技能系统', 'IM 适配器',
      'i18n 国际化', '版本控制 + 发布',
    ];
    for (const exp of expected) {
      assert.ok(labels.includes(exp), `tests items 应包含 "${exp}"`);
    }
  });
});

// ==================== 关键词映射测试 ====================

describe('getKeywordMap', () => {
  it('应返回所有模块的关键词映射', () => {
    const km = getKeywordMap();
    assert.ok(typeof km === 'object', '应返回对象');
    assert.ok(Object.keys(km).length >= 29, `至少 29 个模块，实际 ${Object.keys(km).length}`);
  });

  it('每个映射条目应有 name/phase/keywords', () => {
    const km = getKeywordMap();
    for (const [id, entry] of Object.entries(km)) {
      assert.ok(entry.name, `${id} 应有 name`);
      assert.ok(entry.phase, `${id} 应有 phase`);
      assert.ok(Array.isArray(entry.keywords), `${id} keywords 应为数组`);
      assert.ok(entry.keywords.length > 0, `${id} 应有至少 1 个关键词`);
    }
  });

  it('p5a/p5b/p5c 关键词应非空', () => {
    const km = getKeywordMap();
    assert.ok(km.p5a.keywords.length > 0, 'p5a 应有关键词');
    assert.ok(km.p5b.keywords.length > 0, 'p5b 应有关键词');
    assert.ok(km.p5c.keywords.length > 0, 'p5c 应有关键词');
  });
});

// ==================== 评分历史测试 ====================

describe('SCORE_HISTORY', () => {
  it('应包含评分历史条目', () => {
    assert.ok(Array.isArray(SCORE_HISTORY), 'SCORE_HISTORY 应为数组');
    assert.ok(SCORE_HISTORY.length > 0, 'SCORE_HISTORY 应非空');
  });

  it('每个条目应有 date 和 score', () => {
    for (const entry of SCORE_HISTORY) {
      assert.ok(entry.date, '应有 date');
      assert.ok(typeof entry.score === 'number', 'score 应为数字');
    }
  });
});

// ==================== 动态评分测试 ====================

describe('calculateScore', () => {
  it('应返回 total 和 dimensions', () => {
    const result = calculateScore();
    assert.ok(typeof result.total === 'number', 'total 应为数字');
    assert.ok(result.total >= 0 && result.total <= 100, `total ${result.total} 应在 0-100 范围`);
    assert.ok(Array.isArray(result.dimensions), 'dimensions 应为数组');
    assert.equal(result.dimensions.length, 5, '应有 5 个维度');
  });

  it('每个维度应有 label/score/max/note', () => {
    const { dimensions } = calculateScore();
    for (const dim of dimensions) {
      assert.ok(typeof dim.label === 'string', 'label 应为字符串');
      assert.ok(typeof dim.score === 'number', 'score 应为数字');
      assert.ok(dim.score >= 0 && dim.score <= 100, `${dim.label} score 应在 0-100`);
      assert.equal(dim.max, 100, 'max 应为 100');
      assert.ok(typeof dim.note === 'string', 'note 应为字符串');
    }
  });

  it('加权总分应等于各维度加权之和', () => {
    const { total, dimensions } = calculateScore();
    const weights = [0.35, 0.25, 0.20, 0.10, 0.10];
    const computed = Math.round(
      dimensions.reduce((sum, dim, i) => sum + dim.score * weights[i], 0)
    );
    assert.equal(total, computed, `总分 ${total} 应等于加权计算 ${computed}`);
  });
});

describe('getScoreHistory', () => {
  it('应返回评分历史数组（含动态当前值）', () => {
    const history = getScoreHistory();
    assert.ok(Array.isArray(history), '应返回数组');
    assert.ok(history.length >= SCORE_HISTORY.length, '长度应 >= 静态历史');
  });

  it('末尾条目应为动态计算值', () => {
    const history = getScoreHistory();
    const last = history[history.length - 1];
    assert.ok(last.dynamic === true, '最后一条应有 dynamic: true 标记');
    assert.ok(typeof last.score === 'number', 'score 应为数字');
  });
});

describe('getKPI 动态评分', () => {
  it('scoreTotal 应与 calculateScore().total 一致', () => {
    const kpi = getKPI();
    const score = calculateScore();
    assert.equal(kpi.scoreTotal, score.total,
      `KPI scoreTotal ${kpi.scoreTotal} 应等于 calculateScore ${score.total}`);
  });

  it('_scoreDimensions 应包含 5 个维度', () => {
    const kpi = getKPI();
    assert.ok(Array.isArray(kpi._scoreDimensions), '_scoreDimensions 应为数组');
    assert.equal(kpi._scoreDimensions.length, 5, '应有 5 个维度');
  });
});

// ==================== 数据分析 ====================

console.log('\n=== 管线模块数据摘要 ===');
console.log(`模块总数: ${Object.keys(MODULES).length}`);
console.log(`阶段数: ${PHASES.length}`);
console.log(`分支数: ${BRANCHES.length}`);
console.log(`KPI: ${KPI_DEFAULTS.testCases} tests, ${KPI_DEFAULTS.testPassRate}% pass, ${KPI_DEFAULTS.tools} tools`);
console.log(`p5a 状态: ${MODULES.p5a.status}`);
console.log(`p5b 状态: ${MODULES.p5b.status}`);
console.log(`p5c 状态: ${MODULES.p5c.status}`);

const doneCount = Object.values(MODULES).filter(m => m.status === 'done').length;
const inProgressCount = Object.values(MODULES).filter(m => m.status === 'in-progress').length;
const pendingCount = Object.values(MODULES).filter(m => m.status === 'pending').length;
console.log(`模块完成度: ${doneCount} done / ${inProgressCount} in-progress / ${pendingCount} pending`);
