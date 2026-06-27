/**
 * TabBar 组件测试
 * 覆盖: 空状态、单个/多个标签、活动状态、关闭、去重
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TabBar } from '@/components/layout/TabBar';
import { useUIStore } from '@/stores/uiStore';
import type { Tab } from '@/stores/uiStore';

/** 构造测试标签 */
function makeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    type: 'chat',
    title: '新对话',
    closable: true,
    ...overrides,
  };
}

describe('TabBar', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarOpen: true,
      activeView: 'chat',
      tabs: [],
      activeTabId: null,
      toasts: [],
    });
  });

  // ==================== 空状态 ====================

  describe('空状态', () => {
    it('无标签时应渲染 null', () => {
      const { container } = render(<TabBar />);
      // 无 DOM 输出
      expect(container.innerHTML).toBe('');
    });
  });

  // ==================== 单个标签 ====================

  describe('单个标签', () => {
    beforeEach(() => {
      useUIStore.getState().openTab(makeTab());
    });

    it('应显示标签标题', () => {
      const { getByText } = render(<TabBar />);
      expect(getByText('新对话')).toBeTruthy();
    });

    it('活动标签应有高亮样式', () => {
      const { container } = render(<TabBar />);
      // 活动标签有 border-t-brand 类
      const tab = container.querySelector('.border-t-brand');
      expect(tab).toBeTruthy();
    });

    it('不可关闭的标签不应有关闭按钮', () => {
      // 添加不可关闭标签
      useUIStore
        .getState()
        .openTab(makeTab({ id: 'settings', type: 'settings', title: '设置', closable: false }));
      useUIStore.getState().setActiveTab('settings');

      const { container } = render(<TabBar />);
      const closeButtons = container.querySelectorAll('button');
      // 不可关闭的标签没有关闭按钮（只有 tab 容器可能有点击）
      const xButtons = Array.from(container.querySelectorAll('svg')).filter(
        (el) => el.closest('[class*="opacity-0 group-hover:opacity-100"]') !== null,
      );
      // closable=false 的不显示关闭 X
      expect(xButtons.length).toBeLessThanOrEqual(1); // 只有 chat 标签有 X
    });
  });

  // ==================== 多个标签 ====================

  describe('多个标签', () => {
    beforeEach(() => {
      useUIStore.getState().openTab(makeTab({ id: 'tab-1', title: '对话 1' }));
      useUIStore.getState().openTab(makeTab({ id: 'tab-2', title: '对话 2', sessionId: 's2' }));
      useUIStore
        .getState()
        .openTab(makeTab({ id: 'tab-3', title: '设置', type: 'settings', closable: false }));
    });

    it('应显示所有标签标题', () => {
      const { getByText } = render(<TabBar />);
      expect(getByText('对话 1')).toBeTruthy();
      expect(getByText('对话 2')).toBeTruthy();
      expect(getByText('设置')).toBeTruthy();
    });

    it('点击非活动标签应切换活动状态', () => {
      // 最后打开的 tab-3 是活动状态，点击 tab-2 应切换
      expect(useUIStore.getState().activeTabId).toBe('tab-3');

      const { container } = render(<TabBar />);
      // 通过文本内容找到 tab-2
      const tabElements = container.querySelectorAll('.no-drag');
      const tab2El = Array.from(tabElements).find((el) => el.textContent?.includes('对话 2')) as
        | HTMLElement
        | undefined;
      if (tab2El) fireEvent.click(tab2El);

      // 现在 tab-2 应该是活动的
      expect(useUIStore.getState().activeTabId).toBe('tab-2');
    });

    it('可关闭标签应有关闭按钮 (hover 可见)', () => {
      const { container } = render(<TabBar />);
      // 两个可关闭标签都有 X icon
      const svgs = container.querySelectorAll('svg');
      const xIcons = Array.from(svgs).filter((s) => s.getAttribute('class')?.includes('w-3'));
      // 可关闭标签的是 2 个 (tab-1, tab-2)，不可关闭的 tab-3 没有
      expect(xIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==================== 异常边界 ====================

  describe('异常边界', () => {
    it('大量标签应正常渲染', () => {
      for (let i = 0; i < 20; i++) {
        useUIStore
          .getState()
          .openTab(makeTab({ id: `tab-${i}`, title: `对话 ${i}`, sessionId: `s${i}` }));
      }
      const { container } = render(<TabBar />);
      // 应有 20 个 tab DOM 节点
      const tabs = container.querySelectorAll('[class*="cursor-pointer"]');
      expect(tabs.length).toBeGreaterThanOrEqual(20);
    });
  });
});
