/**
 * TabBar 组件测试
 * 覆盖标签页渲染、切换、关闭、边界情况
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TabBar } from '@/components/layout/TabBar';
import { useUIStore } from '@/stores/uiStore';
describe('TabBar', () => {
    beforeEach(() => {
        useUIStore.setState({
            tabs: [],
            activeTabId: null,
            activeView: 'chat',
        });
    });
    describe('空状态', () => {
        it('无标签时应渲染 null', () => {
            const { container } = render(<TabBar />);
            expect(container.innerHTML).toBe('');
        });
    });
    describe('单个标签', () => {
        it('应显示单个标签标题', () => {
            useUIStore.getState().openTab({
                id: 'tab-1',
                type: 'chat',
                title: '我的对话',
                closable: true,
            });
            render(<TabBar />);
            expect(screen.getByText('我的对话')).toBeInTheDocument();
        });
        it('活动标签应有高亮样式', () => {
            useUIStore.getState().openTab({
                id: 'tab-1',
                type: 'chat',
                title: '对话1',
                closable: true,
            });
            render(<TabBar />);
            const tab = screen.getByText('对话1').closest('div');
            // 活动标签应包含 bg-surface-main 类
            expect(tab?.className).toContain('bg-surface-main');
        });
        it('不可关闭的标签不应有关闭按钮', () => {
            useUIStore.getState().openTab({
                id: 'settings-1',
                type: 'settings',
                title: '设置',
                closable: false,
            });
            render(<TabBar />);
            expect(screen.queryByRole('button')).toBeNull();
        });
    });
    describe('多个标签', () => {
        beforeEach(() => {
            const tabs = [
                { id: 'tab-1', type: 'chat', title: '对话1', closable: true },
                { id: 'tab-2', type: 'chat', title: '对话2', closable: true },
                { id: 'tab-3', type: 'settings', title: '设置', closable: false },
            ];
            tabs.forEach((t) => useUIStore.getState().openTab(t));
            useUIStore.getState().setActiveTab('tab-1');
        });
        it('应显示所有标签标题', () => {
            render(<TabBar />);
            expect(screen.getByText('对话1')).toBeInTheDocument();
            expect(screen.getByText('对话2')).toBeInTheDocument();
            expect(screen.getByText('设置')).toBeInTheDocument();
        });
        it('点击非活动标签应切换活动状态', () => {
            render(<TabBar />);
            fireEvent.click(screen.getByText('对话2'));
            // 验证切换
            expect(useUIStore.getState().activeTabId).toBe('tab-2');
        });
        it('可关闭标签应有关闭按钮', () => {
            render(<TabBar />);
            const closeButtons = document.querySelectorAll('.group-hover\\:opacity-100');
            // 两个可关闭标签各有一个关闭按钮
            expect(closeButtons.length).toBe(2);
        });
    });
    describe('异常边界', () => {
        it('关闭最后标签后不应渲染', () => {
            useUIStore.getState().openTab({
                id: 'single',
                type: 'chat',
                title: '唯一',
                closable: true,
            });
            render(<TabBar />);
            const closeBtn = document.querySelector('.group-hover\\:opacity-100');
            if (closeBtn) {
                fireEvent.click(closeBtn);
            }
            // 重新渲染
            const { container } = render(<TabBar />);
            expect(container.innerHTML).toBe('');
        });
        it('大量标签应显示可滚动', () => {
            for (let i = 0; i < 20; i++) {
                useUIStore.getState().openTab({
                    id: `tab-${i}`,
                    type: 'chat',
                    title: `对话 ${i}`,
                    closable: true,
                });
            }
            render(<TabBar />);
            // 应至少显示第一个标签
            expect(screen.getByText('对话 0')).toBeInTheDocument();
        });
    });
});
//# sourceMappingURL=TabBar.test.js.map