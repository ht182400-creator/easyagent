import { useLayoutEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useDocStore } from '../stores/docStore';
import type { GraphMode, GraphNode, GraphLink } from '../types';

/** 渲染出错时的最小尺寸回退值 */
const FALLBACK_SIZE = 600;

/**
 * 关系图谱组件
 * 使用 D3 力导向图展示文档间 WikiLink 关系
 */
export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { graphData, groupColorMap, selectedDocId, selectDoc, settings, setGraphMode } = useDocStore();

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || graphData.nodes.length === 0) return;

    // 确保容器有有效尺寸，避免 D3 在 0 宽高上出错
    const width = container.clientWidth || FALLBACK_SIZE;
    const height = container.clientHeight || FALLBACK_SIZE;

    try {
      // 清空之前的内容
      container.innerHTML = '';

      const svg = d3
        .select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

      // 缩放行为
      const g = svg.append('g');
      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
      svg.call(zoomBehavior);

      // 颜色映射：与文件树共享同一份 group→color 映射（来自 docStore）
      const colorScale = (group: string) => groupColorMap.get(group) ?? '#64748b';

      // 按目录分组中心：孤立节点会被拉向各自目录中心，形成簇状
      const groupCenters = computeGroupCenters(graphData.nodes, width, height);

      // 力模拟：链接力 + 斥力 + 中心力 + 碰撞 + 分组聚集
      const simulation = d3
        .forceSimulation<GraphNode>(graphData.nodes)
        .force(
          'link',
          d3
            .forceLink<GraphNode, GraphLink>(graphData.links)
            .id((d) => d.id)
            // 弱关联距离更长，强关联距离更短
            .distance((d) => (d.type === 'weak' ? 250 : 120)) as d3.ForceLink<GraphNode, GraphLink>,
        )
        .force('charge', d3.forceManyBody<GraphNode>().strength(-300))
        .force('center', d3.forceCenter<GraphNode>(width / 2, height / 2))
        .force('collide', d3.forceCollide<GraphNode>().radius((d) => (d.radius ?? 10) + 10))
        .force(
          'groupX',
          d3
            .forceX<GraphNode>((d) => groupCenters.get(d.group)?.x ?? width / 2)
            .strength((d) => (d.connectionCount === 0 ? 0.12 : 0.03)),
        )
        .force(
          'groupY',
          d3
            .forceY<GraphNode>((d) => groupCenters.get(d.group)?.y ?? height / 2)
            .strength((d) => (d.connectionCount === 0 ? 0.12 : 0.03)),
        );

      // 绘制连线：弱关联（灰色虚线）+ 强关联（实线）
      const strongLinks = graphData.links.filter((l) => l.type !== 'weak');
      const weakLinks = graphData.links.filter((l) => l.type === 'weak');

      // 弱关联线：先绘制（在底层），灰色虚线
      const weakLinkG = g.append('g').attr('class', 'weak-links');
      const weakLink = weakLinkG
        .selectAll('line')
        .data(weakLinks)
        .join('line')
        .attr('stroke', '#94a3b8')
        .attr('stroke-opacity', 0.25)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5');

      // 强关联线：后绘制（在上层），实线
      const strongLinkG = g.append('g').attr('class', 'strong-links');
      const strongLink = strongLinkG
        .selectAll('line')
        .data(strongLinks)
        .join('line')
        .attr('stroke', '#cbd5e1')
        .attr('stroke-opacity', 0.6)
        .attr('stroke-width', 1.5);

      // 绘制节点
      const node = g
        .append('g')
        .selectAll('g')
        .data(graphData.nodes)
        .join('g')
        .attr('cursor', 'pointer')
        .call(
          d3
            .drag<SVGGElement, GraphNode>()
            .on('start', function (event, d) {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', function (event, d) {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', function (event, d) {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            }) as unknown as (
            selection: d3.Selection<d3.BaseType | SVGGElement, GraphNode, SVGGElement, unknown>,
          ) => void,
        )
        .on('click', (_, d) => {
          selectDoc(d.id);
        });

      node
        .append('circle')
        .attr('r', (d) => d.radius ?? 10)
        .attr('fill', (d) => colorScale(d.group))
        .attr('stroke', (d) => (d.id === selectedDocId ? '#4f46e5' : '#fff'))
        .attr('stroke-width', (d) => (d.id === selectedDocId ? 3 : 1.5));

      node
        .append('text')
        .attr('dy', (d) => (d.radius ?? 10) + 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', '10px')
        .attr('fill', '#334155')
        .text((d) => d.label);

      // 模拟更新位置
      simulation.on('tick', () => {
        strongLink
          .attr('x1', (d) => ((d.source as unknown) as GraphNode).x ?? 0)
          .attr('y1', (d) => ((d.source as unknown) as GraphNode).y ?? 0)
          .attr('x2', (d) => ((d.target as unknown) as GraphNode).x ?? 0)
          .attr('y2', (d) => ((d.target as unknown) as GraphNode).y ?? 0);

        weakLink
          .attr('x1', (d) => ((d.source as unknown) as GraphNode).x ?? 0)
          .attr('y1', (d) => ((d.source as unknown) as GraphNode).y ?? 0)
          .attr('x2', (d) => ((d.target as unknown) as GraphNode).x ?? 0)
          .attr('y2', (d) => ((d.target as unknown) as GraphNode).y ?? 0);

        node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

      return () => {
        simulation.stop();
      };
    } catch (err) {
      console.error('[GraphView] D3 渲染异常:', err);
    }
  }, [graphData, groupColorMap, selectedDocId, selectDoc]);

  return (
    <div className="relative h-full w-full bg-slate-50">
      {/* 图谱信息提示 */}
      <div className="absolute left-3 top-3 z-10 rounded-md bg-white/90 px-3 py-2 text-xs shadow-sm">
        <div className="font-semibold text-slate-700">关系图谱</div>
        <div className="text-slate-500">节点 = 文档，边 = WikiLink</div>
        <div className="text-slate-500">点击节点预览文档，拖拽调整布局</div>
      </div>

      {/* 图谱模式切换 */}
      <GraphModeToggle mode={settings.graphMode} onChange={setGraphMode} />

      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

/**
 * 图谱模式切换按钮
 */
function GraphModeToggle({ mode, onChange }: { mode: GraphMode; onChange: (mode: GraphMode) => void }) {
  return (
    <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-md bg-white/90 p-1 shadow-sm">
      <button
        onClick={() => onChange('global')}
        className={`rounded px-2.5 py-1 text-xs font-medium ${
          mode === 'global'
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        全局
      </button>
      <button
        onClick={() => onChange('neighbors')}
        className={`rounded px-2.5 py-1 text-xs font-medium ${
          mode === 'neighbors'
            ? 'bg-indigo-100 text-indigo-700'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        关联
      </button>
    </div>
  );
}

/**
 * 计算每个目录分组的中心位置
 * 将各组均匀分布在一个圆环上，孤立节点会被拉向该圆环，形成按目录聚集的簇
 */
function computeGroupCenters(
  nodes: GraphNode[],
  width: number,
  height: number,
): Map<string, { x: number; y: number }> {
  const groups = Array.from(new Set(nodes.map((d) => d.group))).sort();
  const centers = new Map<string, { x: number; y: number }>();
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.3;

  groups.forEach((group, i) => {
    const angle = (2 * Math.PI * i) / Math.max(groups.length, 1) - Math.PI / 2;
    centers.set(group, {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  });

  return centers;
}
