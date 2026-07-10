import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../src/services/graphBuilder';
import type { DocNode } from '../src/types';

describe('graphBuilder', () => {
  it('应根据文档链接构建图谱', () => {
    const docs: DocNode[] = [
      { id: 'A.md', name: 'A', type: 'file', path: 'A.md', content: '[[B]]', links: ['B.md'], backlinks: [] },
      { id: 'B.md', name: 'B', type: 'file', path: 'B.md', content: '', links: [], backlinks: ['A.md'] },
    ];

    const graph = buildGraphData(docs);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.links).toHaveLength(1);
    expect(graph.links[0].source).toBe('A.md');
    expect(graph.links[0].target).toBe('B.md');
  });

  it('无连接的文档半径应最小', () => {
    const docs: DocNode[] = [
      { id: 'A.md', name: 'A', type: 'file', path: 'A.md', content: '', links: [], backlinks: [] },
    ];

    const graph = buildGraphData(docs);
    expect(graph.nodes[0].radius).toBe(5);
  });
});
