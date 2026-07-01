/**
 * LangGraph 流转图放大弹窗组件
 * 从 demo/index.html 的 openFlowZoom/closeFlowZoom 迁移而来
 * 支持滚轮缩放、拖拽平移、ESC 关闭
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import MiniFlowGraph from './MiniFlowGraph';
import type { Scenario } from './types';

// ==================== Props ====================

interface FlowZoomModalProps {
  scenario: Scenario | null;
  onClose: () => void;
}

// ==================== 组件 ====================

/**
 * 流转图放大弹窗
 * 以更大 viewBox 渲染迷你流转图，支持缩放拖拽
 */
export default function FlowZoomModal({ scenario, onClose }: FlowZoomModalProps) {
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);

  const isOpen = scenario !== null;

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setZoomLevel(1.0);
      setPanX(0);
      setPanY(0);
    }
  }, [scenario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // 滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const newZoom = Math.max(0.3, Math.min(3.0, zoomLevel + delta));

      // 以鼠标位置为中心缩放
      if (bodyRef.current) {
        const rect = bodyRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const scaleRatio = newZoom / zoomLevel;
        setPanX(mx - scaleRatio * (mx - panX));
        setPanY(my - scaleRatio * (my - panY));
      }
      setZoomLevel(newZoom);
    },
    [zoomLevel, panX, panY],
  );

  // 拖拽开始
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
    },
    [panX, panY],
  );

  // 拖拽移动
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPanX(dragStartRef.current.panX + (e.clientX - dragStartRef.current.x));
      setPanY(dragStartRef.current.panY + (e.clientY - dragStartRef.current.y));
    },
    [isDragging],
  );

  // 拖拽结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 点击遮罩关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!scenario) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[rgba(2,5,10,0.92)] backdrop-blur-md flex flex-col items-center justify-center transition-opacity duration-300 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={handleOverlayClick}
    >
      <div className="w-[90vw] max-w-[1100px] h-[78vh] bg-[#111922] border border-[#1a2530] rounded-xl shadow-[0_0_80px_rgba(0,229,255,0.08)] flex flex-col overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1a2530] flex-shrink-0">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-[#dde4ec]">
            <span>#{scenario.id} {scenario.name}</span>
            <span className="text-[10px] px-2.5 py-0.5 rounded bg-[rgba(0,229,255,0.1)] text-[#00e5ff] border border-[rgba(0,229,255,0.2)]">
              {scenario.flowDesc}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border border-[#1a2530] rounded-md text-[#7a8b9e] hover:bg-[rgba(255,82,82,0.12)] hover:border-[#ff5252] hover:text-[#ff5252] transition-all"
            title="关闭 (ESC)"
          >
            ✕
          </button>
        </div>

        {/* 内容 */}
        <div
          ref={bodyRef}
          className="flex-1 flex items-center justify-center p-2.5 overflow-hidden"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease',
            }}
          >
            {/* 直接使用 MiniFlowGraph，避免 SVG 嵌套问题 */}
            <MiniFlowGraph
              key={`zoom-${scenario.id}`}
              scenario={scenario}
              width="700px"
              height="450px"
            />
          </div>
        </div>

        {/* 底部操作提示 */}
        <div className="flex items-center gap-4 px-5 py-2 border-t border-[#1a2530] text-[10px] text-[#4a5568] flex-shrink-0">
          <span>🖱️ <kbd className="px-1.5 py-0.5 border border-[#1a2530] rounded bg-white/[0.03] text-[9px]">滚轮</kbd> 缩放</span>
          <span>🖱️ <kbd className="px-1.5 py-0.5 border border-[#1a2530] rounded bg-white/[0.03] text-[9px]">拖拽</kbd> 平移</span>
          <span><kbd className="px-1.5 py-0.5 border border-[#1a2530] rounded bg-white/[0.03] text-[9px]">ESC</kbd> 关闭</span>
          <span className="ml-auto text-[#00e5ff] font-mono text-[10px]">{Math.round(zoomLevel * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

export { FlowZoomModal };
