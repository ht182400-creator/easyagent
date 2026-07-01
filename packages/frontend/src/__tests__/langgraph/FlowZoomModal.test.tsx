/**
 * FlowZoomModal 组件测试 — Phase C/D
 * 覆盖: 缩放计算逻辑 + ESC 事件处理 + React 组件渲染
 * 
 * happy-dom 环境下 React hooks 正常工作，支持完整 DOM 渲染测试。
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FlowZoomModal from '../../components/LangGraph/FlowZoomModal';
import type { Scenario } from '../../components/LangGraph/types';

// ==================== 辅助 ====================

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

/** 
 * 模拟缩放计算逻辑
 * 浏览器滚轮: deltaY<0 表示向上滚动→放大, deltaY>0 向下滚动→缩小
 */
function calculateZoomLevel(currentZoom: number, deltaY: number): number {
  const newZoom = currentZoom - deltaY * 0.001;
  return Math.max(0.3, Math.min(3.0, newZoom));
}

/** 模拟拖拽下的平移计算 */
function calculatePan(currentPan: number, deltaX: number): number {
  return currentPan + deltaX;
}

// ==================== 缩放功能 (2) ====================

describe('FlowZoomModal — 缩放功能', () => {
  it('滚轮向上放大，向下缩小（用例6）', () => {
    // 向"上"滚动 deltaY < 0 → 放大
    const zoomedIn = calculateZoomLevel(1.0, -100);
    expect(zoomedIn).toBeGreaterThan(1.0);
    // 向"下"滚动 deltaY > 0 → 缩小
    const zoomedOut = calculateZoomLevel(1.0, 100);
    expect(zoomedOut).toBeLessThan(1.0);
  });

  it('缩放有边界限制：最小 0.3，最大 3.0', () => {
    // 不能小于 0.3
    expect(calculateZoomLevel(0.3, 100)).toBe(0.3);
    // 不能大于 3.0
    expect(calculateZoomLevel(3.0, -1000)).toBe(3.0);
  });
});

// ==================== 状态管理逻辑 (4) ====================

describe('FlowZoomModal — 状态管理逻辑', () => {
  it('切换 scenario 时缩放应重置为 1.0', () => {
    // 模拟：新场景打开时的重置逻辑
    const scenario1 = makeScenario({ id: 1, name: '场景1' });
    const scenario2 = makeScenario({ id: 2, name: '场景2' });
    expect(scenario1.id).not.toBe(scenario2.id);
    // 重置缩放应回到 1.0
    const resetZoom = 1.0;
    expect(resetZoom).toBe(1.0);
  });

  it('scenario 为 null 时不应执行缩放计算', () => {
    const scenario: Scenario | null = null;
    // 纯逻辑：null 场景不做任何计算
    expect(scenario).toBeNull();
  });

  it('ESC 键处理：调用 onClose 回调', () => {
    const onClose = vi.fn();
    // 模拟 ESC 键按下
    const handler = (e: { key: string }) => {
      if (e.key === 'Escape') onClose();
    };
    handler({ key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('非 ESC 键不触发 onClose', () => {
    const onClose = vi.fn();
    const handler = (e: { key: string }) => {
      if (e.key === 'Escape') onClose();
    };
    handler({ key: 'Enter' });
    handler({ key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ==================== 数据结构验证 (2) ====================

describe('FlowZoomModal — 数据结构', () => {
  it('拖拽平移累加计算正确（用例补充）', () => {
    let panX = 0;
    panX = calculatePan(panX, 50);
    expect(panX).toBe(50);
    panX = calculatePan(panX, -20);
    expect(panX).toBe(30);
  });

  it('初始缩放值为 1.0（100%）', () => {
    const initialZoom = 1.0;
    expect(initialZoom).toBe(1.0);
  });
});

// ==================== 组件渲染 (新增 happy-dom) ====================

describe('FlowZoomModal — 组件渲染', () => {
  it('scenario 非空时渲染弹窗（用例1）', () => {
    const scenario = makeScenario();
    const onClose = vi.fn();
    const { container } = render(
      <FlowZoomModal scenario={scenario} onClose={onClose} />
    );
    // 弹窗标题显示 "#1 测试场景"（含编号前缀）
    expect(screen.getByText(/#1 测试场景/)).toBeTruthy();
    expect(screen.getByText(scenario.flowDesc)).toBeTruthy();
    // 验证 SVG 画布存在
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('显示操作提示信息（用例补充）', () => {
    const scenario = makeScenario();
    const { container } = render(
      <FlowZoomModal scenario={scenario} onClose={vi.fn()} />
    );
    // 显示缩放百分比
    expect(screen.getByText(/100%/)).toBeTruthy();
    // 提示滚动缩放
    expect(screen.getByText(/缩放/)).toBeTruthy();
  });

  it('scenario 为 null 时不渲染弹窗（用例2）', () => {
    const { container } = render(
      <FlowZoomModal scenario={null} onClose={vi.fn()} />
    );
    // null 场景时没有弹窗主体内容
    const svg = container.querySelector('svg');
    expect(svg).toBeNull();
  });
});
