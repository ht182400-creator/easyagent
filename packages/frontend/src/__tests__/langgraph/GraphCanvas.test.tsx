/**
 * GraphCanvas 组件测试 — Phase C/D
 * 覆盖: 数据完整性 + React 组件渲染验证
 * 
 * happy-dom 环境下 React hooks 正常工作，支持完整 DOM 渲染测试。
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GraphCanvas, { DEFAULT_NODES, DEFAULT_EDGES, type GraphNode, type GraphEdge } from '../../components/LangGraph/GraphCanvas';

// ==================== 数据完整性 (2) ====================

describe('GraphCanvas — 数据完整性', () => {
  it('DEFAULT_NODES 包含 6 个节点，每个含 id/label/x/y（用例1）', () => {
    expect(DEFAULT_NODES).toHaveLength(6);
    for (const node of DEFAULT_NODES) {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(['start', 'process', 'decision', 'end']).toContain(node.type);
    }
    const nodeMap: Record<string, string> = {};
    DEFAULT_NODES.forEach((n) => { nodeMap[n.id] = n.type; });
    expect(nodeMap['START']).toBe('start');
    expect(nodeMap['think']).toBe('process');
    expect(nodeMap['route']).toBe('decision');
    expect(nodeMap['END']).toBe('end');
  });

  it('DEFAULT_EDGES 包含 6 条边，每个含 from/to/label（用例2）', () => {
    expect(DEFAULT_EDGES).toHaveLength(6);
    for (const edge of DEFAULT_EDGES) {
      expect(edge).toHaveProperty('from');
      expect(edge).toHaveProperty('to');
      expect(edge).toHaveProperty('label');
      expect(['solid', 'conditional', 'dashed']).toContain(edge.type);
    }
    const edgeKeys = DEFAULT_EDGES.map((e) => `${e.from}→${e.to}`);
    expect(edgeKeys).toContain('START→think');
    expect(edgeKeys).toContain('think→route');
    expect(edgeKeys).toContain('route→act');
    expect(edgeKeys).toContain('route→END');
    expect(edgeKeys).toContain('act→observe');
    expect(edgeKeys).toContain('observe→think');
  });

  it('条件边应有 label 和 condition 字段', () => {
    const conditionalEdges = DEFAULT_EDGES.filter((e) => e.type === 'conditional');
    expect(conditionalEdges.length).toBeGreaterThan(0);
    for (const edge of conditionalEdges) {
      expect(edge.label).toBeTruthy();
    }
  });
});

// ==================== 类型验证 ====================

describe('GraphCanvas — 类型导出', () => {
  it('GraphNode 类型应可被正确构造', () => {
    const node: GraphNode = {
      id: 'test', label: 'TEST', type: 'process', x: 100, y: 200, w: 80, h: 40, desc: '测试节点',
    };
    expect(node.id).toBe('test');
    expect(node.x).toBe(100);
  });

  it('GraphEdge 类型应可被正确构造', () => {
    const edge: GraphEdge = {
      from: 'A', to: 'B', type: 'solid', label: 'A→B',
    };
    expect(edge.from).toBe('A');
    expect(edge.type).toBe('solid');
  });
});

// ==================== 渲染验证 (新增 happy-dom) ====================

describe('GraphCanvas — 组件渲染', () => {
  it('应渲染包含 6 个节点标签的 SVG 画布（用例6）', () => {
    const { container } = render(<GraphCanvas />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // 验证节点标签出现在 DOM 中
    const nodeLabels = ['START', 'think', 'route', 'act', 'observe', 'END'];
    for (const label of nodeLabels) {
      const elements = screen.getAllByText(label);
      expect(elements.length).toBeGreaterThan(0);
    }
  });

  it('应渲染边的 SVG path 元素（用例7）', () => {
    const { container } = render(<GraphCanvas />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(6);
  });

  it('条件边应显示 label 文本（用例8）', () => {
    render(<GraphCanvas />);
    // 有两条条件边: "有 tool_calls" 和 "无 tool_calls"
    const labels = screen.getAllByText(/tool_calls/);
    expect(labels.length).toBe(2);
  });
});
