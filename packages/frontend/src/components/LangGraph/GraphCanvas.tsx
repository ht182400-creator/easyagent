/**
 * LangGraph 有向图可视化画布 — SVG React 组件
 * 将 demo/index.html 的原生 DOM 渲染迁移为 React JSX
 * 特性: 6节点 + 6边 + 箭头标记 + 节点高亮 + 虚线动画
 */
import React, { useCallback, useMemo, useRef, useEffect } from 'react';

// ==================== 类型定义 ====================

/** 图节点 */
export interface GraphNode {
  id: string;
  label: string;
  type: 'start' | 'process' | 'decision' | 'end';
  x: number;
  y: number;
  w: number;
  h: number;
  desc: string;
}

/** 图边 */
export interface GraphEdge {
  from: string;
  to: string;
  type: 'solid' | 'conditional' | 'dashed';
  label: string;
  condition?: string;
}

/** 边方向信息 */
interface EdgeDirection {
  fromSide: 'top' | 'bottom' | 'left' | 'right';
  toSide: 'top' | 'bottom' | 'left' | 'right';
}

// ==================== 默认图数据 ====================

/** 默认 6 节点 */
export const DEFAULT_NODES: GraphNode[] = [
  { id: 'START',  label: 'START',  type: 'start',    x: 375, y: 40,  w: 90, h: 50, desc: '用户输入' },
  { id: 'think',  label: 'think',  type: 'process',  x: 375, y: 130, w: 90, h: 56, desc: 'LLM 思考' },
  { id: 'route',  label: 'route',  type: 'decision', x: 375, y: 240, w: 90, h: 56, desc: '条件路由' },
  { id: 'observe',label: 'observe',type: 'process',  x: 180, y: 130, w: 90, h: 56, desc: '观察结果' },
  { id: 'act',    label: 'act',    type: 'process',  x: 180, y: 240, w: 90, h: 56, desc: '执行工具' },
  { id: 'END',    label: 'END',    type: 'end',      x: 610, y: 240, w: 90, h: 50, desc: '结束' },
];

/** 默认 6 条边 */
export const DEFAULT_EDGES: GraphEdge[] = [
  { from: 'START',  to: 'think',   type: 'solid',       label: 'addEdge' },
  { from: 'think',  to: 'route',   type: 'solid',       label: 'addEdge' },
  { from: 'route',  to: 'act',     type: 'conditional', label: '有 tool_calls', condition: '>0' },
  { from: 'route',  to: 'END',     type: 'conditional', label: '无 tool_calls', condition: '=0' },
  { from: 'act',    to: 'observe', type: 'solid',       label: 'addEdge' },
  { from: 'observe',to: 'think',   type: 'dashed',      label: '循环',          condition: '<maxTurns' },
];

// ==================== 几何计算工具 ====================

/** 获取端口偏移（节点四边中点） */
function getPortOffset(node: GraphNode) {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return {
    top:    { x: cx, y: node.y },
    bottom: { x: cx, y: node.y + node.h },
    left:   { x: node.x, y: cy },
    right:  { x: node.x + node.w, y: cy },
    cx,
    cy,
  };
}

/** 判断连线方向 */
function getEdgeDirection(from: GraphNode, to: GraphNode): EdgeDirection {
  const f = getPortOffset(from);
  const t = getPortOffset(to);
  const dx = t.cx - f.cx;
  const dy = t.cy - f.cy;
  if (Math.abs(dx) < 50) {
    return dy > 0
      ? { fromSide: 'bottom', toSide: 'top' }
      : { fromSide: 'top', toSide: 'bottom' };
  }
  return dx > 0
    ? { fromSide: 'right', toSide: 'left' }
    : { fromSide: 'left', toSide: 'right' };
}

/** 生成 SVG 路径 d 属性 */
function buildEdgePath(from: GraphNode, to: GraphNode): string {
  const dir = getEdgeDirection(from, to);
  const fp = getPortOffset(from);
  const tp = getPortOffset(to);
  const fromP = fp[dir.fromSide];
  const toP = tp[dir.toSide];

  if (dir.fromSide === 'bottom' || dir.fromSide === 'top') {
    // 垂直边 — 直线
    return `M${fromP.x},${fromP.y} L${toP.x},${toP.y}`;
  }
  // 水平边 — 贝塞尔曲线
  const midX = (fromP.x + toP.x) / 2;
  return `M${fromP.x},${fromP.y} C${midX},${fromP.y} ${midX},${toP.y} ${toP.x},${toP.y}`;
}

/** 计算边标签位置（避让节点） */
function getEdgeLabelPos(from: GraphNode, to: GraphNode): { x: number; y: number } {
  const dir = getEdgeDirection(from, to);
  const fp = getPortOffset(from);
  const tp = getPortOffset(to);

  if (dir.fromSide === 'right' || dir.fromSide === 'left') {
    return { x: (fp[dir.fromSide].x + tp[dir.toSide].x) / 2, y: Math.min(from.y, to.y) - 6 };
  }
  return { x: (fp[dir.fromSide].x + tp[dir.toSide].x) / 2, y: (fp[dir.fromSide].y + tp[dir.toSide].y) / 2 - 8 };
}

// ==================== 节点颜色映射 ====================

const NODE_COLORS: Record<string, string> = {
  start:    '#8899aa',
  process:  '#00e5ff',
  decision: '#ffb74d',
  end:      '#8899aa',
};

const NODE_BG: Record<string, string> = {
  start:    '#141e26',
  process:  '#0e1a22',
  decision: '#1a1610',
  end:      '#111a1e',
};

// ==================== Props ====================

interface GraphCanvasProps {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  /** 当前高亮的节点 ID (null = 取消) */
  highlightedNode?: string | null;
  /** 高亮的边 from→to 集合 */
  highlightedEdges?: Set<string>;
  /** 节点点击回调 */
  onNodeClick?: (nodeId: string) => void;
  /** viewBox 属性 */
  viewBox?: string;
  /** 容器高度 */
  height?: number;
  /** 是否显示图例 */
  showLegend?: boolean;
  /** 是否显示元数据 */
  showMeta?: boolean;
}

// ==================== 组件 ====================

/**
 * 有向图 SVG 画布组件
 * 从 demo/index.html renderGraph() 迁移而来
 */
export default function GraphCanvas({
  nodes = DEFAULT_NODES,
  edges = DEFAULT_EDGES,
  highlightedNode = null,
  highlightedEdges = new Set(),
  onNodeClick,
  viewBox = '0 10 800 360',
  height = 500,
  showLegend = true,
  showMeta = true,
}: GraphCanvasProps) {
  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [nodes]);

  // 循环边计数
  const loopEdgeCount = useMemo(
    () => edges.filter((e) => e.type === 'dashed').length,
    [edges],
  );
  const hasCycle = loopEdgeCount > 0;

  return (
    <div
      className="rounded-lg border border-[#1a2530] bg-[#0e1419] overflow-hidden"
      style={{ position: 'relative' }}
    >
      {/* 头部 */}
      {showMeta && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2530] bg-black/20">
          <h2 className="text-sm font-medium text-[#00e5ff] tracking-wider">
            ◈ 有向图结构
          </h2>
          <div className="flex gap-4 text-[11px] text-[#4a5568]">
            <span>节点: {nodes.length}</span>
            <span>边: {edges.length}</span>
            <span>环形: {hasCycle ? '是' : '否'}</span>
          </div>
        </div>
      )}

      {/* SVG 画布 */}
      <div
        className="relative overflow-hidden"
        style={{
          height,
          background:
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      >
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: '100%', height: '100%' }}
        >
          {/* 箭头标记定义 */}
          {defsMarkers}

          {/* 边 */}
          {edges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;

            const edgeKey = `${edge.from}→${edge.to}`;
            const isActive = highlightedEdges.has(edgeKey);
            const pathD = buildEdgePath(fromNode, toNode);
            const labelPos = getEdgeLabelPos(fromNode, toNode);

            return (
              <g key={`edge-${i}`} data-edge={edgeKey}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={isActive ? '#00e5ff' : '#2a3a4a'}
                  strokeWidth={isActive ? 2.5 : 2}
                  strokeDasharray={edge.type === 'conditional' ? '6 4' : edge.type === 'dashed' ? '4 6' : undefined}
                  markerEnd={`url(#arrow-${edge.type}${isActive ? '-active' : ''})`}
                  style={{
                    filter: isActive ? 'drop-shadow(0 0 4px rgba(0,229,255,0.4))' : undefined,
                    transition: 'stroke 0.4s ease',
                  }}
                  className={edge.type === 'dashed' ? 'animate-dash-flow' : ''}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  fill="#8899aa"
                  fontSize={12}
                  fontWeight={500}
                  textAnchor="middle"
                  stroke="rgba(8,12,18,0.85)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {edge.label}
                </text>
              </g>
            );
          })}

          {/* 节点 */}
          {nodes.map((node) => {
            const isHighlighted = highlightedNode === node.id;
            const color = NODE_COLORS[node.type] || '#8899aa';
            const bg = NODE_BG[node.type] || '#0c1117';

            return (
              <g
                key={`node-${node.id}`}
                data-node={node.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onNodeClick?.(node.id)}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx={6}
                  ry={6}
                  fill={bg}
                  stroke={color}
                  strokeWidth={2}
                  style={{
                    filter: isHighlighted
                      ? 'drop-shadow(0 0 12px rgba(0,229,255,0.6))'
                      : undefined,
                    transition: 'all 0.3s ease',
                  }}
                  className={isHighlighted ? 'animate-node-glow' : ''}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.filter = 'brightness(1.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = isHighlighted
                      ? 'drop-shadow(0 0 12px rgba(0,229,255,0.6))'
                      : 'none';
                  }}
                />
                {/* 节点名称 */}
                <text
                  x={node.x + node.w / 2}
                  y={node.y + node.h / 2 - 5}
                  fill="#dde4ec"
                  fontSize={12}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ pointerEvents: 'none', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {node.label}
                </text>
                {/* 节点描述 */}
                <text
                  x={node.x + node.w / 2}
                  y={node.y + node.h / 2 + 11}
                  fill="#667788"
                  fontSize={10}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ pointerEvents: 'none', fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {node.desc}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 图例 */}
      {showLegend && (
        <div className="flex gap-5 px-5 py-2.5 border-t border-[#1a2530] text-[11px] text-[#4a5568]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-[#00e5ff] bg-[rgba(0,229,255,0.1)]" />
            处理节点
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-[#ffb74d] bg-[rgba(255,183,77,0.1)]" />
            路由决策
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-b-2 border-dashed border-[#4a5568] rounded-none" />
            循环边
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0 border-b-2 border-dashed border-[#4a5568] rounded-none" />
            条件边
          </span>
        </div>
      )}

      {/* 内联动画关键帧 */}
      <style>{animStyles}</style>
    </div>
  );
}

// ==================== SVG 箭头标记定义 ====================

const defsMarkers = (
  <defs>
    {(['solid', 'conditional', 'dashed'] as const).map((type) => {
      const baseColor = type === 'conditional' ? '#4a3a1a' : '#3a4a5a';
      const activeColor = type === 'conditional' ? '#ffb74d' : '#00e5ff';
      return (
        <React.Fragment key={type}>
          <marker id={`arrow-${type}`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <path d="M0,0 L10,3.5 L0,7 Z" fill={baseColor} />
          </marker>
          <marker id={`arrow-${type}-active`} markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <path d="M0,0 L10,3.5 L0,7 Z" fill={activeColor} />
          </marker>
        </React.Fragment>
      );
    })}
  </defs>
);

// ==================== 内联动画样式 ====================

const animStyles = `
@keyframes node-glow {
  0%, 100% { filter: drop-shadow(0 0 3px rgba(0,229,255,0.3)); }
  50% { filter: drop-shadow(0 0 12px rgba(0,229,255,0.6)); }
}
@keyframes dash-flow {
  to { stroke-dashoffset: -20; }
}
.animate-node-glow {
  animation: node-glow 1.5s ease infinite;
}
.animate-dash-flow {
  animation: dash-flow 2s linear infinite;
}
`;
