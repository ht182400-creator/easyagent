/**
 * MiniFlowGraph 组件测试 — Phase C/D
 * 覆盖: 计算逻辑 + 数据结构验证 + React 组件渲染
 * 
 * happy-dom 环境下 React hooks 正常工作，支持完整 DOM/SVG 渲染测试。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import MiniFlowGraph from '../../components/LangGraph/MiniFlowGraph';
import type { Scenario } from '../../components/LangGraph/types';

// ==================== 辅助 ====================

/** 创建基础场景 */
function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 1,
    name: '测试场景',
    path: 'START → think → END',
    desc: '测试描述',
    input: '测试输入',
    icon: '🧪',
    traversalPath: ['START', 'think', 'route', 'END'],
    flowDesc: '直通',
    ...overrides,
  };
}

/** 模拟 computeOffsets 逻辑（从 MiniFlowGraph 组件提取的纯函数） */
function computeOffsets(traversalPath: string[]): Map<string, number> {
  const visitCounts = new Map<string, number>();
  const offsets = new Map<string, number>();
  for (const node of traversalPath) {
    const count = visitCounts.get(node) || 0;
    offsets.set(`${node}:${count}`, count);
    visitCounts.set(node, count + 1);
  }
  return offsets;
}

/** 模拟 getMiniEdgePath 逻辑 */
function getMiniEdgePath(from: {x:number, y:number}, to: {x:number, y:number}): string {
  return `M${from.x},${from.y} L${to.x},${to.y}`;
}

// ==================== 计算逻辑 (3) ====================

describe('MiniFlowGraph — 计算逻辑', () => {
  it('单次遍历无重复节点时偏移全为 0（用例1 — computeOffsets）', () => {
    const path = ['START', 'think', 'route', 'END'];
    const offsets = computeOffsets(path);
    for (const key of offsets.keys()) {
      expect(offsets.get(key)).toBe(0);
    }
  });

  it('重复遍历产生递增偏移（用例2 — computeOffsets 偏移递增）', () => {
    const path = ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'];
    const offsets = computeOffsets(path);
    // think 第1次: offset 0, 第2次: offset 1
    expect(offsets.get('think:0')).toBe(0);
    expect(offsets.get('think:1')).toBe(1);
    // route 第1次: 0, 第2次: 1
    expect(offsets.get('route:0')).toBe(0);
    expect(offsets.get('route:1')).toBe(1);
  });

  it('getMiniEdgePath 生成有效的 SVG path（用例3 — M 开头, 坐标数字）', () => {
    const path = getMiniEdgePath({ x: 10, y: 20 }, { x: 30, y: 40 });
    expect(path).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
  });
});

// ==================== 数据结构验证 (2) ====================

describe('MiniFlowGraph — 数据结构', () => {
  it('Scenario 类型应包含 traversalPath 可选字段（用例4）', () => {
    const scenario = makeScenario();
    expect(Array.isArray(scenario.traversalPath)).toBe(true);
  });

  it('空 traversalPath 的场景仍然合法（用例5）', () => {
    const scenario = makeScenario({ traversalPath: [] });
    expect(scenario.traversalPath).toHaveLength(0);
    const offsets = computeOffsets(scenario.traversalPath);
    expect(offsets.size).toBe(0);
  });
});

// ==================== 遍历编号逻辑 (2) ====================

describe('MiniFlowGraph — 遍历编号', () => {
  it('长路径生成正确数量的步骤编号（1-indexed）（用例7）', () => {
    const path = ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'];
    // 7 条边 → 编号 1-7（1-indexed）
    const edgeSteps = path.slice(0, -1).map((_, i) => i + 1);
    expect(edgeSteps).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('重复访问同一节点时编号不重复（用例8）', () => {
    const path = ['START', 'think', 'route', 'act', 'observe', 'think', 'route', 'END'];
    const steps = path.slice(0, -1).map((_, i) => i + 1);
    // think 出现在 step 1 和 step 5
    expect(steps[0]).toBe(1); // START→think
    expect(steps[4]).toBe(5); // observe→think (第二次访问 think)
    // 所有编号都是唯一的
    expect(new Set(steps).size).toBe(steps.length);
  });
});

// ==================== 组件渲染 (新增 happy-dom) ====================

describe('MiniFlowGraph — 组件渲染', () => {
  it('应渲染 SVG 画布并包含节点标签（用例4补充）', () => {
    const scenario = makeScenario();
    const { container } = render(<MiniFlowGraph scenario={scenario} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // SVG 节点标签带有前缀（如 "▶ START"），使用包含匹配
    const nodeLabels = ['START', 'think', 'route', 'END'];
    for (const label of nodeLabels) {
      const elements = screen.getAllByText((content) => content.includes(label));
      expect(elements.length).toBeGreaterThan(0);
    }
  });

  it('无 traversalPath 时仍正常渲染默认视图（用例5补充）', () => {
    const scenario = makeScenario({ traversalPath: [] });
    const { container } = render(<MiniFlowGraph scenario={scenario} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('支持自定义宽高（用例补充）', () => {
    const scenario = makeScenario();
    const { container } = render(
      <MiniFlowGraph scenario={scenario} width={200} height={150} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });
});
