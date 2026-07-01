/**
 * 迷你流转图组件 — 场景卡片内的小型 SVG 有向图
 * 从 demo/index.html renderMiniFlowGraph/renderMiniEdges/renderMiniNodes 迁移而来
 */
import React, { useMemo } from 'react';
import type { Scenario, MiniNodePos, MiniFlowGraphProps } from './types';

// ==================== 迷你节点布局 ====================

const MINI_NODE_POS: Record<string, MiniNodePos> = {
  START:   { cx: 375, cy: 30,  w: 56, h: 30, color: '#6b7b8d', label: '入口' },
  think:   { cx: 375, cy: 110, w: 56, h: 34, color: '#00e5ff', label: 'LLM 思考' },
  route:   { cx: 375, cy: 200, w: 56, h: 34, color: '#ffb74d', label: '条件路由' },
  act:     { cx: 195, cy: 200, w: 56, h: 34, color: '#ff5252', label: '执行工具' },
  observe: { cx: 195, cy: 110, w: 56, h: 34, color: '#00ff88', label: '观察结果' },
  END:     { cx: 570, cy: 200, w: 56, h: 30, color: '#6b7b8d', label: '结束' },
};

// ==================== 遍历分析 ====================

/** 遍历段分析：给每次节点访问编号 */
function computeSegments(path: string[]): { node: string; step: number; isEnd: boolean }[] {
  let stepNum = 0;
  return path.map((node, i) => {
    if (node !== 'START' && i < path.length - 1) stepNum++;
    return { node, step: stepNum, isEnd: i === path.length - 1 };
  });
}

/** 计算所有可能的边 */
const ALL_EDGES: { from: string; to: string; type: string }[] = [
  { from: 'START',  to: 'think',   type: 'solid' },
  { from: 'think',  to: 'route',   type: 'solid' },
  { from: 'route',  to: 'act',     type: 'conditional' },
  { from: 'route',  to: 'END',     type: 'conditional' },
  { from: 'act',    to: 'observe', type: 'solid' },
  { from: 'observe',to: 'think',   type: 'loop' },
];

// ==================== 迷你边路径计算 ====================

function getMiniEdgePath(
  from: MiniNodePos,
  to: MiniNodePos,
  fromId: string,
  toId: string,
  xOffset = 0,
  yOffset = 0,
): string {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;

  if (Math.abs(dx) < 50) {
    // 垂直边
    const fromY = dy > 0 ? from.cy + from.h / 2 : from.cy - from.h / 2;
    const toY = dy > 0 ? to.cy - to.h / 2 : to.cy + to.h / 2;
    return `M${from.cx + xOffset},${fromY} L${to.cx + xOffset},${toY}`;
  }
  // 水平边 — 贝塞尔
  const fromX = dx > 0 ? from.cx + from.w / 2 : from.cx - from.w / 2;
  const toX = dx > 0 ? to.cx - to.w / 2 : to.cx + to.w / 2;
  const midX = (fromX + toX) / 2;
  return `M${fromX},${from.cy + yOffset} C${midX},${from.cy + yOffset} ${midX},${to.cy + yOffset} ${toX},${to.cy + yOffset}`;
}

function computeOffsets(count: number): number[] {
  const spacing = 6;
  if (count === 1) return [0];
  const start = -(count - 1) * spacing / 2;
  return Array.from({ length: count }, (_, i) => start + i * spacing);
}

// ==================== 主组件 ====================

/**
 * 迷你流转图
 * 在场景卡片内展示简化的有向图流转路径
 */
export default function MiniFlowGraph({
  scenario,
  actualPath,
  width = '100%',
  height = '100%',
}: MiniFlowGraphProps) {
  const path = actualPath || scenario.traversalPath || [];

  // 构建遍历边对集合
  const traversedPairSet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      set.add(`${path[i]}→${path[i + 1]}`);
    }
    return set;
  }, [path]);

  // 统计每条边的出现次数和偏移
  const { pairOffsetMap, pairIdxMap } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}→${path[i + 1]}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    const offsetMap: Record<string, number[]> = {};
    const idxMap: Record<string, number> = {};
    for (const [key, cnt] of Object.entries(counts)) {
      offsetMap[key] = computeOffsets(cnt);
      idxMap[key] = 0;
    }
    return { pairOffsetMap: offsetMap, pairIdxMap: idxMap };
  }, [path]);

  // 遍历段
  const segments = useMemo(() => computeSegments(path), [path]);

  // 唯一节点集合
  const uniqueNodes = useMemo(() => [...new Set(path)], [path]);

  return (
    <svg
      viewBox="120 -15 530 250"
      preserveAspectRatio="xMidYMid meet"
      style={{ width, height }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker id={`mini-arrow-${scenario.id}`} markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0 L6,2.5 L0,5 Z" fill="#00e5ff" opacity="0.8" />
        </marker>
        <marker id={`mini-arrow-dim-${scenario.id}`} markerWidth="6" markerHeight="5" refX="6" refY="2.5" orient="auto">
          <path d="M0,0 L6,2.5 L0,5 Z" fill="#1a2530" opacity="0.4" />
        </marker>
      </defs>

      {/* 第一遍：未被遍历的边（暗色背景） */}
      {ALL_EDGES.map((edge, i) => {
        const key = `${edge.from}→${edge.to}`;
        if (traversedPairSet.has(key)) return null;
        const fromPos = MINI_NODE_POS[edge.from];
        const toPos = MINI_NODE_POS[edge.to];
        if (!fromPos || !toPos) return null;
        const d = getMiniEdgePath(fromPos, toPos, edge.from, edge.to, 0, 0);
        return (
          <path
            key={`dim-${i}`}
            d={d}
            fill="none"
            stroke="#1a2530"
            strokeWidth={1.2}
            opacity={0.4}
            markerEnd={`url(#mini-arrow-dim-${scenario.id})`}
          />
        );
      })}

      {/* 第二遍：遍历的边（高亮样式 + 序号标签） */}
      {Array.from({ length: path.length - 1 }, (_, i) => {
        const stepNum = i + 1;
        const fromId = path[i];
        const toId = path[i + 1];
        const key = `${fromId}→${toId}`;
        const fromPos = MINI_NODE_POS[fromId];
        const toPos = MINI_NODE_POS[toId];
        if (!fromPos || !toPos) return null;

        const offset = pairOffsetMap[key]?.[pairIdxMap[key]++] ?? 0;
        const isVertical = Math.abs(toPos.cx - fromPos.cx) < 50;
        const xOffset = isVertical ? offset : 0;
        const yOffset = isVertical ? 0 : offset;

        const d = getMiniEdgePath(fromPos, toPos, fromId, toId, xOffset, yOffset);
        const labelX = (fromPos.cx + toPos.cx) / 2 + xOffset;
        const labelY = (fromPos.cy + toPos.cy) / 2 + yOffset - 4;

        return (
          <React.Fragment key={`edge-${i}`}>
            <path
              d={d}
              fill="none"
              stroke="#00e5ff"
              strokeWidth={1.8}
              opacity={1}
              markerEnd={`url(#mini-arrow-${scenario.id})`}
              style={{
                filter: 'drop-shadow(0 0 2px rgba(0,229,255,0.3))',
                animation: 'mini-edge-pulse 1.5s ease infinite',
              }}
            />
            <text
              x={labelX}
              y={labelY}
              fill="#fff"
              fontSize={8}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontFamily: "'JetBrains Mono', monospace", pointerEvents: 'none' }}
            >
              {stepNum}
            </text>
          </React.Fragment>
        );
      })}

      {/* 节点 */}
      {Object.entries(MINI_NODE_POS).map(([id, p]) => {
        const traverseCount = segments.filter((s) => s.node === id).length;
        const isTraversed = traverseCount > 0;

        const x = p.cx - p.w / 2;
        const y = p.cy - p.h / 2;
        const lx = p.cx;
        const ly = p.cy + 1;

        // 单次遍历节点的序号徽标
        let badge = null;
        if (traverseCount === 1 && isTraversed && id !== 'START' && id !== 'END') {
          const step = segments.find((s) => s.node === id)?.step || '';
          badge = (
            <text
              x={lx}
              y={ly + 11}
              fill={p.color}
              fontSize={8}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ pointerEvents: 'none', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {step}
            </text>
          );
        }

        return (
          <React.Fragment key={`node-${id}`}>
            <rect
              x={x}
              y={y}
              width={p.w}
              height={p.h}
              rx={4}
              ry={4}
              fill={isTraversed ? '#0e1a22' : '#0c1117'}
              stroke={isTraversed ? p.color : '#1a2530'}
              strokeWidth={1.5}
              opacity={isTraversed ? 1 : 0.5}
              style={{
                filter: isTraversed ? 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' : undefined,
                transition: 'all 0.3s ease',
              }}
            />
            <text
              x={lx}
              y={ly - 1}
              fill={isTraversed ? '#dde4ec' : '#4a5568'}
              fontSize={10}
              fontWeight={600}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ pointerEvents: 'none', fontFamily: "'JetBrains Mono', monospace" }}
            >
              {id === 'START' ? '▶ START' : id === 'END' ? 'END ■' : id}
            </text>
            {badge}
          </React.Fragment>
        );
      })}

      {/* 内联动画 */}
      <style>{`
        @keyframes mini-edge-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}
